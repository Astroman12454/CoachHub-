import { smoothPath, wavyPath, screenCap, DRAWING_COLORS } from "@/lib/playDrawing";
import type { Token, Drawing } from "@shared/schema";

const TOKEN_RADIUS = 3.4;

interface PlayStepMarksProps {
  tokens: Token[];
  drawings: Drawing[];
  // Tokens/drawings store y as percent-of-height (0-100), but the SVG
  // viewBox height varies by court type (94 half / 188 full) — see
  // PlayEditor's own toViewBoxY for why this is a function, not a constant.
  toViewBoxY: (percentY: number) => number;
}

// A traffic-cone marker — a fixed point on the floor (a cutting line, a
// spacing spot) rather than a player. Yellow rather than the ball/token's
// black-and-white scheme so it doesn't read as a player, and distinct
// enough from the court's dark orange background to stay visible on it.
function ConeMark() {
  const r = TOKEN_RADIUS;
  return (
    <g>
      <polygon
        points={`0,${-r * 1.05} ${r * 0.72},${r * 0.85} ${-r * 0.72},${r * 0.85}`}
        fill="#eab308"
        stroke="#422006"
        strokeWidth="0.4"
        strokeLinejoin="round"
      />
      <rect x={-r * 0.42} y={-r * 0.05} width={r * 0.84} height={r * 0.32} fill="#422006" opacity="0.85" />
      <rect x={-r * 0.9} y={r * 0.62} width={r * 1.8} height={r * 0.34} rx={r * 0.1} fill="#422006" />
    </g>
  );
}

// The read-only "ink" of one play step (drawings + tokens) — shared between
// the interactive editors' live canvas and the static/read-only renders
// (PDF export, the public diagram viewer), so they can never visually drift
// apart. Callers own the enclosing <svg> (the editors' needs pointer
// handlers, the static ones don't) but not its <defs> — the arrowhead
// marker and token drop-shadow are declared here, once, so every caller
// automatically gets a working, matching id instead of having to redeclare
// (and risk mistyping) it themselves.
export default function PlayStepMarks({ tokens, drawings, toViewBoxY }: PlayStepMarksProps) {
  return (
    <>
      <defs>
        <marker id="play-arrowhead" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke" />
        </marker>
        <filter id="token-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0.3" stdDeviation="0.35" floodOpacity="0.45" />
        </filter>
      </defs>

      {drawings.map((d) => {
        const stroke = d.color ?? DRAWING_COLORS[0];
        if (d.tool === "text") {
          const p0 = d.points[0];
          return (
            <text key={d.id} x={p0.x} y={toViewBoxY(p0.y)} fontSize="4" fill={stroke} className="select-none">
              {d.text}
            </text>
          );
        }
        if (d.points.length < 2) return null;
        if (d.tool === "screen") {
          const cap = screenCap(d.points, toViewBoxY);
          return (
            <g key={d.id} stroke={stroke} strokeWidth="0.7" strokeLinecap="round" fill="none">
              <path d={smoothPath(d.points, toViewBoxY)} />
              <line x1={cap.x1} y1={cap.y1} x2={cap.x2} y2={cap.y2} />
            </g>
          );
        }
        const pathD = d.tool === "dribble" ? wavyPath(d.points, toViewBoxY) : smoothPath(d.points, toViewBoxY);
        return (
          <path
            key={d.id}
            d={pathD}
            stroke={stroke}
            strokeWidth="0.7"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={d.tool === "pass" ? "2.5,2" : undefined}
            markerEnd="url(#play-arrowhead)"
          />
        );
      })}

      {tokens.map((t) => (
        <g key={t.id} transform={`translate(${t.x}, ${toViewBoxY(t.y)})`} filter="url(#token-shadow)">
          {t.type === "ball" ? (
            <g>
              <circle r={TOKEN_RADIUS * 0.62} fill="#f97316" stroke="#000" strokeWidth="0.35" />
              <path
                d={`M ${-TOKEN_RADIUS * 0.62} 0 A ${TOKEN_RADIUS * 0.62} ${TOKEN_RADIUS * 0.62} 0 0 1 ${TOKEN_RADIUS * 0.62} 0
                    M 0 ${-TOKEN_RADIUS * 0.62} A ${TOKEN_RADIUS * 0.62} ${TOKEN_RADIUS * 0.9} 0 0 1 0 ${TOKEN_RADIUS * 0.62}`}
                fill="none"
                stroke="#000"
                strokeWidth="0.25"
              />
            </g>
          ) : t.type === "cone" ? (
            <ConeMark />
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
                fontSize="3.3"
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
