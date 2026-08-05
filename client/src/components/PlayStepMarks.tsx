import { straightPath, wavyPath, screenCap, DRAWING_COLORS } from "@/lib/playDrawing";
import type { Token, Drawing } from "@shared/schema";

const TOKEN_RADIUS = 3.2;

interface PlayStepMarksProps {
  tokens: Token[];
  drawings: Drawing[];
  // Tokens/drawings store y as percent-of-height (0-100), but the SVG
  // viewBox height varies by court type (94 half / 188 full) — see
  // PlayEditor's own toViewBoxY for why this is a function, not a constant.
  toViewBoxY: (percentY: number) => number;
}

// The read-only "ink" of one play step (drawings + tokens) — shared between
// PlayEditor's live interactive canvas and PlayDiagram's static render (used
// for PDF export), so the two can never visually drift apart. Callers own
// the enclosing <svg> (PlayEditor's needs pointer handlers, PlayDiagram's
// doesn't) and the <defs> arrowhead marker, since both need it.
export default function PlayStepMarks({ tokens, drawings, toViewBoxY }: PlayStepMarksProps) {
  return (
    <>
      {drawings.map((d) => {
        const [rp1, rp2] = d.points;
        const p1 = { x: rp1.x, y: toViewBoxY(rp1.y) };
        const p2 = rp2 ? { x: rp2.x, y: toViewBoxY(rp2.y) } : undefined;
        const stroke = d.color ?? DRAWING_COLORS[0];
        if (d.tool === "text") {
          return (
            <text key={d.id} x={p1.x} y={p1.y} fontSize="4" fill={stroke} className="select-none">
              {d.text}
            </text>
          );
        }
        if (!p2) return null;
        if (d.tool === "screen") {
          const cap = screenCap(p1.x, p1.y, p2.x, p2.y);
          return (
            <g key={d.id} stroke={stroke} strokeWidth="0.7" fill="none">
              <path d={straightPath(p1.x, p1.y, p2.x, p2.y)} />
              <line x1={cap.x1} y1={cap.y1} x2={cap.x2} y2={cap.y2} />
            </g>
          );
        }
        const d_ = d.tool === "dribble" ? wavyPath(p1.x, p1.y, p2.x, p2.y) : straightPath(p1.x, p1.y, p2.x, p2.y);
        return (
          <path
            key={d.id}
            d={d_}
            stroke={stroke}
            strokeWidth="0.7"
            fill="none"
            strokeDasharray={d.tool === "pass" ? "2.5,2" : undefined}
            markerEnd="url(#play-arrowhead)"
          />
        );
      })}

      {tokens.map((t) => (
        <g key={t.id} transform={`translate(${t.x}, ${toViewBoxY(t.y)})`}>
          {t.type === "ball" ? (
            <circle r={TOKEN_RADIUS * 0.6} fill="#fff" stroke="#000" strokeWidth="0.4" />
          ) : (
            <>
              {/* Fixed black/white scheme (not theme colors) so tokens read
                  clearly against the court's fixed orange background
                  regardless of app theme. */}
              <circle
                r={TOKEN_RADIUS}
                fill={t.type === "offense" ? "#000" : "#fff"}
                stroke="#000"
                strokeWidth="0.5"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="3.2"
                fontWeight="700"
                fill={t.type === "offense" ? "#fff" : "#000"}
                className="select-none"
              >
                {t.label}
              </text>
            </>
          )}
        </g>
      ))}
    </>
  );
}
