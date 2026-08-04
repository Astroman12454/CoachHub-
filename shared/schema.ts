import { pgTable, text, serial, integer, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const PLANS = ["free", "paid"] as const;

// Free plan: 1 team, up to 15 players, read-only exercise library.
// Paid plan: unlimited teams/players, can create/edit exercises, full history.
export const FREE_PLAN_PLAYER_LIMIT = 15;
export const FREE_PLAN_TEAM_LIMIT = 1;

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  plan: text("plan").notNull().default("free"), // 'free' | 'paid'
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

export const EXERCISE_CATEGORIES = [
  "shooting",
  "dribbling",
  "defense",
  "passing",
  "conditioning",
] as const;

export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;

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
