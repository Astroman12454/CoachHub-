import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { requireTeam } from "./auth";
import { registerBillingRoutes } from "./billing";
import { isAIConfigured, extractBoxScore } from "./ai-vision";
import { generateSessionPlan } from "./ai-session-plan";
import { z } from "zod";
import {
  insertExerciseSchema,
  insertTrainingSessionSchema,
  insertPlayerSchema,
  insertAttendanceSchema,
  insertTeamSchema,
  createGameWithStatsSchema,
  FREE_PLAN_PLAYER_LIMIT,
  FREE_PLAN_TEAM_LIMIT,
} from "@shared/schema";

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
export async function registerRoutes(app: Express): Promise<Server> {
  registerBillingRoutes(app);

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
      const accountId = req.session.accountId!;
      const account = await storage.getAccountById(accountId);
      const existingTeams = await storage.getTeamsByAccount(accountId);

      if (account?.plan === "free" && existingTeams.length >= FREE_PLAN_TEAM_LIMIT) {
        return res.status(403).json({ message: "Upgrade to a paid plan to manage more than one team." });
      }

      const { name } = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam(accountId, name);
      res.status(201).json(team);
    } catch (error) {
      res.status(400).json({ message: "Invalid team data" });
    }
  });

  // Exercise routes — scoped by account, shared across that account's teams.
  app.get("/api/exercises", async (req, res) => {
    try {
      const accountId = req.session.accountId!;
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
      const exercise = await storage.getExerciseById(id, req.session.accountId!);

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
      const accountId = req.session.accountId!;
      const account = await storage.getAccountById(accountId);
      if (account?.plan === "free") {
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
      const accountId = req.session.accountId!;
      const account = await storage.getAccountById(accountId);
      if (account?.plan === "free") {
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
      const accountId = req.session.accountId!;
      const account = await storage.getAccountById(accountId);
      if (account?.plan === "free") {
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

  const generatePlanSchema = z.object({
    instructions: z.string().max(500).optional(),
  });

  // AI practice-plan draft — picks exercises from the coach's own library
  // (never invents one) plus a suggested name/notes/duration. Returned as a
  // draft only; nothing is saved until the coach reviews it and submits the
  // normal POST /api/training-sessions below.
  app.post("/api/training-sessions/generate-plan", requireTeam, sessionPlanRateLimiter, async (req, res) => {
    const accountId = req.session.accountId!;
    const account = await storage.getAccountById(accountId);
    if (account?.plan === "free") {
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

    try {
      const plan = await generateSessionPlan(exercises, recentSessions, instructions);
      plan.exerciseIds = (await sanitizeExerciseIds(accountId, plan.exerciseIds)) ?? [];
      res.json(plan);
    } catch (error) {
      res.status(502).json({ message: "Couldn't generate a plan right now. Try again, or build the session by hand." });
    }
  });

  app.post("/api/training-sessions", requireTeam, async (req, res) => {
    try {
      const sessionData = insertTrainingSessionSchema.parse(req.body);
      sessionData.exerciseIds = await sanitizeExerciseIds(req.session.accountId!, sessionData.exerciseIds);
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
      const account = await storage.getAccountById(req.session.accountId!);

      if (account?.plan === "free") {
        const currentCount = await storage.getPlayerCount(teamId);
        if (currentCount >= FREE_PLAN_PLAYER_LIMIT) {
          return res.status(403).json({
            message: `Free plan is limited to ${FREE_PLAN_PLAYER_LIMIT} players. Upgrade to add more.`,
          });
        }
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
      const session = await storage.getTrainingSessionById(existing.sessionId, req.session.currentTeamId!);
      if (!session) {
        return res.status(404).json({ message: "Attendance record not found" });
      }

      const updateData = insertAttendanceSchema.partial().parse(req.body);
      const attendanceRecord = await storage.updateAttendance(id, updateData);

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
      const account = await storage.getAccountById(req.session.accountId!);
      if (account?.plan === "free") {
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

  const httpServer = createServer(app);
  return httpServer;
}
