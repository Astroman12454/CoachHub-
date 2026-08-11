import { pointAtProgress } from "./playDrawing";
import type { Token, Drawing } from "@shared/schema";

// How close (in the court's 0-100 percent space) a drawing's start/end has
// to be to a token's before/after position to count as "this is the arrow
// for that token's move" — generous, since a coach drawing an arrow and then
// dragging the token to match it won't land pixel-perfect.
const MATCH_RADIUS = 6;

function findPathForToken(from: Token, to: Token, drawings: Drawing[]): Drawing | undefined {
  return drawings.find((d) => {
    if (d.tool === "text" || d.points.length < 2) return false;
    const start = d.points[0];
    const end = d.points[d.points.length - 1];
    const startsAtToken = Math.hypot(start.x - from.x, start.y - from.y) < MATCH_RADIUS;
    const endsAtDestination = Math.hypot(end.x - to.x, end.y - to.y) < MATCH_RADIUS;
    return startsAtToken && endsAtDestination;
  });
}

// Computes every token's position at a point in the transition between two
// steps (0 = fully at `from`, 1 = fully at `to`). A token follows a matching
// drawn arrow's curve when the coach drew one from its start position to its
// destination; otherwise it straight-lines between the two, same as before
// this existed. Shared by every surface that animates a play/exercise
// (PlayEditor, ExerciseDiagramEditor, DiagramPlayback) so the matching logic
// can't drift between them.
export function tokensAtProgress(
  from: { tokens: Token[]; drawings: Drawing[] },
  to: { tokens: Token[] },
  progress: number,
): Token[] {
  const fromMap = new Map(from.tokens.map((t) => [t.id, t]));
  const toMap = new Map(to.tokens.map((t) => [t.id, t]));
  const allIds = Array.from(new Set([...Array.from(fromMap.keys()), ...Array.from(toMap.keys())]));

  return allIds.map((id) => {
    const a = fromMap.get(id);
    const b = toMap.get(id);
    if (a && b) {
      const path = findPathForToken(a, b, from.drawings);
      if (path) {
        const pos = pointAtProgress(path.points, progress);
        return { ...b, x: pos.x, y: pos.y };
      }
      return { ...b, x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
    }
    return (b ?? a)!;
  });
}
