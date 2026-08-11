// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { setupAuth, requireAuth } from "./auth";
import { registerRoutes } from "./routes";

function uniqueEmail() {
  return `test-${randomUUID()}@example.com`;
}
const PASSWORD = "correct-password-123";

async function createTestApp() {
  const app = express();
  app.use(express.json());
  setupAuth(app);
  app.use("/api", requireAuth);
  await registerRoutes(app);
  return app;
}

async function signedInAgent(app: express.Express) {
  const email = uniqueEmail();
  const agent = request.agent(app);
  await agent.post("/api/signup").send({ email, password: PASSWORD });
  return agent;
}

// 2024-01-01 is a Monday (dayOfWeek 1), 2024-01-03 is a Wednesday (dayOfWeek 3).
function oneSlot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Team Practice",
    dayOfWeek: 1,
    time: "17:00",
    duration: 60,
    ...overrides,
  };
}

describe("recurring practice slots", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("creates a slot and returns it in the list", async () => {
    const agent = await signedInAgent(app);
    const created = await agent.post("/api/recurring-slots").send(oneSlot());
    expect(created.status).toBe(201);
    expect(created.body.name).toBe("Team Practice");
    expect(created.body.dayOfWeek).toBe(1);

    const list = await agent.get("/api/recurring-slots");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  it("rejects invalid slot data", async () => {
    const agent = await signedInAgent(app);
    const missingName = await agent.post("/api/recurring-slots").send(oneSlot({ name: "" }));
    expect(missingName.status).toBe(400);

    const badDay = await agent.post("/api/recurring-slots").send(oneSlot({ dayOfWeek: 7 }));
    expect(badDay.status).toBe(400);

    const badDuration = await agent.post("/api/recurring-slots").send(oneSlot({ duration: 0 }));
    expect(badDuration.status).toBe(400);
  });

  it("scopes the slot list to the requesting team", async () => {
    const teamA = await signedInAgent(app);
    await teamA.post("/api/recurring-slots").send(oneSlot());

    const teamB = await signedInAgent(app);
    const listForB = await teamB.get("/api/recurring-slots");
    expect(listForB.body).toEqual([]);
  });

  it("deletes a slot scoped to the requesting team", async () => {
    const owner = await signedInAgent(app);
    const created = await owner.post("/api/recurring-slots").send(oneSlot());

    const otherCoach = await signedInAgent(app);
    const deniedDelete = await otherCoach.delete(`/api/recurring-slots/${created.body.id}`);
    expect(deniedDelete.status).toBe(404);

    const ownDelete = await owner.delete(`/api/recurring-slots/${created.body.id}`);
    expect(ownDelete.status).toBe(204);

    const list = await owner.get("/api/recurring-slots");
    expect(list.body).toEqual([]);
  });

  it("materializes sessions on the matching weekday for every week in range", async () => {
    const agent = await signedInAgent(app);
    await agent.post("/api/recurring-slots").send(oneSlot({ dayOfWeek: 1, time: "17:00" }));
    await agent.post("/api/recurring-slots").send(oneSlot({ name: "Skills Work", dayOfWeek: 3, time: "18:30" }));

    const generated = await agent
      .post("/api/recurring-slots/generate")
      .send({ startDate: "2024-01-01", weeks: 2 });
    expect(generated.status).toBe(200);
    expect(generated.body.created).toBe(4);

    const list = await agent.get("/api/training-sessions?startDate=2024-01-01&endDate=2024-01-14");
    const dates = list.body.map((s: { date: string; time: string }) => `${s.date}|${s.time}`).sort();
    expect(dates).toEqual([
      "2024-01-01|17:00",
      "2024-01-03|18:30",
      "2024-01-08|17:00",
      "2024-01-10|18:30",
    ]);

    const names = list.body.map((s: { name: string }) => s.name).sort();
    expect(names).toEqual([
      "Skills Work — 03/01",
      "Skills Work — 10/01",
      "Team Practice — 01/01",
      "Team Practice — 08/01",
    ]);
  });

  it("does not duplicate sessions when generating over an already-generated range", async () => {
    const agent = await signedInAgent(app);
    await agent.post("/api/recurring-slots").send(oneSlot({ dayOfWeek: 1, time: "17:00" }));

    const first = await agent.post("/api/recurring-slots/generate").send({ startDate: "2024-02-05", weeks: 1 });
    expect(first.body.created).toBe(1);

    const second = await agent.post("/api/recurring-slots/generate").send({ startDate: "2024-02-05", weeks: 1 });
    expect(second.body.created).toBe(0);

    const list = await agent.get("/api/training-sessions?startDate=2024-02-05&endDate=2024-02-11");
    expect(list.body).toHaveLength(1);
  });

  it("rejects an invalid generate request", async () => {
    const agent = await signedInAgent(app);
    const badWeeks = await agent.post("/api/recurring-slots/generate").send({ startDate: "2024-01-01", weeks: 0 });
    expect(badWeeks.status).toBe(400);
  });
});
