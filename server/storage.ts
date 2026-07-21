import { 
  exercises, 
  trainingSessions, 
  players,
  attendance,
  type Exercise, 
  type InsertExercise,
  type TrainingSession,
  type InsertTrainingSession,
  type Player,
  type InsertPlayer,
  type Attendance,
  type InsertAttendance
} from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";

export interface IStorage {
  // Exercise methods
  getAllExercises(): Promise<Exercise[]>;
  getExerciseById(id: number): Promise<Exercise | undefined>;
  getExercisesByCategory(category: string): Promise<Exercise[]>;
  createExercise(exercise: InsertExercise): Promise<Exercise>;
  updateExercise(id: number, exercise: Partial<InsertExercise>): Promise<Exercise | undefined>;
  deleteExercise(id: number): Promise<boolean>;

  // Training Session methods
  getAllTrainingSessions(): Promise<TrainingSession[]>;
  getTrainingSessionById(id: number): Promise<TrainingSession | undefined>;
  getTrainingSessionsByDateRange(startDate: string, endDate: string): Promise<TrainingSession[]>;
  createTrainingSession(session: InsertTrainingSession): Promise<TrainingSession>;
  updateTrainingSession(id: number, session: Partial<InsertTrainingSession>): Promise<TrainingSession | undefined>;
  deleteTrainingSession(id: number): Promise<boolean>;

  // Player methods
  getAllPlayers(): Promise<Player[]>;
  getPlayerById(id: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: number, player: Partial<InsertPlayer>): Promise<Player | undefined>;
  deletePlayer(id: number): Promise<boolean>;
  getActivePlayersCount(): Promise<number>;

  // Attendance methods
  getAttendanceBySession(sessionId: number): Promise<Attendance[]>;
  getAttendanceByPlayer(playerId: number): Promise<Attendance[]>;
  markAttendance(attendance: InsertAttendance): Promise<Attendance>;
  updateAttendance(id: number, attendance: Partial<InsertAttendance>): Promise<Attendance | undefined>;
  getPlayerAttendanceStats(playerId: number): Promise<{ total: number; present: number; absent: number; rate: number }>;
}

export class MemStorage implements IStorage {
  private exercises: Map<number, Exercise>;
  private trainingSessions: Map<number, TrainingSession>;
  private players: Map<number, Player>;
  private currentExerciseId: number;
  private currentSessionId: number;
  private currentPlayerId: number;

  constructor() {
    this.exercises = new Map();
    this.trainingSessions = new Map();
    this.players = new Map();
    this.currentExerciseId = 1;
    this.currentSessionId = 1;
    this.currentPlayerId = 1;

    // Initialize with some sample data
    this.initializeSampleData();
  }

