import { describe, it, expect } from "vitest";
import { tokensAtProgress } from "./playAnimation";
import type { Token, Drawing } from "@shared/schema";

function token(overrides: Partial<Token> = {}): Token {
  return { id: "t1", type: "offense", label: "1", x: 0, y: 0, ...overrides };
}

describe("tokensAtProgress", () => {
  it("straight-lines a token when no drawing matches its move", () => {
    const from = { tokens: [token({ x: 0, y: 0 })], drawings: [] };
    const to = { tokens: [token({ x: 10, y: 0 })] };
    const result = tokensAtProgress(from, to, 0.5);
    expect(result[0].x).toBeCloseTo(5, 1);
    expect(result[0].y).toBeCloseTo(0, 1);
  });

  it("follows a matching drawing's curve instead of a straight line", () => {
    // A curved arrow that bows out to y=20 partway, from (0,0) to (10,0).
    const drawing: Drawing = {
      id: "d1",
      tool: "move",
      points: [{ x: 0, y: 0 }, { x: 5, y: 20 }, { x: 10, y: 0 }],
    };
    const from = { tokens: [token({ x: 0, y: 0 })], drawings: [drawing] };
    const to = { tokens: [token({ x: 10, y: 0 })] };
    const result = tokensAtProgress(from, to, 0.5);
    // A straight line would put y at ~0; following the curve should bow
    // well away from that toward the drawn midpoint.
    expect(result[0].y).toBeGreaterThan(5);
  });

  it("ignores a drawing that doesn't start or end near the token", () => {
    const drawing: Drawing = {
      id: "d1",
      tool: "move",
      points: [{ x: 50, y: 50 }, { x: 60, y: 60 }],
    };
    const from = { tokens: [token({ x: 0, y: 0 })], drawings: [drawing] };
    const to = { tokens: [token({ x: 10, y: 0 })] };
    const result = tokensAtProgress(from, to, 0.5);
    expect(result[0].x).toBeCloseTo(5, 1);
    expect(result[0].y).toBeCloseTo(0, 1);
  });

  it("ignores a text drawing even if its single point is near the token", () => {
    const drawing: Drawing = {
      id: "d1",
      tool: "text",
      points: [{ x: 0, y: 0 }],
      text: "go",
    };
    const from = { tokens: [token({ x: 0, y: 0 })], drawings: [drawing] };
    const to = { tokens: [token({ x: 10, y: 0 })] };
    const result = tokensAtProgress(from, to, 0.5);
    expect(result[0].x).toBeCloseTo(5, 1);
  });

  it("keeps a token that only exists in one of the two steps as-is", () => {
    const from = { tokens: [token({ id: "gone", x: 0, y: 0 })], drawings: [] };
    const to = { tokens: [token({ id: "new", x: 10, y: 10 })] };
    const result = tokensAtProgress(from, to, 0.5);
    const ids = result.map((t) => t.id).sort();
    expect(ids).toEqual(["gone", "new"]);
  });

  it("returns the destination position exactly at progress 1", () => {
    const from = { tokens: [token({ x: 0, y: 0 })], drawings: [] };
    const to = { tokens: [token({ x: 10, y: 30 })] };
    const result = tokensAtProgress(from, to, 1);
    expect(result[0].x).toBeCloseTo(10, 1);
    expect(result[0].y).toBeCloseTo(30, 1);
  });
});
