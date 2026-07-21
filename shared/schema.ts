import { pgTable, text, serial, integer, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
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
  name: text("name").notNull(),
  position: text("position"),
  isActive: integer("is_active").default(1), // 1 for active, 0 for inactive
});

export const insertExerciseSchema = createInsertSchema(exercises).omit({
  id: true,
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessions).omit({
  id: true,
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
});

export const insertAttendanceSchema = createInsertSchema(attendance).omit({
  id: true,
  markedAt: true,
});

export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercises.$inferSelect;

export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessions.$inferSelect;

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;
