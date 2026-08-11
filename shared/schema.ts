import { pgTable, text, serial, integer, real, timestamp, json, unique, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const PLANS = ["free", "paid", "club"] as const;
export type Plan = (typeof PLANS)[number];

// Free plan: 1 team, up to 15 players, read-only exercise library, up to 3
// saved plays. Paid plan: unlimited teams/players/plays, can create/edit
// exercises, full history. Club plan: everything Paid has, plus up to
// CLUB_PLAN_SEAT_LIMIT coaches sharing access to the same teams (invited
// from the account that holds the Club subscription).
export const FREE_PLAN_PLAYER_LIMIT = 15;
export const FREE_PLAN_TEAM_LIMIT = 1;
export const FREE_PLAN_PLAY_LIMIT = 3;
export const CLUB_PLAN_SEAT_LIMIT = 3;

// Owned and shaped by connect-pg-simple (server/auth.ts), not application
// code — declared here only so `drizzle-kit push` recognizes the table and
// doesn't try to drop it as "extra" on every push. Never read or written
// directly; express-session is the only thing that touches it.
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  plan: text("plan").notNull().default("free").$type<Plan>(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // A sha256 hash of the one-time reset token (never the raw token — a DB
  // leak shouldn't hand out working reset links), cleared once used or once
  // resetTokenExpiresAt passes. Null when no reset is in flight.
  resetTokenHash: text("reset_token_hash"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// A pending invitation to join a Club account as a coach — consumed (row
// deleted) the moment it's accepted, turning into an accountMemberships row.
// Mirrors accounts' password-reset token fields: a sha256 hash of the raw
// token, never the token itself, so a DB leak can't hand out a working
// invite link.
export const accountInvites = pgTable("account_invites", {
  id: serial("id").primaryKey(),
  ownerAccountId: integer("owner_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Grants memberAccountId (a coach's own login) access to ownerAccountId's
// teams — the Club plan's multi-coach seat. memberAccountId is unique: a
// coach belongs to at most one club at a time.
export const accountMemberships = pgTable("account_memberships", {
  id: serial("id").primaryKey(),
  ownerAccountId: integer("owner_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  memberAccountId: integer("member_account_id").notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  // Null until the first automatic weekly digest goes out; gates the cron
  // sweep (server/notifications-cron.ts) so a team gets at most one digest
  // every 7 days regardless of how often the sweep itself runs.
  lastWeeklyDigestAt: timestamp("last_weekly_digest_at"),
  // Prefills SessionModal's duration field for a from-scratch session, ahead
  // of its own "reuse the most recent session's duration" fallback — null
  // until a coach sets one, so nothing changes for a team that never does.
  defaultSessionDuration: integer("default_session_duration"),
  // A plain image URL (same convention as exercises.imageUrl — no upload
  // pipeline), shown next to the team name in the sidebar's team switcher.
  logoUrl: text("logo_url"),
  // One of TEAM_THEME_COLORS, or null for the app's default orange. Applied
  // client-side by overriding the --basketball-orange* CSS variables (see
  // client/src/lib/teamTheme.ts) — a fixed, pre-vetted palette rather than a
  // free-form color picker, so every option keeps the WCAG AA contrast the
  // default orange was deliberately tuned for.
  themeColor: text("theme_color"),
});

export const TEAM_THEME_COLORS = ["blue", "green", "purple", "red", "teal"] as const;
export type TeamThemeColor = typeof TEAM_THEME_COLORS[number];

export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // shooting, dribbling, defense, passing, conditioning
  duration: integer("duration").notNull(), // in minutes
  difficulty: text("difficulty").notNull(), // easy, medium, hard
  instructions: text("instructions"),
  imageUrl: text("image_url"),
  // 1 for favorited, 0 otherwise — same integer-flag convention as
  // players.isActive. Toggled through its own endpoint (not the general
  // create/edit form), so it's never plan-gated the way editing an
  // exercise's content is.
  isFavorite: integer("is_favorite").default(0),
  // Unguessable (24 random bytes) credential for a public read-only view of
  // this one exercise — same portalToken pattern as players. Null until a
  // coach first generates a share link.
  shareToken: text("share_token").unique(),
  // How many players the drill needs to run at all — a coach's own note for
  // planning around attendance, not enforced anywhere.
  minPlayers: integer("min_players"),
  // 1 when a coach has opted this exercise into the cross-account community
  // library (GET /api/community-exercises) for other coaches to browse and
  // import — same integer-flag convention as isFavorite, toggled through its
  // own ungated endpoint since opting in isn't "creating custom content".
  sharedToCommunity: integer("shared_to_community").default(0),
  // Only meaningful once the exercise has diagram steps (see exerciseSteps
  // below) — same convention as plays.courtType, defaulted so an exercise
  // with no diagram yet still has a valid value ready for when one is added.
  courtType: text("court_type").notNull().default("half"),
});

// A drill's optional animated court diagram — same shape and step-by-step
// tween-between-snapshots model as playSteps, kept in its own table (rather
// than a column on exercises) since most exercises have none at all. Editing
// happens on its own page/endpoint, separate from the exercise's normal
// name/description/etc. form.
export const exerciseSteps = pgTable("exercise_steps", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
  stepIndex: integer("step_index").notNull(),
  tokens: json("tokens").notNull().$type<Token[]>(),
  drawings: json("drawings").notNull().$type<Drawing[]>(),
});

export const trainingSessions = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  duration: integer("duration").notNull(), // in minutes
  exerciseIds: text("exercise_ids").array().default([]), // array of exercise IDs
  playIds: text("play_ids").array().default([]), // array of playbook play IDs practiced this session
  // Physical tests to run at the start of this session, before the exercise
  // sequence — lets a session combine a physical block (testing) with the
  // technical block (exercises) that follows it in Training Mode.
  testIds: text("test_ids").array().default([]),
  notes: text("notes"),
  attendanceCount: integer("attendance_count").default(0),
  totalPlayers: integer("total_players").default(18),
  status: text("status").default("scheduled"), // scheduled, in_progress, completed, cancelled
  // Null until the automatic ~2h-before reminder goes out (see
  // server/notifications-cron.ts) — the guard that keeps a coach's own
  // manual "Notify" button and the automatic sweep from double-sending.
  reminderSentAt: timestamp("reminder_sent_at"),
});

// A reusable starting point for a new session — everything about a session
// EXCEPT the date/time/attendance, which are inherently per-occurrence.
// Applying one just pre-fills SessionModal's fields; it never links back
// to the sessions later created from it.
export const sessionTemplates = pgTable("session_templates", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  duration: integer("duration").notNull(),
  exerciseIds: text("exercise_ids").array().default([]),
  playIds: text("play_ids").array().default([]),
  testIds: text("test_ids").array().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});


// A saved weekly pattern ("Tuesdays and Thursdays at 5:30pm") a coach sets
// up once at the start of a season. Never read directly by the calendar —
// generateSessionsFromSlots (server/storage.ts) is the only thing that
// turns a slot into real training_sessions rows, so the calendar's single
// source of truth stays trainingSessions.
export const recurringPracticeSlots = pgTable("recurring_practice_slots", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6, matches JS Date#getDay() (0 = Sunday)
  time: text("time").notNull(),
  duration: integer("duration").notNull(), // in minutes
  createdAt: timestamp("created_at").defaultNow(),
});

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => trainingSessions.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // present, absent, late, excused
  notes: text("notes"),
  markedAt: timestamp("marked_at").defaultNow(),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: text("position"),
  // No uniqueness constraint — a coach mid-season swapping numbers, or two
  // players briefly sharing one during a jersey order delay, shouldn't be
  // blocked by the app. Null until the coach assigns one.
  jerseyNumber: integer("jersey_number"),
  isActive: integer("is_active").default(1), // 1 for active, 0 for inactive
  // Plain "YYYY-MM-DD" text, same convention as every other date in this
  // schema (trainingSessions.date, playerInjuries.reportedDate, ...) —
  // avoids the timezone-shift bugs a native `date` column invites once a
  // value round-trips through JSON. Null for a player without a birth date
  // on file yet.
  birthDate: text("birth_date"),
  // Centimeters — null until the coach records one.
  height: integer("height"),
  // 'left' | 'right', null until recorded.
  dominantHand: text("dominant_hand").$type<"left" | "right">(),
  // Free text — a name and a phone number, not two structured fields, since
  // a coach jotting this down mid-registration shouldn't have to fill in a
  // rigid form. Null until the coach records one.
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  // Allergies, conditions, anything a coach needs to know in an emergency —
  // free text, null until recorded.
  medicalNotes: text("medical_notes"),
  // 1 for the team captain, 0 otherwise — same integer-flag convention as
  // isActive. Not unique: a coach naming co-captains shouldn't be blocked.
  isCaptain: integer("is_captain").default(0),
  // Unguessable (24 random bytes) credential for the public read-only player
  // portal — a coach shares a link built from this instead of the parent
  // needing an account. Null until the coach first generates a link.
  portalToken: text("portal_token").unique(),
});

