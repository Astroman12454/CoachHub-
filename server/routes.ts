import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireTeam } from "./auth";
import { registerBillingRoutes } from "./billing";
import {
  insertExerciseSchema,
  insertTrainingSessionSchema,
  insertPlayerSchema,
  insertAttendanceSchema,
  insertTeamSchema,
  FREE_PLAN_PLAYER_LIMIT,
  FREE_PLAN_TEAM_LIMIT,
} from "@shared/schema";

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

  const httpServer = createServer(app);
  return httpServer;
}
