import {
  accounts,
  teams,
  exercises,
  exerciseSteps,
  exerciseLikes,
  exerciseRatings,
  exerciseComments,
  exerciseSaves,
  exerciseReports,
  playLikes,
  playComments,
  playSaves,
  playReports,
  playRatings,
  evaluationTestLikes,
  evaluationTestComments,
  evaluationTestSaves,
  evaluationTestReports,
  evaluationTestRatings,
  coachFollows,
  notifications,
  trainingSessions,
  players,
  attendance,
  games,
  gameStats,
  plays,
  playSteps,
  pushSubscriptions,
  playerNotes,
  playerInjuries,
  drillAttempts,
  sessionTemplates,
  recurringPracticeSlots,
  accountInvites,
  accountMemberships,
  evaluationTests,
  evaluationTestResults,
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
  type PlayerNote,
  type PlayerInjury,
  type CreatePlayerInjury,
  type DrillAttempt,
  type LogDrillAttempt,
  type PlayPracticeStats,
  type InsertSessionTemplate,
  type SessionTemplate,
  type InsertRecurringPracticeSlot,
  type RecurringPracticeSlot,
  type Plan,
  type AccountInvite,
  type AccountMembership,
  type CoachMember,
  type EvaluationTest,
  type InsertEvaluationTest,
  type EvaluationTestResult,
  type PlayerEvaluationTestHistory,
  type CoachProfile,
  type NotificationView,
  type NotificationType,
  type SuggestedCoach,
  type ExerciseCommentView,
  type PlayCommentView,
  type EvaluationTestCommentView,
  type ReportReason,
  type ReportStatus,
  type AdminReportView,
} from "@shared/schema";
import { computeEvaluationScore } from "@shared/evaluationScore";
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
  // Every table with an accountId/teamId/etc. chain back to accounts.id is
  // declared onDelete: cascade in the schema, so this one delete is enough
  // to remove all of this coach's data (teams, players, sessions, plays,
  // exercises, social activity, everything) — see shared/schema.ts.
  deleteAccount(id: number): Promise<void>;

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
  getCommunityExercises(accountId: number, opts?: { sort?: "recent" | "popular"; followingOnly?: boolean; savedOnly?: boolean }): Promise<(Exercise & { likeCount: number; likedByMe: boolean; savedByMe: boolean; commentCount: number; avgRating: number | null; ratingCount: number; myRating: number | null; publishedBy: { accountId: number; publicName: string | null } })[]>;
  // Copies a shared exercise into the importing account as a brand-new,
  // private row (fresh id, isFavorite/shareToken/sharedToCommunity all
  // reset) — importing never mutates or links back to the original.
  importCommunityExercise(id: number, accountId: number): Promise<Exercise | undefined>;
  // Idempotent — liking twice is a no-op, not an error. Only works on
  // exercises currently shared to the community (false if not found/shared).
  likeExercise(exerciseId: number, accountId: number): Promise<boolean>;
  unlikeExercise(exerciseId: number, accountId: number): Promise<void>;
  // "Guardado" — a private bookmark, distinct from liking. Also only works
  // on a currently-shared exercise.
  saveExercise(exerciseId: number, accountId: number): Promise<boolean>;
  unsaveExercise(exerciseId: number, accountId: number): Promise<void>;
  // A coach's 1-5 star opinion of a community exercise, public (unlike a
  // save) and re-ratable (unlike a like's on/off) — see exerciseRatings.
  // Only works on exercises currently shared to the community, same as
  // liking. False if not found/shared.
  rateExercise(exerciseId: number, accountId: number, rating: number): Promise<boolean>;
  unrateExercise(exerciseId: number, accountId: number): Promise<void>;
  // Idempotent — following twice is a no-op. False if the target account
  // doesn't exist or hasn't set a public name (not followable).
  followCoach(followerAccountId: number, followingAccountId: number): Promise<boolean>;
  unfollowCoach(followerAccountId: number, followingAccountId: number): Promise<void>;
  // Public mini-profile for a coach — undefined if the account doesn't
  // exist or hasn't set a public name (same "not found" either way, so
  // guessing account ids can't distinguish the two).
  getCoachProfile(accountId: number, viewerAccountId: number): Promise<CoachProfile | undefined>;
  // "Who to follow" candidates for the Discover tab — see SuggestedCoach.
  getSuggestedCoaches(viewerAccountId: number, limit?: number): Promise<SuggestedCoach[]>;
  // The bell-icon feed — see notifications table comment in shared/schema.ts.
  // Callers don't create these directly; likeExercise/followCoach/
  // createExerciseComment do it internally, only for a genuinely new like/
  // follow/comment and never for self.
  createNotification(data: { accountId: number; type: "follow" | "like" | "comment" | "like_play" | "comment_play" | "like_evaluation_test" | "comment_evaluation_test"; actorAccountId: number; exerciseId?: number; playId?: number; evaluationTestId?: number }): Promise<void>;
  getNotifications(accountId: number, limit?: number): Promise<NotificationView[]>;
  getUnreadNotificationCount(accountId: number): Promise<number>;
  markNotificationRead(id: number, accountId: number): Promise<void>;
  markAllNotificationsRead(accountId: number): Promise<void>;
  // Requires the exercise to currently be shared to the community (undefined
  // otherwise); the notification to the owner (if any) happens internally.
  createExerciseComment(exerciseId: number, accountId: number, body: string): Promise<ExerciseCommentView | undefined>;
  // Undefined (not just empty) if the exercise doesn't exist or isn't
  // currently shared — lets the route 404 instead of showing an empty thread.
  getExerciseComments(exerciseId: number, viewerAccountId: number): Promise<ExerciseCommentView[] | undefined>;
  // True only if the comment existed and the requester was allowed to
  // delete it (its author, or the exercise's owner).
  deleteExerciseComment(commentId: number, accountId: number): Promise<boolean>;

  // Play (playbook) community — same shape as the exercise community above,
  // except a play's "owner" for social purposes is resolved through
  // teams.accountId (a play belongs to a team, not directly to an account).
  setPlayCommunityShare(id: number, teamId: number, shared: boolean): Promise<Play | undefined>;
  getCommunityPlays(accountId: number, opts?: { sort?: "recent" | "popular"; followingOnly?: boolean; savedOnly?: boolean }): Promise<(Play & { likeCount: number; likedByMe: boolean; savedByMe: boolean; commentCount: number; avgRating: number | null; ratingCount: number; myRating: number | null; publishedBy: { accountId: number; publicName: string | null } })[]>;
  // Copies a shared play (with its steps) into the importing team's own
  // playbook as a brand-new row — same "fresh copy, never linked back" model
  // as importCommunityExercise.
  importCommunityPlay(id: number, teamId: number): Promise<Play | undefined>;
  likePlay(playId: number, accountId: number): Promise<boolean>;
  unlikePlay(playId: number, accountId: number): Promise<void>;
  // "Guardado" — a private bookmark, distinct from liking. Also only works
  // on a currently-shared play.
  savePlay(playId: number, accountId: number): Promise<boolean>;
  unsavePlay(playId: number, accountId: number): Promise<void>;
  // A public 1-5 star rating — see storage.rateExercise for the upsert
  // behavior this mirrors.
  ratePlay(playId: number, accountId: number, rating: number): Promise<boolean>;
  unratePlay(playId: number, accountId: number): Promise<void>;
  createPlayComment(playId: number, accountId: number, body: string): Promise<PlayCommentView | undefined>;
  getPlayComments(playId: number, viewerAccountId: number): Promise<PlayCommentView[] | undefined>;
  deletePlayComment(commentId: number, accountId: number): Promise<boolean>;

  // Evaluation test community — scoped directly by accountId, same as
  // exercises (no team indirection to resolve, unlike plays above). Covers
  // general player evaluation, physical and skill tests alike.
  setEvaluationTestCommunityShare(id: number, accountId: number, shared: boolean): Promise<EvaluationTest | undefined>;
  getCommunityEvaluationTests(accountId: number, opts?: { sort?: "recent" | "popular"; followingOnly?: boolean; savedOnly?: boolean }): Promise<(EvaluationTest & { likeCount: number; likedByMe: boolean; savedByMe: boolean; commentCount: number; avgRating: number | null; ratingCount: number; myRating: number | null; publishedBy: { accountId: number; publicName: string | null } })[]>;
  importCommunityEvaluationTest(id: number, accountId: number): Promise<EvaluationTest | undefined>;
  likeEvaluationTest(testId: number, accountId: number): Promise<boolean>;
  unlikeEvaluationTest(testId: number, accountId: number): Promise<void>;
  saveEvaluationTest(testId: number, accountId: number): Promise<boolean>;
  unsaveEvaluationTest(testId: number, accountId: number): Promise<void>;
  rateEvaluationTest(testId: number, accountId: number, rating: number): Promise<boolean>;
  unrateEvaluationTest(testId: number, accountId: number): Promise<void>;
  createEvaluationTestComment(testId: number, accountId: number, body: string): Promise<EvaluationTestCommentView | undefined>;
  getEvaluationTestComments(testId: number, viewerAccountId: number): Promise<EvaluationTestCommentView[] | undefined>;
  deleteEvaluationTestComment(commentId: number, accountId: number): Promise<boolean>;

  // Community content moderation. Reporting requires the content to
  // currently be shared (same as commenting); "already_reported" lets a
  // reporter who already flagged this content see that instead of a
  // generic error. Resolving is admin-only (gated in the route, not here)
  // — "remove" both marks the report and unpublishes the content itself
  // (sharedToCommunity back to 0), never deletes the coach's own copy.
  reportExercise(exerciseId: number, accountId: number, reason: ReportReason, details?: string): Promise<"created" | "already_reported" | "not_found">;
  reportPlay(playId: number, accountId: number, reason: ReportReason, details?: string): Promise<"created" | "already_reported" | "not_found">;
  reportEvaluationTest(testId: number, accountId: number, reason: ReportReason, details?: string): Promise<"created" | "already_reported" | "not_found">;
  getPendingReports(): Promise<AdminReportView[]>;
  resolveReport(contentType: "exercise" | "play" | "evaluationTest", reportId: number, action: "dismiss" | "remove"): Promise<boolean>;

  // An exercise's optional animated court diagram — same step-snapshot
  // model as plays (see getPlaySteps/*PlayWithSteps below), but edited on
  // its own page/endpoint since most exercises never get one.
  getExerciseSteps(exerciseId: number): Promise<ExerciseStep[]>;
  saveExerciseDiagram(id: number, accountId: number, data: SaveExerciseDiagram): Promise<Exercise | undefined>;
  deleteExerciseDiagram(id: number, accountId: number): Promise<boolean>;

  // Evaluation test methods — general player evaluation (physical and
  // skill), scored 1-100 (see computeEvaluationScore). Templates are scoped
  // by account (shared across that account's teams, same as exercises);
  // results recorded per player/date, either in bulk (a whole roster in one
  // sitting) or one at a time (a single result array is also how the
  // profile's quick single-player add works), and read back per player.
  getAllEvaluationTests(accountId: number): Promise<EvaluationTest[]>;
  getEvaluationTestById(id: number, accountId: number): Promise<EvaluationTest | undefined>;
  createEvaluationTest(accountId: number, test: InsertEvaluationTest): Promise<EvaluationTest>;
  updateEvaluationTest(id: number, accountId: number, test: Partial<InsertEvaluationTest>): Promise<EvaluationTest | undefined>;
  deleteEvaluationTest(id: number, accountId: number): Promise<boolean>;
  recordEvaluationTestResults(testId: number, date: string, results: { playerId: number; value: number }[]): Promise<EvaluationTestResult[]>;
  getLatestEvaluationTestResultsForTeam(testId: number, teamId: number): Promise<Record<number, { value: number; date: string }>>;
  getEvaluationTestResultsForPlayer(playerId: number): Promise<PlayerEvaluationTestHistory[]>;
  // Each player's best-ever value for this test before a new result is
  // recorded — direction derived from bestValue vs worstValue. Used to tell
  // whether an incoming result is a new personal record; a player with no
  // prior result is left out of the map entirely, since there's no record
  // for them to beat yet.
  getBestEvaluationTestValues(testId: number, playerIds: number[], worstValue: number, bestValue: number): Promise<Record<number, number>>;
  // Roster-wide latest score per player per test — feeds the scrimmage team
  // balancer (replaces the old getCurrentSkillRatingsForTeam).
  getCurrentEvaluationScoresForTeam(teamId: number): Promise<Record<number, Record<number, number>>>;

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

  // Freeform coach notes on a player, scoped by playerId (callers verify
  // team ownership via getPlayerById first, same as the attendance methods
  // above).
  getPlayerNotes(playerId: number): Promise<PlayerNote[]>;
  createPlayerNote(playerId: number, content: string): Promise<PlayerNote>;
  deletePlayerNote(id: number, teamId: number): Promise<boolean>;

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

  async deleteAccount(id: number): Promise<void> {
    await db.delete(accounts).where(eq(accounts.id, id));
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

  // One query across every one of the account's teams (not one per team,
  // like this used to do) — same JS-side tally as the single-team
  // getPlayPracticeStats below, just fetching all the rows it tallies over
  // in a single round trip so a multi-team Club account doesn't pay for
  // its team count in extra queries.
  async getExerciseUsageStats(accountId: number): Promise<Record<string, { count: number; lastUsedDate: string | null }>> {
    const teamsForAccount = await this.getTeamsByAccount(accountId);
    const stats: Record<string, { count: number; lastUsedDate: string | null }> = {};
    if (teamsForAccount.length === 0) return stats;

    const sessions = await db.select().from(trainingSessions)
      .where(inArray(trainingSessions.teamId, teamsForAccount.map((team) => team.id)));
    for (const session of sessions) {
      for (const exerciseId of session.exerciseIds ?? []) {
        const entry = stats[exerciseId] ?? { count: 0, lastUsedDate: null };
        entry.count++;
        if (!entry.lastUsedDate || session.date > entry.lastUsedDate) entry.lastUsedDate = session.date;
        stats[exerciseId] = entry;
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

  async getCommunityExercises(accountId: number, opts: { sort?: "recent" | "popular"; followingOnly?: boolean; savedOnly?: boolean } = {}): Promise<(Exercise & { likeCount: number; likedByMe: boolean; savedByMe: boolean; commentCount: number; avgRating: number | null; ratingCount: number; myRating: number | null; publishedBy: { accountId: number; publicName: string | null } })[]> {
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

    if (opts.savedOnly) {
      const savedRows = await db.select({ exerciseId: exerciseSaves.exerciseId }).from(exerciseSaves).where(eq(exerciseSaves.accountId, accountId));
      const savedExerciseIds = new Set(savedRows.map((row) => row.exerciseId));
      shared = shared.filter((exercise) => savedExerciseIds.has(exercise.id));
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

    const savedRowsForViewer = await db
      .select({ exerciseId: exerciseSaves.exerciseId })
      .from(exerciseSaves)
      .where(and(inArray(exerciseSaves.exerciseId, exerciseIds), eq(exerciseSaves.accountId, accountId)));
    const savedExerciseIdsForViewer = new Set(savedRowsForViewer.map((row) => row.exerciseId));

    const commentCounts = await db
      .select({ exerciseId: exerciseComments.exerciseId, count: sql<number>`count(*)::int` })
      .from(exerciseComments)
      .where(inArray(exerciseComments.exerciseId, exerciseIds))
      .groupBy(exerciseComments.exerciseId);
    const commentCountByExerciseId = new Map(commentCounts.map((row) => [row.exerciseId, row.count]));

    const ratingAggregates = await db
      .select({ exerciseId: exerciseRatings.exerciseId, avg: sql<number>`avg(${exerciseRatings.rating})::float`, count: sql<number>`count(*)::int` })
      .from(exerciseRatings)
      .where(inArray(exerciseRatings.exerciseId, exerciseIds))
      .groupBy(exerciseRatings.exerciseId);
    const ratingAggregateByExerciseId = new Map(ratingAggregates.map((row) => [row.exerciseId, row]));

    const myRatingRows = await db
      .select({ exerciseId: exerciseRatings.exerciseId, rating: exerciseRatings.rating })
      .from(exerciseRatings)
      .where(and(inArray(exerciseRatings.exerciseId, exerciseIds), eq(exerciseRatings.accountId, accountId)));
    const myRatingByExerciseId = new Map(myRatingRows.map((row) => [row.exerciseId, row.rating]));

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
      savedByMe: savedExerciseIdsForViewer.has(exercise.id),
      commentCount: commentCountByExerciseId.get(exercise.id) ?? 0,
      avgRating: ratingAggregateByExerciseId.get(exercise.id)?.avg ?? null,
      ratingCount: ratingAggregateByExerciseId.get(exercise.id)?.count ?? 0,
      myRating: myRatingByExerciseId.get(exercise.id) ?? null,
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

    // .returning() comes back empty on the onConflictDoNothing no-op path
    // (already liked) — only a genuinely new like notifies the owner, and
    // never for liking your own exercise.
    const inserted = await db.insert(exerciseLikes).values({ exerciseId, accountId }).onConflictDoNothing().returning();
    if (inserted.length > 0 && exercise.accountId !== accountId) {
      await this.createNotification({ accountId: exercise.accountId, type: "like", actorAccountId: accountId, exerciseId });
    }
    return true;
  }

  async unlikeExercise(exerciseId: number, accountId: number): Promise<void> {
    await db.delete(exerciseLikes).where(and(eq(exerciseLikes.exerciseId, exerciseId), eq(exerciseLikes.accountId, accountId)));
  }

  async rateExercise(exerciseId: number, accountId: number, rating: number): Promise<boolean> {
    const [exercise] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), eq(exercises.sharedToCommunity, 1)));
    if (!exercise) return false;

    await db
      .insert(exerciseRatings)
      .values({ exerciseId, accountId, rating })
      .onConflictDoUpdate({
        target: [exerciseRatings.exerciseId, exerciseRatings.accountId],
        set: { rating },
      });
    return true;
  }

  async unrateExercise(exerciseId: number, accountId: number): Promise<void> {
    await db.delete(exerciseRatings).where(and(eq(exerciseRatings.exerciseId, exerciseId), eq(exerciseRatings.accountId, accountId)));
  }

  async saveExercise(exerciseId: number, accountId: number): Promise<boolean> {
    const [exercise] = await db.select().from(exercises).where(and(eq(exercises.id, exerciseId), eq(exercises.sharedToCommunity, 1)));
    if (!exercise) return false;

    await db.insert(exerciseSaves).values({ exerciseId, accountId }).onConflictDoNothing();
    return true;
  }

  async unsaveExercise(exerciseId: number, accountId: number): Promise<void> {
    await db.delete(exerciseSaves).where(and(eq(exerciseSaves.exerciseId, exerciseId), eq(exerciseSaves.accountId, accountId)));
  }

  async followCoach(followerAccountId: number, followingAccountId: number): Promise<boolean> {
    const [target] = await db.select().from(accounts).where(eq(accounts.id, followingAccountId));
    if (!target?.publicName) return false;

    const inserted = await db.insert(coachFollows).values({ followerAccountId, followingAccountId }).onConflictDoNothing().returning();
    if (inserted.length > 0) {
      await this.createNotification({ accountId: followingAccountId, type: "follow", actorAccountId: followerAccountId });
    }
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

  async getSuggestedCoaches(viewerAccountId: number, limit = 5): Promise<SuggestedCoach[]> {
    const followingRows = await db
      .select({ followingAccountId: coachFollows.followingAccountId })
      .from(coachFollows)
      .where(eq(coachFollows.followerAccountId, viewerAccountId));
    const excludedAccountIds = new Set([viewerAccountId, ...followingRows.map((row) => row.followingAccountId)]);

    // publicName is guaranteed non-null here — publishing has required one
    // since Fase A — but joined in anyway rather than assumed, since a
    // pre-Fase-A row shared before that gate existed could still be null.
    const publisherRows = await db
      .select({
        accountId: exercises.accountId,
        publicName: accounts.publicName,
        exerciseCount: sql<number>`count(distinct ${exercises.id})::int`,
        likeCount: sql<number>`count(${exerciseLikes.id})::int`,
      })
      .from(exercises)
      .innerJoin(accounts, eq(accounts.id, exercises.accountId))
      .leftJoin(exerciseLikes, eq(exerciseLikes.exerciseId, exercises.id))
      .where(eq(exercises.sharedToCommunity, 1))
      .groupBy(exercises.accountId, accounts.publicName);

    const candidates = publisherRows.filter((row) => row.publicName && !excludedAccountIds.has(row.accountId));
    if (candidates.length === 0) return [];

    const candidateIds = candidates.map((row) => row.accountId);
    const followerCounts = await db
      .select({ followingAccountId: coachFollows.followingAccountId, count: sql<number>`count(*)::int` })
      .from(coachFollows)
      .where(inArray(coachFollows.followingAccountId, candidateIds))
      .groupBy(coachFollows.followingAccountId);
    const followerCountByAccountId = new Map(followerCounts.map((row) => [row.followingAccountId, row.count]));

    return candidates
      .map((row) => ({
        accountId: row.accountId,
        publicName: row.publicName as string,
        exerciseCount: row.exerciseCount,
        likeCount: row.likeCount,
        followerCount: followerCountByAccountId.get(row.accountId) ?? 0,
      }))
      .sort((a, b) => b.likeCount - a.likeCount || b.exerciseCount - a.exerciseCount || a.accountId - b.accountId)
      .slice(0, limit);
  }

  async createNotification(data: { accountId: number; type: "follow" | "like" | "comment" | "like_play" | "comment_play" | "like_evaluation_test" | "comment_evaluation_test"; actorAccountId: number; exerciseId?: number; playId?: number; evaluationTestId?: number }): Promise<void> {
    await db.insert(notifications).values({
      accountId: data.accountId,
      type: data.type,
      actorAccountId: data.actorAccountId,
      exerciseId: data.exerciseId ?? null,
      playId: data.playId ?? null,
      evaluationTestId: data.evaluationTestId ?? null,
    });
  }

  async getNotifications(accountId: number, limit = 30): Promise<NotificationView[]> {
    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        actorAccountId: notifications.actorAccountId,
        actorPublicName: accounts.publicName,
        exerciseId: notifications.exerciseId,
        exerciseName: exercises.name,
        playId: notifications.playId,
        playName: plays.name,
        evaluationTestId: notifications.evaluationTestId,
        evaluationTestName: evaluationTests.name,
        read: notifications.read,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(accounts, eq(notifications.actorAccountId, accounts.id))
      .leftJoin(exercises, eq(notifications.exerciseId, exercises.id))
      .leftJoin(plays, eq(notifications.playId, plays.id))
      .leftJoin(evaluationTests, eq(notifications.evaluationTestId, evaluationTests.id))
      .where(eq(notifications.accountId, accountId))
      .orderBy(desc(notifications.id))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      actorAccountId: row.actorAccountId,
      actorPublicName: row.actorPublicName,
      exerciseId: row.exerciseId,
      exerciseName: row.exerciseName,
      playId: row.playId,
      playName: row.playName,
      evaluationTestId: row.evaluationTestId,
      evaluationTestName: row.evaluationTestName,
      read: row.read === 1,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    }));
  }

  async getUnreadNotificationCount(accountId: number): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.accountId, accountId), eq(notifications.read, 0)));
    return row.count;
  }

  async markNotificationRead(id: number, accountId: number): Promise<void> {
    await db
      .update(notifications)
      .set({ read: 1 })
      .where(and(eq(notifications.id, id), eq(notifications.accountId, accountId)));
  }

  async markAllNotificationsRead(accountId: number): Promise<void> {
    await db
      .update(notifications)
      .set({ read: 1 })
      .where(and(eq(notifications.accountId, accountId), eq(notifications.read, 0)));
  }

  async createExerciseComment(exerciseId: number, accountId: number, body: string): Promise<ExerciseCommentView | undefined> {
    const [exercise] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), eq(exercises.sharedToCommunity, 1)));
    if (!exercise) return undefined;

    const [comment] = await db.insert(exerciseComments).values({ exerciseId, accountId, body }).returning();

    if (exercise.accountId !== accountId) {
      await this.createNotification({ accountId: exercise.accountId, type: "comment", actorAccountId: accountId, exerciseId });
    }

    const [author] = await db.select({ publicName: accounts.publicName }).from(accounts).where(eq(accounts.id, accountId));

    return {
      id: comment.id,
      exerciseId: comment.exerciseId,
      accountId: comment.accountId,
      publicName: author?.publicName ?? null,
      body: comment.body,
      createdAt: comment.createdAt ? comment.createdAt.toISOString() : null,
      canDelete: true,
    };
  }

  async getExerciseComments(exerciseId: number, viewerAccountId: number): Promise<ExerciseCommentView[] | undefined> {
    const [exercise] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), eq(exercises.sharedToCommunity, 1)));
    if (!exercise) return undefined;

    const rows = await db
      .select({
        id: exerciseComments.id,
        exerciseId: exerciseComments.exerciseId,
        accountId: exerciseComments.accountId,
        publicName: accounts.publicName,
        body: exerciseComments.body,
        createdAt: exerciseComments.createdAt,
      })
      .from(exerciseComments)
      .leftJoin(accounts, eq(accounts.id, exerciseComments.accountId))
      .where(eq(exerciseComments.exerciseId, exerciseId))
      .orderBy(asc(exerciseComments.id));

    return rows.map((row) => ({
      id: row.id,
      exerciseId: row.exerciseId,
      accountId: row.accountId,
      publicName: row.publicName,
      body: row.body,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      canDelete: row.accountId === viewerAccountId || exercise.accountId === viewerAccountId,
    }));
  }

  async deleteExerciseComment(commentId: number, accountId: number): Promise<boolean> {
    const [comment] = await db.select().from(exerciseComments).where(eq(exerciseComments.id, commentId));
    if (!comment) return false;

    const [exercise] = await db.select().from(exercises).where(eq(exercises.id, comment.exerciseId));
    const canDelete = comment.accountId === accountId || exercise?.accountId === accountId;
    if (!canDelete) return false;

    const result = await db.delete(exerciseComments).where(eq(exerciseComments.id, commentId));
    return (result.rowCount ?? 0) > 0;
  }

  async setPlayCommunityShare(id: number, teamId: number, shared: boolean): Promise<Play | undefined> {
    const [play] = await db
      .update(plays)
      .set({ sharedToCommunity: shared ? 1 : 0 })
      .where(and(eq(plays.id, id), eq(plays.teamId, teamId)))
      .returning();
    return play || undefined;
  }

  async getCommunityPlays(accountId: number, opts: { sort?: "recent" | "popular"; followingOnly?: boolean; savedOnly?: boolean } = {}): Promise<(Play & { likeCount: number; likedByMe: boolean; savedByMe: boolean; commentCount: number; avgRating: number | null; ratingCount: number; myRating: number | null; publishedBy: { accountId: number; publicName: string | null } })[]> {
    let shared = await db
      .select({ play: plays, ownerAccountId: teams.accountId })
      .from(plays)
      .innerJoin(teams, eq(teams.id, plays.teamId))
      .where(eq(plays.sharedToCommunity, 1));
    if (shared.length === 0) return [];

    if (opts.followingOnly) {
      const followingRows = await db
        .select({ followingAccountId: coachFollows.followingAccountId })
        .from(coachFollows)
        .where(eq(coachFollows.followerAccountId, accountId));
      const followingAccountIds = new Set(followingRows.map((row) => row.followingAccountId));
      shared = shared.filter((row) => followingAccountIds.has(row.ownerAccountId));
    }

    if (opts.savedOnly) {
      const savedRows = await db.select({ playId: playSaves.playId }).from(playSaves).where(eq(playSaves.accountId, accountId));
      const savedPlayIds = new Set(savedRows.map((row) => row.playId));
      shared = shared.filter((row) => savedPlayIds.has(row.play.id));
    }

    if (shared.length === 0) return [];

    const playIds = shared.map((row) => row.play.id);
    const likeCounts = await db
      .select({ playId: playLikes.playId, count: sql<number>`count(*)::int` })
      .from(playLikes)
      .where(inArray(playLikes.playId, playIds))
      .groupBy(playLikes.playId);
    const likeCountByPlayId = new Map(likeCounts.map((row) => [row.playId, row.count]));

    const likedRows = await db
      .select({ playId: playLikes.playId })
      .from(playLikes)
      .where(and(inArray(playLikes.playId, playIds), eq(playLikes.accountId, accountId)));
    const likedPlayIds = new Set(likedRows.map((row) => row.playId));

    const savedRowsForViewer = await db
      .select({ playId: playSaves.playId })
      .from(playSaves)
      .where(and(inArray(playSaves.playId, playIds), eq(playSaves.accountId, accountId)));
    const savedPlayIdsForViewer = new Set(savedRowsForViewer.map((row) => row.playId));

    const commentCounts = await db
      .select({ playId: playComments.playId, count: sql<number>`count(*)::int` })
      .from(playComments)
      .where(inArray(playComments.playId, playIds))
      .groupBy(playComments.playId);
    const commentCountByPlayId = new Map(commentCounts.map((row) => [row.playId, row.count]));

    const ratingAggregates = await db
      .select({ playId: playRatings.playId, avg: sql<number>`avg(${playRatings.rating})::float`, count: sql<number>`count(*)::int` })
      .from(playRatings)
      .where(inArray(playRatings.playId, playIds))
      .groupBy(playRatings.playId);
    const ratingAggregateByPlayId = new Map(ratingAggregates.map((row) => [row.playId, row]));

    const myRatingRows = await db
      .select({ playId: playRatings.playId, rating: playRatings.rating })
      .from(playRatings)
      .where(and(inArray(playRatings.playId, playIds), eq(playRatings.accountId, accountId)));
    const myRatingByPlayId = new Map(myRatingRows.map((row) => [row.playId, row.rating]));

    const publisherIds = Array.from(new Set(shared.map((row) => row.ownerAccountId)));
    const publishers = await db
      .select({ id: accounts.id, publicName: accounts.publicName })
      .from(accounts)
      .where(inArray(accounts.id, publisherIds));
    const publisherById = new Map(publishers.map((publisher) => [publisher.id, publisher]));

    const withExtras = shared.map((row) => ({
      ...row.play,
      likeCount: likeCountByPlayId.get(row.play.id) ?? 0,
      likedByMe: likedPlayIds.has(row.play.id),
      savedByMe: savedPlayIdsForViewer.has(row.play.id),
      commentCount: commentCountByPlayId.get(row.play.id) ?? 0,
      avgRating: ratingAggregateByPlayId.get(row.play.id)?.avg ?? null,
      ratingCount: ratingAggregateByPlayId.get(row.play.id)?.count ?? 0,
      myRating: myRatingByPlayId.get(row.play.id) ?? null,
      publishedBy: {
        accountId: row.ownerAccountId,
        publicName: publisherById.get(row.ownerAccountId)?.publicName ?? null,
      },
    }));

    return opts.sort === "popular"
      ? withExtras.sort((a, b) => b.likeCount - a.likeCount || b.id - a.id)
      : withExtras.sort((a, b) => b.id - a.id);
  }

  async importCommunityPlay(id: number, teamId: number): Promise<Play | undefined> {
    return await db.transaction(async (tx) => {
      const [source] = await tx.select().from(plays).where(and(eq(plays.id, id), eq(plays.sharedToCommunity, 1)));
      if (!source) return undefined;

      const [imported] = await tx
        .insert(plays)
        .values({
          teamId,
          name: source.name,
          category: source.category,
          courtType: source.courtType,
          situation: source.situation,
          notes: source.notes,
        })
        .returning();

      const sourceSteps = await tx
        .select()
        .from(playSteps)
        .where(eq(playSteps.playId, source.id))
        .orderBy(asc(playSteps.stepIndex));
      if (sourceSteps.length > 0) {
        await tx.insert(playSteps).values(
          sourceSteps.map((step) => ({
            playId: imported.id,
            stepIndex: step.stepIndex,
            tokens: step.tokens,
            drawings: step.drawings,
          })),
        );
      }

      return imported;
    });
  }

  async likePlay(playId: number, accountId: number): Promise<boolean> {
    const [row] = await db
      .select({ ownerAccountId: teams.accountId })
      .from(plays)
      .innerJoin(teams, eq(teams.id, plays.teamId))
      .where(and(eq(plays.id, playId), eq(plays.sharedToCommunity, 1)));
    if (!row) return false;

    const inserted = await db.insert(playLikes).values({ playId, accountId }).onConflictDoNothing().returning();
    if (inserted.length > 0 && row.ownerAccountId !== accountId) {
      await this.createNotification({ accountId: row.ownerAccountId, type: "like_play", actorAccountId: accountId, playId });
    }
    return true;
  }

  async unlikePlay(playId: number, accountId: number): Promise<void> {
    await db.delete(playLikes).where(and(eq(playLikes.playId, playId), eq(playLikes.accountId, accountId)));
  }

  async ratePlay(playId: number, accountId: number, rating: number): Promise<boolean> {
    const [play] = await db.select().from(plays).where(and(eq(plays.id, playId), eq(plays.sharedToCommunity, 1)));
    if (!play) return false;

    await db
      .insert(playRatings)
      .values({ playId, accountId, rating })
      .onConflictDoUpdate({
        target: [playRatings.playId, playRatings.accountId],
        set: { rating },
      });
    return true;
  }

  async unratePlay(playId: number, accountId: number): Promise<void> {
    await db.delete(playRatings).where(and(eq(playRatings.playId, playId), eq(playRatings.accountId, accountId)));
  }

  async savePlay(playId: number, accountId: number): Promise<boolean> {
    const [play] = await db.select().from(plays).where(and(eq(plays.id, playId), eq(plays.sharedToCommunity, 1)));
    if (!play) return false;

    await db.insert(playSaves).values({ playId, accountId }).onConflictDoNothing();
    return true;
  }

  async unsavePlay(playId: number, accountId: number): Promise<void> {
    await db.delete(playSaves).where(and(eq(playSaves.playId, playId), eq(playSaves.accountId, accountId)));
  }

  async createPlayComment(playId: number, accountId: number, body: string): Promise<PlayCommentView | undefined> {
    const [row] = await db
      .select({ ownerAccountId: teams.accountId })
      .from(plays)
      .innerJoin(teams, eq(teams.id, plays.teamId))
      .where(and(eq(plays.id, playId), eq(plays.sharedToCommunity, 1)));
    if (!row) return undefined;

    const [comment] = await db.insert(playComments).values({ playId, accountId, body }).returning();

    if (row.ownerAccountId !== accountId) {
      await this.createNotification({ accountId: row.ownerAccountId, type: "comment_play", actorAccountId: accountId, playId });
    }

    const [author] = await db.select({ publicName: accounts.publicName }).from(accounts).where(eq(accounts.id, accountId));

    return {
      id: comment.id,
      playId: comment.playId,
      accountId: comment.accountId,
      publicName: author?.publicName ?? null,
      body: comment.body,
      createdAt: comment.createdAt ? comment.createdAt.toISOString() : null,
      canDelete: true,
    };
  }

  async getPlayComments(playId: number, viewerAccountId: number): Promise<PlayCommentView[] | undefined> {
    const [row] = await db
      .select({ ownerAccountId: teams.accountId })
      .from(plays)
      .innerJoin(teams, eq(teams.id, plays.teamId))
      .where(and(eq(plays.id, playId), eq(plays.sharedToCommunity, 1)));
    if (!row) return undefined;

    const rows = await db
      .select({
        id: playComments.id,
        playId: playComments.playId,
        accountId: playComments.accountId,
        publicName: accounts.publicName,
        body: playComments.body,
        createdAt: playComments.createdAt,
      })
      .from(playComments)
      .leftJoin(accounts, eq(accounts.id, playComments.accountId))
      .where(eq(playComments.playId, playId))
      .orderBy(asc(playComments.id));

    return rows.map((r) => ({
      id: r.id,
      playId: r.playId,
      accountId: r.accountId,
      publicName: r.publicName,
      body: r.body,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      canDelete: r.accountId === viewerAccountId || row.ownerAccountId === viewerAccountId,
    }));
  }

  async deletePlayComment(commentId: number, accountId: number): Promise<boolean> {
    const [comment] = await db.select().from(playComments).where(eq(playComments.id, commentId));
    if (!comment) return false;

    const [row] = await db
      .select({ ownerAccountId: teams.accountId })
      .from(plays)
      .innerJoin(teams, eq(teams.id, plays.teamId))
      .where(eq(plays.id, comment.playId));

    const canDelete = comment.accountId === accountId || row?.ownerAccountId === accountId;
    if (!canDelete) return false;

    const result = await db.delete(playComments).where(eq(playComments.id, commentId));
    return (result.rowCount ?? 0) > 0;
  }

  async setEvaluationTestCommunityShare(id: number, accountId: number, shared: boolean): Promise<EvaluationTest | undefined> {
    const [test] = await db
      .update(evaluationTests)
      .set({ sharedToCommunity: shared ? 1 : 0 })
      .where(and(eq(evaluationTests.id, id), eq(evaluationTests.accountId, accountId)))
      .returning();
    return test || undefined;
  }

  async getCommunityEvaluationTests(accountId: number, opts: { sort?: "recent" | "popular"; followingOnly?: boolean; savedOnly?: boolean } = {}): Promise<(EvaluationTest & { likeCount: number; likedByMe: boolean; savedByMe: boolean; commentCount: number; avgRating: number | null; ratingCount: number; myRating: number | null; publishedBy: { accountId: number; publicName: string | null } })[]> {
    let shared = await db.select().from(evaluationTests).where(eq(evaluationTests.sharedToCommunity, 1));
    if (shared.length === 0) return [];

    if (opts.followingOnly) {
      const followingRows = await db
        .select({ followingAccountId: coachFollows.followingAccountId })
        .from(coachFollows)
        .where(eq(coachFollows.followerAccountId, accountId));
      const followingAccountIds = new Set(followingRows.map((row) => row.followingAccountId));
      shared = shared.filter((test) => followingAccountIds.has(test.accountId));
    }

    if (opts.savedOnly) {
      const savedRows = await db.select({ testId: evaluationTestSaves.testId }).from(evaluationTestSaves).where(eq(evaluationTestSaves.accountId, accountId));
      const savedTestIds = new Set(savedRows.map((row) => row.testId));
      shared = shared.filter((test) => savedTestIds.has(test.id));
    }

    if (shared.length === 0) return [];

    const testIds = shared.map((test) => test.id);
    const likeCounts = await db
      .select({ testId: evaluationTestLikes.testId, count: sql<number>`count(*)::int` })
      .from(evaluationTestLikes)
      .where(inArray(evaluationTestLikes.testId, testIds))
      .groupBy(evaluationTestLikes.testId);
    const likeCountByTestId = new Map(likeCounts.map((row) => [row.testId, row.count]));

    const likedRows = await db
      .select({ testId: evaluationTestLikes.testId })
      .from(evaluationTestLikes)
      .where(and(inArray(evaluationTestLikes.testId, testIds), eq(evaluationTestLikes.accountId, accountId)));
    const likedTestIds = new Set(likedRows.map((row) => row.testId));

    const savedRowsForViewer = await db
      .select({ testId: evaluationTestSaves.testId })
      .from(evaluationTestSaves)
      .where(and(inArray(evaluationTestSaves.testId, testIds), eq(evaluationTestSaves.accountId, accountId)));
    const savedTestIdsForViewer = new Set(savedRowsForViewer.map((row) => row.testId));

    const commentCounts = await db
      .select({ testId: evaluationTestComments.testId, count: sql<number>`count(*)::int` })
      .from(evaluationTestComments)
      .where(inArray(evaluationTestComments.testId, testIds))
      .groupBy(evaluationTestComments.testId);
    const commentCountByTestId = new Map(commentCounts.map((row) => [row.testId, row.count]));

    const ratingAggregates = await db
      .select({ testId: evaluationTestRatings.testId, avg: sql<number>`avg(${evaluationTestRatings.rating})::float`, count: sql<number>`count(*)::int` })
      .from(evaluationTestRatings)
      .where(inArray(evaluationTestRatings.testId, testIds))
      .groupBy(evaluationTestRatings.testId);
    const ratingAggregateByTestId = new Map(ratingAggregates.map((row) => [row.testId, row]));

    const myRatingRows = await db
      .select({ testId: evaluationTestRatings.testId, rating: evaluationTestRatings.rating })
      .from(evaluationTestRatings)
      .where(and(inArray(evaluationTestRatings.testId, testIds), eq(evaluationTestRatings.accountId, accountId)));
    const myRatingByTestId = new Map(myRatingRows.map((row) => [row.testId, row.rating]));

    const publisherIds = Array.from(new Set(shared.map((test) => test.accountId)));
    const publishers = await db
      .select({ id: accounts.id, publicName: accounts.publicName })
      .from(accounts)
      .where(inArray(accounts.id, publisherIds));
    const publisherById = new Map(publishers.map((publisher) => [publisher.id, publisher]));

    const withExtras = shared.map((test) => ({
      ...test,
      likeCount: likeCountByTestId.get(test.id) ?? 0,
      likedByMe: likedTestIds.has(test.id),
      savedByMe: savedTestIdsForViewer.has(test.id),
      commentCount: commentCountByTestId.get(test.id) ?? 0,
      avgRating: ratingAggregateByTestId.get(test.id)?.avg ?? null,
      ratingCount: ratingAggregateByTestId.get(test.id)?.count ?? 0,
      myRating: myRatingByTestId.get(test.id) ?? null,
      publishedBy: {
        accountId: test.accountId,
        publicName: publisherById.get(test.accountId)?.publicName ?? null,
      },
    }));

    return opts.sort === "popular"
      ? withExtras.sort((a, b) => b.likeCount - a.likeCount || b.id - a.id)
      : withExtras.sort((a, b) => b.id - a.id);
  }

  async importCommunityEvaluationTest(id: number, accountId: number): Promise<EvaluationTest | undefined> {
    const [source] = await db.select().from(evaluationTests).where(and(eq(evaluationTests.id, id), eq(evaluationTests.sharedToCommunity, 1)));
    if (!source) return undefined;

    const [imported] = await db
      .insert(evaluationTests)
      .values({
        accountId,
        name: source.name,
        type: source.type,
        unit: source.unit,
        worstValue: source.worstValue,
        bestValue: source.bestValue,
        description: source.description,
      })
      .returning();
    return imported;
  }

  async likeEvaluationTest(testId: number, accountId: number): Promise<boolean> {
    const [test] = await db.select().from(evaluationTests).where(and(eq(evaluationTests.id, testId), eq(evaluationTests.sharedToCommunity, 1)));
    if (!test) return false;

    const inserted = await db.insert(evaluationTestLikes).values({ testId, accountId }).onConflictDoNothing().returning();
    if (inserted.length > 0 && test.accountId !== accountId) {
      await this.createNotification({ accountId: test.accountId, type: "like_evaluation_test", actorAccountId: accountId, evaluationTestId: testId });
    }
    return true;
  }

  async unlikeEvaluationTest(testId: number, accountId: number): Promise<void> {
    await db.delete(evaluationTestLikes).where(and(eq(evaluationTestLikes.testId, testId), eq(evaluationTestLikes.accountId, accountId)));
  }

  async rateEvaluationTest(testId: number, accountId: number, rating: number): Promise<boolean> {
    const [test] = await db.select().from(evaluationTests).where(and(eq(evaluationTests.id, testId), eq(evaluationTests.sharedToCommunity, 1)));
    if (!test) return false;

    await db
      .insert(evaluationTestRatings)
      .values({ testId, accountId, rating })
      .onConflictDoUpdate({
        target: [evaluationTestRatings.testId, evaluationTestRatings.accountId],
        set: { rating },
      });
    return true;
  }

  async unrateEvaluationTest(testId: number, accountId: number): Promise<void> {
    await db.delete(evaluationTestRatings).where(and(eq(evaluationTestRatings.testId, testId), eq(evaluationTestRatings.accountId, accountId)));
  }

  async saveEvaluationTest(testId: number, accountId: number): Promise<boolean> {
    const [test] = await db.select().from(evaluationTests).where(and(eq(evaluationTests.id, testId), eq(evaluationTests.sharedToCommunity, 1)));
    if (!test) return false;

    await db.insert(evaluationTestSaves).values({ testId, accountId }).onConflictDoNothing();
    return true;
  }

  async unsaveEvaluationTest(testId: number, accountId: number): Promise<void> {
    await db.delete(evaluationTestSaves).where(and(eq(evaluationTestSaves.testId, testId), eq(evaluationTestSaves.accountId, accountId)));
  }

  async createEvaluationTestComment(testId: number, accountId: number, body: string): Promise<EvaluationTestCommentView | undefined> {
    const [test] = await db.select().from(evaluationTests).where(and(eq(evaluationTests.id, testId), eq(evaluationTests.sharedToCommunity, 1)));
    if (!test) return undefined;

    const [comment] = await db.insert(evaluationTestComments).values({ testId, accountId, body }).returning();

    if (test.accountId !== accountId) {
      await this.createNotification({ accountId: test.accountId, type: "comment_evaluation_test", actorAccountId: accountId, evaluationTestId: testId });
    }

    const [author] = await db.select({ publicName: accounts.publicName }).from(accounts).where(eq(accounts.id, accountId));

    return {
      id: comment.id,
      testId: comment.testId,
      accountId: comment.accountId,
      publicName: author?.publicName ?? null,
      body: comment.body,
      createdAt: comment.createdAt ? comment.createdAt.toISOString() : null,
      canDelete: true,
    };
  }

  async getEvaluationTestComments(testId: number, viewerAccountId: number): Promise<EvaluationTestCommentView[] | undefined> {
    const [test] = await db.select().from(evaluationTests).where(and(eq(evaluationTests.id, testId), eq(evaluationTests.sharedToCommunity, 1)));
    if (!test) return undefined;

    const rows = await db
      .select({
        id: evaluationTestComments.id,
        testId: evaluationTestComments.testId,
        accountId: evaluationTestComments.accountId,
        publicName: accounts.publicName,
        body: evaluationTestComments.body,
        createdAt: evaluationTestComments.createdAt,
      })
      .from(evaluationTestComments)
      .leftJoin(accounts, eq(accounts.id, evaluationTestComments.accountId))
      .where(eq(evaluationTestComments.testId, testId))
      .orderBy(asc(evaluationTestComments.id));

    return rows.map((r) => ({
      id: r.id,
      testId: r.testId,
      accountId: r.accountId,
      publicName: r.publicName,
      body: r.body,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      canDelete: r.accountId === viewerAccountId || test.accountId === viewerAccountId,
    }));
  }

  async deleteEvaluationTestComment(commentId: number, accountId: number): Promise<boolean> {
    const [comment] = await db.select().from(evaluationTestComments).where(eq(evaluationTestComments.id, commentId));
    if (!comment) return false;

    const [test] = await db.select().from(evaluationTests).where(eq(evaluationTests.id, comment.testId));
    const canDelete = comment.accountId === accountId || test?.accountId === accountId;
    if (!canDelete) return false;

    const result = await db.delete(evaluationTestComments).where(eq(evaluationTestComments.id, commentId));
    return (result.rowCount ?? 0) > 0;
  }

  async reportExercise(exerciseId: number, accountId: number, reason: ReportReason, details?: string): Promise<"created" | "already_reported" | "not_found"> {
    const [exercise] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), eq(exercises.sharedToCommunity, 1)));
    if (!exercise) return "not_found";

    const [existing] = await db
      .select()
      .from(exerciseReports)
      .where(and(eq(exerciseReports.exerciseId, exerciseId), eq(exerciseReports.accountId, accountId)));
    if (existing) return "already_reported";

    await db.insert(exerciseReports).values({ exerciseId, accountId, reason, details: details ?? null });
    return "created";
  }

  async reportPlay(playId: number, accountId: number, reason: ReportReason, details?: string): Promise<"created" | "already_reported" | "not_found"> {
    const [play] = await db
      .select()
      .from(plays)
      .where(and(eq(plays.id, playId), eq(plays.sharedToCommunity, 1)));
    if (!play) return "not_found";

    const [existing] = await db
      .select()
      .from(playReports)
      .where(and(eq(playReports.playId, playId), eq(playReports.accountId, accountId)));
    if (existing) return "already_reported";

    await db.insert(playReports).values({ playId, accountId, reason, details: details ?? null });
    return "created";
  }

  async reportEvaluationTest(testId: number, accountId: number, reason: ReportReason, details?: string): Promise<"created" | "already_reported" | "not_found"> {
    const [test] = await db
      .select()
      .from(evaluationTests)
      .where(and(eq(evaluationTests.id, testId), eq(evaluationTests.sharedToCommunity, 1)));
    if (!test) return "not_found";

    const [existing] = await db
      .select()
      .from(evaluationTestReports)
      .where(and(eq(evaluationTestReports.testId, testId), eq(evaluationTestReports.accountId, accountId)));
    if (existing) return "already_reported";

    await db.insert(evaluationTestReports).values({ testId, accountId, reason, details: details ?? null });
    return "created";
  }

  // Merges the three content types' pending reports into one admin feed.
  // Each content type resolves "owner" differently (a play's owner is its
  // team's account, the other two are scoped by accountId directly — same
  // asymmetry as getCommunityPlays/getCommunityExercises), so they're
  // queried separately and joined against a single batched accounts lookup
  // rather than one shared query.
  async getPendingReports(): Promise<AdminReportView[]> {
    const [exerciseRows, playRows, evaluationTestRows] = await Promise.all([
      db
        .select({
          id: exerciseReports.id,
          contentId: exerciseReports.exerciseId,
          contentName: exercises.name,
          reason: exerciseReports.reason,
          details: exerciseReports.details,
          status: exerciseReports.status,
          reporterAccountId: exerciseReports.accountId,
          ownerAccountId: exercises.accountId,
          createdAt: exerciseReports.createdAt,
        })
        .from(exerciseReports)
        .innerJoin(exercises, eq(exercises.id, exerciseReports.exerciseId))
        .where(eq(exerciseReports.status, "pending")),
      db
        .select({
          id: playReports.id,
          contentId: playReports.playId,
          contentName: plays.name,
          reason: playReports.reason,
          details: playReports.details,
          status: playReports.status,
          reporterAccountId: playReports.accountId,
          ownerAccountId: teams.accountId,
          createdAt: playReports.createdAt,
        })
        .from(playReports)
        .innerJoin(plays, eq(plays.id, playReports.playId))
        .innerJoin(teams, eq(teams.id, plays.teamId))
        .where(eq(playReports.status, "pending")),
      db
        .select({
          id: evaluationTestReports.id,
          contentId: evaluationTestReports.testId,
          contentName: evaluationTests.name,
          reason: evaluationTestReports.reason,
          details: evaluationTestReports.details,
          status: evaluationTestReports.status,
          reporterAccountId: evaluationTestReports.accountId,
          ownerAccountId: evaluationTests.accountId,
          createdAt: evaluationTestReports.createdAt,
        })
        .from(evaluationTestReports)
        .innerJoin(evaluationTests, eq(evaluationTests.id, evaluationTestReports.testId))
        .where(eq(evaluationTestReports.status, "pending")),
    ]);

    const merged = [
      ...exerciseRows.map((r) => ({ ...r, contentType: "exercise" as const })),
      ...playRows.map((r) => ({ ...r, contentType: "play" as const })),
      ...evaluationTestRows.map((r) => ({ ...r, contentType: "evaluationTest" as const })),
    ];
    if (merged.length === 0) return [];

    const accountIds = new Set<number>();
    merged.forEach((r) => {
      accountIds.add(r.reporterAccountId);
      accountIds.add(r.ownerAccountId);
    });
    const accountRows = await db
      .select({ id: accounts.id, email: accounts.email, publicName: accounts.publicName })
      .from(accounts)
      .where(inArray(accounts.id, Array.from(accountIds)));
    const accountById = new Map(accountRows.map((a) => [a.id, a]));

    return merged
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
      .map((r) => ({
        id: r.id,
        contentType: r.contentType,
        contentId: r.contentId,
        contentName: r.contentName,
        reason: r.reason as ReportReason,
        details: r.details,
        status: r.status as ReportStatus,
        reporterAccountId: r.reporterAccountId,
        reporterPublicName: accountById.get(r.reporterAccountId)?.publicName ?? null,
        reporterEmail: accountById.get(r.reporterAccountId)?.email ?? "",
        ownerAccountId: r.ownerAccountId,
        ownerEmail: accountById.get(r.ownerAccountId)?.email ?? "",
        createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      }));
  }

  async resolveReport(contentType: "exercise" | "play" | "evaluationTest", reportId: number, action: "dismiss" | "remove"): Promise<boolean> {
    const status: ReportStatus = action === "remove" ? "removed" : "dismissed";

    if (contentType === "exercise") {
      const [report] = await db.select().from(exerciseReports).where(eq(exerciseReports.id, reportId));
      if (!report) return false;
      await db.update(exerciseReports).set({ status }).where(eq(exerciseReports.id, reportId));
      if (action === "remove") {
        await db.update(exercises).set({ sharedToCommunity: 0 }).where(eq(exercises.id, report.exerciseId));
      }
      return true;
    }

    if (contentType === "play") {
      const [report] = await db.select().from(playReports).where(eq(playReports.id, reportId));
      if (!report) return false;
      await db.update(playReports).set({ status }).where(eq(playReports.id, reportId));
      if (action === "remove") {
        await db.update(plays).set({ sharedToCommunity: 0 }).where(eq(plays.id, report.playId));
      }
      return true;
    }

    const [report] = await db.select().from(evaluationTestReports).where(eq(evaluationTestReports.id, reportId));
    if (!report) return false;
    await db.update(evaluationTestReports).set({ status }).where(eq(evaluationTestReports.id, reportId));
    if (action === "remove") {
      await db.update(evaluationTests).set({ sharedToCommunity: 0 }).where(eq(evaluationTests.id, report.testId));
    }
    return true;
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

  // Evaluation test methods — a coach-defined test scored automatically
  // 1-100 (see computeEvaluationScore).
  async getAllEvaluationTests(accountId: number): Promise<EvaluationTest[]> {
    return await db.select().from(evaluationTests).where(eq(evaluationTests.accountId, accountId));
  }

  async getEvaluationTestById(id: number, accountId: number): Promise<EvaluationTest | undefined> {
    const [test] = await db
      .select()
      .from(evaluationTests)
      .where(and(eq(evaluationTests.id, id), eq(evaluationTests.accountId, accountId)));
    return test || undefined;
  }

  async createEvaluationTest(accountId: number, insertTest: InsertEvaluationTest): Promise<EvaluationTest> {
    const [test] = await db
      .insert(evaluationTests)
      .values({ ...insertTest, accountId, description: insertTest.description || null })
      .returning();
    return test;
  }

  async updateEvaluationTest(id: number, accountId: number, updateData: Partial<InsertEvaluationTest>): Promise<EvaluationTest | undefined> {
    const [test] = await db
      .update(evaluationTests)
      .set(updateData)
      .where(and(eq(evaluationTests.id, id), eq(evaluationTests.accountId, accountId)))
      .returning();
    return test || undefined;
  }

  async deleteEvaluationTest(id: number, accountId: number): Promise<boolean> {
    const result = await db
      .delete(evaluationTests)
      .where(and(eq(evaluationTests.id, id), eq(evaluationTests.accountId, accountId)));
    return (result.rowCount ?? 0) > 0;
  }

  async recordEvaluationTestResults(testId: number, date: string, results: { playerId: number; value: number }[]): Promise<EvaluationTestResult[]> {
    return await db
      .insert(evaluationTestResults)
      .values(results.map((r) => ({ testId, playerId: r.playerId, value: r.value, date })))
      .returning();
  }

  async getBestEvaluationTestValues(testId: number, playerIds: number[], worstValue: number, bestValue: number): Promise<Record<number, number>> {
    if (playerIds.length === 0) return {};
    const lowerIsBetter = bestValue < worstValue;
    const rows = await db
      .select({ playerId: evaluationTestResults.playerId, value: evaluationTestResults.value })
      .from(evaluationTestResults)
      .where(and(eq(evaluationTestResults.testId, testId), inArray(evaluationTestResults.playerId, playerIds)));

    const bests: Record<number, number> = {};
    for (const row of rows) {
      const current = bests[row.playerId];
      if (current === undefined || (lowerIsBetter ? row.value < current : row.value > current)) {
        bests[row.playerId] = row.value;
      }
    }
    return bests;
  }

  async getLatestEvaluationTestResultsForTeam(testId: number, teamId: number): Promise<Record<number, { value: number; date: string }>> {
    const rows = await db
      .select({ playerId: evaluationTestResults.playerId, value: evaluationTestResults.value, date: evaluationTestResults.date })
      .from(evaluationTestResults)
      .innerJoin(players, eq(evaluationTestResults.playerId, players.id))
      .where(and(eq(evaluationTestResults.testId, testId), eq(players.teamId, teamId)))
      .orderBy(desc(evaluationTestResults.date), desc(evaluationTestResults.createdAt));

    // Rows are newest-first, so the first time a player is seen is their
    // latest result.
    const latest: Record<number, { value: number; date: string }> = {};
    for (const row of rows) {
      if (!(row.playerId in latest)) latest[row.playerId] = { value: row.value, date: row.date };
    }
    return latest;
  }

  async getEvaluationTestResultsForPlayer(playerId: number): Promise<PlayerEvaluationTestHistory[]> {
    const rows = await db
      .select({
        testId: evaluationTests.id,
        testName: evaluationTests.name,
        type: evaluationTests.type,
        unit: evaluationTests.unit,
        worstValue: evaluationTests.worstValue,
        bestValue: evaluationTests.bestValue,
        value: evaluationTestResults.value,
        date: evaluationTestResults.date,
      })
      .from(evaluationTestResults)
      .innerJoin(evaluationTests, eq(evaluationTestResults.testId, evaluationTests.id))
      .where(eq(evaluationTestResults.playerId, playerId))
      .orderBy(desc(evaluationTestResults.date), desc(evaluationTestResults.createdAt));

    const byTest = new Map<number, PlayerEvaluationTestHistory>();
    for (const row of rows) {
      let group = byTest.get(row.testId);
      if (!group) {
        group = { testId: row.testId, testName: row.testName, type: row.type, unit: row.unit, worstValue: row.worstValue, bestValue: row.bestValue, results: [] };
        byTest.set(row.testId, group);
      }
      group.results.push({ value: row.value, date: row.date });
    }
    return Array.from(byTest.values());
  }

  // Roster-wide latest score per player per test, for the scrimmage
  // balancer — mirrors getLatestEvaluationTestResultsForTeam but across
  // every test the account has, and returns the computed 1-100 score
  // instead of the raw value.
  async getCurrentEvaluationScoresForTeam(teamId: number): Promise<Record<number, Record<number, number>>> {
    const rows = await db
      .select({
        playerId: evaluationTestResults.playerId,
        testId: evaluationTestResults.testId,
        value: evaluationTestResults.value,
        worstValue: evaluationTests.worstValue,
        bestValue: evaluationTests.bestValue,
      })
      .from(evaluationTestResults)
      .innerJoin(players, eq(evaluationTestResults.playerId, players.id))
      .innerJoin(evaluationTests, eq(evaluationTestResults.testId, evaluationTests.id))
      .where(eq(players.teamId, teamId))
      .orderBy(desc(evaluationTestResults.date), desc(evaluationTestResults.createdAt));

    // Rows are newest-first, so the first (player, test) pair seen is that
    // player's latest result for that test.
    const current: Record<number, Record<number, number>> = {};
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.playerId}:${row.testId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const playerCurrent = current[row.playerId] ?? (current[row.playerId] = {});
      playerCurrent[row.testId] = computeEvaluationScore(row.value, row.worstValue, row.bestValue);
    }
    return current;
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

  async getPlayerNotes(playerId: number): Promise<PlayerNote[]> {
    return await db.select().from(playerNotes).where(eq(playerNotes.playerId, playerId)).orderBy(desc(playerNotes.createdAt));
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