  private initializeSampleData() {
    // Sample exercises
    const sampleExercises: InsertExercise[] = [
      {
        name: "Free Throw Form Drill",
        description: "Focus on consistent shooting form and follow-through technique",
        category: "shooting",
        duration: 15,
        difficulty: "medium",
        instructions: "Stand at the free throw line, focus on form and follow-through",
        imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200"
      },
      {
        name: "Cone Weaving Drill",
        description: "Improve ball handling and agility through cone navigation",
        category: "dribbling",
        duration: 10,
        difficulty: "easy",
        instructions: "Dribble through cones using both hands",
        imageUrl: "https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200"
      },
      {
        name: "Defensive Sliding Drill",
        description: "Build lateral quickness and proper defensive stance",
        category: "defense",
        duration: 20,
        difficulty: "hard",
        instructions: "Maintain low stance, slide laterally without crossing feet",
        imageUrl: "https://images.unsplash.com/photo-1518611012118-696072aa579a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200"
      },
      {
        name: "Chest Pass Accuracy",
        description: "Improve passing accuracy and technique",
        category: "passing",
        duration: 12,
        difficulty: "medium",
        instructions: "Pass the ball using proper chest pass technique to targets",
      },
      {
        name: "Suicide Sprints",
        description: "Build cardiovascular endurance and speed",
        category: "conditioning",
        duration: 8,
        difficulty: "hard",
        instructions: "Sprint to each line and back, touch each line",
      }
    ];

    sampleExercises.forEach(exercise => {
      this.createExercise(exercise);
    });

    // Sample training sessions
    const sampleSessions: InsertTrainingSession[] = [
      {
        name: "Offensive Fundamentals",
        date: "2025-06-24",
        time: "16:00",
        duration: 120,
        exerciseIds: ["1", "4"],
        notes: "Focus on shooting form and ball movement",
        attendanceCount: 16,
        totalPlayers: 18
      },
      {
        name: "Defensive Drills",
        date: "2025-06-25",
        time: "15:30",
        duration: 120,
        exerciseIds: ["3"],
        notes: "Emphasis on team defense",
        attendanceCount: 18,
        totalPlayers: 18
      }
    ];

    sampleSessions.forEach(session => {
      this.createTrainingSession(session);
    });

    // Sample players
    const samplePlayers: InsertPlayer[] = [
      { name: "Carlos García", position: "Point Guard", isActive: 1 },
      { name: "Miguel Rodriguez", position: "Shooting Guard", isActive: 1 },
      { name: "Antonio López", position: "Center", isActive: 1 },
      { name: "José Martínez", position: "Power Forward", isActive: 1 },
      { name: "Luis Hernández", position: "Small Forward", isActive: 1 },
      { name: "Francisco Silva", position: "Point Guard", isActive: 1 },
      { name: "Pablo Ruiz", position: "Shooting Guard", isActive: 1 },
      { name: "Diego Morales", position: "Center", isActive: 1 },
      { name: "Andrés Vásquez", position: "Power Forward", isActive: 1 },
      { name: "Ricardo Torres", position: "Small Forward", isActive: 1 },
      { name: "Alejandro Pérez", position: "Point Guard", isActive: 1 },
      { name: "Fernando Castro", position: "Shooting Guard", isActive: 1 },
      { name: "Javier Mendoza", position: "Small Forward", isActive: 1 },
      { name: "Roberto Jiménez", position: "Power Forward", isActive: 1 },
      { name: "Sergio Romero", position: "Center", isActive: 1 },
      { name: "Manuel Gutiérrez", position: "Point Guard", isActive: 1 },
      { name: "Raúl Vargas", position: "Shooting Guard", isActive: 1 },
      { name: "Eduardo Ramos", position: "Small Forward", isActive: 1 }
    ];

    samplePlayers.forEach(player => {
      this.createPlayer(player);
    });
  }

  // Exercise methods
  async getAllExercises(): Promise<Exercise[]> {
    return Array.from(this.exercises.values());
  }

  async getExerciseById(id: number): Promise<Exercise | undefined> {
    return this.exercises.get(id);
  }

  async getExercisesByCategory(category: string): Promise<Exercise[]> {
    return Array.from(this.exercises.values()).filter(
      exercise => exercise.category === category
    );
  }

  async createExercise(insertExercise: InsertExercise): Promise<Exercise> {
    const id = this.currentExerciseId++;
    const exercise: Exercise = { 
      ...insertExercise, 
      id,
      instructions: insertExercise.instructions || null,
      imageUrl: insertExercise.imageUrl || null
    };
    this.exercises.set(id, exercise);
    return exercise;
  }

  async updateExercise(id: number, updateData: Partial<InsertExercise>): Promise<Exercise | undefined> {
    const existing = this.exercises.get(id);
    if (!existing) return undefined;
    
    const updated: Exercise = { ...existing, ...updateData };
    this.exercises.set(id, updated);
    return updated;
  }

  async deleteExercise(id: number): Promise<boolean> {
    return this.exercises.delete(id);
  }

  // Training Session methods
  async getAllTrainingSessions(): Promise<TrainingSession[]> {
    return Array.from(this.trainingSessions.values());
  }

