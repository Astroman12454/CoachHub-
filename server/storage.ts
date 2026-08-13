import {
  accounts,
  teams,
  exercises,
  exerciseSteps,
  exerciseLikes,
  coachFollows,
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
  playerInjuries,
  drillAttempts,
  sessionTemplates,
  recurringPracticeSlots,
  accountInvites,
  accountMemberships,
  physicalTests,
  physicalTestResults,
  type Account,
  type Team,
  type InsertTeam,
  type Exercise,
  type InsertExercise,
  type ExerciseStep,
  type SaveExerciseDiagram,
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
  type PlayerInjury,
  type CreatePlayerInjury,
  type DrillAttempt,
  type LogDrillAttempt,
  type PlayerDevelopment,
  type PlayPracticeStats,
  type InsertSessionTemplate,
  type SessionTemplate,
  type InsertRecurringPracticeSlot,
  type RecurringPracticeSlot,
  type Plan,
  type AccountInvite,
  type AccountMembership,
  type CoachMember,
  type PhysicalTest,
  type InsertPhysicalTest,
  type PhysicalTestResult,
  type PlayerPhysicalTestHistory,
  type CoachProfile,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, isNull, lt, sql, sum, countDistinct, asc, desc, inArray } from "drizzle-orm";
import crypto from "crypto";

export interface IStorage {
  // Account methods
  createAccount(email: string, passwordHash: string): Promise<Account>;
  getAccountByEmail(email: string): Promise<Account | undefined>;
  getAccountById(id: number): Promise<Account | undefined>;
  getAllAccounts(): Promise<Account[]>;
  getAccountByStripeCustomerId(stripeCustomerId: string): Promise<Account | undefined>;
  setAccountStripeCustomerId(id: number, stripeCustomerId: string): Promise<void>;
  setAccountSubscription(id: number, plan: Plan, stripeSubscriptionId: string | null): Promise<void>;
  setAccountPublicName(id: number, publicName: string): Promise<Account | undefined>;
  setPasswordResetToken(id: number, tokenHash: string, expiresAt: Date): Promise<void>;
  getAccountByValidResetTokenHash(tokenHash: string): Promise<Account | undefined>;
  resetPassword(id: number, passwordHash: string): Promise<void>;

  // Club plan multi-coach seats. resolveEffectiveAccountId is the one
  // primitive nearly everything else builds on: for a coach who accepted an
  // invite, every account-scoped operation (exercises, plan/limit checks,
  // team creation, the team switcher) should act on the CLUB's account, not
  // their own — so routes resolve through this instead of using
  // req.session.accountId directly wherever ownership of a shared resource
  // is being decided.
  resolveEffectiveAccountId(accountId: number): Promise<number>;
  getOwnerAccountIdForMember(memberAccountId: number): Promise<number | null>;
  createAccountInvite(ownerAccountId: number, email: string, tokenHash: string, expiresAt: Date): Promise<AccountInvite>;
  getAccountInviteByValidTokenHash(tokenHash: string): Promise<AccountInvite | undefined>;
  getPendingInvitesForAccount(ownerAccountId: number): Promise<AccountInvite[]>;
  deleteAccountInvite(id: number): Promise<void>;
  createAccountMembership(ownerAccountId: number, memberAccountId: number): Promise<AccountMembership>;
  getAccountMemberships(ownerAccountId: number): Promise<CoachMember[]>;
  removeAccountMembership(ownerAccountId: number, memberAccountId: number): Promise<boolean>;

  // Team methods
  createTeam(accountId: number, name: string): Promise<Team>;
  getTeamsByAccount(accountId: number): Promise<Team[]>;
  getTeamById(id: number, accountId: number): Promise<Team | undefined>;
  updateTeam(id: number, accountId: number, data: Partial<InsertTeam>): Promise<Team | undefined>;

