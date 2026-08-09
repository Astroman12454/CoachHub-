import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { requireTeam } from "./auth";
import { registerBillingRoutes } from "./billing";
import { registerCoachRoutes } from "./coaches";
import { isAIConfigured, extractBoxScore } from "./ai-vision";
import { generateSessionPlan, type SessionPlanContext } from "./ai-session-plan";
import { parseCommand } from "./ai-command";
import { isPushConfigured, getVapidPublicKey } from "./push";
import { notifyTeam, notifyPlayer, formatNotifyDate } from "./notify";
import { runNotificationSweep } from "./notifications-cron";
import { z } from "zod";
import {
  insertExerciseSchema,
  insertTrainingSessionSchema,
  insertPlayerSchema,
  insertAttendanceSchema,
  insertTeamSchema,
  createGameWithStatsSchema,
  createPlaySchema,
  pushSubscriptionSchema,
  skillRatingInputSchema,
  createPlayerNoteSchema,
  createPlayerInjurySchema,
  recoverInjurySchema,
  logDrillAttemptSchema,
  insertSessionTemplateSchema,
  insertRecurringPracticeSlotSchema,
  generateSessionsFromSlotsSchema,
  insertPhysicalTestSchema,
  recordPhysicalTestResultsSchema,
  FREE_PLAN_PLAYER_LIMIT,
  FREE_PLAN_PLAY_LIMIT,
  type TrainingSession,
} from "@shared/schema";
import {
  canCreateTeam,
  canCreatePlayer,
  canCreatePlay,
  canUseCustomExercises,
  canGenerateAiSessionPlan,
  canImportBoxScore,
} from "@shared/entitlements";

const ACCEPTED_BOX_SCORE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf",
]);
const boxScoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ACCEPTED_BOX_SCORE_TYPES.has(file.mimetype));
  },
});

// Each call costs real money (Anthropic API), so it's rate-limited more
// tightly than a normal write route — 20 uploads/hour is generous for a
// coach logging games one at a time but blocks a runaway client/script.
const boxScoreAnalyzeRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many box score uploads. Please try again later." },
});

// Text-only calls are cheaper than the vision-based box-score import, but
// still real money — a bit more headroom than that limiter.
const sessionPlanRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many practice plan requests. Please try again later." },
});

// Unauthenticated by design (see requireAuth's /portal/ exemption), so this
// throttles token-scanning/scraping rather than a coach's normal usage —
// generous enough for a parent refreshing the page repeatedly.
const portalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

// A coach broadcasting to their own roster, not an AI cost — just generous
// enough to block an accidental click-loop rather than normal usage.
const notifyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many notifications sent. Please try again later." },
});

// Parses a route param as a positive integer id, or responds 400 and returns
// null so callers can bail out instead of querying the DB with NaN.
function parseId(req: Request, res: Response, param = "id"): number | null {
  const id = parseInt(req.params[param]);
  if (isNaN(id)) {
    res.status(400).json({ message: `Invalid ${param}` });
    return null;
  }
  return id;
}

// Every handler below reads accountId/teamId from the session, never from
// the request body or query params — a coach can't access another coach's
// data by guessing/passing a different id. requireTeam (server/auth.ts)
// guarantees both are present before these run.
// Only a drill with a real sample size is worth steering a whole session
// around — a single missed rep is noise, not a weak spot.
const MIN_ATTEMPTS_FOR_WEAK_DRILL = 3;
const WEAK_DRILL_THRESHOLD_PCT = 60;

