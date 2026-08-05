import { pgTable, text, serial, integer, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const PLANS = ["free", "paid"] as const;

// Free plan: 1 team, up to 15 players, read-only exercise library, up to 3
// saved plays. Paid plan: unlimited teams/players/plays, can create/edit
// exercises, full history.
export const FREE_PLAN_PLAYER_LIMIT = 15;
export const FREE_PLAN_TEAM_LIMIT = 1;
export const FREE_PLAN_PLAY_LIMIT = 3;

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  plan: text("plan").notNull().default("free"), // 'free' | 'paid'
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

export const trainingSessions = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  duration: integer("duration").notNull(), // in minutes
  exerciseIds: text("exercise_ids").array().default([]), // array of exercise IDs
  notes: text("notes"),
  attendanceCount: integer("attendance_count").default(0),
  totalPlayers: integer("total_players").default(18),
  status: text("status").default("scheduled"), // scheduled, in_progress, completed, cancelled
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
  isActive: integer("is_active").default(1), // 1 for active, 0 for inactive
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
export const TOKEN_TYPES = ["offense", "defense", "ball"] as const;
export const DRAWING_TOOLS = ["move", "pass", "dribble", "screen", "text"] as const;

// Each step is a full board snapshot (every token's position, plus the
// drawings — arrows/annotations — for that step's transition). Animating a
// play just tweens token x/y between consecutive steps and shows that
// step's drawings; nothing more clever than that.
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
  points: z.array(z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })).min(1),
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

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  accountId: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Team name is required"),
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

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  teamId: true,
}).extend({
  name: z.string().min(1, "Player name is required"),
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
  steps: z.array(playStepDataSchema).min(1, "A play needs at least one step"),
});
export type CreatePlay = z.infer<typeof createPlaySchema>;

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;

export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercises.$inferSelect;

export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessions.$inferSelect;

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;

export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

export type GameStat = typeof gameStats.$inferSelect;
export type CreateGameWithStats = z.infer<typeof createGameWithStatsSchema>;

export type Play = typeof plays.$inferSelect;
export type PlayStep = typeof playSteps.$inferSelect;

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
