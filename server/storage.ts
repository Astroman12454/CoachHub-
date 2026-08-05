import {
  accounts,
  teams,
  exercises,
  trainingSessions,
  players,
  attendance,
  games,
  gameStats,
  plays,
  playSteps,
  pushSubscriptions,
  skillRatings,
  playerNotes,
  sessionTemplates,
  type Account,
  type Team,
  type Exercise,
  type InsertExercise,
  type TrainingSession,
  type InsertTrainingSession,
  type Player,
  type InsertPlayer,
  type Attendance,
  type InsertAttendance,
  type Game,
  type GameStat,
  type CreateGameWithStats,
  type PlayerGameStatsSummary,
  type Play,
  type PlayStep,
  type CreatePlay,
  type PortalData,
  type SkillRatingInput,
  type PlayerNote,
  type PlayerDevelopment,
  type PlayPracticeStats,
  type InsertSessionTemplate,
  type SessionTemplate
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, sum, countDistinct, asc, desc } from "drizzle-orm";
import crypto from "crypto";

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

  // Session template methods (scoped by team)
  getAllSessionTemplates(teamId: number): Promise<SessionTemplate[]>;
  createSessionTemplate(teamId: number, template: InsertSessionTemplate): Promise<SessionTemplate>;
  deleteSessionTemplate(id: number, teamId: number): Promise<boolean>;

  // Player methods (scoped by team)
  getAllPlayers(teamId: number): Promise<Player[]>;
  getPlayerById(id: number, teamId: number): Promise<Player | undefined>;
  createPlayer(teamId: number, player: InsertPlayer): Promise<Player>;
  updatePlayer(id: number, teamId: number, player: Partial<InsertPlayer>): Promise<Player | undefined>;
  deletePlayer(id: number, teamId: number): Promise<boolean>;
  getActivePlayersCount(teamId: number): Promise<number>;
  getPlayerCount(teamId: number): Promise<number>;
  getOrCreatePortalToken(playerId: number, teamId: number): Promise<string | undefined>;
  revokePortalToken(playerId: number, teamId: number): Promise<boolean>;
  getPortalData(token: string): Promise<PortalData | undefined>;

  // Attendance methods — callers verify session/player ownership first
  // (via getTrainingSessionById/getPlayerById above) since attendance rows
  // don't carry teamId directly.
  getAttendanceBySession(sessionId: number): Promise<Attendance[]>;
  getAttendanceByPlayer(playerId: number): Promise<Attendance[]>;
  getAttendanceById(id: number): Promise<Attendance | undefined>;
  markAttendance(attendance: InsertAttendance): Promise<Attendance>;
  updateAttendance(id: number, attendance: Partial<InsertAttendance>): Promise<Attendance | undefined>;
  getPlayerAttendanceStats(playerId: number): Promise<{ total: number; present: number; absent: number; rate: number }>;

  // Player development methods — skill ratings and freeform notes, both
  // scoped by playerId (callers verify team ownership via getPlayerById
  // first, same as the attendance methods above).
  createSkillRating(playerId: number, ratings: SkillRatingInput): Promise<void>;
  createPlayerNote(playerId: number, content: string): Promise<PlayerNote>;
  deletePlayerNote(id: number, teamId: number): Promise<boolean>;
  getPlayerDevelopment(playerId: number): Promise<PlayerDevelopment>;

  // Game methods (scoped by team)
  getAllGames(teamId: number): Promise<Game[]>;
  getGameById(id: number, teamId: number): Promise<Game | undefined>;
  getGameStats(gameId: number): Promise<GameStat[]>;
  createGameWithStats(teamId: number, data: CreateGameWithStats): Promise<Game>;
  deleteGame(id: number, teamId: number): Promise<boolean>;
  getPlayerGameStatsSummary(teamId: number): Promise<PlayerGameStatsSummary[]>;

  // Play (playbook) methods, scoped by team
  getAllPlays(teamId: number): Promise<Play[]>;
  getPlayById(id: number, teamId: number): Promise<Play | undefined>;
  getPlaySteps(playId: number): Promise<PlayStep[]>;
  getPlayCount(teamId: number): Promise<number>;
  createPlayWithSteps(teamId: number, data: CreatePlay): Promise<Play>;
  updatePlayWithSteps(id: number, teamId: number, data: CreatePlay): Promise<Play | undefined>;
  deletePlay(id: number, teamId: number): Promise<boolean>;
  getPlayPracticeStats(teamId: number): Promise<PlayPracticeStats[]>;

  // Push subscription methods — scoped by player (portal visitors, not
  // accounts) since these back the player/parent portal's notifications.
  getPlayerIdByPortalToken(token: string): Promise<number | undefined>;
  savePushSubscription(playerId: number, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void>;
  deletePushSubscription(playerId: number, endpoint: string): Promise<void>;
  deletePushSubscriptionsByEndpoint(endpoint: string): Promise<void>;
  getPushSubscriptionsForTeam(
    teamId: number,
  ): Promise<{ endpoint: string; p256dh: string; auth: string; portalToken: string | null }[]>;
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

  async getAllSessionTemplates(teamId: number): Promise<SessionTemplate[]> {
    return await db.select().from(sessionTemplates).where(eq(sessionTemplates.teamId, teamId));
  }

  async createSessionTemplate(teamId: number, template: InsertSessionTemplate): Promise<SessionTemplate> {
    const [row] = await db
      .insert(sessionTemplates)
      .values({ ...template, teamId, exerciseIds: template.exerciseIds || null, playIds: template.playIds || null, notes: template.notes || null })
      .returning();
    return row;
  }

  async deleteSessionTemplate(id: number, teamId: number): Promise<boolean> {
    const result = await db
      .delete(sessionTemplates)
      .where(and(eq(sessionTemplates.id, id), eq(sessionTemplates.teamId, teamId)));
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

  async getOrCreatePortalToken(playerId: number, teamId: number): Promise<string | undefined> {
    const player = await this.getPlayerById(playerId, teamId);
    if (!player) return undefined;
    if (player.portalToken) return player.portalToken;

    const token = crypto.randomBytes(24).toString("hex");
    await db.update(players).set({ portalToken: token }).where(eq(players.id, playerId));
    return token;
  }

  async revokePortalToken(playerId: number, teamId: number): Promise<boolean> {
    const result = await db
      .update(players)
      .set({ portalToken: null })
      .where(and(eq(players.id, playerId), eq(players.teamId, teamId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Public, unauthenticated lookup for the player/parent portal — the token
  // itself (only ever handed out via the authenticated portal-link endpoint
  // above) is what scopes this to exactly one player, not a session.
  async getPortalData(token: string): Promise<PortalData | undefined> {
    const [player] = await db.select().from(players).where(eq(players.portalToken, token));
    if (!player) return undefined;

    const [team] = await db.select().from(teams).where(eq(teams.id, player.teamId));
    if (!team) return undefined;

    const today = new Date().toISOString().slice(0, 10);

    const upcomingSessions = await db
      .select()
      .from(trainingSessions)
      .where(and(eq(trainingSessions.teamId, player.teamId), sql`${trainingSessions.date} >= ${today}`))
      .orderBy(asc(trainingSessions.date), asc(trainingSessions.time))
      .limit(10);

    const upcomingGames = await db
      .select()
      .from(games)
      .where(and(eq(games.teamId, player.teamId), sql`${games.date} >= ${today}`))
      .orderBy(asc(games.date))
      .limit(10);

    const attendanceRows = await db
      .select({
        sessionId: attendance.sessionId,
        status: attendance.status,
        sessionName: trainingSessions.name,
        date: trainingSessions.date,
      })
      .from(attendance)
      .innerJoin(trainingSessions, eq(attendance.sessionId, trainingSessions.id))
      .where(eq(attendance.playerId, player.id))
      .orderBy(desc(trainingSessions.date))
      .limit(10);

    const seasonStats = await this.getPlayerGameStatsSummary(player.teamId);
    const stats = seasonStats.find((s) => s.playerId === player.id) ?? null;

    return {
      player: { id: player.id, name: player.name, position: player.position },
      team: { name: team.name },
      upcomingSessions: upcomingSessions.map((s) => ({
        id: s.id, name: s.name, date: s.date, time: s.time, duration: s.duration, status: s.status,
      })),
      upcomingGames: upcomingGames.map((g) => ({
        id: g.id, opponent: g.opponent, date: g.date, location: g.location,
      })),
      attendance: attendanceRows,
      stats,
    };
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

  // A rating is always all 5 categories submitted together (see
  // skillRatingInputSchema) and inserted in one multi-row statement, so they
  // share a single ratedAt — that shared timestamp is what groups them back
  // into one "evaluation" for the history view, no separate id needed.
  async createSkillRating(playerId: number, ratings: SkillRatingInput): Promise<void> {
    const entries = Object.entries(ratings) as [string, number][];
    await db.insert(skillRatings).values(entries.map(([category, rating]) => ({ playerId, category, rating })));
  }

  async createPlayerNote(playerId: number, content: string): Promise<PlayerNote> {
    const [note] = await db.insert(playerNotes).values({ playerId, content }).returning();
    return note;
  }

  async deletePlayerNote(id: number, teamId: number): Promise<boolean> {
    const [note] = await db
      .select({ playerId: playerNotes.playerId })
      .from(playerNotes)
      .where(eq(playerNotes.id, id));
    if (!note) return false;
    const player = await this.getPlayerById(note.playerId, teamId);
    if (!player) return false;

    const result = await db.delete(playerNotes).where(eq(playerNotes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getPlayerDevelopment(playerId: number): Promise<PlayerDevelopment> {
    const [ratingRows, notes] = await Promise.all([
      db.select().from(skillRatings).where(eq(skillRatings.playerId, playerId)).orderBy(desc(skillRatings.ratedAt)),
      db.select().from(playerNotes).where(eq(playerNotes.playerId, playerId)).orderBy(desc(playerNotes.createdAt)),
    ]);

    // Rows are newest-first, so the first time a category is seen is its
    // latest rating — cheaper than a DISTINCT ON query for roster-sized data.
    const current: Record<string, number> = {};
    for (const row of ratingRows) {
      if (!(row.category in current)) current[row.category] = row.rating;
    }

    return {
      current: ratingRows.length > 0 ? current : null,
      history: ratingRows.map((r) => ({ category: r.category, rating: r.rating, ratedAt: (r.ratedAt ?? new Date()).toISOString() })),
      notes,
    };
  }

  // Game methods
  async getAllGames(teamId: number): Promise<Game[]> {
    return await db.select().from(games).where(eq(games.teamId, teamId));
  }

  async getGameById(id: number, teamId: number): Promise<Game | undefined> {
    const [game] = await db
      .select()
      .from(games)
      .where(and(eq(games.id, id), eq(games.teamId, teamId)));
    return game || undefined;
  }

  async getGameStats(gameId: number): Promise<GameStat[]> {
    return await db.select().from(gameStats).where(eq(gameStats.gameId, gameId));
  }

  // Inserts the game and its full box score together — callers must have
  // already filtered `data.stats` down to playerIds that belong to teamId
  // (see sanitizePlayerIds in routes.ts) since this layer trusts its input.
  async createGameWithStats(teamId: number, data: CreateGameWithStats): Promise<Game> {
    return await db.transaction(async (tx) => {
      const [game] = await tx
        .insert(games)
        .values({
          teamId,
          opponent: data.opponent,
          date: data.date,
          location: data.location || null,
          teamScore: data.teamScore ?? null,
          opponentScore: data.opponentScore ?? null,
          notes: data.notes || null,
        })
        .returning();

      if (data.stats.length > 0) {
        await tx.insert(gameStats).values(
          data.stats.map((s) => ({ ...s, gameId: game.id })),
        );
      }

      return game;
    });
  }

  async deleteGame(id: number, teamId: number): Promise<boolean> {
    const result = await db
      .delete(games)
      .where(and(eq(games.id, id), eq(games.teamId, teamId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Season totals per player, aggregated in Postgres across every game_stats
  // row tied to one of this team's games. gamesPlayed counts distinct games
  // (not stat rows) so a player only shows up once per game they appeared in.
  async getPlayerGameStatsSummary(teamId: number): Promise<PlayerGameStatsSummary[]> {
    const rows = await db
      .select({
        playerId: gameStats.playerId,
        gamesPlayed: countDistinct(gameStats.gameId),
        points: sum(gameStats.points),
        rebounds: sum(gameStats.rebounds),
        assists: sum(gameStats.assists),
        steals: sum(gameStats.steals),
        blocks: sum(gameStats.blocks),
        turnovers: sum(gameStats.turnovers),
        fouls: sum(gameStats.fouls),
      })
      .from(gameStats)
      .innerJoin(games, eq(gameStats.gameId, games.id))
      .where(eq(games.teamId, teamId))
      .groupBy(gameStats.playerId);

    return rows.map((r) => ({
      playerId: r.playerId,
      gamesPlayed: Number(r.gamesPlayed),
      points: Number(r.points ?? 0),
      rebounds: Number(r.rebounds ?? 0),
      assists: Number(r.assists ?? 0),
      steals: Number(r.steals ?? 0),
      blocks: Number(r.blocks ?? 0),
      turnovers: Number(r.turnovers ?? 0),
      fouls: Number(r.fouls ?? 0),
    }));
  }

  // Play (playbook) methods
  async getAllPlays(teamId: number): Promise<Play[]> {
    return await db.select().from(plays).where(eq(plays.teamId, teamId));
  }

  async getPlayById(id: number, teamId: number): Promise<Play | undefined> {
    const [play] = await db
      .select()
      .from(plays)
      .where(and(eq(plays.id, id), eq(plays.teamId, teamId)));
    return play || undefined;
  }

  async getPlaySteps(playId: number): Promise<PlayStep[]> {
    return await db
      .select()
      .from(playSteps)
      .where(eq(playSteps.playId, playId))
      .orderBy(asc(playSteps.stepIndex));
  }

  async getPlayCount(teamId: number): Promise<number> {
    const teamPlays = await db.select().from(plays).where(eq(plays.teamId, teamId));
    return teamPlays.length;
  }

  async createPlayWithSteps(teamId: number, data: CreatePlay): Promise<Play> {
    return await db.transaction(async (tx) => {
      const [play] = await tx
        .insert(plays)
        .values({ teamId, name: data.name, category: data.category, courtType: data.courtType, notes: data.notes ?? null })
        .returning();

      await tx.insert(playSteps).values(
        data.steps.map((step, stepIndex) => ({
          playId: play.id,
          stepIndex,
          tokens: step.tokens,
          drawings: step.drawings,
        })),
      );

      return play;
    });
  }

  // Editing a play replaces its whole step sequence rather than trying to
  // diff individual steps — much simpler, and the client always sends the
  // full sequence anyway (see PlayEditor).
  async updatePlayWithSteps(id: number, teamId: number, data: CreatePlay): Promise<Play | undefined> {
    return await db.transaction(async (tx) => {
      const [play] = await tx
        .update(plays)
        .set({ name: data.name, category: data.category, courtType: data.courtType, notes: data.notes ?? null })
        .where(and(eq(plays.id, id), eq(plays.teamId, teamId)))
        .returning();
      if (!play) return undefined;

      await tx.delete(playSteps).where(eq(playSteps.playId, id));
      await tx.insert(playSteps).values(
        data.steps.map((step, stepIndex) => ({
          playId: id,
          stepIndex,
          tokens: step.tokens,
          drawings: step.drawings,
        })),
      );

      return play;
    });
  }

  async deletePlay(id: number, teamId: number): Promise<boolean> {
    const result = await db
      .delete(plays)
      .where(and(eq(plays.id, id), eq(plays.teamId, teamId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Tallied in JS rather than SQL: trainingSessions.playIds is a text[]
  // column (same shape as exerciseIds), and a team's session count is small
  // enough that unnest-ing it in Postgres wouldn't be worth the extra query
  // complexity over just reducing the rows we already fetch.
  async getPlayPracticeStats(teamId: number): Promise<PlayPracticeStats[]> {
    const sessions = await db.select().from(trainingSessions).where(eq(trainingSessions.teamId, teamId));

    const tally = new Map<number, { count: number; lastDate: string | null }>();
    for (const session of sessions) {
      for (const idStr of session.playIds ?? []) {
        const playId = parseInt(idStr, 10);
        if (isNaN(playId)) continue;
        const entry = tally.get(playId) ?? { count: 0, lastDate: null };
        entry.count++;
        if (!entry.lastDate || session.date > entry.lastDate) entry.lastDate = session.date;
        tally.set(playId, entry);
      }
    }

    return Array.from(tally.entries()).map(([playId, { count, lastDate }]) => ({
      playId,
      timesPracticed: count,
      lastPracticedDate: lastDate,
    }));
  }

  async getPlayerIdByPortalToken(token: string): Promise<number | undefined> {
    const [player] = await db.select({ id: players.id }).from(players).where(eq(players.portalToken, token));
    return player?.id;
  }

  async savePushSubscription(
    playerId: number,
    sub: { endpoint: string; p256dh: string; auth: string },
  ): Promise<void> {
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.playerId, playerId), eq(pushSubscriptions.endpoint, sub.endpoint)));
    if (existing.length > 0) return;
    await db.insert(pushSubscriptions).values({ playerId, ...sub });
  }

  async deletePushSubscription(playerId: number, endpoint: string): Promise<void> {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.playerId, playerId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  // Called when a push service reports an endpoint as permanently gone
  // (404/410) — removes it for every player it was subscribed under, not
  // just the one that triggered the send, since the endpoint itself (the
  // device) is what's gone.
  async deletePushSubscriptionsByEndpoint(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getPushSubscriptionsForTeam(
    teamId: number,
  ): Promise<{ endpoint: string; p256dh: string; auth: string; portalToken: string | null }[]> {
    return await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        portalToken: players.portalToken,
      })
      .from(pushSubscriptions)
      .innerJoin(players, eq(pushSubscriptions.playerId, players.id))
      .where(eq(players.teamId, teamId));
  }
}

export const storage = new DatabaseStorage();