  async getTrainingSessionById(id: number): Promise<TrainingSession | undefined> {
    return this.trainingSessions.get(id);
  }

  async createTrainingSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    const id = this.currentSessionId++;
    const session: TrainingSession = { 
      ...insertSession, 
      id,
      exerciseIds: insertSession.exerciseIds || null,
      notes: insertSession.notes || null,
      attendanceCount: insertSession.attendanceCount || null,
      totalPlayers: insertSession.totalPlayers || null,
      status: insertSession.status || null
    };
    this.trainingSessions.set(id, session);
    return session;
  }

  async updateTrainingSession(id: number, updateData: Partial<InsertTrainingSession>): Promise<TrainingSession | undefined> {
    const existing = this.trainingSessions.get(id);
    if (!existing) return undefined;
    
    const updated: TrainingSession = { ...existing, ...updateData };
    this.trainingSessions.set(id, updated);
    return updated;
  }

  async deleteTrainingSession(id: number): Promise<boolean> {
    return this.trainingSessions.delete(id);
  }

  // Player methods
  async getAllPlayers(): Promise<Player[]> {
    return Array.from(this.players.values());
  }

  async getPlayerById(id: number): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = this.currentPlayerId++;
    const player: Player = { 
      ...insertPlayer, 
      id,
      position: insertPlayer.position || null,
      isActive: insertPlayer.isActive || null
    };
    this.players.set(id, player);
    return player;
  }

  async updatePlayer(id: number, updateData: Partial<InsertPlayer>): Promise<Player | undefined> {
    const existing = this.players.get(id);
    if (!existing) return undefined;
    
    const updated: Player = { ...existing, ...updateData };
    this.players.set(id, updated);
    return updated;
  }

  async deletePlayer(id: number): Promise<boolean> {
    return this.players.delete(id);
  }

  async getActivePlayersCount(): Promise<number> {
    return Array.from(this.players.values()).filter(player => player.isActive === 1).length;
  }

  // Stub methods for attendance (MemStorage doesn't need these)
  async getTrainingSessionsByDateRange(startDate: string, endDate: string): Promise<TrainingSession[]> {
    return Array.from(this.trainingSessions.values()).filter(session => 
      session.date >= startDate && session.date <= endDate
    );
  }

  async getAttendanceBySession(sessionId: number): Promise<Attendance[]> {
    return [];
  }

  async getAttendanceByPlayer(playerId: number): Promise<Attendance[]> {
    return [];
  }

  async markAttendance(attendance: InsertAttendance): Promise<Attendance> {
    throw new Error("Attendance not supported in MemStorage");
  }

  async updateAttendance(id: number, attendance: Partial<InsertAttendance>): Promise<Attendance | undefined> {
    throw new Error("Attendance not supported in MemStorage");
  }

  async getPlayerAttendanceStats(playerId: number): Promise<{ total: number; present: number; absent: number; rate: number }> {
    return { total: 0, present: 0, absent: 0, rate: 0 };
  }
}

export class DatabaseStorage implements IStorage {
  // Exercise methods
  async getAllExercises(): Promise<Exercise[]> {
    return await db.select().from(exercises);
  }