// Everything the AI session-plan generator knows about the team beyond
// the exercise library itself — pulls from injury tracking, drill/shot
// logging, and playbook practice stats, all already collected elsewhere
// in the app for their own features. Keeping this assembly here (not in
// storage.ts) keeps the AI-specific shaping out of the plain data layer.
// Exported (module scope, not a closure inside registerRoutes) so it's
// testable directly against real storage data without needing an
// ANTHROPIC_API_KEY or mocking the AI client.
export async function buildSessionPlanContext(teamId: number): Promise<SessionPlanContext> {
  const [injuries, players, attempts, plays, playStats] = await Promise.all([
    storage.getActiveInjuriesForTeam(teamId),
    storage.getAllPlayers(teamId),
    storage.getTeamDrillAttempts(teamId),
    storage.getAllPlays(teamId),
    storage.getPlayPracticeStats(teamId),
  ]);

  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const injuredPlayerNames = injuries
    .map((i) => playerNameById.get(i.playerId))
    .filter((name): name is string => !!name);

  const drillTally = new Map<string, { made: number; total: number }>();
  for (const attempt of attempts) {
    const entry = drillTally.get(attempt.drillName) ?? { made: 0, total: 0 };
    entry.total++;
    if (attempt.made) entry.made++;
    drillTally.set(attempt.drillName, entry);
  }
  const weakDrills = Array.from(drillTally.entries())
    .map(([drillName, { made, total }]) => ({ drillName, percentage: Math.round((made / total) * 100), attempts: total }))
    .filter((d) => d.attempts >= MIN_ATTEMPTS_FOR_WEAK_DRILL && d.percentage < WEAK_DRILL_THRESHOLD_PCT)
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 3);

  const practiceCountByPlayId = new Map(playStats.map((s) => [s.playId, s.timesPracticed]));
  const neglectedPlays = plays
    .map((play) => ({ name: play.name, category: play.category, timesPracticed: practiceCountByPlayId.get(play.id) ?? 0 }))
    .sort((a, b) => a.timesPracticed - b.timesPracticed)
    .slice(0, 3);

  return { injuredPlayerNames, weakDrills, neglectedPlays };
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerBillingRoutes(app);
  registerCoachRoutes(app);

  // Team routes
  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getTeamsByAccount(req.session.accountId!);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      // A coach who accepted a Club invite creates teams under the club's
      // account (visible to every coach on it), gated by the club's plan
      // and team count — not their own separate, otherwise-unused account.
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      const existingTeams = await storage.getTeamsByAccount(accountId);

      if (!canCreateTeam(account?.plan ?? "free", existingTeams.length)) {
        return res.status(403).json({ message: "Upgrade to a paid plan to manage more than one team." });
      }

      const { name } = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam(accountId, name);
      res.status(201).json(team);
    } catch (error) {
      res.status(400).json({ message: "Invalid team data" });
    }
  });

  // Exercise routes — scoped by account, shared across that account's teams
  // (and, for a Club coach, across the whole club — see
  // resolveEffectiveAccountId).
  app.get("/api/exercises", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { category } = req.query;
      const exercises = category && typeof category === "string"
        ? await storage.getExercisesByCategory(accountId, category)
        : await storage.getAllExercises(accountId);

      res.json(exercises);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exercises" });
    }
  });

  app.get("/api/exercises/:id", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const exercise = await storage.getExerciseById(id, accountId);

      if (!exercise) {
        return res.status(404).json({ message: "Exercise not found" });
      }

      res.json(exercise);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exercise" });
    }
  });

  app.post("/api/exercises", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (!canUseCustomExercises(account?.plan ?? "free")) {
        return res.status(403).json({ message: "Upgrade to a paid plan to add custom exercises." });
      }

      const exerciseData = insertExerciseSchema.parse(req.body);
      const exercise = await storage.createExercise(accountId, exerciseData);
      res.status(201).json(exercise);
    } catch (error) {
      res.status(400).json({ message: "Invalid exercise data" });
    }
  });

  app.put("/api/exercises/:id", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (!canUseCustomExercises(account?.plan ?? "free")) {
        return res.status(403).json({ message: "Upgrade to a paid plan to edit exercises." });
      }

      const id = parseId(req, res);
      if (id === null) return;
      const updateData = insertExerciseSchema.partial().parse(req.body);
      const exercise = await storage.updateExercise(id, accountId, updateData);

      if (!exercise) {
        return res.status(404).json({ message: "Exercise not found" });
      }

      res.json(exercise);
    } catch (error) {
      res.status(400).json({ message: "Invalid exercise data" });
    }
  });

  app.delete("/api/exercises/:id", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (!canUseCustomExercises(account?.plan ?? "free")) {
        return res.status(403).json({ message: "Upgrade to a paid plan to delete exercises." });
      }

      const id = parseId(req, res);
      if (id === null) return;
      const deleted = await storage.deleteExercise(id, accountId);

      if (!deleted) {
        return res.status(404).json({ message: "Exercise not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete exercise" });
    }
  });

  // Physical test routes — templates scoped by account, shared across that
  // account's teams (and, for a Club coach, across the whole club — see
  // resolveEffectiveAccountId), same as exercises. No plan gate: physical
  // testing is a player-evaluation tool like skill ratings, available on
  // every plan.
  app.get("/api/physical-tests", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const tests = await storage.getAllPhysicalTests(accountId);
      res.json(tests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch physical tests" });
    }
  });

  app.post("/api/physical-tests", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const testData = insertPhysicalTestSchema.parse(req.body);
      const test = await storage.createPhysicalTest(accountId, testData);
      res.status(201).json(test);
    } catch (error) {
      res.status(400).json({ message: "Invalid physical test data" });
    }
  });

  app.put("/api/physical-tests/:id", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const id = parseId(req, res);
      if (id === null) return;
      const updateData = insertPhysicalTestSchema.partial().parse(req.body);
      const test = await storage.updatePhysicalTest(id, accountId, updateData);

      if (!test) {
        return res.status(404).json({ message: "Physical test not found" });
      }

      res.json(test);
    } catch (error) {
      res.status(400).json({ message: "Invalid physical test data" });
    }
  });

  app.delete("/api/physical-tests/:id", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const id = parseId(req, res);
      if (id === null) return;
      const deleted = await storage.deletePhysicalTest(id, accountId);

      if (!deleted) {
        return res.status(404).json({ message: "Physical test not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete physical test" });
    }
  });

  // A whole active roster's results for one test, recorded in a single
  // batch (the way a coach actually runs a fitness test — one session,
  // everyone in turn) rather than one request per player.
  app.post("/api/physical-tests/:id/results", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const test = await storage.getPhysicalTestById(id, accountId);
      if (!test) {
        return res.status(404).json({ message: "Physical test not found" });
      }

      const { date, results } = recordPhysicalTestResultsSchema.parse(req.body);
      const teamPlayers = await storage.getAllPlayers(req.session.currentTeamId!);
      const teamPlayerIds = new Set(teamPlayers.map((p) => p.id));
      const invalidPlayerId = results.find((r) => !teamPlayerIds.has(r.playerId));
      if (invalidPlayerId) {
        return res.status(400).json({ message: "One or more players don't belong to the current team." });
      }

      const saved = await storage.recordPhysicalTestResults(id, date, results);
      res.status(201).json(saved);
    } catch (error) {
      res.status(400).json({ message: "Invalid physical test results" });
    }
  });

  // Prefills the bulk-entry form with each player's most recent result for
  // this test, so re-testing the roster doesn't start from a blank table.
  app.get("/api/physical-tests/:id/latest", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const latest = await storage.getLatestPhysicalTestResultsForTeam(id, req.session.currentTeamId!);
      res.json(latest);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch latest results" });
    }
  });

  app.get("/api/players/:id/physical-test-results", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const history = await storage.getPhysicalTestResultsForPlayer(id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch physical test results" });
    }
  });

  // Training Session routes — scoped by the session's current team.
  app.get("/api/training-sessions", requireTeam, async (req, res) => {
    try {
      const teamId = req.session.currentTeamId!;
      const { startDate, endDate } = req.query;
      const sessions = startDate && endDate && typeof startDate === "string" && typeof endDate === "string"
        ? await storage.getTrainingSessionsByDateRange(teamId, startDate, endDate)
        : await storage.getAllTrainingSessions(teamId);

      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch training sessions" });
    }
  });

  app.get("/api/training-sessions/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const session = await storage.getTrainingSessionById(id, req.session.currentTeamId!);

      if (!session) {
        return res.status(404).json({ message: "Training session not found" });
      }

      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch training session" });
    }
  });

  // Drops any exerciseIds that don't belong to this account, so a session
  // can't end up referencing another account's (private) exercise by a
  // guessed id.
  async function sanitizeExerciseIds(accountId: number, exerciseIds: string[] | null | undefined) {
    if (!exerciseIds || exerciseIds.length === 0) return exerciseIds;
    const owned = await storage.getAllExercises(accountId);
    const ownedIds = new Set(owned.map(e => e.id.toString()));
    return exerciseIds.filter(id => ownedIds.has(id));
  }

  // Same defense-in-depth as sanitizeExerciseIds above, but scoped by team
  // (plays belong to a team, not an account) — a session can't end up
  // referencing another team's play by a guessed id.
  async function sanitizePlayIds(teamId: number, playIds: string[] | null | undefined) {
    if (!playIds || playIds.length === 0) return playIds;
    const owned = await storage.getAllPlays(teamId);
    const ownedIds = new Set(owned.map(p => p.id.toString()));
    return playIds.filter(id => ownedIds.has(id));
  }

  const generatePlanSchema = z.object({
    instructions: z.string().max(500).optional(),
  });

  // AI practice-plan draft — picks exercises from the coach's own library
  // (never invents one) plus a suggested name/notes/duration. Returned as a
  // draft only; nothing is saved until the coach reviews it and submits the
  // normal POST /api/training-sessions below.
  app.post("/api/training-sessions/generate-plan", requireTeam, sessionPlanRateLimiter, async (req, res) => {
    const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
    const account = await storage.getAccountById(accountId);
    if (!canGenerateAiSessionPlan(account?.plan ?? "free")) {
      return res.status(403).json({ message: "Upgrade to a paid plan to generate a practice plan with AI." });
    }

    const parseResult = generatePlanSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: "Invalid request." });
    }
    const { instructions } = parseResult.data;

    if (!isAIConfigured()) {
      return res.status(503).json({ message: "AI practice plans aren't configured yet." });
    }

    const teamId = req.session.currentTeamId!;
    const exercises = await storage.getAllExercises(accountId);
    if (exercises.length === 0) {
      return res.status(400).json({ message: "Add some exercises to your library first." });
    }
    const recentSessions = (await storage.getAllTrainingSessions(teamId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const context = await buildSessionPlanContext(teamId);

    try {
      const plan = await generateSessionPlan(exercises, recentSessions, instructions, context);
      plan.exerciseIds = (await sanitizeExerciseIds(accountId, plan.exerciseIds)) ?? [];
      res.json(plan);
    } catch (error) {
      res.status(502).json({ message: "Couldn't generate a plan right now. Try again, or build the session by hand." });
    }
  });

  const parseCommandSchema = z.object({
    text: z.string().min(1).max(300),
  });

  // Natural-language shortcut for the two safest, most common scheduling
  // requests (create a session, repeat a past one) — never saves anything
  // itself. The client uses the parsed result to prefill SessionModal, so
  // "create a session tomorrow at 6" still ends with the coach reviewing
  // and hitting Save, same as building it by hand.
  app.post("/api/ai/parse-command", requireTeam, sessionPlanRateLimiter, async (req, res) => {
    const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
    const account = await storage.getAccountById(accountId);
    if (!canGenerateAiSessionPlan(account?.plan ?? "free")) {
      return res.status(403).json({ message: "Upgrade to a paid plan to use natural-language commands." });
    }

    const parseResult = parseCommandSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: "Invalid request." });
    }

    if (!isAIConfigured()) {
      return res.status(503).json({ message: "Natural-language commands aren't configured yet." });
    }

    const teamId = req.session.currentTeamId!;
    const recentSessions = (await storage.getAllTrainingSessions(teamId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    try {
      const todayISO = new Date().toISOString().split("T")[0];
      const result = await parseCommand(parseResult.data.text, todayISO, recentSessions);
      res.json(result);
    } catch (error) {
      res.status(502).json({ message: "Couldn't understand that right now. Try again, or use the normal form." });
    }
  });

  app.post("/api/training-sessions", requireTeam, async (req, res) => {
    try {
      const sessionData = insertTrainingSessionSchema.parse(req.body);
      sessionData.exerciseIds = await sanitizeExerciseIds(req.session.accountId!, sessionData.exerciseIds);
      sessionData.playIds = await sanitizePlayIds(req.session.currentTeamId!, sessionData.playIds);
      const session = await storage.createTrainingSession(req.session.currentTeamId!, sessionData);
      res.status(201).json(session);
    } catch (error) {
      res.status(400).json({ message: "Invalid training session data" });
    }
  });

  app.put("/api/training-sessions/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const updateData = insertTrainingSessionSchema.partial().parse(req.body);
      if (updateData.exerciseIds) {
        updateData.exerciseIds = await sanitizeExerciseIds(req.session.accountId!, updateData.exerciseIds);
      }
      if (updateData.playIds) {
        updateData.playIds = await sanitizePlayIds(req.session.currentTeamId!, updateData.playIds);
      }
      const session = await storage.updateTrainingSession(id, req.session.currentTeamId!, updateData);

      if (!session) {
        return res.status(404).json({ message: "Training session not found" });
      }

      res.json(session);
    } catch (error) {
      res.status(400).json({ message: "Invalid training session data" });
    }
  });

  app.delete("/api/training-sessions/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const deleted = await storage.deleteTrainingSession(id, req.session.currentTeamId!);

      if (!deleted) {
        return res.status(404).json({ message: "Training session not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete training session" });
    }
  });

  // Session templates — a reusable starting point for SessionModal (name,
  // duration, exercises, plays, notes) that never links back to sessions
  // created from it, so deleting a template can't cascade into anything.
  app.get("/api/session-templates", requireTeam, async (req, res) => {
    try {
      const templates = await storage.getAllSessionTemplates(req.session.currentTeamId!);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session templates" });
    }
  });

  app.post("/api/session-templates", requireTeam, async (req, res) => {
    try {
      const teamId = req.session.currentTeamId!;
      const data = insertSessionTemplateSchema.parse(req.body);
      data.exerciseIds = await sanitizeExerciseIds(req.session.accountId!, data.exerciseIds);
      data.playIds = await sanitizePlayIds(teamId, data.playIds);
      const template = await storage.createSessionTemplate(teamId, data);
      res.status(201).json(template);
    } catch (error) {
      res.status(400).json({ message: "Invalid session template data" });
    }
  });

  app.delete("/api/session-templates/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const deleted = await storage.deleteSessionTemplate(id, req.session.currentTeamId!);
      if (!deleted) {
        return res.status(404).json({ message: "Session template not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete session template" });
    }
  });

  // Recurring practice slots — a saved weekly pattern ("Tuesdays at 5:30pm")
  // a coach sets up once at the start of a season. Slots by themselves don't
  // appear on the calendar; /generate below is what turns them into real
  // training_sessions rows.
  app.get("/api/recurring-slots", requireTeam, async (req, res) => {
    try {
      const slots = await storage.getAllRecurringPracticeSlots(req.session.currentTeamId!);
      res.json(slots);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recurring practice slots" });
    }
  });

  app.post("/api/recurring-slots", requireTeam, async (req, res) => {
    try {
      const data = insertRecurringPracticeSlotSchema.parse(req.body);
      const slot = await storage.createRecurringPracticeSlot(req.session.currentTeamId!, data);
      res.status(201).json(slot);
    } catch (error) {
      res.status(400).json({ message: "Invalid recurring practice slot data" });
    }
  });

  app.delete("/api/recurring-slots/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const deleted = await storage.deleteRecurringPracticeSlot(id, req.session.currentTeamId!);
      if (!deleted) {
        return res.status(404).json({ message: "Recurring practice slot not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete recurring practice slot" });
    }
  });

  app.post("/api/recurring-slots/generate", requireTeam, async (req, res) => {
    try {
      const { startDate, weeks } = generateSessionsFromSlotsSchema.parse(req.body);
      const created = await storage.generateSessionsFromSlots(req.session.currentTeamId!, startDate, weeks);
      res.json({ created });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Pushes a reminder to every player/parent subscribed via their portal
  // link (see the /api/portal/:token/subscribe routes below). Free on both
  // plans — it's a broadcast to the coach's own roster, not an AI feature.
  app.post("/api/training-sessions/:id/notify", requireTeam, notifyRateLimiter, async (req, res) => {
    try {
      if (!isPushConfigured()) {
        return res.status(503).json({ message: "Push notifications aren't configured yet." });
      }
      const id = parseId(req, res);
      if (id === null) return;
      const teamId = req.session.currentTeamId!;
      const session = await storage.getTrainingSessionById(id, teamId);
      if (!session) {
        return res.status(404).json({ message: "Training session not found" });
      }

      const sent = await notifyTeam(teamId, {
        title: `Practice: ${session.name}`,
        body: `${formatNotifyDate(session.date)} at ${session.time}`,
      });
      res.json({ sent });
    } catch (error) {
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // Player routes — scoped by the session's current team.
  app.get("/api/players", requireTeam, async (req, res) => {
    try {
      const players = await storage.getAllPlayers(req.session.currentTeamId!);
      res.json(players);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch players" });
    }
  });

  app.get("/api/players/count", requireTeam, async (req, res) => {
    try {
      const count = await storage.getActivePlayersCount(req.session.currentTeamId!);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch player count" });
    }
  });

  app.post("/api/players", requireTeam, async (req, res) => {
    try {
      const teamId = req.session.currentTeamId!;
      const effectiveAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(effectiveAccountId);

      const currentPlayerCount = await storage.getPlayerCount(teamId);
      if (!canCreatePlayer(account?.plan ?? "free", currentPlayerCount)) {
        return res.status(403).json({
          message: `Free plan is limited to ${FREE_PLAN_PLAYER_LIMIT} players. Upgrade to add more.`,
        });
      }

      const playerData = insertPlayerSchema.parse(req.body);
      const player = await storage.createPlayer(teamId, playerData);
      res.status(201).json(player);
    } catch (error) {
      res.status(400).json({ message: "Invalid player data" });
    }
  });

  app.put("/api/players/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const updateData = insertPlayerSchema.partial().parse(req.body);
      const player = await storage.updatePlayer(id, req.session.currentTeamId!, updateData);

      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      res.json(player);
    } catch (error) {
      res.status(400).json({ message: "Invalid player data" });
    }
  });

  app.delete("/api/players/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const deleted = await storage.deletePlayer(id, req.session.currentTeamId!);

      if (!deleted) {
        return res.status(404).json({ message: "Player not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete player" });
    }
  });

  // Player development — skill ratings (radar chart) and freeform coach
  // notes, both gated on the player actually belonging to the current team
  // before touching storage.
  // Roster-wide current ratings — feeds the scrimmage team balancer on the
  // client, which needs every player's snapshot at once rather than one
  // /development round trip per player.
  app.get("/api/players/skill-ratings", requireTeam, async (req, res) => {
    try {
      const ratings = await storage.getCurrentSkillRatingsForTeam(req.session.currentTeamId!);
      res.json(ratings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch skill ratings" });
    }
  });

  app.get("/api/players/:id/development", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const development = await storage.getPlayerDevelopment(id);
      res.json(development);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch player development" });
    }
  });

  app.post("/api/players/:id/skill-ratings", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const ratings = skillRatingInputSchema.parse(req.body);
      const before = (await storage.getPlayerDevelopment(id)).current;
      await storage.createSkillRating(id, ratings);
      const development = await storage.getPlayerDevelopment(id);

      // "Proactive parent mode": push straight to whoever's subscribed to
      // THIS player's portal (not the whole team) the moment a rating goes
      // up — no digest, no coach action beyond the rating itself.
      if (isPushConfigured() && before) {
        const improved = Object.entries(ratings).filter(
          ([category, rating]) => typeof before[category] === "number" && rating > before[category],
        );
        if (improved.length > 0) {
          const summary = improved
            .map(([category, rating]) => `${category.charAt(0).toUpperCase()}${category.slice(1)} ${before[category]}→${rating}`)
            .join(", ");
          try {
            await notifyPlayer(id, { title: `${player.name}'s progress`, body: `Nice improvement: ${summary}` });
          } catch {
            // Best-effort — a push failure shouldn't fail the rating save.
          }
        }
      }

      res.status(201).json(development);
    } catch (error) {
      res.status(400).json({ message: "Invalid skill rating data" });
    }
  });

  app.post("/api/players/:id/notes", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const { content } = createPlayerNoteSchema.parse(req.body);
      const note = await storage.createPlayerNote(id, content);
      res.status(201).json(note);
    } catch (error) {
      res.status(400).json({ message: "Invalid note data" });
    }
  });

  app.delete("/api/players/:id/notes/:noteId", requireTeam, async (req, res) => {
    try {
      const noteId = parseId(req, res, "noteId");
      if (noteId === null) return;
      const deleted = await storage.deletePlayerNote(noteId, req.session.currentTeamId!);
      if (!deleted) {
        return res.status(404).json({ message: "Note not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  // Injury tracking. The team-wide list (active injuries only) powers the
  // "injured" badge on the players list and attendance modal without an
  // N+1 fetch per player; the per-player list is the full history shown on
  // their profile.
  app.get("/api/players/injuries", requireTeam, async (req, res) => {
    try {
      const injuries = await storage.getActiveInjuriesForTeam(req.session.currentTeamId!);
      res.json(injuries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch injuries" });
    }
  });

  app.get("/api/players/:id/injuries", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const injuries = await storage.getPlayerInjuries(id);
      res.json(injuries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch injuries" });
    }
  });

  app.post("/api/players/:id/injuries", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const data = createPlayerInjurySchema.parse(req.body);
      const injury = await storage.createPlayerInjury(id, data);
      res.status(201).json(injury);
    } catch (error) {
      res.status(400).json({ message: "Invalid injury data" });
    }
  });

  app.put("/api/players/:id/injuries/:injuryId/recover", requireTeam, async (req, res) => {
    try {
      const injuryId = parseId(req, res, "injuryId");
      if (injuryId === null) return;
      const { recoveredDate } = recoverInjurySchema.parse(req.body);
      const updated = await storage.markInjuryRecovered(injuryId, req.session.currentTeamId!, recoveredDate);
      if (!updated) {
        return res.status(404).json({ message: "Injury not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete("/api/players/:id/injuries/:injuryId", requireTeam, async (req, res) => {
    try {
      const injuryId = parseId(req, res, "injuryId");
      if (injuryId === null) return;
      const deleted = await storage.deletePlayerInjury(injuryId, req.session.currentTeamId!);
      if (!deleted) {
        return res.status(404).json({ message: "Injury not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete injury" });
    }
  });

  // Drill stat tracking — one attempt per tap during practice. The
  // team-wide list backs the live tally shown while marking attendance
  // (every roster player at once, no N+1); the per-player list is a
  // player's full season history shown on their profile.
  app.get("/api/players/drill-attempts", requireTeam, async (req, res) => {
    try {
      const attempts = await storage.getTeamDrillAttempts(req.session.currentTeamId!);
      res.json(attempts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch drill attempts" });
    }
  });

  app.get("/api/players/:id/drill-attempts", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const attempts = await storage.getPlayerDrillAttempts(id);
      res.json(attempts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch drill attempts" });
    }
  });

  app.post("/api/players/:id/drill-attempts", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const data = logDrillAttemptSchema.parse(req.body);
      const attempt = await storage.logDrillAttempt(id, data);
      res.status(201).json(attempt);
    } catch (error) {
      res.status(400).json({ message: "Invalid drill attempt data" });
    }
  });

  app.delete("/api/players/:id/drill-attempts/:attemptId", requireTeam, async (req, res) => {
    try {
      const attemptId = parseId(req, res, "attemptId");
      if (attemptId === null) return;
      const deleted = await storage.deleteDrillAttempt(attemptId, req.session.currentTeamId!);
      if (!deleted) {
        return res.status(404).json({ message: "Drill attempt not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete drill attempt" });
    }
  });

  // Player/parent portal — a coach generates a shareable, unguessable link
  // per player; the public GET below (no requireTeam, no session) is what
  // that link resolves to. See requireAuth's /portal/ exemption.
  app.post("/api/players/:id/portal-link", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const token = await storage.getOrCreatePortalToken(id, req.session.currentTeamId!);
      if (!token) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.json({ token });
    } catch (error) {
      res.status(500).json({ message: "Failed to create portal link" });
    }
  });

  app.delete("/api/players/:id/portal-link", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const revoked = await storage.revokePortalToken(id, req.session.currentTeamId!);
      if (!revoked) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to revoke portal link" });
    }
  });

  app.get("/api/portal/:token", portalRateLimiter, async (req, res) => {
    try {
      const data = await storage.getPortalData(req.params.token);
      if (!data) {
        return res.status(404).json({ message: "Link not found or no longer active" });
      }
      // null when VAPID keys aren't configured — the client hides the
      // "enable notifications" button in that case rather than offering a
      // subscribe flow that would just fail.
      res.json({ ...data, vapidPublicKey: getVapidPublicKey() });
    } catch (error) {
      res.status(500).json({ message: "Failed to load portal" });
    }
  });

  // Push subscribe/unsubscribe — same public, token-scoped shape as the GET
  // above (covered by the same requireAuth /portal/ exemption).
  app.post("/api/portal/:token/subscribe", portalRateLimiter, async (req, res) => {
    try {
      const playerId = await storage.getPlayerIdByPortalToken(req.params.token);
      if (!playerId) {
        return res.status(404).json({ message: "Link not found or no longer active" });
      }
      const parsed = pushSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid push subscription" });
      }
      await storage.savePushSubscription(playerId, {
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.delete("/api/portal/:token/subscribe", portalRateLimiter, async (req, res) => {
    try {
      const playerId = await storage.getPlayerIdByPortalToken(req.params.token);
      if (!playerId) {
        return res.status(404).json({ message: "Link not found or no longer active" });
      }
      const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : null;
      if (!endpoint) {
        return res.status(400).json({ message: "Missing endpoint" });
      }
      await storage.deletePushSubscription(playerId, endpoint);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  // Attendance routes — session/player ownership verified against the
  // current team before any read/write, since attendance rows don't carry
  // a teamId of their own.
  app.get("/api/attendance/session/:sessionId", requireTeam, async (req, res) => {
    try {
      const sessionId = parseId(req, res, "sessionId");
      if (sessionId === null) return;
      const session = await storage.getTrainingSessionById(sessionId, req.session.currentTeamId!);
      if (!session) {
        return res.status(404).json({ message: "Training session not found" });
      }
      const attendanceRecords = await storage.getAttendanceBySession(sessionId);
      res.json(attendanceRecords);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch attendance" });
    }
  });

  app.get("/api/attendance/player/:playerId", requireTeam, async (req, res) => {
    try {
      const playerId = parseId(req, res, "playerId");
      if (playerId === null) return;
      const player = await storage.getPlayerById(playerId, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const attendanceRecords = await storage.getAttendanceByPlayer(playerId);
      res.json(attendanceRecords);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch player attendance" });
    }
  });

  // "Proactive parent mode": pushes straight to whoever's subscribed to
  // this player's portal the moment they're marked absent — the one
  // attendance status that's actually actionable for a parent to know
  // about right away, unlike present/late/excused.
  async function notifyIfAbsent(playerId: number, playerName: string, session: TrainingSession, status: string) {
    if (status !== "absent" || !isPushConfigured()) return;
    try {
      await notifyPlayer(playerId, {
        title: "Absence recorded",
        body: `${playerName} was marked absent for "${session.name}" on ${formatNotifyDate(session.date)}.`,
      });
    } catch {
      // Best-effort — a push failure shouldn't fail the attendance save.
    }
  }

  app.post("/api/attendance", requireTeam, async (req, res) => {
    try {
      const attendanceData = insertAttendanceSchema.parse(req.body);
      const teamId = req.session.currentTeamId!;

      const [session, player] = await Promise.all([
        storage.getTrainingSessionById(attendanceData.sessionId, teamId),
        storage.getPlayerById(attendanceData.playerId, teamId),
      ]);
      if (!session || !player) {
        return res.status(404).json({ message: "Training session or player not found" });
      }

      const attendanceRecord = await storage.markAttendance(attendanceData);
      await notifyIfAbsent(player.id, player.name, session, attendanceRecord.status);
      res.status(201).json(attendanceRecord);
    } catch (error) {
      res.status(400).json({ message: "Invalid attendance data" });
    }
  });

  app.put("/api/attendance/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;

      const existing = await storage.getAttendanceById(id);
      if (!existing) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      const teamId = req.session.currentTeamId!;
      const [session, player] = await Promise.all([
        storage.getTrainingSessionById(existing.sessionId, teamId),
        storage.getPlayerById(existing.playerId, teamId),
      ]);
      if (!session || !player) {
        return res.status(404).json({ message: "Attendance record not found" });
      }

      const updateData = insertAttendanceSchema.partial().parse(req.body);
      const attendanceRecord = await storage.updateAttendance(id, updateData);
      if (attendanceRecord) {
        await notifyIfAbsent(player.id, player.name, session, attendanceRecord.status);
      }

      res.json(attendanceRecord);
    } catch (error) {
      res.status(400).json({ message: "Invalid attendance data" });
    }
  });

  app.get("/api/players/:playerId/attendance-stats", requireTeam, async (req, res) => {
    try {
      const playerId = parseId(req, res, "playerId");
      if (playerId === null) return;
      const player = await storage.getPlayerById(playerId, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const stats = await storage.getPlayerAttendanceStats(playerId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch attendance stats" });
    }
  });

  // Stats endpoint for dashboard
  app.get("/api/stats", requireTeam, async (req, res) => {
    try {
      const teamId = req.session.currentTeamId!;
      const sessions = await storage.getAllTrainingSessions(teamId);
      const exercises = await storage.getAllExercises(req.session.accountId!);
      const activePlayersCount = await storage.getActivePlayersCount(teamId);

      const totalSessions = sessions.length;
      const totalExercises = exercises.length;

      // Calculate average attendance
      const totalAttendance = sessions.reduce((acc, session) => acc + (session.attendanceCount || 0), 0);
      const totalPossibleAttendance = sessions.reduce((acc, session) => acc + (session.totalPlayers || 0), 0);
      const avgAttendance = totalPossibleAttendance > 0 ? Math.round((totalAttendance / totalPossibleAttendance) * 100) : 0;

      res.json({
        totalSessions,
        activePlayersCount,
        totalExercises,
        avgAttendance
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Game routes — scoped by the session's current team. Manual box-score
  // entry is free; AI photo/PDF import (below) is a paid-plan convenience.
  app.get("/api/games", requireTeam, async (req, res) => {
    try {
      const games = await storage.getAllGames(req.session.currentTeamId!);
      res.json(games);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch games" });
    }
  });

  app.get("/api/games/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const teamId = req.session.currentTeamId!;
      const game = await storage.getGameById(id, teamId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      const stats = await storage.getGameStats(id);
      res.json({ ...game, stats });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch game" });
    }
  });

  app.post("/api/games", requireTeam, async (req, res) => {
    try {
      const teamId = req.session.currentTeamId!;
      const data = createGameWithStatsSchema.parse(req.body);

      // Drop any stat lines for playerIds that don't belong to this team, so
      // a game can't end up crediting stats to another team's roster.
      const roster = await storage.getAllPlayers(teamId);
      const rosterIds = new Set(roster.map((p) => p.id));
      data.stats = data.stats.filter((s) => rosterIds.has(s.playerId));

      const game = await storage.createGameWithStats(teamId, data);
      res.status(201).json(game);
    } catch (error) {
      res.status(400).json({ message: "Invalid game data" });
    }
  });

  app.delete("/api/games/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const deleted = await storage.deleteGame(id, req.session.currentTeamId!);
      if (!deleted) {
        return res.status(404).json({ message: "Game not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete game" });
    }
  });

  app.post("/api/games/:id/notify", requireTeam, notifyRateLimiter, async (req, res) => {
    try {
      if (!isPushConfigured()) {
        return res.status(503).json({ message: "Push notifications aren't configured yet." });
      }
      const id = parseId(req, res);
      if (id === null) return;
      const teamId = req.session.currentTeamId!;
      const game = await storage.getGameById(id, teamId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      const sent = await notifyTeam(teamId, {
        title: `Game vs ${game.opponent}`,
        body: game.location ? `${formatNotifyDate(game.date)} · ${game.location}` : formatNotifyDate(game.date),
      });
      res.json({ sent });
    } catch (error) {
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // Season totals per player, aggregated across every logged game — the
  // leaderboard view on the Games page.
  app.get("/api/players/stats", requireTeam, async (req, res) => {
    try {
      const summary = await storage.getPlayerGameStatsSummary(req.session.currentTeamId!);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch player stats" });
    }
  });

  // Play (playbook) routes — scoped by the session's current team.
  app.get("/api/plays", requireTeam, async (req, res) => {
    try {
      const teamPlays = await storage.getAllPlays(req.session.currentTeamId!);
      res.json(teamPlays);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch plays" });
    }
  });

  // Registered before /api/plays/:id so "stats" doesn't get swallowed as
  // an :id param — how often each play has come up across the team's
  // training sessions, tallied from trainingSessions.playIds.
  app.get("/api/plays/stats", requireTeam, async (req, res) => {
    try {
      const stats = await storage.getPlayPracticeStats(req.session.currentTeamId!);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch play practice stats" });
    }
  });

  app.get("/api/plays/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const teamId = req.session.currentTeamId!;
      const play = await storage.getPlayById(id, teamId);
      if (!play) {
        return res.status(404).json({ message: "Play not found" });
      }
      const steps = await storage.getPlaySteps(id);
      res.json({ ...play, steps });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch play" });
    }
  });

  app.post("/api/plays", requireTeam, async (req, res) => {
    try {
      const teamId = req.session.currentTeamId!;
      const effectiveAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(effectiveAccountId);
      const currentPlayCount = await storage.getPlayCount(teamId);
      if (!canCreatePlay(account?.plan ?? "free", currentPlayCount)) {
        return res.status(403).json({
          message: `Free plan is limited to ${FREE_PLAN_PLAY_LIMIT} saved plays. Upgrade to save more.`,
        });
      }

      const data = createPlaySchema.parse(req.body);
      const play = await storage.createPlayWithSteps(teamId, data);
      res.status(201).json(play);
    } catch (error) {
      res.status(400).json({ message: "Invalid play data" });
    }
  });

  app.put("/api/plays/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const data = createPlaySchema.parse(req.body);
      const play = await storage.updatePlayWithSteps(id, req.session.currentTeamId!, data);
      if (!play) {
        return res.status(404).json({ message: "Play not found" });
      }
      res.json(play);
    } catch (error) {
      res.status(400).json({ message: "Invalid play data" });
    }
  });

  app.delete("/api/plays/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const deleted = await storage.deletePlay(id, req.session.currentTeamId!);
      if (!deleted) {
        return res.status(404).json({ message: "Play not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete play" });
    }
  });

  // AI box-score import — upload a photo or PDF, get a draft back for the
  // coach to review/correct before it's saved via POST /api/games above.
  // Nothing is persisted here; this route only ever reads.
  app.post(
    "/api/games/analyze",
    requireTeam,
    boxScoreAnalyzeRateLimiter,
    boxScoreUpload.single("file"),
    async (req, res) => {
      // Plan gate first: a free-plan coach should see "upgrade to unlock
      // this" regardless of whether the AI backend happens to be
      // configured — not a confusing "not configured" error that implies
      // it's a temporary outage rather than a plan limit.
      const effectiveAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(effectiveAccountId);
      if (!canImportBoxScore(account?.plan ?? "free")) {
        return res.status(403).json({ message: "Upgrade to a paid plan to import box scores automatically." });
      }

      if (!isAIConfigured()) {
        return res.status(503).json({ message: "Box score import isn't configured yet." });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
      }

      try {
        const extracted = await extractBoxScore(req.file.buffer, req.file.mimetype);
        res.json(extracted);
      } catch (error) {
        res.status(502).json({ message: "Couldn't read that file. Try a clearer photo or enter the game manually." });
      }
    },
  );

  // Runs the same sweep the in-process scheduler (server/notifications-cron.ts)
  // already ticks every 15 minutes — this HTTP path exists because Render's
  // free tier sleeps the whole process after inactivity, and a sleeping
  // process can't fire its own interval. Point an external pinger (a Render
  // Cron Job, cron-job.org, a GitHub Actions schedule, ...) at this every 15
  // min with the CRON_SECRET header for reliable delivery on that plan; on
  // an always-on deployment it's redundant but harmless (the sweep is
  // idempotent either way).
  app.post("/api/cron/notifications", async (req: Request, res: Response) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return res.status(503).json({ message: "Scheduled notifications aren't configured yet." });
    }
    const provided = req.get("x-cron-secret") ?? req.query.secret;
    if (provided !== secret) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const result = await runNotificationSweep();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Notification sweep failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