// A browser's Web Push subscription, scoped to one player's portal (not an
// account — portal visitors never sign in). One physical device can end up
// subscribed for more than one player (e.g. a parent with two kids on the
// team visiting both portals), hence player+endpoint rather than endpoint
// alone as the natural key.
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  playerEndpointUnique: unique().on(table.playerId, table.endpoint),
}));

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

// One row per skill per evaluation — a coach rating a player submits all 5
// categories at once (see skillRatingInputSchema below), inserted together
// in a single multi-row statement so they share the exact same ratedAt and
// can be grouped back into one "evaluation" by that timestamp without a
// separate grouping id.
export const skillRatings = pgTable("skill_ratings", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // shooting | dribbling | defense | passing | conditioning
  rating: integer("rating").notNull(), // 1-10
  ratedAt: timestamp("rated_at").defaultNow(),
});

// A reusable physical-test template ("Sprint 3x court", measured in seconds)
// — scoped by accountId like exercises, so a coach defines it once and runs
// it with any of their teams. lowerIsBetter distinguishes timed tests (lower
// is the better result) from rep/distance tests (higher is better), so the
// UI can rank and trend results correctly without guessing from the unit.
export const physicalTests = pgTable("physical_tests", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  unit: text("unit").notNull(), // free text, e.g. "seconds", "reps", "meters"
  lowerIsBetter: integer("lower_is_better").notNull().default(0), // 1 for timed tests, 0 for reps/distance
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// One player's result on one occasion a test was run — recorded in bulk
// (the whole active roster at once, see POST /api/physical-tests/:id/results)
// rather than one at a time like skill ratings, since a coach typically runs
// a fitness test as a single team-wide session.
export const physicalTestResults = pgTable("physical_test_results", {
  id: serial("id").primaryKey(),
  testId: integer("test_id").notNull().references(() => physicalTests.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  value: real("value").notNull(),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const playerNotes = pgTable("player_notes", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// A player can have several injuries over a season; each stays in this
// history table forever (even once recovered) so the profile shows a real
// record, not just the current state.
export const playerInjuries = pgTable("player_injuries", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  status: text("status").notNull().default("active"), // 'active' | 'recovered'
  reportedDate: text("reported_date").notNull(),
  recoveredDate: text("recovered_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// One row per shot/rep logged during practice (e.g. one free throw), not
// an aggregate — so a quick tap during a drill just inserts a row, and
// season totals are a simple count/sum over this table instead of needing
// careful increment/decrement logic to support undo.
export const drillAttempts = pgTable("drill_attempts", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  drillName: text("drill_name").notNull(),
  date: text("date").notNull(),
  made: integer("made").notNull(), // 1 = made, 0 = missed
  // Percent-of-court-width/height (0-100, same convention as a play's Token
  // x/y — see PlayEditor's toSVGPoint), null when the shot's location
  // wasn't recorded (the fast team-wide tracker doesn't ask for one).
  x: real("x"),
  y: real("y"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  opponent: text("opponent").notNull(),
  date: text("date").notNull(),
  location: text("location"), // 'home' | 'away'
  teamScore: integer("team_score"),
  opponentScore: integer("opponent_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const gameStats = pgTable("game_stats", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  points: integer("points").default(0),
  rebounds: integer("rebounds").default(0),
  assists: integer("assists").default(0),
  steals: integer("steals").default(0),
  blocks: integer("blocks").default(0),
  turnovers: integer("turnovers").default(0),
  fouls: integer("fouls").default(0),
});

export const PLAY_CATEGORIES = ["offense", "defense", "inbound", "special"] as const;
export const COURT_TYPES = ["full", "half"] as const;
// A finer-grained tag than category — "what situation does this play answer"
// rather than "what kind of play is it". Optional: a play with no specific
// situation is just a general set play.
export const PLAY_SITUATIONS = [
  "out_of_bounds_baseline",
  "out_of_bounds_sideline",
  "last_shot",
  "press_break",
  "vs_zone",
  "vs_man",
  "fast_break",
  "after_timeout",
] as const;
export const TOKEN_TYPES = ["offense", "defense", "ball", "cone"] as const;
export const DRAWING_TOOLS = ["move", "pass", "dribble", "screen", "text"] as const;

// Each step is a full board snapshot (every token's position, plus the
// drawings — arrows/annotations — for that step's transition). Animating a
// play tweens token x/y between consecutive steps, following a matching
// drawing's curve when one exists (see client/src/lib/playAnimation.ts)
// instead of a straight line, and shows that step's drawings.
export const tokenSchema = z.object({
  id: z.string(),
  type: z.enum(TOKEN_TYPES),
  label: z.string().max(4),
  x: z.number().min(0).max(100), // percent of court width, so it scales with any container size
  y: z.number().min(0).max(100),
});

export const drawingSchema = z.object({
  id: z.string(),
  tool: z.enum(DRAWING_TOOLS),
  // A dragged arrow/line is recorded as a multi-point curve (see
  // client/src/lib/playDrawing.ts's smoothPath), not just its two
  // endpoints — capped well above what the editor's own resampling ever
  // produces, just as a payload-size backstop.
  points: z.array(z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })).min(1).max(40),
  text: z.string().max(60).optional(),
  color: z.string().max(20).optional(),
});

export type Token = z.infer<typeof tokenSchema>;
export type Drawing = z.infer<typeof drawingSchema>;

export const plays = pgTable("plays", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(), // offense | defense | inbound | special
  courtType: text("court_type").notNull().default("half"), // full | half
  situation: text("situation"), // one of PLAY_SITUATIONS, or null for a general play
  notes: text("notes"),
  // 1 for favorited, 0 otherwise — same convention as exercises.isFavorite.
  // Toggled through its own ungated endpoint, since starring an existing
  // play isn't "creating" a new one against the plan's play limit.
  isFavorite: integer("is_favorite").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const playSteps = pgTable("play_steps", {
  id: serial("id").primaryKey(),
  playId: integer("play_id").notNull().references(() => plays.id, { onDelete: "cascade" }),
  stepIndex: integer("step_index").notNull(),
  tokens: json("tokens").notNull().$type<Token[]>(),
  drawings: json("drawings").notNull().$type<Drawing[]>(),
});

export const EXERCISE_CATEGORIES = [
  "shooting",
  "dribbling",
  "defense",
  "passing",
  "conditioning",
] as const;

// Reuses the exercise library's own categories as the skill axes, so a
// player's development profile lines up with what practices actually train.
export const SKILL_CATEGORIES = EXERCISE_CATEGORIES;

export const skillRatingInputSchema = z.object({
  shooting: z.number().int().min(1).max(10),
  dribbling: z.number().int().min(1).max(10),
  defense: z.number().int().min(1).max(10),
  passing: z.number().int().min(1).max(10),
  conditioning: z.number().int().min(1).max(10),
});
export type SkillRatingInput = z.infer<typeof skillRatingInputSchema>;

export const createPlayerNoteSchema = z.object({
  content: z.string().min(1, "Note can't be empty").max(2000),
});
export type CreatePlayerNote = z.infer<typeof createPlayerNoteSchema>;

export const createPlayerInjurySchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  reportedDate: z.string().min(1, "Date is required"),
  notes: z.string().max(2000).optional().nullable(),
});
export type CreatePlayerInjury = z.infer<typeof createPlayerInjurySchema>;

export const recoverInjurySchema = z.object({
  recoveredDate: z.string().min(1, "Date is required"),
});

export const logDrillAttemptSchema = z.object({
  drillName: z.string().min(1, "Drill name is required").max(100),
  date: z.string().min(1, "Date is required"),
  made: z.union([z.literal(0), z.literal(1)]),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
});
export type LogDrillAttempt = z.infer<typeof logDrillAttemptSchema>;

export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;

export const GAME_LOCATIONS = ["home", "away"] as const;

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  createdAt: true,
  passwordHash: true,
  plan: true,
}).extend({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Missing reset token"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const inviteCoachSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  accountId: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Team name is required"),
  defaultSessionDuration: z.number().int().min(1, "Duration must be at least 1 minute").nullish(),
  logoUrl: z.string().max(2000).nullish(),
  themeColor: z.enum(TEAM_THEME_COLORS).nullish(),
});

// These `.extend()` calls are the single source of truth for validation on
// both sides of the wire: the server parses requests with these same
// schemas (server/routes.ts), so a stricter rule here closes gaps that a
// client-only check can't (a direct API call bypassing the UI, for example).
export const insertExerciseSchema = createInsertSchema(exercises).omit({
  id: true,
  accountId: true,
}).extend({
  name: z.string().min(1, "Exercise name is required"),
  description: z.string().min(1, "Description is required"),
  category: z.enum(EXERCISE_CATEGORIES),
  duration: z.number().int().min(1, "Duration must be at least 1 minute"),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  minPlayers: z.number().int().min(1, "Must be at least 1 player").nullish(),
});

export const insertPhysicalTestSchema = createInsertSchema(physicalTests).omit({
  id: true,
  accountId: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Test name is required"),
  unit: z.string().min(1, "Unit is required").max(20, "Unit is too long"),
  lowerIsBetter: z.union([z.literal(0), z.literal(1)]),
  description: z.string().max(500).nullable().optional(),
});

// What a coach submits after running one test with the whole active roster
// in one sitting — a single date plus one value per player, inserted as a
// batch instead of one request per player.
export const recordPhysicalTestResultsSchema = z.object({
  date: z.string().min(1, "Date is required"),
  results: z.array(z.object({
    playerId: z.number().int(),
    value: z.number(),
  })).min(1, "At least one result is required"),
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessions).omit({
  id: true,
  teamId: true,
}).extend({
  name: z.string().min(1, "Session name is required"),
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  duration: z.number().int().min(1, "Duration must be at least 1 minute"),
});

export const insertSessionTemplateSchema = createInsertSchema(sessionTemplates).omit({
  id: true,
  teamId: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Template name is required"),
  duration: z.number().int().min(1, "Duration must be at least 1 minute"),
});

export const insertRecurringPracticeSlotSchema = createInsertSchema(recurringPracticeSlots).omit({
  id: true,
  teamId: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Slot name is required"),
  dayOfWeek: z.number().int().min(0).max(6),
  time: z.string().min(1, "Time is required"),
  duration: z.number().int().min(1, "Duration must be at least 1 minute"),
});

// What a coach submits to turn saved slots into real calendar sessions:
// a starting Monday and how many weeks out to materialize them for.
export const generateSessionsFromSlotsSchema = z.object({
  startDate: z.string().min(1, "Start date is required"),
  weeks: z.number().int().min(1).max(52),
});
export type GenerateSessionsFromSlots = z.infer<typeof generateSessionsFromSlotsSchema>;

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  teamId: true,
}).extend({
  name: z.string().min(1, "Player name is required"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").nullish(),
  height: z.number().int().min(50, "Enter a height in centimeters").max(260, "Enter a height in centimeters").nullish(),
  jerseyNumber: z.number().int().min(0, "Enter a jersey number").max(99, "Enter a jersey number").nullish(),
  dominantHand: z.enum(["left", "right"]).nullish(),
  emergencyContactName: z.string().max(100, "Name is too long").nullish(),
  emergencyContactPhone: z.string().max(30, "Phone number is too long").nullish(),
  medicalNotes: z.string().max(1000, "Notes are too long").nullish(),
});

export const insertAttendanceSchema = createInsertSchema(attendance).omit({
  id: true,
  markedAt: true,
}).extend({
  status: z.enum(ATTENDANCE_STATUSES),
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  teamId: true,
  createdAt: true,
}).extend({
  opponent: z.string().min(1, "Opponent is required"),
  date: z.string().min(1, "Date is required"),
  location: z.enum(GAME_LOCATIONS).nullable().optional(),
  teamScore: z.number().int().min(0).nullable().optional(),
  opponentScore: z.number().int().min(0).nullable().optional(),
});

const gameStatLineSchema = z.object({
  playerId: z.number().int(),
  points: z.number().int().min(0).default(0),
  rebounds: z.number().int().min(0).default(0),
  assists: z.number().int().min(0).default(0),
  steals: z.number().int().min(0).default(0),
  blocks: z.number().int().min(0).default(0),
  turnovers: z.number().int().min(0).default(0),
  fouls: z.number().int().min(0).default(0),
});

// What the client actually posts to create a game: the game itself plus the
// full box score in one shot, so the write is one atomic transaction instead
// of a game create followed by N stat-line creates the client has to sequence.
export const createGameWithStatsSchema = insertGameSchema.extend({
  stats: z.array(gameStatLineSchema).default([]),
});

export const playStepDataSchema = z.object({
  tokens: z.array(tokenSchema).max(30),
  drawings: z.array(drawingSchema).max(60),
});
export type PlayStepData = z.infer<typeof playStepDataSchema>;

// Same one-shot-transaction shape as createGameWithStatsSchema: the play's
// metadata plus every step, saved (or fully replaced, on edit) together.
export const createPlaySchema = z.object({
  name: z.string().min(1, "Play name is required"),
  category: z.enum(PLAY_CATEGORIES),
  courtType: z.enum(COURT_TYPES),
  situation: z.enum(PLAY_SITUATIONS).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  steps: z.array(playStepDataSchema).min(1, "A play needs at least one step"),
});
export type CreatePlay = z.infer<typeof createPlaySchema>;

// Same one-shot shape as createPlaySchema's courtType+steps, but standalone
// (no name/category/etc.) since an exercise's diagram is edited separately
// from its normal create/edit form.
export const saveExerciseDiagramSchema = z.object({
  courtType: z.enum(COURT_TYPES),
  steps: z.array(playStepDataSchema).min(1, "A diagram needs at least one step"),
});
export type SaveExerciseDiagram = z.infer<typeof saveExerciseDiagramSchema>;

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;

export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

export type AccountInvite = typeof accountInvites.$inferSelect;
export type AccountMembership = typeof accountMemberships.$inferSelect;
export type InviteCoach = z.infer<typeof inviteCoachSchema>;

// A membership row plus the member's own email, for the "manage coaches"
// list — the membership table itself only stores the account id.
export interface CoachMember {
  memberAccountId: number;
  email: string;
  createdAt: string | null;
}

export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercises.$inferSelect;
export type ExerciseStep = typeof exerciseSteps.$inferSelect;

export type InsertPhysicalTest = z.infer<typeof insertPhysicalTestSchema>;
export type PhysicalTest = typeof physicalTests.$inferSelect;
export type PhysicalTestResult = typeof physicalTestResults.$inferSelect;
export type RecordPhysicalTestResults = z.infer<typeof recordPhysicalTestResultsSchema>;

// The shape of POST /api/physical-tests/:id/results — newRecordPlayerIds is
// every player whose submitted value beat their own prior best on this test
// (direction-aware; a player with no prior result isn't included).
export interface RecordPhysicalTestResultsResponse {
  results: PhysicalTestResult[];
  newRecordPlayerIds: number[];
}

// One player's full history for one test template, newest-first — the
// shape returned by GET /api/players/:id/physical-test-results.
export interface PlayerPhysicalTestHistory {
  testId: number;
  testName: string;
  unit: string;
  lowerIsBetter: boolean;
  results: { value: number; date: string }[];
}

export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessions.$inferSelect;

export type InsertSessionTemplate = z.infer<typeof insertSessionTemplateSchema>;
export type SessionTemplate = typeof sessionTemplates.$inferSelect;

export type InsertRecurringPracticeSlot = z.infer<typeof insertRecurringPracticeSlotSchema>;
export type RecurringPracticeSlot = typeof recurringPracticeSlots.$inferSelect;

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

export type SkillRating = typeof skillRatings.$inferSelect;
export type PlayerNote = typeof playerNotes.$inferSelect;
export type PlayerInjury = typeof playerInjuries.$inferSelect;
export type DrillAttempt = typeof drillAttempts.$inferSelect;

// A player's development profile: current standing (latest rating per
// category, null until the coach rates them at least once), every past
// evaluation for the trend view, and the coach's running notes.
export interface PlayerDevelopment {
  current: Record<string, number> | null;
  history: { category: string; rating: number; ratedAt: string }[];
  notes: PlayerNote[];
}

export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;

export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

export type GameStat = typeof gameStats.$inferSelect;
export type CreateGameWithStats = z.infer<typeof createGameWithStatsSchema>;

export type Play = typeof plays.$inferSelect;
export type PlayStep = typeof playSteps.$inferSelect;

// How often a play has come up in a training session — tallied from
// trainingSessions.playIds (see getPlayPracticeStats), not a table of its
// own, same as PlayerGameStatsSummary below.
export interface PlayPracticeStats {
  playId: number;
  timesPracticed: number;
  lastPracticedDate: string | null;
}

// Season totals for one player, aggregated across every game they have a
// stat line in — computed in Postgres (see getPlayerGameStatsSummary), not
// a table of its own.
export interface PlayerGameStatsSummary {
  playerId: number;
  gamesPlayed: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
}

// The read-only payload served by the public player/parent portal
// (GET /api/portal/:token) — deliberately narrow: only what a parent needs
// to see about their own player, never the coach's account/team internals.
export interface PortalData {
  player: { id: number; name: string; position: string | null };
  team: { name: string };
  upcomingSessions: {
    id: number;
    name: string;
    date: string;
    time: string;
    duration: number;
    status: string | null;
  }[];
  upcomingGames: { id: number; opponent: string; date: string; location: string | null }[];
  attendance: { sessionId: number; sessionName: string; date: string; status: string }[];
  stats: PlayerGameStatsSummary | null;
}
