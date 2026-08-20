import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { requireTeam, requireTeamAllowHelperWrites, blockReadOnlyMembers } from "./auth";
import { registerBillingRoutes } from "./billing";
import { registerCoachRoutes } from "./coaches";
import { registerGuardianAuthorizationRoutes } from "./guardian-authorization";
import { isMinor } from "@shared/age";
import { trackEvent, trackMilestoneEvent, getEventCounts } from "./analytics";
import { isAIConfigured, extractBoxScore } from "./ai-vision";
import { generateSessionPlan, filterExercisesForPlayerCount, type SessionPlanContext } from "./ai-session-plan";
import { parseCommand } from "./ai-command";
import { answerHelpQuestion, type HelpChatMessage } from "./ai-help";
import { isPushConfigured, getVapidPublicKey } from "./push";
import { notifyTeam, notifyPlayer, formatNotifyDate } from "./notify";
import { runNotificationSweep } from "./notifications-cron";
import { z } from "zod";
import {
  insertExerciseSchema,
  saveExerciseDiagramSchema,
  insertTrainingSessionSchema,
  insertPlayerSchema,
  bulkCreatePlayersSchema,
  insertAttendanceSchema,
  insertTeamSchema,
  createGameWithStatsSchema,
  createPlaySchema,
  pushSubscriptionSchema,
  createPlayerNoteSchema,
  createPlayerInjurySchema,
  recoverInjurySchema,
  logDrillAttemptSchema,
  insertSessionTemplateSchema,
  insertRecurringPracticeSlotSchema,
  generateSessionsFromSlotsSchema,
  insertEvaluationTestSchema,
  evaluationTestFieldsSchema,
  recordEvaluationTestResultsSchema,
  setPublicNameSchema,
  createExerciseCommentSchema,
  createReportSchema,
  rateContentSchema,
  requestGuardianAuthorizationSchema,
  FREE_PLAN_PLAYER_LIMIT,
  FREE_PLAN_PLAY_LIMIT,
  type TrainingSession,
} from "@shared/schema";
import {
  isPaidPlan,
  canCreateTeam,
  canCreatePlayer,
  canCreatePlay,
  canUseCustomExercises,
  canGenerateAiSessionPlan,
  canUseAiCommands,
  canImportBoxScore,
  canUseAiHelp,
} from "@shared/entitlements";
import { computeEvaluationScore } from "@shared/evaluationScore";

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

// Gate for writing health data (medicalNotes, playerInjuries) on a player
// who's a minor: LOPDGDD art. 7 requires guardian consent below the digital
// age of consent (14 in Spain) for this kind of sensitive processing. Adults
// and players with no birth date on file (isMinor's documented default)
// aren't gated at all — this only ever blocks the minor case.
async function hasMedicalDataAuthorization(player: { id: number; birthDate: string | null }): Promise<boolean> {
  if (!isMinor(player.birthDate)) return true;
  const consent = await storage.getActiveConsent(player.id, "medical_data");
  return !!consent;
}

const MEDICAL_CONSENT_REQUIRED_MESSAGE =
  "This player is a minor. Recording health information requires the parent or guardian's authorization first — request it from the player's profile.";

