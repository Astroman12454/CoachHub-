import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExerciseSchema, insertTrainingSessionSchema, insertPlayerSchema, insertAttendanceSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Exercise routes
  app.get("/api/exercises", async (req, res) => {
    try {
      const { category } = req.query;
      let exercises;
      
      if (category && typeof category === "string") {
        exercises = await storage.getExercisesByCategory(category);
      } else {
        exercises = await storage.getAllExercises();
      }
      
      res.json(exercises);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exercises" });
    }
  });

  app.get("/api/exercises/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const exercise = await storage.getExerciseById(id);
      
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
      const exerciseData = insertExerciseSchema.parse(req.body);
      const exercise = await storage.createExercise(exerciseData);
      res.status(201).json(exercise);
    } catch (error) {
      res.status(400).json({ message: "Invalid exercise data" });
    }
  });

  app.put("/api/exercises/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = insertExerciseSchema.partial().parse(req.body);
      const exercise = await storage.updateExercise(id, updateData);
      
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
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteExercise(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Exercise not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete exercise" });
    }
  });

  // Training Session routes
  app.get("/api/training-sessions", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let sessions;
      
      if (startDate && endDate && typeof startDate === "string" && typeof endDate === "string") {
        sessions = await storage.getTrainingSessionsByDateRange(startDate, endDate);
      } else {
        sessions = await storage.getAllTrainingSessions();
      }
      
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch training sessions" });
    }
  });

  app.get("/api/training-sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = await storage.getTrainingSessionById(id);
      
      if (!session) {
        return res.status(404).json({ message: "Training session not found" });
      }
      
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch training session" });
    }
  });

  app.post("/api/training-sessions", async (req, res) => {
    try {
      const sessionData = insertTrainingSessionSchema.parse(req.body);
      const session = await storage.createTrainingSession(sessionData);
      res.status(201).json(session);
    } catch (error) {
      res.status(400).json({ message: "Invalid training session data" });
    }
  });

  app.put("/api/training-sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = insertTrainingSessionSchema.partial().parse(req.body);
      const session = await storage.updateTrainingSession(id, updateData);
      
      if (!session) {
        return res.status(404).json({ message: "Training session not found" });
      }
      
      res.json(session);
    } catch (error) {
      res.status(400).json({ message: "Invalid training session data" });
    }
  });

  app.delete("/api/training-sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteTrainingSession(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Training session not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete training session" });
    }
  });

  // Player routes
  app.get("/api/players", async (req, res) => {
    try {
      const players = await storage.getAllPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch players" });
    }
  });

  app.get("/api/players/count", async (req, res) => {
    try {
      const count = await storage.getActivePlayersCount();
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch player count" });
    }
  });

  app.post("/api/players", async (req, res) => {
    try {
      const playerData = insertPlayerSchema.parse(req.body);
      const player = await storage.createPlayer(playerData);
      res.status(201).json(player);
    } catch (error) {
      res.status(400).json({ message: "Invalid player data" });
    }
  });

  app.put("/api/players/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = insertPlayerSchema.partial().parse(req.body);
      const player = await storage.updatePlayer(id, updateData);
      
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      res.json(player);
    } catch (error) {
      res.status(400).json({ message: "Invalid player data" });
    }
  });

  app.delete("/api/players/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deletePlayer(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete player" });
    }
  });

  // Attendance routes
  app.get("/api/attendance/session/:sessionId", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const attendanceRecords = await storage.getAttendanceBySession(sessionId);
      res.json(attendanceRecords);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch attendance" });
    }
  });

  app.get("/api/attendance/player/:playerId", async (req, res) => {
    try {
      const playerId = parseInt(req.params.playerId);
      const attendanceRecords = await storage.getAttendanceByPlayer(playerId);
      res.json(attendanceRecords);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch player attendance" });
    }
  });

  app.post("/api/attendance", async (req, res) => {
    try {
      const attendanceData = insertAttendanceSchema.parse(req.body);
      const attendanceRecord = await storage.markAttendance(attendanceData);
      res.status(201).json(attendanceRecord);
    } catch (error) {
      res.status(400).json({ message: "Invalid attendance data" });
    }
  });

  app.put("/api/attendance/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = insertAttendanceSchema.partial().parse(req.body);
      const attendanceRecord = await storage.updateAttendance(id, updateData);
      
      if (!attendanceRecord) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      
      res.json(attendanceRecord);
    } catch (error) {
      res.status(400).json({ message: "Invalid attendance data" });
    }
  });

  app.get("/api/players/:playerId/attendance-stats", async (req, res) => {
    try {
      const playerId = parseInt(req.params.playerId);
      const stats = await storage.getPlayerAttendanceStats(playerId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch attendance stats" });
    }
  });

  // Stats endpoint for dashboard
  app.get("/api/stats", async (req, res) => {
    try {
      const sessions = await storage.getAllTrainingSessions();
      const exercises = await storage.getAllExercises();
      const activePlayersCount = await storage.getActivePlayersCount();
      
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
