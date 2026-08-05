// Pure geometry helpers for rendering a Drawing (an arrow/line/annotation on
// a play step) as an SVG path. Coordinates are all in the court's 0-100
// percent space, same as tokens.

export function straightPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

// A dribble is conventionally drawn as a wavy line along the path of travel.
export function wavyPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len; // unit perpendicular to the line
  const py = dx / len;
  const waves = Math.max(3, Math.round(len / 6));
  const amplitude = 1.6;

  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= waves; i++) {
    const t = i / waves;
    const midT = t - 0.5 / waves;
    const sign = i % 2 === 0 ? -1 : 1;
    const mx = x1 + dx * midT + px * amplitude * sign;
    const my = y1 + dy * midT + py * amplitude * sign;
    const ex = x1 + dx * t;
    const ey = y1 + dy * t;
    d += ` Q ${mx} ${my} ${ex} ${ey}`;
  }
  return d;
}

// The short perpendicular cap at the end of a "screen" line — the standard
// basketball-diagram symbol for a screen (a line ending in a "T").
export function screenCap(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const capLen = 2.5;
  return {
    x1: x2 - px * capLen,
    y1: y2 - py * capLen,
    x2: x2 + px * capLen,
    y2: y2 + py * capLen,
  };
}

export const DRAWING_COLORS = ["#1f2937", "#ea580c", "#2563eb", "#dc2626"] as const;