  // Exercise methods (scoped by account — shared across that account's teams)
  getAllExercises(accountId: number): Promise<Exercise[]>;
  getExerciseById(id: number, accountId: number): Promise<Exercise | undefined>;
  getExercisesByCategory(accountId: number, category: string): Promise<Exercise[]>;
  createExercise(accountId: number, exercise: InsertExercise): Promise<Exercise>;
  updateExercise(id: number, accountId: number, exercise: Partial<InsertExercise>): Promise<Exercise | undefined>;
  deleteExercise(id: number, accountId: number): Promise<boolean>;
  setExerciseFavorite(id: number, accountId: number, isFavorite: boolean): Promise<Exercise | undefined>;
  // How many training sessions (across every team on the account) reference
  // each exercise, and the most recent session date that used it — derived
  // from trainingSessions.exerciseIds rather than a stored counter, since
  // that array is the single source of truth for "what's in a session".
  getExerciseUsageStats(accountId: number): Promise<Record<string, { count: number; lastUsedDate: string | null }>>;
  getOrCreateExerciseShareToken(id: number, accountId: number): Promise<string | undefined>;
  revokeExerciseShareToken(id: number, accountId: number): Promise<boolean>;
  getExerciseByShareToken(token: string): Promise<Exercise | undefined>;
  setExerciseCommunityShare(id: number, accountId: number, shared: boolean): Promise<Exercise | undefined>;
  // Cross-account by design — every exercise any coach has opted into the
  // community library, not scoped to the requesting account. likeCount/
  // likedByMe are computed against exerciseLikes for the requesting account,
  // publishedBy against the sharing account's public name, and
  // followingOnly narrows the list to accounts the requester follows.
  getCommunityExercises(accountId: number, opts?: { sort?: "recent" | "popular"; followingOnly?: boolean }): Promise<(Exercise & { likeCount: number; likedByMe: boolean; publishedBy: { accountId: number; publicName: string | null } })[]>;
  // Copies a shared exercise into the importing account as a brand-new,
  // private row (fresh id, isFavorite/shareToken/sharedToCommunity all
  // reset) — importing never mutates or links back to the original.
  importCommunityExercise(id: number, accountId: number): Promise<Exercise | undefined>;
  // Idempotent — liking twice is a no-op, not an error. Only works on
  // exercises currently shared to the community (false if not found/shared).
  likeExercise(exerciseId: number, accountId: number): Promise<boolean>;
  unlikeExercise(exerciseId: number, accountId: number): Promise<void>;
  // Idempotent — following twice is a no-op. False if the target account
  // doesn't exist or hasn't set a public name (not followable).
  followCoach(followerAccountId: number, followingAccountId: number): Promise<boolean>;
  unfollowCoach(followerAccountId: number, followingAccountId: number): Promise<void>;
  // Public mini-profile for a coach — undefined if the account doesn't
  // exist or hasn't set a public name (same "not found" either way, so
  // guessing account ids can't distinguish the two).
  getCoachProfile(accountId: number, viewerAccountId: number): Promise<CoachProfile | undefined>;
  // An exercise's optional animated court diagram — same step-snapshot
  // model as plays (see getPlaySteps/*PlayWithSteps below), but edited on
  // its own page/endpoint since most exercises never get one.
  getExerciseSteps(exerciseId: number): Promise<ExerciseStep[]>;
  saveExerciseDiagram(id: number, accountId: number, data: SaveExerciseDiagram): Promise<Exercise | undefined>;
  deleteExerciseDiagram(id: number, accountId: number): Promise<boolean>;

  // Physical test methods — the templates are scoped by account (shared
  // across that account's teams, same as exercises); results are recorded
  // in bulk (a whole roster in one sitting) and read back per player.
  getAllPhysicalTests(accountId: number): Promise<PhysicalTest[]>;
  getPhysicalTestById(id: number, accountId: number): Promise<PhysicalTest | undefined>;
  createPhysicalTest(accountId: number, test: InsertPhysicalTest): Promise<PhysicalTest>;
  updatePhysicalTest(id: number, accountId: number, test: Partial<InsertPhysicalTest>): Promise<PhysicalTest | undefined>;
  deletePhysicalTest(id: number, accountId: number): Promise<boolean>;
  recordPhysicalTestResults(testId: number, date: string, results: { playerId: number; value: number }[]): Promise<PhysicalTestResult[]>;
  getLatestPhysicalTestResultsForTeam(testId: number, teamId: number): Promise<Record<number, { value: number; date: string }>>;
  getPhysicalTestResultsForPlayer(playerId: number): Promise<PlayerPhysicalTestHistory[]>;
  // Each player's best-ever value for this test before a new result is
  // recorded — direction-aware (lower is better for timed tests). Used to
  // tell whether an incoming result is a new personal record; a player with
  // no prior result is left out of the map entirely, since there's no
  // record for them to beat yet.
  getBestPhysicalTestValues(testId: number, playerIds: number[], lowerIsBetter: boolean): Promise<Record<number, number>>;

  // Training Session methods (scoped by team)
  getAllTrainingSessions(teamId: number): Promise<TrainingSession[]>;
  getTrainingSessionById(id: number, teamId: number): Promise<TrainingSession | undefined>;
  getTrainingSessionsByDateRange(teamId: number, startDate: string, endDate: string): Promise<TrainingSession[]>;
  createTrainingSession(teamId: number, session: InsertTrainingSession): Promise<TrainingSession>;
  updateTrainingSession(id: number, teamId: number, session: Partial<InsertTrainingSession>): Promise<TrainingSession | undefined>;
  deleteTrainingSession(id: number, teamId: number): Promise<boolean>;

  // Scheduled-notification methods (server/notifications-cron.ts) — global,
  // not scoped to one team/account, since a cron sweep runs over everyone.
  getSessionsNeedingReminder(windowStart: Date, windowEnd: Date): Promise<TrainingSession[]>;
  markSessionReminderSent(id: number): Promise<void>;
  getTeamsDueForWeeklyDigest(cutoff: Date): Promise<Team[]>;
  markTeamDigestSent(teamId: number, at: Date): Promise<void>;

  // Session template methods (scoped by team)
  getAllSessionTemplates(teamId: number): Promise<SessionTemplate[]>;
  createSessionTemplate(teamId: number, template: InsertSessionTemplate): Promise<SessionTemplate>;
  deleteSessionTemplate(id: number, teamId: number): Promise<boolean>;

