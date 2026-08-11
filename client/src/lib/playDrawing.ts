// Pure geometry helpers for rendering a Drawing (an arrow/line/annotation on
// a play step) as an SVG path, and for walking along it. Coordinates are all
// in the court's 0-100 percent space, same as tokens, unless noted.

export interface Point {
  x: number;
  y: number;
}

// Turns an ordered list of points traced by a drag gesture into a smooth SVG
// path via a Catmull-Rom-to-cubic-Bezier conversion (uniform parameterization,
// tension 1/6 — the standard construction). With exactly two points the two
// synthesized control points land exactly on the segment between them, so
// this degenerates to a straight line — a drop-in replacement for what used
// to be a dedicated two-point-only path, and backward compatible with
// drawings saved before multi-point curves existed.
export function smoothPath(points: Point[], toViewBoxY: (y: number) => number): string {
  const pts = points.map((p) => ({ x: p.x, y: toViewBoxY(p.y) }));
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  };
}

// Densely samples the exact same curve smoothPath() draws, in whatever
// coordinate space the input points are in — used by anything that needs to
// walk along the curve rather than just render it (the dribble's wave
// pattern, the screen tool's end cap, and pointAtProgress below).
export function sampleCurve(points: Point[], samplesPerSegment = 10): Point[] {
  if (points.length < 2) return points.slice();
  const result: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    for (let s = 0; s < samplesPerSegment; s++) {
      result.push(cubicPoint(p1, cp1, cp2, p2, s / samplesPerSegment));
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

// Walks a fraction (0-1) of the way along the smooth curve through `points`,
// by arc length rather than by control-point index — lets a token's
// animation follow a coach's drawn arrow instead of straight-lining between
// its endpoints. See client/src/lib/playAnimation.ts for where this plugs in.
export function pointAtProgress(points: Point[], progress: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const samples = sampleCurve(points, 12);
  const cumulative: number[] = [0];
  for (let i = 1; i < samples.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
  }
  const total = cumulative[cumulative.length - 1];
  const target = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 1; i < samples.length; i++) {
    if (cumulative[i] >= target) {
      const segLen = cumulative[i] - cumulative[i - 1];
      const segT = segLen === 0 ? 0 : (target - cumulative[i - 1]) / segLen;
      return {
        x: samples[i - 1].x + (samples[i].x - samples[i - 1].x) * segT,
        y: samples[i - 1].y + (samples[i].y - samples[i - 1].y) * segT,
      };
    }
  }
  return samples[samples.length - 1];
}

// Resamples a raw, densely-recorded drag gesture down to at most maxPoints,
// evenly spaced by arc length — keeps the traced shape while bounding how
// many points get persisted (drawingSchema caps points per drawing).
export function resamplePoints(points: Point[], maxPoints: number): Point[] {
  if (points.length <= maxPoints) return points;
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = cumulative[cumulative.length - 1];
  const result: Point[] = [];
  for (let k = 0; k < maxPoints; k++) {
    const target = (k / (maxPoints - 1)) * total;
    let idx = 0;
    while (idx < cumulative.length - 2 && cumulative[idx + 1] < target) idx++;
    const segLen = cumulative[idx + 1] - cumulative[idx];
    const segT = segLen === 0 ? 0 : (target - cumulative[idx]) / segLen;
    result.push({
      x: points[idx].x + (points[idx + 1].x - points[idx].x) * segT,
      y: points[idx].y + (points[idx + 1].y - points[idx].y) * segT,
    });
  }
  return result;
}

// A dribble is conventionally drawn as a wavy line along the path of travel
// — the wave rides the same smooth curve smoothPath() renders, rather than
// assuming a single straight segment.
export function wavyPath(points: Point[], toViewBoxY: (y: number) => number): string {
  const pts = points.map((p) => ({ x: p.x, y: toViewBoxY(p.y) }));
  const samples = sampleCurve(pts, 10);
  if (samples.length < 2) return "";
  const amplitude = 1.6;
  const waveLength = 6;
  let cumulative = 0;
  const wavy: Point[] = [samples[0]];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    cumulative += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = Math.sin((cumulative / waveLength) * Math.PI * 2) * amplitude;
    wavy.push({ x: cur.x + nx * offset, y: cur.y + ny * offset });
  }
  let d = `M ${wavy[0].x} ${wavy[0].y}`;
  for (let i = 1; i < wavy.length; i++) d += ` L ${wavy[i].x} ${wavy[i].y}`;
  return d;
}

// The short perpendicular cap at the end of a "screen" line — the standard
// basketball-diagram symbol for a screen (a line ending in a "T") —
// oriented along the curve's final tangent rather than assuming a straight
// segment.
export function screenCap(points: Point[], toViewBoxY: (y: number) => number) {
  const pts = points.map((p) => ({ x: p.x, y: toViewBoxY(p.y) }));
  const samples = sampleCurve(pts, 10);
  const p2 = samples[samples.length - 1];
  const p1 = samples[samples.length - 2] ?? p2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const capLen = 2.5;
  return {
    x1: p2.x - px * capLen,
    y1: p2.y - py * capLen,
    x2: p2.x + px * capLen,
    y2: p2.y + py * capLen,
  };
}

// Orange is deliberately excluded — the court itself is now a fixed orange
// background (see BasketballCourt), so an orange drawing would vanish on it.
export const DRAWING_COLORS = ["#000000", "#ffffff", "#2563eb", "#dc2626"] as const;