export async function registerRoutes(app: Express): Promise<Server> {
  registerBillingRoutes(app);
  registerCoachRoutes(app);
  registerGuardianAuthorizationRoutes(app);

  // Not under /api, so it's outside requireAuth entirely (see index.ts —
  // that middleware is only mounted on the /api prefix) and reachable
  // straight from the site root, which is where crawlers expect to find
  // it. The one thing that actually makes the public exercise pages
  // discoverable, on top of robots.txt allowing them.
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const origin = `${req.protocol}://${req.get("host")}`;
      const staticPaths = ["/", "/pricing", "/privacy", "/terms", "/support"];
      const exerciseIds = await storage.getCommunitySharedExerciseIds();
      const urls = [
        ...staticPaths.map((path) => `${origin}${path}`),
        ...exerciseIds.map((id) => `${origin}/community/exercises/${id}`),
      ];
      res.type("application/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n") +
        `\n</urlset>\n`
      );
    } catch (error) {
      res.status(500).type("text/plain").send("Failed to generate sitemap");
    }
  });

  // The only event the client is trusted to report itself — everything else
  // in ANALYTICS_EVENTS is fired server-side, at the exact route that
  // proves the thing actually happened. "Completed the onboarding
  // checklist" has no server action of its own to hang off (it's a
  // derived, client-computed state), so this is the one deliberate
  // exception; the closed enum plus the milestone dedupe keep it from being
  // a general-purpose event-injection endpoint.
  app.post("/api/analytics/track", async (req, res) => {
    try {
      if (req.body?.event !== "onboarding_checklist_completed") {
        return res.status(400).json({ message: "Unknown event" });
      }
      await trackMilestoneEvent(req.session.accountId!, "onboarding_checklist_completed");
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to record event" });
    }
  });

  // Team routes
  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getTeamsByAccount(req.session.accountId!);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.post("/api/teams", blockReadOnlyMembers, async (req, res) => {
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

  // Currently only used to set defaultSessionDuration (SessionModal's
  // starting point for a from-scratch session), but scoped generically like
  // the other insertTeamSchema.partial() update routes in case more team
  // preferences show up later.
  //
  // blockReadOnlyMembers (not requireTeam — this doesn't need a currentTeamId,
  // and the id being edited isn't necessarily the caller's selected team) is
  // what actually stops an "assistant"/"helper" member from renaming a team;
  // it was missing here before, which meant a read-only member could
  // silently rename any team in the club despite every other write being
  // blocked for them.
  app.put("/api/teams/:id", blockReadOnlyMembers, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const updateData = insertTeamSchema.partial().parse(req.body);
      const team = await storage.updateTeam(id, accountId, updateData);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      res.json(team);
    } catch (error) {
      res.status(400).json({ message: "Invalid team data" });
    }
  });

  // Deleting the whole team, not just its name — every player/session/
  // attendance/evaluation/game/play scoped to it cascades at the DB level
  // (see storage.deleteTeam). Blocked when it's the account's only
  // remaining team: too much of the app assumes a currentTeamId always
  // resolves to something real to let that go to zero.
  app.delete("/api/teams/:id", blockReadOnlyMembers, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const accountTeams = await storage.getTeamsByAccount(accountId);
      if (!accountTeams.some((team) => team.id === id)) {
        return res.status(404).json({ message: "Team not found" });
      }
      if (accountTeams.length <= 1) {
        return res.status(400).json({ message: "Can't delete your only team." });
      }

      await storage.deleteTeam(id, accountId);
      // Only the caller's own session is fixed up here — a club member on a
      // different login who also had this team selected picks a valid one
      // the next time they switch teams, same as if it had been renamed out
      // from under them.
      if (req.session.currentTeamId === id) {
        const nextTeam = accountTeams.find((team) => team.id !== id);
        req.session.currentTeamId = nextTeam?.id;
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // The name shown on anything this account publishes to the community
  // library and to coaches it follows/is followed by — set once (prompted
  // the first time the coach tries to publish or follow) and editable
  // afterward from Coach Settings. Applies to the effective (owner)
  // account, same as team/exercise ownership already does for Club
  // members — see sessionPayload in server/auth.ts.
  app.put("/api/account/public-name", blockReadOnlyMembers, async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { publicName } = setPublicNameSchema.parse(req.body);
      const account = await storage.setAccountPublicName(accountId, publicName);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json({ publicName: account.publicName });
    } catch (error) {
      res.status(400).json({ message: "Invalid name" });
    }
  });

  // Deliberately req.session.accountId, not resolveEffectiveAccountId — a
  // referral code belongs to the specific login that shared it, not to
  // whichever club it happens to have joined (a Club member referring a
  // friend shouldn't hand out the club owner's code).
  app.get("/api/account/referrals", async (req, res) => {
    try {
      const stats = await storage.getReferralStats(req.session.accountId!);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to load referral stats" });
    }
  });

  // A one-shot JSON snapshot of everything under this team — roster,
  // schedule, attendance, games/stats, plays/steps, and evaluation-test
  // history — for a coach who wants a personal backup or wants to move the
  // season's data elsewhere. Not a restore/import path, just an export.
  app.get("/api/teams/:id/export", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const team = await storage.getTeamById(id, accountId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const [players, teamSessions, teamGames, teamPlays, teamEvaluationTests] = await Promise.all([
        storage.getAllPlayers(id),
        storage.getAllTrainingSessions(id),
        storage.getAllGames(id),
        storage.getAllPlays(id),
        storage.getAllEvaluationTests(accountId),
      ]);

      const [attendanceBySession, gamesWithStats, playsWithSteps, evaluationTestHistory] = await Promise.all([
        Promise.all(teamSessions.map((s) => storage.getAttendanceBySession(s.id))),
        Promise.all(teamGames.map(async (g) => ({ ...g, stats: await storage.getGameStats(g.id) }))),
        Promise.all(teamPlays.map(async (p) => ({ ...p, steps: await storage.getPlaySteps(p.id) }))),
        Promise.all(players.map(async (p) => ({
          playerId: p.id,
          playerName: p.name,
          history: await storage.getEvaluationTestResultsForPlayer(p.id),
        }))),
      ]);

      res.json({
        exportedAt: new Date().toISOString(),
        team: { name: team.name, logoUrl: team.logoUrl, themeColor: team.themeColor },
        players,
        trainingSessions: teamSessions,
        attendance: attendanceBySession.flat(),
        games: gamesWithStats,
        plays: playsWithSteps,
        evaluationTests: teamEvaluationTests,
        evaluationTestHistory,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to export team data" });
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

  // How many sessions use each exercise, and when it was last used — powers
  // the library's "recently used" sort. Keyed by exercise id as a string to
  // match trainingSessions.exerciseIds' own string-array storage. Must be
  // registered ahead of GET /:id below, or "usage-stats" gets swallowed as
  // an :id path parameter.
  app.get("/api/exercises/usage-stats", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const stats = await storage.getExerciseUsageStats(accountId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exercise usage stats" });
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

      const steps = await storage.getExerciseSteps(id);
      res.json({ ...exercise, steps });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exercise" });
    }
  });

  app.post("/api/exercises", blockReadOnlyMembers, async (req, res) => {
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

  app.put("/api/exercises/:id", blockReadOnlyMembers, async (req, res) => {
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

  app.delete("/api/exercises/:id", blockReadOnlyMembers, async (req, res) => {
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

  const setExerciseFavoriteSchema = z.object({ isFavorite: z.boolean() });

  // Favoriting is a personal organizational flag, not "editing an exercise's
  // content" — deliberately not behind canUseCustomExercises, so a free-plan
  // coach can still star entries in the shared starter library.
  app.put("/api/exercises/:id/favorite", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { isFavorite } = setExerciseFavoriteSchema.parse(req.body);
      const exercise = await storage.setExerciseFavorite(id, accountId, isFavorite);

      if (!exercise) {
        return res.status(404).json({ message: "Exercise not found" });
      }

      res.json(exercise);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Share link — same unguessable-token pattern as the player portal (see
  // /api/players/:id/portal-link below), not plan-gated: viewing an
  // exercise you already have isn't "creating a custom exercise."
  app.post("/api/exercises/:id/share-link", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const token = await storage.getOrCreateExerciseShareToken(id, accountId);
      if (!token) {
        return res.status(404).json({ message: "Exercise not found" });
      }
      res.json({ token });
    } catch (error) {
      res.status(500).json({ message: "Failed to create share link" });
    }
  });

  app.delete("/api/exercises/:id/share-link", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const revoked = await storage.revokeExerciseShareToken(id, accountId);
      if (!revoked) {
        return res.status(404).json({ message: "Exercise not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to revoke share link" });
    }
  });

  // Public, read-only — reachable by anyone with the link, same as
  // /api/portal/:token (see the requireAuth exemption in server/auth.ts).
  app.get("/api/exercise-share/:token", portalRateLimiter, async (req, res) => {
    try {
      const exercise = await storage.getExerciseByShareToken(req.params.token);
      if (!exercise) {
        return res.status(404).json({ message: "Link not found or no longer active" });
      }
      // Only what a viewer of the drill itself needs — never the owning
      // account's id.
      const { id, name, description, category, duration, difficulty, instructions, imageUrl, courtType, nameEs, descriptionEs, instructionsEs } = exercise;
      const steps = await storage.getExerciseSteps(id);
      res.json({ id, name, description, category, duration, difficulty, instructions, imageUrl, courtType, nameEs, descriptionEs, instructionsEs, steps });
    } catch (error) {
      res.status(500).json({ message: "Failed to load shared exercise" });
    }
  });

  // Public, read-only, and — unlike /api/exercise-share/:token above —
  // deliberately indexable: a community-shared exercise's own numeric id is
  // not a secret, and the coach already opted into publishing it by sharing
  // it to the community. Backs the public /community/exercises/:id page
  // that's meant to actually be crawlable (see robots.txt/sitemap.xml),
  // unlike the rest of the authenticated app.
  app.get("/api/community-exercises/:id/public", portalRateLimiter, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const exercise = await storage.getPublicCommunityExercise(id);
      if (!exercise) {
        return res.status(404).json({ message: "Exercise not found or no longer shared" });
      }
      const { name, description, category, duration, difficulty, instructions, imageUrl, courtType, nameEs, descriptionEs, instructionsEs } = exercise;
      const steps = await storage.getExerciseSteps(id);
      res.json({ id, name, description, category, duration, difficulty, instructions, imageUrl, courtType, nameEs, descriptionEs, instructionsEs, steps });
    } catch (error) {
      res.status(500).json({ message: "Failed to load exercise" });
    }
  });

  // Editing a diagram is "editing the exercise's content" the same as its
  // name/description, so it's gated the same way — unlike favoriting,
  // sharing, or community-toggling, which are personal actions.
  app.put("/api/exercises/:id/diagram", blockReadOnlyMembers, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (!canUseCustomExercises(account?.plan ?? "free")) {
        return res.status(403).json({ message: "Upgrade to a paid plan to add a diagram to an exercise." });
      }

      const data = saveExerciseDiagramSchema.parse(req.body);
      const exercise = await storage.saveExerciseDiagram(id, accountId, data);
      if (!exercise) {
        return res.status(404).json({ message: "Exercise not found" });
      }
      const steps = await storage.getExerciseSteps(id);
      res.json({ ...exercise, steps });
    } catch (error) {
      res.status(400).json({ message: "Invalid diagram data" });
    }
  });

  app.delete("/api/exercises/:id/diagram", blockReadOnlyMembers, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (!canUseCustomExercises(account?.plan ?? "free")) {
        return res.status(403).json({ message: "Upgrade to a paid plan to edit an exercise's diagram." });
      }

      const deleted = await storage.deleteExerciseDiagram(id, accountId);
      if (!deleted) {
        return res.status(404).json({ message: "Exercise not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete diagram" });
    }
  });

  const setCommunityShareSchema = z.object({ shared: z.boolean() });

  // Opting in/out of the community library is a personal visibility choice,
  // not "editing" the exercise — same rationale as favoriting, deliberately
  // not behind canUseCustomExercises. Publishing (shared: true) does require
  // a public name first, though — since the exercise now shows who
  // published it, there's no such thing as an anonymous publish anymore.
  app.put("/api/exercises/:id/share-community", blockReadOnlyMembers, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { shared } = setCommunityShareSchema.parse(req.body);

      // Ownership first (404 either way if this isn't the requester's own
      // exercise), so a request for someone else's id never reveals
      // anything about the requester's own public-name state.
      const existing = await storage.getExerciseById(id, accountId);
      if (!existing) {
        return res.status(404).json({ message: "Exercise not found" });
      }
      if (shared) {
        const account = await storage.getAccountById(accountId);
        if (!account?.publicName) {
          return res.status(409).json({ message: "Set a public name before publishing to the community.", code: "PUBLIC_NAME_REQUIRED" });
        }
      }
      const exercise = await storage.setExerciseCommunityShare(id, accountId, shared);

      if (!exercise) {
        return res.status(404).json({ message: "Exercise not found" });
      }

      res.json(exercise);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Cross-account by design — any signed-in coach can browse what other
  // coaches have opted to share, same as browsing their own library.
  // publishedBy exposes the sharing account's public name (never its
  // accountId/email directly) now that publishing requires one — see PUT
  // /api/exercises/:id/share-community.
  app.get("/api/community-exercises", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const sort = req.query.sort === "popular" ? "popular" : "recent";
      const followingOnly = req.query.following === "true";
      const savedOnly = req.query.saved === "true";
      const shared = await storage.getCommunityExercises(accountId, { sort, followingOnly, savedOnly });
      res.json(shared.map(({ id, name, description, category, duration, difficulty, instructions, imageUrl, minPlayers, nameEs, descriptionEs, instructionsEs, likeCount, likedByMe, savedByMe, commentCount, avgRating, ratingCount, myRating, publishedBy }) =>
        ({ id, name, description, category, duration, difficulty, instructions, imageUrl, minPlayers, nameEs, descriptionEs, instructionsEs, likeCount, likedByMe, savedByMe, commentCount, avgRating, ratingCount, myRating, publishedBy })
      ));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch community exercises" });
    }
  });

  // Liking is free on every plan, same as favoriting — see the community
  // share route above for why publishing/importing are gated but this isn't.
  app.post("/api/community-exercises/:id/like", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const liked = await storage.likeExercise(id, accountId);
      if (!liked) {
        return res.status(404).json({ message: "Community exercise not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to like exercise" });
    }
  });

  app.delete("/api/community-exercises/:id/like", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unlikeExercise(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to unlike exercise" });
    }
  });

  // A public 1-5 star rating, distinct from liking — see exerciseRatings in
  // shared/schema.ts. Free on every plan, same as liking; re-rating just
  // updates the coach's own row (storage.rateExercise upserts).
  app.put("/api/community-exercises/:id/rating", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { rating } = rateContentSchema.parse(req.body);
      const rated = await storage.rateExercise(id, accountId, rating);
      if (!rated) {
        return res.status(404).json({ message: "Community exercise not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Invalid rating" });
    }
  });

  app.delete("/api/community-exercises/:id/rating", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unrateExercise(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove rating" });
    }
  });

  // "Guardado" — a private bookmark, distinct from liking (see exerciseSaves
  // in shared/schema.ts). Free on every plan, same as liking.
  app.post("/api/community-exercises/:id/save", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const saved = await storage.saveExercise(id, accountId);
      if (!saved) {
        return res.status(404).json({ message: "Community exercise not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to save exercise" });
    }
  });

  app.delete("/api/community-exercises/:id/save", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unsaveExercise(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to unsave exercise" });
    }
  });

  // Comments show the author's name next to real text, so posting one
  // needs a public name set first — same 409 PUBLIC_NAME_REQUIRED gate as
  // publishing (see PUT /api/exercises/:id/share-community).
  app.get("/api/community-exercises/:id/comments", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const comments = await storage.getExerciseComments(id, accountId);
      if (!comments) {
        return res.status(404).json({ message: "Community exercise not found" });
      }
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/community-exercises/:id/comments", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (!account?.publicName) {
        return res.status(409).json({ message: "Set a public name before commenting.", code: "PUBLIC_NAME_REQUIRED" });
      }

      const { body } = createExerciseCommentSchema.parse(req.body);
      const comment = await storage.createExerciseComment(id, accountId, body);
      if (!comment) {
        return res.status(404).json({ message: "Community exercise not found" });
      }
      res.status(201).json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment" });
    }
  });

  // Deletable by the comment's own author or the exercise's owner
  // (moderating their own published content) — nobody else, see
  // storage.deleteExerciseComment. 404 either way so a requester who isn't
  // allowed can't tell "not found" from "not yours to delete".
  app.delete("/api/community-exercises/:id/comments/:commentId", async (req, res) => {
    try {
      const commentId = parseId(req, res, "commentId");
      if (commentId === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const deleted = await storage.deleteExerciseComment(commentId, accountId);
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Flags an exercise for admin review — see server/storage.ts's
  // reportExercise for the "already_reported" idempotency and GET
  // /api/admin/reports for how an admin acts on it. Free on every plan,
  // same as liking/commenting; not a publicName-gated action since the
  // reporter's identity is never shown to anyone but an admin.
  app.post("/api/community-exercises/:id/report", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { reason, details } = createReportSchema.parse(req.body);
      const result = await storage.reportExercise(id, accountId, reason, details);
      if (result === "not_found") {
        return res.status(404).json({ message: "Community exercise not found" });
      }
      res.status(201).json({ status: result });
    } catch (error) {
      res.status(400).json({ message: "Invalid report" });
    }
  });

  // Following is free on every plan, same as liking. accountId here is
  // always the *target* being followed — the follower is always resolved
  // from the session, same as everywhere else in this file.
  app.post("/api/coaches/:accountId/follow", async (req, res) => {
    try {
      const targetId = parseId(req, res, "accountId");
      if (targetId === null) return;
      const followerAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      if (followerAccountId === targetId) {
        return res.status(400).json({ message: "You can't follow yourself" });
      }

      const followed = await storage.followCoach(followerAccountId, targetId);
      if (!followed) {
        return res.status(404).json({ message: "Coach not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to follow coach" });
    }
  });

  app.delete("/api/coaches/:accountId/follow", async (req, res) => {
    try {
      const targetId = parseId(req, res, "accountId");
      if (targetId === null) return;
      const followerAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unfollowCoach(followerAccountId, targetId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to unfollow coach" });
    }
  });

  // A coach's public mini-profile — 404s for both "no such account" and
  // "that account never set a public name" alike, so probing account ids
  // can't distinguish the two.
  // Registered before /api/coaches/:accountId below — Express matches route
  // patterns in registration order, and :accountId would otherwise swallow
  // "suggested" as its param value (then 400 on failing to parse it as a number).
  app.get("/api/coaches/suggested", async (req, res) => {
    try {
      const viewerAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const requested = parseInt(req.query.limit as string);
      const limit = Number.isNaN(requested) ? 5 : Math.min(Math.max(requested, 1), 1000);
      const suggestions = await storage.getSuggestedCoaches(viewerAccountId, limit);
      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch suggested coaches" });
    }
  });

  app.get("/api/coaches/:accountId", async (req, res) => {
    try {
      const targetId = parseId(req, res, "accountId");
      if (targetId === null) return;
      const viewerAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const profile = await storage.getCoachProfile(targetId, viewerAccountId);
      if (!profile) {
        return res.status(404).json({ message: "Coach not found" });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch coach profile" });
    }
  });

  // The bell-icon feed — a coach was followed, or one of their published
  // exercises got liked. See storage.createNotification for how these get
  // created (never directly from a route; always a side effect of
  // followCoach/likeExercise).
  app.get("/api/notifications", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const [items, unreadCount] = await Promise.all([
        storage.getNotifications(accountId),
        storage.getUnreadNotificationCount(accountId),
      ]);
      res.json({ notifications: items, unreadCount });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.markAllNotificationsRead(accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notifications read" });
    }
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.markNotificationRead(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  // Importing copies the drill into your own library, so it's gated the
  // same as creating any other custom exercise.
  app.post("/api/community-exercises/:id/import", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (!canUseCustomExercises(account?.plan ?? "free")) {
        return res.status(403).json({ message: "Upgrade to a paid plan to import community exercises." });
      }

      const imported = await storage.importCommunityExercise(id, accountId);
      if (!imported) {
        return res.status(404).json({ message: "Community exercise not found" });
      }
      res.status(201).json(imported);
    } catch (error) {
      res.status(500).json({ message: "Failed to import exercise" });
    }
  });

  // Evaluation tests — general player evaluation (physical and skill
  // tests alike), scored automatically 1-100 (see computeEvaluationScore).
  // Templates scoped by account, shared across that account's teams (and,
  // for a Club coach, across the whole club — see resolveEffectiveAccountId),
  // same as exercises. No plan gate: available on every plan.
  app.get("/api/evaluation-tests", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const tests = await storage.getAllEvaluationTests(accountId);
      res.json(tests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch evaluation tests" });
    }
  });

  app.post("/api/evaluation-tests", blockReadOnlyMembers, async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const testData = insertEvaluationTestSchema.parse(req.body);
      const test = await storage.createEvaluationTest(accountId, testData);
      res.status(201).json(test);
    } catch (error) {
      res.status(400).json({ message: "Invalid evaluation test data" });
    }
  });

  app.put("/api/evaluation-tests/:id", blockReadOnlyMembers, async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const id = parseId(req, res);
      if (id === null) return;
      const updateData = evaluationTestFieldsSchema.partial().parse(req.body);
      const test = await storage.updateEvaluationTest(id, accountId, updateData);

      if (!test) {
        return res.status(404).json({ message: "Evaluation test not found" });
      }

      res.json(test);
    } catch (error) {
      res.status(400).json({ message: "Invalid evaluation test data" });
    }
  });

  app.delete("/api/evaluation-tests/:id", blockReadOnlyMembers, async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const id = parseId(req, res);
      if (id === null) return;
      const deleted = await storage.deleteEvaluationTest(id, accountId);

      if (!deleted) {
        return res.status(404).json({ message: "Evaluation test not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete evaluation test" });
    }
  });

  const setEvaluationTestCommunityShareSchema = z.object({ shared: z.boolean() });

  app.put("/api/evaluation-tests/:id/share-community", blockReadOnlyMembers, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { shared } = setEvaluationTestCommunityShareSchema.parse(req.body);

      const existing = await storage.getEvaluationTestById(id, accountId);
      if (!existing) {
        return res.status(404).json({ message: "Evaluation test not found" });
      }
      if (shared) {
        const account = await storage.getAccountById(accountId);
        if (!account?.publicName) {
          return res.status(409).json({ message: "Set a public name before publishing to the community.", code: "PUBLIC_NAME_REQUIRED" });
        }
      }
      const test = await storage.setEvaluationTestCommunityShare(id, accountId, shared);
      if (!test) {
        return res.status(404).json({ message: "Evaluation test not found" });
      }
      res.json(test);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.get("/api/community-evaluation-tests", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const sort = req.query.sort === "popular" ? "popular" : "recent";
      const followingOnly = req.query.following === "true";
      const savedOnly = req.query.saved === "true";
      const shared = await storage.getCommunityEvaluationTests(accountId, { sort, followingOnly, savedOnly });
      res.json(shared.map(({ id, name, type, unit, worstValue, bestValue, description, likeCount, likedByMe, savedByMe, commentCount, avgRating, ratingCount, myRating, publishedBy }) =>
        ({ id, name, type, unit, worstValue, bestValue, description, likeCount, likedByMe, savedByMe, commentCount, avgRating, ratingCount, myRating, publishedBy })
      ));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch community evaluation tests" });
    }
  });

  app.post("/api/community-evaluation-tests/:id/like", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const liked = await storage.likeEvaluationTest(id, accountId);
      if (!liked) {
        return res.status(404).json({ message: "Community evaluation test not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to like evaluation test" });
    }
  });

  app.delete("/api/community-evaluation-tests/:id/like", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unlikeEvaluationTest(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to unlike evaluation test" });
    }
  });

  // A public 1-5 star rating, distinct from liking — see
  // /api/community-exercises/:id/rating for the same pattern.
  app.put("/api/community-evaluation-tests/:id/rating", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { rating } = rateContentSchema.parse(req.body);
      const rated = await storage.rateEvaluationTest(id, accountId, rating);
      if (!rated) {
        return res.status(404).json({ message: "Community evaluation test not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Invalid rating" });
    }
  });

  app.delete("/api/community-evaluation-tests/:id/rating", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unrateEvaluationTest(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove rating" });
    }
  });

  app.post("/api/community-evaluation-tests/:id/save", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const saved = await storage.saveEvaluationTest(id, accountId);
      if (!saved) {
        return res.status(404).json({ message: "Community evaluation test not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to save evaluation test" });
    }
  });

  app.delete("/api/community-evaluation-tests/:id/save", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unsaveEvaluationTest(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to unsave evaluation test" });
    }
  });

  app.get("/api/community-evaluation-tests/:id/comments", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const comments = await storage.getEvaluationTestComments(id, accountId);
      if (!comments) {
        return res.status(404).json({ message: "Community evaluation test not found" });
      }
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/community-evaluation-tests/:id/comments", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (!account?.publicName) {
        return res.status(409).json({ message: "Set a public name before commenting.", code: "PUBLIC_NAME_REQUIRED" });
      }

      const { body } = createExerciseCommentSchema.parse(req.body);
      const comment = await storage.createEvaluationTestComment(id, accountId, body);
      if (!comment) {
        return res.status(404).json({ message: "Community evaluation test not found" });
      }
      res.status(201).json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment" });
    }
  });

  app.delete("/api/community-evaluation-tests/:id/comments/:commentId", async (req, res) => {
    try {
      const commentId = parseId(req, res, "commentId");
      if (commentId === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const deleted = await storage.deleteEvaluationTestComment(commentId, accountId);
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Same reporting mechanism as /api/community-exercises/:id/report.
  app.post("/api/community-evaluation-tests/:id/report", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { reason, details } = createReportSchema.parse(req.body);
      const result = await storage.reportEvaluationTest(id, accountId, reason, details);
      if (result === "not_found") {
        return res.status(404).json({ message: "Community evaluation test not found" });
      }
      res.status(201).json({ status: result });
    } catch (error) {
      res.status(400).json({ message: "Invalid report" });
    }
  });

  app.post("/api/community-evaluation-tests/:id/import", async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const imported = await storage.importCommunityEvaluationTest(id, accountId);
      if (!imported) {
        return res.status(404).json({ message: "Community evaluation test not found" });
      }
      res.status(201).json(imported);
    } catch (error) {
      res.status(500).json({ message: "Failed to import evaluation test" });
    }
  });

  // Results can be a whole active roster recorded in one batch, or a single
  // {playerId, value} entry — the same endpoint backs both the team-wide
  // "Record results" dialog and the player profile's quick single-test add.
  app.post("/api/evaluation-tests/:id/results", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const test = await storage.getEvaluationTestById(id, accountId);
      if (!test) {
        return res.status(404).json({ message: "Evaluation test not found" });
      }

      const { date, results } = recordEvaluationTestResultsSchema.parse(req.body);
      const teamPlayers = await storage.getAllPlayers(req.session.currentTeamId!);
      const teamPlayerIds = new Set(teamPlayers.map((p) => p.id));
      const invalidPlayerId = results.find((r) => !teamPlayerIds.has(r.playerId));
      if (invalidPlayerId) {
        return res.status(400).json({ message: "One or more players don't belong to the current team." });
      }

      // Snapshot each player's best-ever value AND current score before
      // inserting, so we can tell who beat their personal record and (for
      // the proactive push below) whose score actually went up.
      const lowerIsBetter = test.bestValue < test.worstValue;
      const previousBests = await storage.getBestEvaluationTestValues(id, results.map((r) => r.playerId), test.worstValue, test.bestValue);
      const saved = await storage.recordEvaluationTestResults(id, date, results);
      const newRecordPlayerIds = results
        .filter((r) => {
          const prevBest = previousBests[r.playerId];
          if (prevBest === undefined) return false;
          return lowerIsBetter ? r.value < prevBest : r.value > prevBest;
        })
        .map((r) => r.playerId);

      // "Proactive parent mode": push straight to whoever's subscribed to a
      // player's own portal the moment their score on this test goes up —
      // same best-effort, no-digest behavior the old skill-rating push had.
      if (isPushConfigured()) {
        for (const r of results) {
          const prevBest = previousBests[r.playerId];
          if (prevBest === undefined) continue;
          const prevScore = computeEvaluationScore(prevBest, test.worstValue, test.bestValue);
          const newScore = computeEvaluationScore(r.value, test.worstValue, test.bestValue);
          if (newScore <= prevScore) continue;
          try {
            const player = teamPlayers.find((p) => p.id === r.playerId);
            await notifyPlayer(r.playerId, {
              title: `${player?.name ?? "Player"}'s progress`,
              body: `Nice improvement: ${test.name} ${prevScore}→${newScore}`,
            });
          } catch {
            // Best-effort — a push failure shouldn't fail the results save.
          }
        }
      }

      res.status(201).json({ results: saved, newRecordPlayerIds });
    } catch (error) {
      res.status(400).json({ message: "Invalid evaluation test results" });
    }
  });

  app.get("/api/evaluation-tests/:id/latest", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const latest = await storage.getLatestEvaluationTestResultsForTeam(id, req.session.currentTeamId!);
      res.json(latest);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch latest results" });
    }
  });

  app.get("/api/players/:id/evaluation-results", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const history = await storage.getEvaluationTestResultsForPlayer(id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch evaluation results" });
    }
  });

  // Roster-wide latest score per player per test — feeds the scrimmage team
  // balancer, which needs every player's snapshot at once.
  app.get("/api/players/evaluation-scores", requireTeam, async (req, res) => {
    try {
      const scores = await storage.getCurrentEvaluationScoresForTeam(req.session.currentTeamId!);
      res.json(scores);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch evaluation scores" });
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

  // Same defense-in-depth as sanitizeExerciseIds above — evaluation tests
  // are scoped by accountId, not team, same as exercises.
  async function sanitizeTestIds(accountId: number, testIds: string[] | null | undefined) {
    if (!testIds || testIds.length === 0) return testIds;
    const owned = await storage.getAllEvaluationTests(accountId);
    const ownedIds = new Set(owned.map(t => t.id.toString()));
    return testIds.filter(id => ownedIds.has(id));
  }

  const generatePlanSchema = z.object({
    instructions: z.string().max(500).optional(),
    // How many players will attend — lets the generator only pick exercises
    // whose minPlayers actually fits the group. Optional so calling the API
    // directly without it still works (falls back to the old unfiltered
    // behavior); the client UI always asks for it.
    playerCount: z.number().int().min(1).max(200).optional(),
  });

  // AI practice-plan draft — picks exercises from the coach's own library
  // (never invents one) plus a suggested name/notes/duration. Returned as a
  // draft only; nothing is saved until the coach reviews it and submits the
  // normal POST /api/training-sessions below.
  app.post("/api/training-sessions/generate-plan", requireTeam, sessionPlanRateLimiter, async (req, res) => {
    const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
    const account = await storage.getAccountById(accountId);
    const trialUsed = account?.aiSessionPlanTrialUsedAt != null;
    if (!canGenerateAiSessionPlan(account?.plan ?? "free", trialUsed)) {
      return res.status(403).json({ message: "Upgrade to a paid plan to generate a practice plan with AI." });
    }

    const parseResult = generatePlanSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: "Invalid request." });
    }
    const { instructions, playerCount } = parseResult.data;

    if (!isAIConfigured()) {
      return res.status(503).json({ message: "AI practice plans aren't configured yet." });
    }

    const teamId = req.session.currentTeamId!;
    const allExercises = await storage.getAllExercises(accountId);
    if (allExercises.length === 0) {
      return res.status(400).json({ message: "Add some exercises to your library first." });
    }
    const exercises = filterExercisesForPlayerCount(allExercises, playerCount);
    if (exercises.length === 0) {
      return res.status(400).json({ message: `None of your exercises fit a group of ${playerCount} players. Lower the player count, or add exercises with a smaller minimum.` });
    }
    const recentSessions = (await storage.getAllTrainingSessions(teamId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const context = await buildSessionPlanContext(teamId);

    try {
      const plan = await generateSessionPlan(exercises, recentSessions, instructions, context, playerCount);
      plan.exerciseIds = (await sanitizeExerciseIds(accountId, plan.exerciseIds)) ?? [];
      if (!isPaidPlan(account?.plan ?? "free") && !trialUsed) {
        await storage.markAiSessionPlanTrialUsed(accountId);
      }
      trackEvent(accountId, "ai_session_plan_generated");
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
    if (!canUseAiCommands(account?.plan ?? "free")) {
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

  const helpChatSchema = z.object({
    // Capped well below what a real back-and-forth needs (10 exchanges) —
    // the client already trims its local history to the same bound before
    // sending, this is just the server-side backstop against a hand-built
    // request with a huge fabricated history running up the token bill.
    messages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(2000),
    })).min(1).max(20),
  });

  // A conversational "how do I..." helper — see server/ai-help.ts for what
  // it's told about the app. Stateless on the server: the client resends
  // the whole visible conversation each turn (same pattern the Anthropic
  // Messages API itself uses), so there's no chat history to store or
  // clean up server-side.
  app.post("/api/ai/help-chat", requireTeam, sessionPlanRateLimiter, async (req, res) => {
    const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
    const account = await storage.getAccountById(accountId);
    if (!canUseAiHelp(account?.plan ?? "free")) {
      return res.status(403).json({ message: "Upgrade to a paid plan to ask the AI helper." });
    }

    const parseResult = helpChatSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: "Invalid request." });
    }

    if (!isAIConfigured()) {
      return res.status(503).json({ message: "The AI helper isn't configured yet." });
    }

    try {
      const reply = await answerHelpQuestion(parseResult.data.messages as HelpChatMessage[]);
      res.json({ reply });
    } catch (error) {
      res.status(502).json({ message: "Couldn't get an answer right now. Try again in a moment." });
    }
  });

  app.post("/api/training-sessions", requireTeam, async (req, res) => {
    try {
      const sessionData = insertTrainingSessionSchema.parse(req.body);
      sessionData.exerciseIds = await sanitizeExerciseIds(req.session.accountId!, sessionData.exerciseIds);
      sessionData.playIds = await sanitizePlayIds(req.session.currentTeamId!, sessionData.playIds);
      sessionData.testIds = await sanitizeTestIds(req.session.accountId!, sessionData.testIds);
      const session = await storage.createTrainingSession(req.session.currentTeamId!, sessionData);
      trackEvent(req.session.accountId!, "training_session_created");
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
      if (updateData.testIds) {
        updateData.testIds = await sanitizeTestIds(req.session.accountId!, updateData.testIds);
      }
      // Fetched before the update purely to detect an actual status
      // transition below — re-saving a session that's already "completed"
      // (editing notes afterward, say) shouldn't fire the event again.
      const before = updateData.status ? await storage.getTrainingSessionById(id, req.session.currentTeamId!) : undefined;
      const session = await storage.updateTrainingSession(id, req.session.currentTeamId!, updateData);

      if (!session) {
        return res.status(404).json({ message: "Training session not found" });
      }
      if (updateData.status && updateData.status !== before?.status) {
        if (updateData.status === "in_progress") trackEvent(req.session.accountId!, "training_started");
        else if (updateData.status === "completed") trackEvent(req.session.accountId!, "training_completed");
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
      data.testIds = await sanitizeTestIds(req.session.accountId!, data.testIds);
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
      // A minor's medical notes can't be recorded without guardian
      // authorization, which can't exist yet for a player who doesn't exist
      // yet — rather than blocking creation of the rest of the roster entry,
      // silently drop them and tell the client so it can prompt the coach to
      // request authorization from the new player's profile afterward.
      let medicalNotesWithheld = false;
      if (playerData.medicalNotes && isMinor(playerData.birthDate)) {
        playerData.medicalNotes = null;
        medicalNotesWithheld = true;
      }
      const player = await storage.createPlayer(teamId, playerData);
      trackEvent(effectiveAccountId, "player_added", { count: 1 });
      res.status(201).json({ ...player, medicalNotesWithheld });
    } catch (error) {
      res.status(400).json({ message: "Invalid player data" });
    }
  });

  // Quick roster entry — a coach pastes/types a whole team (name + optional
  // jersey number) at once instead of opening "Add Player" N times. No
  // medical/consent fields exist at this point, so there's nothing to gate
  // on minors here (see the singular POST above for that logic).
  app.post("/api/players/bulk", requireTeam, async (req, res) => {
    try {
      const teamId = req.session.currentTeamId!;
      const effectiveAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(effectiveAccountId);

      const { players: newPlayers } = bulkCreatePlayersSchema.parse(req.body);

      const currentPlayerCount = await storage.getPlayerCount(teamId);
      if (!isPaidPlan(account?.plan ?? "free")) {
        const remaining = FREE_PLAN_PLAYER_LIMIT - currentPlayerCount;
        if (newPlayers.length > Math.max(remaining, 0)) {
          return res.status(403).json({
            message: `Free plan is limited to ${FREE_PLAN_PLAYER_LIMIT} players — only room for ${Math.max(remaining, 0)} more. Upgrade to add the rest.`,
          });
        }
      }

      const created = await storage.createPlayers(teamId, newPlayers);
      trackEvent(effectiveAccountId, "player_added", { count: created.length, bulk: true });
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ message: "Invalid player data" });
    }
  });

  app.put("/api/players/:id", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const existing = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!existing) {
        return res.status(404).json({ message: "Player not found" });
      }

      const updateData = insertPlayerSchema.partial().parse(req.body);
      const newMedicalNotes = updateData.medicalNotes;
      const isNewOrChangedMedicalNotes =
        typeof newMedicalNotes === "string" && newMedicalNotes.trim() && newMedicalNotes !== existing.medicalNotes;
      if (isNewOrChangedMedicalNotes) {
        const birthDate = updateData.birthDate !== undefined ? updateData.birthDate : existing.birthDate;
        if (!(await hasMedicalDataAuthorization({ id, birthDate }))) {
          return res.status(403).json({ message: MEDICAL_CONSENT_REQUIRED_MESSAGE, code: "guardian_authorization_required" });
        }
      }

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

  // Freeform coach notes on a player, gated on the player actually
  // belonging to the current team.
  app.get("/api/players/:id/notes", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      const notes = await storage.getPlayerNotes(id);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.post("/api/players/:id/notes", requireTeamAllowHelperWrites, async (req, res) => {
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

  app.delete("/api/players/:id/notes/:noteId", requireTeamAllowHelperWrites, async (req, res) => {
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
      if (!(await hasMedicalDataAuthorization(player))) {
        return res.status(403).json({ message: MEDICAL_CONSENT_REQUIRED_MESSAGE, code: "guardian_authorization_required" });
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
      // Fire-and-forget — a logging hiccup shouldn't fail a parent's page
      // load, it just means this one visit is missing from the log.
      storage.logPortalAccess(data.player.id).catch(() => {});
      // null when VAPID keys aren't configured — the client hides the
      // "enable notifications" button in that case rather than offering a
      // subscribe flow that would just fail.
      res.json({ ...data, vapidPublicKey: getVapidPublicKey() });
    } catch (error) {
      res.status(500).json({ message: "Failed to load portal" });
    }
  });

  // Same token, a different shape — one shareable card instead of the
  // day-to-day utility view above, meant to be linked or screenshotted
  // outward. Doesn't log a portal-access visit the way the GET above does;
  // logPortalAccess exists to flag unusual traffic on the family's own
  // link, and a recap getting reshared is the point, not a signal to flag.
  app.get("/api/portal/:token/summary", portalRateLimiter, async (req, res) => {
    try {
      const summary = await storage.getPlayerSeasonSummary(req.params.token);
      if (!summary) {
        return res.status(404).json({ message: "Link not found or no longer active" });
      }
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to load season summary" });
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

  app.post("/api/attendance", requireTeamAllowHelperWrites, async (req, res) => {
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

  app.put("/api/attendance/:id", requireTeamAllowHelperWrites, async (req, res) => {
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

  app.get("/api/team-progress", requireTeam, async (req, res) => {
    try {
      const summary = await storage.getTeamProgressSummary(req.session.currentTeamId!);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team progress" });
    }
  });

  app.get("/api/players/attention", requireTeam, async (req, res) => {
    try {
      const flags = await storage.getPlayersNeedingAttention(req.session.currentTeamId!);
      res.json(flags);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch players needing attention" });
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

  const setPlayFavoriteSchema = z.object({ isFavorite: z.boolean() });

  // Favoriting is a personal organizational flag, not "creating a play" —
  // deliberately not counted against the plan's saved-play limit.
  app.put("/api/plays/:id/favorite", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const { isFavorite } = setPlayFavoriteSchema.parse(req.body);
      const play = await storage.setPlayFavorite(id, req.session.currentTeamId!, isFavorite);
      if (!play) {
        return res.status(404).json({ message: "Play not found" });
      }
      res.json(play);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  const setPlayCommunityShareSchema = z.object({ shared: z.boolean() });

  // Play community — same shape and gating as the exercise community above
  // (see PUT /api/exercises/:id/share-community's comment for why publishing
  // needs a public name first), scoped by teamId since a play belongs to a
  // team rather than directly to an account.
  app.put("/api/plays/:id/share-community", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const teamId = req.session.currentTeamId!;
      const { shared } = setPlayCommunityShareSchema.parse(req.body);

      const existing = await storage.getPlayById(id, teamId);
      if (!existing) {
        return res.status(404).json({ message: "Play not found" });
      }
      if (shared) {
        const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
        const account = await storage.getAccountById(accountId);
        if (!account?.publicName) {
          return res.status(409).json({ message: "Set a public name before publishing to the community.", code: "PUBLIC_NAME_REQUIRED" });
        }
      }
      const play = await storage.setPlayCommunityShare(id, teamId, shared);
      if (!play) {
        return res.status(404).json({ message: "Play not found" });
      }
      res.json(play);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.get("/api/community-plays", requireTeam, async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const sort = req.query.sort === "popular" ? "popular" : "recent";
      const followingOnly = req.query.following === "true";
      const savedOnly = req.query.saved === "true";
      const shared = await storage.getCommunityPlays(accountId, { sort, followingOnly, savedOnly });
      res.json(shared.map(({ id, name, category, courtType, situation, notes, likeCount, likedByMe, savedByMe, commentCount, avgRating, ratingCount, myRating, publishedBy }) =>
        ({ id, name, category, courtType, situation, notes, likeCount, likedByMe, savedByMe, commentCount, avgRating, ratingCount, myRating, publishedBy })
      ));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch community plays" });
    }
  });

  app.post("/api/community-plays/:id/like", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const liked = await storage.likePlay(id, accountId);
      if (!liked) {
        return res.status(404).json({ message: "Community play not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to like play" });
    }
  });

  app.delete("/api/community-plays/:id/like", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unlikePlay(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to unlike play" });
    }
  });

  // A public 1-5 star rating, distinct from liking — see
  // /api/community-exercises/:id/rating for the same pattern.
  app.put("/api/community-plays/:id/rating", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { rating } = rateContentSchema.parse(req.body);
      const rated = await storage.ratePlay(id, accountId, rating);
      if (!rated) {
        return res.status(404).json({ message: "Community play not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Invalid rating" });
    }
  });

  app.delete("/api/community-plays/:id/rating", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unratePlay(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove rating" });
    }
  });

  // "Guardado" — a private bookmark, distinct from liking (see playSaves in
  // shared/schema.ts). Free on every plan, same as liking.
  app.post("/api/community-plays/:id/save", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const saved = await storage.savePlay(id, accountId);
      if (!saved) {
        return res.status(404).json({ message: "Community play not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to save play" });
    }
  });

  app.delete("/api/community-plays/:id/save", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      await storage.unsavePlay(id, accountId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to unsave play" });
    }
  });

  app.get("/api/community-plays/:id/comments", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const comments = await storage.getPlayComments(id, accountId);
      if (!comments) {
        return res.status(404).json({ message: "Community play not found" });
      }
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/community-plays/:id/comments", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (!account?.publicName) {
        return res.status(409).json({ message: "Set a public name before commenting.", code: "PUBLIC_NAME_REQUIRED" });
      }

      const { body } = createExerciseCommentSchema.parse(req.body);
      const comment = await storage.createPlayComment(id, accountId, body);
      if (!comment) {
        return res.status(404).json({ message: "Community play not found" });
      }
      res.status(201).json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment" });
    }
  });

  app.delete("/api/community-plays/:id/comments/:commentId", requireTeam, async (req, res) => {
    try {
      const commentId = parseId(req, res, "commentId");
      if (commentId === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const deleted = await storage.deletePlayComment(commentId, accountId);
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Same reporting mechanism as /api/community-exercises/:id/report.
  app.post("/api/community-plays/:id/report", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const { reason, details } = createReportSchema.parse(req.body);
      const result = await storage.reportPlay(id, accountId, reason, details);
      if (result === "not_found") {
        return res.status(404).json({ message: "Community play not found" });
      }
      res.status(201).json({ status: result });
    } catch (error) {
      res.status(400).json({ message: "Invalid report" });
    }
  });

  // Importing consumes a play slot exactly like drawing up a new one from
  // scratch — plays were never behind the exercises-style "custom content
  // requires paid" gate, just the free plan's play-count cap, so importing
  // stays consistent with that (not a blanket paid-only gate).
  app.post("/api/community-plays/:id/import", requireTeam, async (req, res) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const teamId = req.session.currentTeamId!;
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      const currentPlayCount = await storage.getPlayCount(teamId);
      if (!canCreatePlay(account?.plan ?? "free", currentPlayCount)) {
        return res.status(403).json({
          message: `Free plan is limited to ${FREE_PLAN_PLAY_LIMIT} saved plays. Upgrade to save more.`,
        });
      }

      const imported = await storage.importCommunityPlay(id, teamId);
      if (!imported) {
        return res.status(404).json({ message: "Community play not found" });
      }
      res.status(201).json(imported);
    } catch (error) {
      res.status(500).json({ message: "Failed to import play" });
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

  // Admin content moderation — gated on accounts.isAdmin (set by hand in
  // the database, never through the API; see shared/schema.ts). Every
  // other route in this file only ever acts on the caller's own data, so
  // this is deliberately the one place that reads across every account's
  // published content.
  app.get("/api/admin/reports", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (account?.isAdmin !== 1) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const reports = await storage.getPendingReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // The 10 product metrics from the audit, last 30 days — same admin gate
  // as reports above.
  app.get("/api/admin/analytics", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (account?.isAdmin !== 1) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const counts = await getEventCounts(30);
      res.json(counts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  const reportContentTypes = ["exercise", "play", "evaluationTest"] as const;
  const resolveReportSchema = z.object({ action: z.enum(["dismiss", "remove"]) });

  app.post("/api/admin/reports/:contentType/:id/resolve", async (req, res) => {
    try {
      const accountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const account = await storage.getAccountById(accountId);
      if (account?.isAdmin !== 1) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const contentType = req.params.contentType as typeof reportContentTypes[number];
      if (!reportContentTypes.includes(contentType)) {
        return res.status(400).json({ message: "Invalid content type" });
      }
      const id = parseId(req, res);
      if (id === null) return;
      const { action } = resolveReportSchema.parse(req.body);

      const resolved = await storage.resolveReport(contentType, id, action);
      if (!resolved) {
        return res.status(404).json({ message: "Report not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Failed to resolve report" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