  async getExerciseById(id: number): Promise<Exercise | undefined> {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.id, id));
    return exercise || undefined;
  }

  async getExercisesByCategory(category: string): Promise<Exercise[]> {
    return await db.select().from(exercises).where(eq(exercises.category, category));
  }

  async createExercise(insertExercise: InsertExercise): Promise<Exercise> {
    const [exercise] = await db
      .insert(exercises)
      .values({
        ...insertExercise,
        instructions: insertExercise.instructions || null,
        imageUrl: insertExercise.imageUrl || null
      })
      .returning();
    return exercise;
  }

  async updateExercise(id: number, updateData: Partial<InsertExercise>): Promise<Exercise | undefined> {
    const [exercise] = await db
      .update(exercises)
      .set(updateData)
      .where(eq(exercises.id, id))
      .returning();
    return exercise || undefined;
  }

  async deleteExercise(id: number): Promise<boolean> {
    const result = await db.delete(exercises).where(eq(exercises.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Training Session methods
  async getAllTrainingSessions(): Promise<TrainingSession[]> {
    return await db.select().from(trainingSessions);
  }

  async getTrainingSessionsByDateRange(startDate: string, endDate: string): Promise<TrainingSession[]> {
    return await db.select().from(trainingSessions)
      .where(
        sql`${trainingSessions.date} >= ${startDate} AND ${trainingSessions.date} <= ${endDate}`
      );
  }

  async getTrainingSessionById(id: number): Promise<TrainingSession | undefined> {
    const [session] = await db.select().from(trainingSessions).where(eq(trainingSessions.id, id));
    return session || undefined;
  }

  async createTrainingSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    const [session] = await db
      .insert(trainingSessions)
      .values({
        ...insertSession,
        exerciseIds: insertSession.exerciseIds || null,
        notes: insertSession.notes || null,
        attendanceCount: insertSession.attendanceCount || null,
        totalPlayers: insertSession.totalPlayers || null,
        status: insertSession.status || null
      })
      .returning();
    return session;
  }

  async updateTrainingSession(id: number, updateData: Partial<InsertTrainingSession>): Promise<TrainingSession | undefined> {
    const [session] = await db
      .update(trainingSessions)
      .set(updateData)
      .where(eq(trainingSessions.id, id))
      .returning();
    return session || undefined;
  }

  async deleteTrainingSession(id: number): Promise<boolean> {
    const result = await db.delete(trainingSessions).where(eq(trainingSessions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Player methods
  async getAllPlayers(): Promise<Player[]> {
    return await db.select().from(players);
  }

  async getPlayerById(id: number): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player || undefined;
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db
      .insert(players)
      .values({
        ...insertPlayer,
        position: insertPlayer.position || null,
        isActive: insertPlayer.isActive || null
      })
      .returning();
    return player;
  }

  async updatePlayer(id: number, updateData: Partial<InsertPlayer>): Promise<Player | undefined> {
    const [player] = await db
      .update(players)
      .set(updateData)
      .where(eq(players.id, id))
      .returning();
    return player || undefined;
  }

  async deletePlayer(id: number): Promise<boolean> {
    const result = await db.delete(players).where(eq(players.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getActivePlayersCount(): Promise<number> {
    const activePlayers = await db.select().from(players).where(eq(players.isActive, 1));
    return activePlayers.length;
  }

  // Attendance methods
  async getAttendanceBySession(sessionId: number): Promise<Attendance[]> {
    return await db.select().from(attendance).where(eq(attendance.sessionId, sessionId));
  }

  async getAttendanceByPlayer(playerId: number): Promise<Attendance[]> {
    return await db.select().from(attendance).where(eq(attendance.playerId, playerId));
  }

  async markAttendance(insertAttendance: InsertAttendance): Promise<Attendance> {
    const [attendanceRecord] = await db
      .insert(attendance)
      .values(insertAttendance)
      .returning();
    return attendanceRecord;
  }

  async updateAttendance(id: number, updateData: Partial<InsertAttendance>): Promise<Attendance | undefined> {
    const [attendanceRecord] = await db
      .update(attendance)
      .set(updateData)
      .where(eq(attendance.id, id))
      .returning();
    return attendanceRecord || undefined;
  }

  async getPlayerAttendanceStats(playerId: number): Promise<{ total: number; present: number; absent: number; rate: number }> {
    const playerAttendance = await db.select().from(attendance).where(eq(attendance.playerId, playerId));
    const total = playerAttendance.length;
    const present = playerAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
    const absent = total - present;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    
    return { total, present, absent, rate };
  }
}

export const storage = new DatabaseStorage();