  // Recurring practice slot methods (scoped by team) — a saved weekly
  // pattern; generateSessionsFromSlots is what turns it into real sessions.
  getAllRecurringPracticeSlots(teamId: number): Promise<RecurringPracticeSlot[]>;
  createRecurringPracticeSlot(teamId: number, slot: InsertRecurringPracticeSlot): Promise<RecurringPracticeSlot>;
  deleteRecurringPracticeSlot(id: number, teamId: number): Promise<boolean>;
  generateSessionsFromSlots(teamId: number, startDate: string, weeks: number): Promise<number>;

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
  getPlayerAttendanceStats(playerId: number): Promise<{
    total: number; present: number; absent: number; rate: number;
    totalHoursTrained: number;
    monthly: { month: string; present: number; absent: number }[];
  }>;

  // Player development methods — skill ratings and freeform notes, both
  // scoped by playerId (callers verify team ownership via getPlayerById
  // first, same as the attendance methods above).
  createSkillRating(playerId: number, ratings: SkillRatingInput): Promise<void>;
  createPlayerNote(playerId: number, content: string): Promise<PlayerNote>;
  deletePlayerNote(id: number, teamId: number): Promise<boolean>;
  getPlayerDevelopment(playerId: number): Promise<PlayerDevelopment>;
  // Roster-wide current ratings — feeds the scrimmage team balancer, so it
  // doesn't need one getPlayerDevelopment round trip per player.
  getCurrentSkillRatingsForTeam(teamId: number): Promise<Record<number, Record<string, number>>>;

  // Injury tracking — history lives on the player (getPlayerInjuries);
  // getActiveInjuriesForTeam is the roster-wide cross-reference used for the
  // "injured" badge on the players list and the attendance modal.
  getPlayerInjuries(playerId: number): Promise<PlayerInjury[]>;
  getActiveInjuriesForTeam(teamId: number): Promise<PlayerInjury[]>;
  createPlayerInjury(playerId: number, data: CreatePlayerInjury): Promise<PlayerInjury>;
  markInjuryRecovered(id: number, teamId: number, recoveredDate: string): Promise<PlayerInjury | undefined>;
  deletePlayerInjury(id: number, teamId: number): Promise<boolean>;

