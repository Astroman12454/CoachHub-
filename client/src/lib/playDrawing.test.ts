import { describe, it, expect } from "vitest";
import { smoothPath, sampleCurve, pointAtProgress, resamplePoints, pathLength } from "./playDrawing";

const identityY = (y: number) => y;

describe("smoothPath", () => {
  it("degenerates to a straight line for exactly two points", () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 20 }], identityY);
    // The two synthesized Catmull-Rom control points land on the segment
    // itself, so every point on the curve should be collinear with the ends.
    const match = d.match(/C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)/);
    expect(match).not.toBeNull();
    const [cp1x, cp1y, cp2x, cp2y] = match!.slice(1).map(Number);
    // cross product of (end - start) and (controlPoint - start) is 0 for collinear points
    const cross1 = 10 * cp1y - 20 * cp1x;
    const cross2 = 10 * cp2y - 20 * cp2x;
    expect(cross1).toBeCloseTo(0, 5);
    expect(cross2).toBeCloseTo(0, 5);
  });

  it("returns an empty string for zero points", () => {
    expect(smoothPath([], identityY)).toBe("");
  });
});

describe("sampleCurve", () => {
  it("returns the input unchanged for fewer than two points", () => {
    expect(sampleCurve([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });

  it("starts and ends at the first/last input point", () => {
    const points = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
    const samples = sampleCurve(points, 5);
    expect(samples[0]).toEqual(points[0]);
    expect(samples[samples.length - 1]).toEqual(points[2]);
  });
});

describe("pointAtProgress", () => {
  const straight = [{ x: 0, y: 0 }, { x: 10, y: 0 }];

  it("returns the start point at progress 0", () => {
    const p = pointAtProgress(straight, 0);
    expect(p.x).toBeCloseTo(0, 1);
    expect(p.y).toBeCloseTo(0, 1);
  });

  it("returns the end point at progress 1", () => {
    const p = pointAtProgress(straight, 1);
    expect(p.x).toBeCloseTo(10, 1);
    expect(p.y).toBeCloseTo(0, 1);
  });

  it("is roughly the midpoint at progress 0.5 for a straight segment", () => {
    const p = pointAtProgress(straight, 0.5);
    expect(p.x).toBeCloseTo(5, 0);
  });

  it("clamps progress outside 0-1", () => {
    expect(pointAtProgress(straight, -1)).toEqual(pointAtProgress(straight, 0));
    expect(pointAtProgress(straight, 2)).toEqual(pointAtProgress(straight, 1));
  });
});

describe("resamplePoints", () => {
  it("leaves a point list at or under the cap untouched", () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(resamplePoints(points, 5)).toEqual(points);
  });

  it("caps a long point list at maxPoints while preserving the endpoints", () => {
    const points = Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0 }));
    const result = resamplePoints(points, 10);
    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[result.length - 1].x).toBeCloseTo(99, 0);
  });

  it("keeps the resampled path roughly the same length as the original", () => {
    const points = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    const result = resamplePoints(points, 10);
    expect(pathLength(result)).toBeCloseTo(pathLength(points), 0);
  });
});
