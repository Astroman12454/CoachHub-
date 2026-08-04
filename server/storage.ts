import {
  accounts,
  teams,
  exercises,
  trainingSessions,
  players,
  attendance,
  type Account,
  type Team,
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
import { eq, and, sql } from "drizzle-orm";

export interface IStorage {
  // Account methods
  createAccount(email: string, passwordHash: string): Promise<Account>;
  getAccountByEmail(email: string): Promise<Account | undefined>;
  getAccountById(id: number): Promise<Account | undefined>;
  getAccountByStripeCustomerId(stripeCustomerId: string): Promise<Account | undefined>;
  setAccountStripeCustomerId(id: number, stripeCustomerId: string): Promise<void>;
  setAccountSubscription(id: number, plan: "free" | "paid", stripeSubscriptionId: string | null): Promise<void>;

  // Team methods
  createTeam(accountId: number, name: string): Promise<Team>;
  getTeamsByAccount(accountId: number): Promise<Team[]>;
  getTeamById(id: number, accountId: number): Promise<Team | undefined>;

  // Exercise methods (scoped by account — shared across that account's teams)
  getAllExercises(accountId: number): Promise<Exercise[]>;
  getExerciseById(id: number, accountId: number): Promise<Exercise | undefined>;
  getExercisesByCategory(accountId: number, category: string): Promise<Exercise[]>;
  createExercise(accountId: number, exercise: InsertExercise): Promise<Exercise>;
  updateExercise(id: number, accountId: number, exercise: Partial<InsertExercise>): Promise<Exercise | undefined>;
  deleteExercise(id: number, accountId: number): Promise<boolean>;

  // Training Session methods (scoped by team)
  getAllTrainingSessions(teamId: number): Promise<TrainingSession[]>;
  getTrainingSessionById(id: number, teamId: number): Promise<TrainingSession | undefined>;
  getTrainingSessionsByDateRange(teamId: number, startDate: string, endDate: string): Promise<TrainingSession[]>;
  createTrainingSession(teamId: number, session: InsertTrainingSession): Promise<TrainingSession>;
  updateTrainingSession(id: number, teamId: number, session: Partial<InsertTrainingSession>): Promise<TrainingSession | undefined>;
  deleteTrainingSession(id: number, teamId: number): Promise<boolean>;

  // Player methods (scoped by team)
  getAllPlayers(teamId: number): Promise<Player[]>;
  getPlayerById(id: number, teamId: number): Promise<Player | undefined>;
  createPlayer(teamId: number, player: InsertPlayer): Promise<Player>;
  updatePlayer(id: number, teamId: number, player: Partial<InsertPlayer>): Promise<Player | undefined>;
  deletePlayer(id: number, teamId: number): Promise<boolean>;
  getActivePlayersCount(teamId: number): Promise<number>;
  getPlayerCount(teamId: number): Promise<number>;

  // Attendance methods — callers verify session/player ownership first
  // (via getTrainingSessionById/getPlayerById above) since attendance rows
  // don't carry teamId directly.
  getAttendanceBySession(sessionId: number): Promise<Attendance[]>;
  getAttendanceByPlayer(playerId: number): Promise<Attendance[]>;
  getAttendanceById(id: number): Promise<Attendance | undefined>;
  markAttendance(attendance: InsertAttendance): Promise<Attendance>;
  updateAttendance(id: number, attendance: Partial<InsertAttendance>): Promise<Attendance | undefined>;
  getPlayerAttendanceStats(playerId: number): Promise<{ total: number; present: number; absent: number; rate: number }>;
}

export class DatabaseStorage implements IStorage {
  // Account methods
  async createAccount(email: string, passwordHash: string): Promise<Account> {
    const [account] = await db
      .insert(accounts)
      .values({ email, passwordHash })
      .returning();
    return account;
  }

  async getAccountByEmail(email: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.email, email));
    return account || undefined;
  }

  async getAccountById(id: number): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account || undefined;
  }

  async getAccountByStripeCustomerId(stripeCustomerId: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.stripeCustomerId, stripeCustomerId));
    return account || undefined;
  }

  async setAccountStripeCustomerId(id: number, stripeCustomerId: string): Promise<void> {
    await db.update(accounts).set({ stripeCustomerId }).where(eq(accounts.id, id));
  }

  async setAccountSubscription(id: number, plan: "free" | "paid", stripeSubscriptionId: string | null): Promise<void> {
    await db.update(accounts).set({ plan, stripeSubscriptionId }).where(eq(accounts.id, id));
  }

  // Team methods
  async createTeam(accountId: number, name: string): Promise<Team> {
    const [team] = await db
      .insert(teams)
      .values({ accountId, name })
      .returning();
    return team;
  }

  async getTeamsByAccount(accountId: number): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.accountId, accountId));
  }

  async getTeamById(id: number, accountId: number): Promise<Team | undefined> {
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, id), eq(teams.accountId, accountId)));
    return team || undefined;
  }

  // Exercise methods
  async getAllExercises(accountId: number): Promise<Exercise[]> {
    return await db.select().from(exercises).where(eq(exercises.accountId, accountId));
  }

  async getExerciseById(id: number, accountId: number): Promise<Exercise | undefined> {
    const [exercise] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, id), eq(exercises.accountId, accountId)));
    return exercise || undefined;
  }

  async getExercisesByCategory(accountId: number, category: string): Promise<Exercise[]> {
    return await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.accountId, accountId), eq(exercises.category, category)));
  }

  async createExercise(accountId: number, insertExercise: InsertExercise): Promise<Exercise> {
    const [exercise] = await db
      .insert(exercises)
      .values({
        ...insertExercise,
        accountId,
        instructions: insertExercise.instructions || null,
        imageUrl: insertExercise.imageUrl || null
      })
      .returning();
    return exercise;
  }

  async updateExercise(id: number, accountId: number, updateData: Partial<InsertExercise>): Promise<Exercise | undefined> {
    const [exercise] = await db
      .update(exercises)
      .set(updateData)
      .where(and(eq(exercises.id, id), eq(exercises.accountId, accountId)))
      .returning();
    return exercise || undefined;
  }

  async deleteExercise(id: number, accountId: number): Promise<boolean> {
    const result = await db
      .delete(exercises)
      .where(and(eq(exercises.id, id), eq(exercises.accountId, accountId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Training Session methods
  async getAllTrainingSessions(teamId: number): Promise<TrainingSession[]> {
    return await db.select().from(trainingSessions).where(eq(trainingSessions.teamId, teamId));
  }

  async getTrainingSessionsByDateRange(teamId: number, startDate: string, endDate: string): Promise<TrainingSession[]> {
    return await db.select().from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.teamId, teamId),
          sql`${trainingSessions.date} >= ${startDate} AND ${trainingSessions.date} <= ${endDate}`
        )
      );
  }

  async getTrainingSessionById(id: number, teamId: number): Promise<TrainingSession | undefined> {
    const [session] = await db
      .select()
      .from(trainingSessions)
      .where(and(eq(trainingSessions.id, id), eq(trainingSessions.teamId, teamId)));
    return session || undefined;
  }

  async createTrainingSession(teamId: number, insertSession: InsertTrainingSession): Promise<TrainingSession> {
    const [session] = await db
      .insert(trainingSessions)
      .values({
        ...insertSession,
        teamId,
        exerciseIds: insertSession.exerciseIds || null,
        notes: insertSession.notes || null,
        attendanceCount: insertSession.attendanceCount || null,
        totalPlayers: insertSession.totalPlayers || null,
        status: insertSession.status || null
      })
      .returning();
    return session;
  }

  async updateTrainingSession(id: number, teamId: number, updateData: Partial<InsertTrainingSession>): Promise<TrainingSession | undefined> {
    const [session] = await db
      .update(trainingSessions)
      .set(updateData)
      .where(and(eq(trainingSessions.id, id), eq(trainingSessions.teamId, teamId)))
      .returning();
    return session || undefined;
  }

  async deleteTrainingSession(id: number, teamId: number): Promise<boolean> {
    const result = await db
      .delete(trainingSessions)
      .where(and(eq(trainingSessions.id, id), eq(trainingSessions.teamId, teamId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Player methods
  async getAllPlayers(teamId: number): Promise<Player[]> {
    return await db.select().from(players).where(eq(players.teamId, teamId));
  }

  async getPlayerById(id: number, teamId: number): Promise<Player | undefined> {
    const [player] = await db
      .select()
      .from(players)
      .where(and(eq(players.id, id), eq(players.teamId, teamId)));
    return player || undefined;
  }

  async createPlayer(teamId: number, insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db
      .insert(players)
      .values({
        ...insertPlayer,
        teamId,
        position: insertPlayer.position || null,
        isActive: insertPlayer.isActive || null
      })
      .returning();
    return player;
  }

  async updatePlayer(id: number, teamId: number, updateData: Partial<InsertPlayer>): Promise<Player | undefined> {
    const [player] = await db
      .update(players)
      .set(updateData)
      .where(and(eq(players.id, id), eq(players.teamId, teamId)))
      .returning();
    return player || undefined;
  }

  async deletePlayer(id: number, teamId: number): Promise<boolean> {
    const result = await db
      .delete(players)
      .where(and(eq(players.id, id), eq(players.teamId, teamId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getActivePlayersCount(teamId: number): Promise<number> {
    const activePlayers = await db
      .select()
      .from(players)
      .where(and(eq(players.teamId, teamId), eq(players.isActive, 1)));
    return activePlayers.length;
  }

  async getPlayerCount(teamId: number): Promise<number> {
    const teamPlayers = await db.select().from(players).where(eq(players.teamId, teamId));
    return teamPlayers.length;
  }

  // Attendance methods
  async getAttendanceBySession(sessionId: number): Promise<Attendance[]> {
    return await db.select().from(attendance).where(eq(attendance.sessionId, sessionId));
  }

  async getAttendanceByPlayer(playerId: number): Promise<Attendance[]> {
    return await db.select().from(attendance).where(eq(attendance.playerId, playerId));
  }

  async getAttendanceById(id: number): Promise<Attendance | undefined> {
    const [record] = await db.select().from(attendance).where(eq(attendance.id, id));
    return record || undefined;
  }

  async markAttendance(insertAttendance: InsertAttendance): Promise<Attendance> {
    const [attendanceRecord] = await db
      .insert(attendance)
      .values(insertAttendance)
      .returning();
    await this.syncSessionAttendanceCount(attendanceRecord.sessionId);
    return attendanceRecord;
  }

  async updateAttendance(id: number, updateData: Partial<InsertAttendance>): Promise<Attendance | undefined> {
    const [attendanceRecord] = await db
      .update(attendance)
      .set(updateData)
      .where(eq(attendance.id, id))
      .returning();

    if (attendanceRecord) {
      await this.syncSessionAttendanceCount(attendanceRecord.sessionId);
    }

    return attendanceRecord || undefined;
  }

  // Keeps a training session's attendanceCount/totalPlayers columns (used for
  // the quick-glance badges on the dashboard and schedule) in sync with the
  // actual attendance records, since those are the source of truth.
  private async syncSessionAttendanceCount(sessionId: number): Promise<void> {
    const [session] = await db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId));
    if (!session) return;

    const sessionAttendance = await this.getAttendanceBySession(sessionId);
    const presentCount = sessionAttendance.filter(
      (a) => a.status === "present" || a.status === "late",
    ).length;
    const totalPlayers = await this.getActivePlayersCount(session.teamId);

    await db
      .update(trainingSessions)
      .set({ attendanceCount: presentCount, totalPlayers })
      .where(eq(trainingSessions.id, sessionId));
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