  // Drill stat tracking — one row per logged rep (see drillAttempts in the
  // schema for why), so a quick tap during practice is just an insert and
  // undo is just deleting the row it returned.
  getPlayerDrillAttempts(playerId: number): Promise<DrillAttempt[]>;
  getTeamDrillAttempts(teamId: number): Promise<DrillAttempt[]>;
  logDrillAttempt(playerId: number, data: LogDrillAttempt): Promise<DrillAttempt>;
  deleteDrillAttempt(id: number, teamId: number): Promise<boolean>;

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
  setPlayFavorite(id: number, teamId: number, isFavorite: boolean): Promise<Play | undefined>;
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
  getPushSubscriptionsForPlayer(
    playerId: number,
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

  // Ops/backfill use only (see server/scripts/backfill-starter-content.ts)
  // — nothing in the request-serving app lists every account at once.
  async getAllAccounts(): Promise<Account[]> {
    return await db.select().from(accounts);
  }

  async getAccountByStripeCustomerId(stripeCustomerId: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.stripeCustomerId, stripeCustomerId));
    return account || undefined;
  }

  async setAccountStripeCustomerId(id: number, stripeCustomerId: string): Promise<void> {
    await db.update(accounts).set({ stripeCustomerId }).where(eq(accounts.id, id));
  }

  async setAccountSubscription(id: number, plan: Plan, stripeSubscriptionId: string | null): Promise<void> {
    await db.update(accounts).set({ plan, stripeSubscriptionId }).where(eq(accounts.id, id));
  }

  async setAccountPublicName(id: number, publicName: string): Promise<Account | undefined> {
    const [account] = await db.update(accounts).set({ publicName }).where(eq(accounts.id, id)).returning();
    return account || undefined;
  }

  async setPasswordResetToken(id: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.update(accounts).set({ resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt }).where(eq(accounts.id, id));
  }

  async getAccountByValidResetTokenHash(tokenHash: string): Promise<Account | undefined> {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.resetTokenHash, tokenHash), sql`${accounts.resetTokenExpiresAt} > now()`));
    return account || undefined;
  }

  async resetPassword(id: number, passwordHash: string): Promise<void> {
    await db.update(accounts).set({ passwordHash, resetTokenHash: null, resetTokenExpiresAt: null }).where(eq(accounts.id, id));
  }

  async getOwnerAccountIdForMember(memberAccountId: number): Promise<number | null> {
    const [membership] = await db
      .select({ ownerAccountId: accountMemberships.ownerAccountId })
      .from(accountMemberships)
      .where(eq(accountMemberships.memberAccountId, memberAccountId));
    return membership?.ownerAccountId ?? null;
  }

  async resolveEffectiveAccountId(accountId: number): Promise<number> {
    return (await this.getOwnerAccountIdForMember(accountId)) ?? accountId;
  }

  async createAccountInvite(ownerAccountId: number, email: string, tokenHash: string, expiresAt: Date): Promise<AccountInvite> {
    const [invite] = await db
      .insert(accountInvites)
      .values({ ownerAccountId, email, tokenHash, expiresAt })
      .returning();
    return invite;
  }

  async getAccountInviteByValidTokenHash(tokenHash: string): Promise<AccountInvite | undefined> {
    const [invite] = await db
      .select()
      .from(accountInvites)
      .where(and(eq(accountInvites.tokenHash, tokenHash), sql`${accountInvites.expiresAt} > now()`));
    return invite || undefined;
  }

  async getPendingInvitesForAccount(ownerAccountId: number): Promise<AccountInvite[]> {
    return await db
      .select()
      .from(accountInvites)
      .where(and(eq(accountInvites.ownerAccountId, ownerAccountId), sql`${accountInvites.expiresAt} > now()`));
  }

  async deleteAccountInvite(id: number): Promise<void> {
    await db.delete(accountInvites).where(eq(accountInvites.id, id));
  }

  async createAccountMembership(ownerAccountId: number, memberAccountId: number): Promise<AccountMembership> {
    const [membership] = await db
      .insert(accountMemberships)
      .values({ ownerAccountId, memberAccountId })
      .returning();
    return membership;
  }

  async getAccountMemberships(ownerAccountId: number): Promise<CoachMember[]> {
    const rows = await db
      .select({ memberAccountId: accountMemberships.memberAccountId, email: accounts.email, createdAt: accountMemberships.createdAt })
      .from(accountMemberships)
      .innerJoin(accounts, eq(accountMemberships.memberAccountId, accounts.id))
      .where(eq(accountMemberships.ownerAccountId, ownerAccountId));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt ? r.createdAt.toISOString() : null }));
  }

  async removeAccountMembership(ownerAccountId: number, memberAccountId: number): Promise<boolean> {
    const result = await db
      .delete(accountMemberships)
      .where(and(eq(accountMemberships.ownerAccountId, ownerAccountId), eq(accountMemberships.memberAccountId, memberAccountId)));
    return (result.rowCount ?? 0) > 0;
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

  async updateTeam(id: number, accountId: number, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const [team] = await db
      .update(teams)
      .set(data)
      .where(and(eq(teams.id, id), eq(teams.accountId, accountId)))
      .returning();
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

  async setExerciseFavorite(id: number, accountId: number, isFavorite: boolean): Promise<Exercise | undefined> {
    const [exercise] = await db
      .update(exercises)
      .set({ isFavorite: isFavorite ? 1 : 0 })
      .where(and(eq(exercises.id, id), eq(exercises.accountId, accountId)))
      .returning();
    return exercise || undefined;
  }

  async getExerciseUsageStats(accountId: number): Promise<Record<string, { count: number; lastUsedDate: string | null }>> {
    const teamsForAccount = await this.getTeamsByAccount(accountId);
    const stats: Record<string, { count: number; lastUsedDate: string | null }> = {};
    for (const team of teamsForAccount) {
      const sessions = await this.getAllTrainingSessions(team.id);
      for (const session of sessions) {
        for (const exerciseId of session.exerciseIds ?? []) {
          const entry = stats[exerciseId] ?? { count: 0, lastUsedDate: null };
          entry.count++;
          if (!entry.lastUsedDate || session.date > entry.lastUsedDate) entry.lastUsedDate = session.date;
          stats[exerciseId] = entry;
        }
      }
    }
    return stats;
  }

  async getOrCreateExerciseShareToken(id: number, accountId: number): Promise<string | undefined> {
    const exercise = await this.getExerciseById(id, accountId);
    if (!exercise) return undefined;
    if (exercise.shareToken) return exercise.shareToken;

    const token = crypto.randomBytes(24).toString("hex");
    await db.update(exercises).set({ shareToken: token }).where(eq(exercises.id, id));
    return token;
  }

  async revokeExerciseShareToken(id: number, accountId: number): Promise<boolean> {
    const result = await db
      .update(exercises)
      .set({ shareToken: null })
      .where(and(eq(exercises.id, id), eq(exercises.accountId, accountId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getExerciseByShareToken(token: string): Promise<Exercise | undefined> {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.shareToken, token));
    return exercise || undefined;
  }

  async setExerciseCommunityShare(id: number, accountId: number, shared: boolean): Promise<Exercise | undefined> {
    const [exercise] = await db
      .update(exercises)
      .set({ sharedToCommunity: shared ? 1 : 0 })
      .where(and(eq(exercises.id, id), eq(exercises.accountId, accountId)))
      .returning();
    return exercise || undefined;
  }

  async getCommunityExercises(accountId: number, opts: { sort?: "recent" | "popular"; followingOnly?: boolean } = {}): Promise<(Exercise & { likeCount: number; likedByMe: boolean; publishedBy: { accountId: number; publicName: string | null } })[]> {
    let shared = await db.select().from(exercises).where(eq(exercises.sharedToCommunity, 1));
    if (shared.length === 0) return [];

    if (opts.followingOnly) {
      const followingRows = await db
        .select({ followingAccountId: coachFollows.followingAccountId })
        .from(coachFollows)
        .where(eq(coachFollows.followerAccountId, accountId));
      const followingAccountIds = new Set(followingRows.map((row) => row.followingAccountId));
      shared = shared.filter((exercise) => followingAccountIds.has(exercise.accountId));
      if (shared.length === 0) return [];
    }

    const exerciseIds = shared.map((exercise) => exercise.id);
    const counts = await db
      .select({ exerciseId: exerciseLikes.exerciseId, count: sql<number>`count(*)::int` })
      .from(exerciseLikes)
      .where(inArray(exerciseLikes.exerciseId, exerciseIds))
      .groupBy(exerciseLikes.exerciseId);
    const countByExerciseId = new Map(counts.map((row) => [row.exerciseId, row.count]));

    const likedRows = await db
      .select({ exerciseId: exerciseLikes.exerciseId })
      .from(exerciseLikes)
      .where(and(inArray(exerciseLikes.exerciseId, exerciseIds), eq(exerciseLikes.accountId, accountId)));
    const likedExerciseIds = new Set(likedRows.map((row) => row.exerciseId));

    const publisherIds = Array.from(new Set(shared.map((exercise) => exercise.accountId)));
    const publishers = await db
      .select({ id: accounts.id, publicName: accounts.publicName })
      .from(accounts)
      .where(inArray(accounts.id, publisherIds));
    const publisherById = new Map(publishers.map((publisher) => [publisher.id, publisher]));

    const withExtras = shared.map((exercise) => ({
      ...exercise,
      likeCount: countByExerciseId.get(exercise.id) ?? 0,
      likedByMe: likedExerciseIds.has(exercise.id),
      publishedBy: {
        accountId: exercise.accountId,
        publicName: publisherById.get(exercise.accountId)?.publicName ?? null,
      },
    }));

    return opts.sort === "popular"
      ? withExtras.sort((a, b) => b.likeCount - a.likeCount || b.id - a.id)
      : withExtras.sort((a, b) => b.id - a.id);
  }

  async likeExercise(exerciseId: number, accountId: number): Promise<boolean> {
    const [exercise] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), eq(exercises.sharedToCommunity, 1)));
    if (!exercise) return false;

    await db.insert(exerciseLikes).values({ exerciseId, accountId }).onConflictDoNothing();
    return true;
  }

  async unlikeExercise(exerciseId: number, accountId: number): Promise<void> {
    await db.delete(exerciseLikes).where(and(eq(exerciseLikes.exerciseId, exerciseId), eq(exerciseLikes.accountId, accountId)));
  }

  async followCoach(followerAccountId: number, followingAccountId: number): Promise<boolean> {
    const [target] = await db.select().from(accounts).where(eq(accounts.id, followingAccountId));
    if (!target?.publicName) return false;

    await db.insert(coachFollows).values({ followerAccountId, followingAccountId }).onConflictDoNothing();
    return true;
  }

  async unfollowCoach(followerAccountId: number, followingAccountId: number): Promise<void> {
    await db
      .delete(coachFollows)
      .where(and(eq(coachFollows.followerAccountId, followerAccountId), eq(coachFollows.followingAccountId, followingAccountId)));
  }

  async getCoachProfile(accountId: number, viewerAccountId: number): Promise<CoachProfile | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!account?.publicName) return undefined;

    const [exerciseCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(exercises)
      .where(and(eq(exercises.accountId, accountId), eq(exercises.sharedToCommunity, 1)));
    const [followerCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(coachFollows)
      .where(eq(coachFollows.followingAccountId, accountId));
    const [followingCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(coachFollows)
      .where(eq(coachFollows.followerAccountId, accountId));
    const [existingFollow] = await db
      .select()
      .from(coachFollows)
      .where(and(eq(coachFollows.followerAccountId, viewerAccountId), eq(coachFollows.followingAccountId, accountId)));

    return {
      accountId: account.id,
      publicName: account.publicName,
      exerciseCount: exerciseCountRow.count,
      followerCount: followerCountRow.count,
      followingCount: followingCountRow.count,
      followedByMe: !!existingFollow,
      isOwnProfile: account.id === viewerAccountId,
    };
  }

  async importCommunityExercise(id: number, accountId: number): Promise<Exercise | undefined> {
    return await db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(exercises)
        .where(and(eq(exercises.id, id), eq(exercises.sharedToCommunity, 1)));
      if (!source) return undefined;

      const [imported] = await tx
        .insert(exercises)
        .values({
          accountId,
          name: source.name,
          description: source.description,
          category: source.category,
          duration: source.duration,
          difficulty: source.difficulty,
          instructions: source.instructions,
          imageUrl: source.imageUrl,
          minPlayers: source.minPlayers,
          courtType: source.courtType,
        })
        .returning();

      const sourceSteps = await tx
        .select()
        .from(exerciseSteps)
        .where(eq(exerciseSteps.exerciseId, source.id))
        .orderBy(asc(exerciseSteps.stepIndex));
      if (sourceSteps.length > 0) {
        await tx.insert(exerciseSteps).values(
          sourceSteps.map((step) => ({
            exerciseId: imported.id,
            stepIndex: step.stepIndex,
            tokens: step.tokens,
            drawings: step.drawings,
          })),
        );
      }

      return imported;
    });
  }

  async getExerciseSteps(exerciseId: number): Promise<ExerciseStep[]> {
    return await db
      .select()
      .from(exerciseSteps)
      .where(eq(exerciseSteps.exerciseId, exerciseId))
      .orderBy(asc(exerciseSteps.stepIndex));
  }

  // Replaces the whole step sequence rather than diffing individual steps —
  // same rationale as updatePlayWithSteps: much simpler, and the client
  // always sends the full sequence anyway.
  async saveExerciseDiagram(id: number, accountId: number, data: SaveExerciseDiagram): Promise<Exercise | undefined> {
    return await db.transaction(async (tx) => {
      const [exercise] = await tx
        .update(exercises)
        .set({ courtType: data.courtType })
        .where(and(eq(exercises.id, id), eq(exercises.accountId, accountId)))
        .returning();
      if (!exercise) return undefined;

      await tx.delete(exerciseSteps).where(eq(exerciseSteps.exerciseId, id));
      await tx.insert(exerciseSteps).values(
        data.steps.map((step, stepIndex) => ({
          exerciseId: id,
          stepIndex,
          tokens: step.tokens,
          drawings: step.drawings,
        })),
      );

      return exercise;
    });
  }

  async deleteExerciseDiagram(id: number, accountId: number): Promise<boolean> {
    const exercise = await this.getExerciseById(id, accountId);
    if (!exercise) return false;
    await db.delete(exerciseSteps).where(eq(exerciseSteps.exerciseId, id));
    return true;
  }

  // Physical test methods
  async getAllPhysicalTests(accountId: number): Promise<PhysicalTest[]> {
    return await db.select().from(physicalTests).where(eq(physicalTests.accountId, accountId));
  }

  async getPhysicalTestById(id: number, accountId: number): Promise<PhysicalTest | undefined> {
    const [test] = await db
      .select()
      .from(physicalTests)
      .where(and(eq(physicalTests.id, id), eq(physicalTests.accountId, accountId)));
    return test || undefined;
  }

  async createPhysicalTest(accountId: number, insertTest: InsertPhysicalTest): Promise<PhysicalTest> {
    const [test] = await db
      .insert(physicalTests)
      .values({ ...insertTest, accountId, description: insertTest.description || null })
      .returning();
    return test;
  }

  async updatePhysicalTest(id: number, accountId: number, updateData: Partial<InsertPhysicalTest>): Promise<PhysicalTest | undefined> {
    const [test] = await db
      .update(physicalTests)
      .set(updateData)
      .where(and(eq(physicalTests.id, id), eq(physicalTests.accountId, accountId)))
      .returning();
    return test || undefined;
  }

  async deletePhysicalTest(id: number, accountId: number): Promise<boolean> {
    const result = await db
      .delete(physicalTests)
      .where(and(eq(physicalTests.id, id), eq(physicalTests.accountId, accountId)));
    return (result.rowCount ?? 0) > 0;
  }

  async recordPhysicalTestResults(testId: number, date: string, results: { playerId: number; value: number }[]): Promise<PhysicalTestResult[]> {
    return await db
      .insert(physicalTestResults)
      .values(results.map((r) => ({ testId, playerId: r.playerId, value: r.value, date })))
      .returning();
  }

  async getBestPhysicalTestValues(testId: number, playerIds: number[], lowerIsBetter: boolean): Promise<Record<number, number>> {
    if (playerIds.length === 0) return {};
    const rows = await db
      .select({ playerId: physicalTestResults.playerId, value: physicalTestResults.value })
      .from(physicalTestResults)
      .where(and(eq(physicalTestResults.testId, testId), inArray(physicalTestResults.playerId, playerIds)));

    const bests: Record<number, number> = {};
    for (const row of rows) {
      const current = bests[row.playerId];
      if (current === undefined || (lowerIsBetter ? row.value < current : row.value > current)) {
        bests[row.playerId] = row.value;
      }
    }
    return bests;
  }

  async getLatestPhysicalTestResultsForTeam(testId: number, teamId: number): Promise<Record<number, { value: number; date: string }>> {
    const rows = await db
      .select({ playerId: physicalTestResults.playerId, value: physicalTestResults.value, date: physicalTestResults.date })
      .from(physicalTestResults)
      .innerJoin(players, eq(physicalTestResults.playerId, players.id))
      .where(and(eq(physicalTestResults.testId, testId), eq(players.teamId, teamId)))
      .orderBy(desc(physicalTestResults.date), desc(physicalTestResults.createdAt));

    // Rows are newest-first, so the first time a player is seen is their
    // latest result — same reduction as getCurrentSkillRatingsForTeam.
    const latest: Record<number, { value: number; date: string }> = {};
    for (const row of rows) {
      if (!(row.playerId in latest)) latest[row.playerId] = { value: row.value, date: row.date };
    }
    return latest;
  }

  async getPhysicalTestResultsForPlayer(playerId: number): Promise<PlayerPhysicalTestHistory[]> {
    const rows = await db
      .select({
        testId: physicalTests.id,
        testName: physicalTests.name,
        unit: physicalTests.unit,
        lowerIsBetter: physicalTests.lowerIsBetter,
        value: physicalTestResults.value,
        date: physicalTestResults.date,
      })
      .from(physicalTestResults)
      .innerJoin(physicalTests, eq(physicalTestResults.testId, physicalTests.id))
      .where(eq(physicalTestResults.playerId, playerId))
      .orderBy(desc(physicalTestResults.date), desc(physicalTestResults.createdAt));

    const byTest = new Map<number, PlayerPhysicalTestHistory>();
    for (const row of rows) {
      let group = byTest.get(row.testId);
      if (!group) {
        group = { testId: row.testId, testName: row.testName, unit: row.unit, lowerIsBetter: row.lowerIsBetter === 1, results: [] };
        byTest.set(row.testId, group);
      }
      group.results.push({ value: row.value, date: row.date });
    }
    return Array.from(byTest.values());
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

  // date/time are separate text columns (no timezone stored anywhere in the
  // schema — see generateSessionsFromSlots for the same convention), so the
  // window bounds are formatted as naive "YYYY-MM-DD HH:MM:SS" strings and
  // compared as plain text against date || ' ' || time. windowStart/End are
  // themselves computed by the caller as if the stored wall-clock time were
  // UTC, same assumption the rest of the server-side scheduling code makes.
  async getSessionsNeedingReminder(windowStart: Date, windowEnd: Date): Promise<TrainingSession[]> {
    const startStr = windowStart.toISOString().slice(0, 19).replace("T", " ");
    const endStr = windowEnd.toISOString().slice(0, 19).replace("T", " ");
    return await db
      .select()
      .from(trainingSessions)
      .where(
        and(
          sql`(${trainingSessions.date} || ' ' || ${trainingSessions.time}) BETWEEN ${startStr} AND ${endStr}`,
          isNull(trainingSessions.reminderSentAt),
          sql`${trainingSessions.status} IS DISTINCT FROM 'cancelled'`,
        ),
      );
  }

  async markSessionReminderSent(id: number): Promise<void> {
    await db.update(trainingSessions).set({ reminderSentAt: new Date() }).where(eq(trainingSessions.id, id));
  }

  async getTeamsDueForWeeklyDigest(cutoff: Date): Promise<Team[]> {
    return await db
      .select()
      .from(teams)
      .where(or(isNull(teams.lastWeeklyDigestAt), lt(teams.lastWeeklyDigestAt, cutoff)));
  }

  async markTeamDigestSent(teamId: number, at: Date): Promise<void> {
    await db.update(teams).set({ lastWeeklyDigestAt: at }).where(eq(teams.id, teamId));
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

  async getAllRecurringPracticeSlots(teamId: number): Promise<RecurringPracticeSlot[]> {
    return await db.select().from(recurringPracticeSlots).where(eq(recurringPracticeSlots.teamId, teamId));
  }

  async createRecurringPracticeSlot(teamId: number, slot: InsertRecurringPracticeSlot): Promise<RecurringPracticeSlot> {
    const [row] = await db
      .insert(recurringPracticeSlots)
      .values({ ...slot, teamId })
      .returning();
    return row;
  }

  async deleteRecurringPracticeSlot(id: number, teamId: number): Promise<boolean> {
    const result = await db
      .delete(recurringPracticeSlots)
      .where(and(eq(recurringPracticeSlots.id, id), eq(recurringPracticeSlots.teamId, teamId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Materializes real training_sessions rows from the team's saved weekly
  // slots, one per (slot, matching calendar date) pair across the requested
  // range. Skips any date+time that already has a session — so re-running
  // this for an overlapping range (e.g. extending the season) never
  // duplicates a session a coach may have already edited by hand.
  async generateSessionsFromSlots(teamId: number, startDate: string, weeks: number): Promise<number> {
    const slots = await this.getAllRecurringPracticeSlots(teamId);
    if (slots.length === 0) return 0;

    const totalDays = weeks * 7;
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + totalDays - 1);
    const endDateStr = end.toISOString().split("T")[0];

    const existing = await this.getTrainingSessionsByDateRange(teamId, startDate, endDateStr);
    const existingKeys = new Set(existing.map((s) => `${s.date}|${s.time}`));

    let created = 0;
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + i);
      const dayOfWeek = date.getUTCDay();
      const dateStr = date.toISOString().split("T")[0];

      for (const slot of slots) {
        if (slot.dayOfWeek !== dayOfWeek) continue;
        const key = `${dateStr}|${slot.time}`;
        if (existingKeys.has(key)) continue;

        const [, month, day] = dateStr.split("-");
        await this.createTrainingSession(teamId, {
          name: `${slot.name} — ${day}/${month}`,
          date: dateStr,
          time: slot.time,
          duration: slot.duration,
        });
        existingKeys.add(key);
        created++;
      }
    }
    return created;
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

  async getPlayerAttendanceStats(playerId: number): Promise<{
    total: number; present: number; absent: number; rate: number;
    totalHoursTrained: number;
    monthly: { month: string; present: number; absent: number }[];
  }> {
    // Joined with trainingSessions (rather than a plain attendance select)
    // so total hours trained and the monthly breakdown can be derived from
    // each session's own date/duration without a second round trip.
    const rows = await db
      .select({ status: attendance.status, date: trainingSessions.date, duration: trainingSessions.duration })
      .from(attendance)
      .innerJoin(trainingSessions, eq(attendance.sessionId, trainingSessions.id))
      .where(eq(attendance.playerId, playerId));

    const total = rows.length;
    const presentRows = rows.filter(r => r.status === 'present' || r.status === 'late');
    const present = presentRows.length;
    const absent = total - present;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    const totalHoursTrained = Math.round((presentRows.reduce((sum, r) => sum + r.duration, 0) / 60) * 10) / 10;

    const monthlyMap = new Map<string, { present: number; absent: number }>();
    for (const row of rows) {
      const month = row.date.slice(0, 7); // "YYYY-MM"
      const entry = monthlyMap.get(month) ?? { present: 0, absent: 0 };
      if (row.status === 'present' || row.status === 'late') entry.present++;
      else entry.absent++;
      monthlyMap.set(month, entry);
    }
    const monthly = Array.from(monthlyMap.entries())
      .map(([month, counts]) => ({ month, ...counts }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return { total, present, absent, rate, totalHoursTrained, monthly };
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

  async getCurrentSkillRatingsForTeam(teamId: number): Promise<Record<number, Record<string, number>>> {
    const rows = await db
      .select({ playerId: skillRatings.playerId, category: skillRatings.category, rating: skillRatings.rating })
      .from(skillRatings)
      .innerJoin(players, eq(skillRatings.playerId, players.id))
      .where(eq(players.teamId, teamId))
      .orderBy(desc(skillRatings.ratedAt));

    // Same newest-first-wins reduction as getPlayerDevelopment, just grouped
    // by player instead of scoped to one.
    const current: Record<number, Record<string, number>> = {};
    for (const row of rows) {
      const playerCurrent = current[row.playerId] ?? (current[row.playerId] = {});
      if (!(row.category in playerCurrent)) playerCurrent[row.category] = row.rating;
    }
    return current;
  }

  async getPlayerInjuries(playerId: number): Promise<PlayerInjury[]> {
    return await db
      .select()
      .from(playerInjuries)
      .where(eq(playerInjuries.playerId, playerId))
      .orderBy(desc(playerInjuries.createdAt));
  }

  async getActiveInjuriesForTeam(teamId: number): Promise<PlayerInjury[]> {
    const rows = await db
      .select({ injury: playerInjuries })
      .from(playerInjuries)
      .innerJoin(players, eq(playerInjuries.playerId, players.id))
      .where(and(eq(players.teamId, teamId), eq(playerInjuries.status, "active")));
    return rows.map((r) => r.injury);
  }

  async createPlayerInjury(playerId: number, data: CreatePlayerInjury): Promise<PlayerInjury> {
    const [injury] = await db
      .insert(playerInjuries)
      .values({ playerId, ...data, status: "active" })
      .returning();
    return injury;
  }

  async markInjuryRecovered(id: number, teamId: number, recoveredDate: string): Promise<PlayerInjury | undefined> {
    const [existing] = await db
      .select({ playerId: playerInjuries.playerId })
      .from(playerInjuries)
      .where(eq(playerInjuries.id, id));
    if (!existing) return undefined;
    const player = await this.getPlayerById(existing.playerId, teamId);
    if (!player) return undefined;

    const [updated] = await db
      .update(playerInjuries)
      .set({ status: "recovered", recoveredDate })
      .where(eq(playerInjuries.id, id))
      .returning();
    return updated;
  }

  async deletePlayerInjury(id: number, teamId: number): Promise<boolean> {
    const [existing] = await db
      .select({ playerId: playerInjuries.playerId })
      .from(playerInjuries)
      .where(eq(playerInjuries.id, id));
    if (!existing) return false;
    const player = await this.getPlayerById(existing.playerId, teamId);
    if (!player) return false;

    const result = await db.delete(playerInjuries).where(eq(playerInjuries.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getPlayerDrillAttempts(playerId: number): Promise<DrillAttempt[]> {
    return await db
      .select()
      .from(drillAttempts)
      .where(eq(drillAttempts.playerId, playerId))
      .orderBy(desc(drillAttempts.createdAt));
  }

  async getTeamDrillAttempts(teamId: number): Promise<DrillAttempt[]> {
    const rows = await db
      .select({ attempt: drillAttempts })
      .from(drillAttempts)
      .innerJoin(players, eq(drillAttempts.playerId, players.id))
      .where(eq(players.teamId, teamId))
      .orderBy(desc(drillAttempts.createdAt));
    return rows.map((r) => r.attempt);
  }

  async logDrillAttempt(playerId: number, data: LogDrillAttempt): Promise<DrillAttempt> {
    const [attempt] = await db
      .insert(drillAttempts)
      .values({ playerId, ...data })
      .returning();
    return attempt;
  }

  async deleteDrillAttempt(id: number, teamId: number): Promise<boolean> {
    const [existing] = await db
      .select({ playerId: drillAttempts.playerId })
      .from(drillAttempts)
      .where(eq(drillAttempts.id, id));
    if (!existing) return false;
    const player = await this.getPlayerById(existing.playerId, teamId);
    if (!player) return false;

    const result = await db.delete(drillAttempts).where(eq(drillAttempts.id, id));
    return (result.rowCount ?? 0) > 0;
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
        .values({ teamId, name: data.name, category: data.category, courtType: data.courtType, situation: data.situation ?? null, notes: data.notes ?? null })
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
        .set({ name: data.name, category: data.category, courtType: data.courtType, situation: data.situation ?? null, notes: data.notes ?? null })
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

  async setPlayFavorite(id: number, teamId: number, isFavorite: boolean): Promise<Play | undefined> {
    const [play] = await db
      .update(plays)
      .set({ isFavorite: isFavorite ? 1 : 0 })
      .where(and(eq(plays.id, id), eq(plays.teamId, teamId)))
      .returning();
    return play || undefined;
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

  // Same shape as getPushSubscriptionsForTeam, scoped to one player instead
  // of the whole roster — backs the personalized "proactive parent" pushes
  // (skill-rating improvements, absences) in server/routes.ts, as opposed
  // to the coach-initiated team-wide broadcasts notifyTeam sends.
  async getPushSubscriptionsForPlayer(
    playerId: number,
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
      .where(eq(pushSubscriptions.playerId, playerId));
  }
}

export const storage = new DatabaseStorage();
