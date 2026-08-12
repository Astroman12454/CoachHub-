// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { setupAuth, requireAuth } from "./auth";
import { registerRoutes } from "./routes";
import { DEFAULT_EXERCISES } from "./seed";
import { EXERCISE_CATEGORIES, DIFFICULTY_LEVELS } from "@shared/schema";

function uniqueEmail() {
  return `test-${randomUUID()}@example.com`;
}
const PASSWORD = "correct-password-123";

describe("DEFAULT_EXERCISES (seed library content)", () => {
  it("has 28 exercises in each category (140 total)", () => {
    expect(DEFAULT_EXERCISES).toHaveLength(140);
    const byCategory = new Map<string, number>();
    for (const ex of DEFAULT_EXERCISES) {
      byCategory.set(ex.category, (byCategory.get(ex.category) ?? 0) + 1);
    }
    for (const category of EXERCISE_CATEGORIES) {
      expect(byCategory.get(category)).toBe(28);
    }
  });

  it("has no duplicate names", () => {
    const names = DEFAULT_EXERCISES.map((ex) => ex.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every exercise has a valid category and difficulty", () => {
    for (const ex of DEFAULT_EXERCISES) {
      expect(EXERCISE_CATEGORIES).toContain(ex.category);
      expect(DIFFICULTY_LEVELS).toContain(ex.difficulty);
    }
  });

  it("every exercise has non-empty name/description/instructions in both languages, and a positive duration", () => {
    for (const ex of DEFAULT_EXERCISES) {
      expect(ex.name.length, `${ex.name}: empty name`).toBeGreaterThan(0);
      expect(ex.description.length, `${ex.name}: empty description`).toBeGreaterThan(0);
      expect(ex.instructions?.length ?? 0, `${ex.name}: empty instructions`).toBeGreaterThan(0);
      expect(ex.nameEs?.length ?? 0, `${ex.name}: empty nameEs`).toBeGreaterThan(0);
      expect(ex.descriptionEs?.length ?? 0, `${ex.name}: empty descriptionEs`).toBeGreaterThan(0);
      expect(ex.instructionsEs?.length ?? 0, `${ex.name}: empty instructionsEs`).toBeGreaterThan(0);
      expect(ex.duration, `${ex.name}: non-positive duration`).toBeGreaterThan(0);
    }
  });
});

describe("seedDefaultExercises (signup integration)", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    setupAuth(app);
    app.use("/api", requireAuth);
    await registerRoutes(app);
  });

  it("gives a freshly signed-up account all 140 seed exercises, 28 per category", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    const signup = await agent.post("/api/signup").send({ email, password: PASSWORD });
    expect(signup.status).toBe(201);

    const res = await agent.get("/api/exercises");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(140);

    const byCategory = new Map<string, number>();
    for (const ex of res.body) {
      byCategory.set(ex.category, (byCategory.get(ex.category) ?? 0) + 1);
    }
    for (const category of EXERCISE_CATEGORIES) {
      expect(byCategory.get(category)).toBe(28);
    }
  });
});
