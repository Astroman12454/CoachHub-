import { useId } from "react";

interface BasketballCourtProps {
  courtType: "full" | "half";
}

export const COURT_ORANGE = "#CC3600";
const LINE_COLOR = "#000000";

// Renders one basket end (baseline at y=0, basket pointing "up" out of the
// court) — reused twice, mirrored, for a full court.
function CourtEnd({ mirror }: { mirror?: boolean }) {
  const t = mirror ? "scale(1,-1)" : undefined;
  return (
    <g transform={t} stroke={LINE_COLOR} strokeLinecap="round" strokeLinejoin="round">
      {/* Baseline */}
      <line x1="0" y1="0" x2="100" y2="0" strokeWidth="0.5" />
      {/* Lane / key */}
      <rect x="34" y="0" width="32" height="38" fill="none" strokeWidth="0.5" />
      {/* Free-throw circle */}
      <circle cx="50" cy="38" r="12" fill="none" strokeWidth="0.5" />
      {/* Backboard — 4ft from the baseline in real courts, scaled 2 units/ft */}
      <line x1="44" y1="8" x2="56" y2="8" strokeWidth="1" />
      {/* Basket — rim center is 5.25ft (63") from the baseline, not 2.75ft;
          the previous value quietly halved this, dragging the rim,
          backboard, and the arc centered on it all too close to the line. */}
      <circle cx="50" cy="10.5" r="1.5" fill="none" strokeWidth="0.5" />
      {/* Three-point arc — radius 47.5 (23.75ft, the real arc distance)
          centered on the basket (50, 10.5). Real courts flatten the
          corners to straight 22ft lines parallel to the sideline instead
          of following this circle all the way to the baseline; skipped
          here to keep this a coaching tool rather than a blueprint, but
          the radius and center now match a real hoop. */}
      <path d="M 3.7 0 A 47.5 47.5 0 1 0 96.3 0" fill="none" strokeWidth="0.5" />
    </g>
  );
}

// A coaching-tool court, not a regulation blueprint — accurate enough to
// read at a glance, simple enough to stay crisp at any size (pure SVG, no
// raster assets). Deliberately fixed orange/black regardless of the app's
// light/dark theme — a whiteboard, not a themed UI surface — so token and
// drawing colors (PlayEditor) are chosen to contrast with it rather than
// with the app's theme colors.
export default function BasketballCourt({ courtType }: BasketballCourtProps) {
  const height = courtType === "full" ? 188 : 94;
  // Unique per instance so two courts rendered on the same page (or the
  // same off-screen PDF-export batch) never share — and silently fight
  // over — one <radialGradient> id.
  const gradientId = `court-surface-${useId()}`;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="w-full h-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* A subtle radial highlight rather than a flat fill — reads as a
            lit wood/court surface instead of a solid color swatch. */}
        <radialGradient id={gradientId} cx="50%" cy="35%" r="85%">
          <stop offset="0%" stopColor="#DD4A10" />
          <stop offset="100%" stopColor={COURT_ORANGE} />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height={height} fill={`url(#${gradientId})`} stroke={LINE_COLOR} strokeWidth="0.5" />
      {courtType === "full" ? (
        <>
          <g transform={`translate(0, ${height})`}>
            <CourtEnd mirror />
          </g>
          <CourtEnd />
          <line x1="0" y1={height / 2} x2="100" y2={height / 2} stroke={LINE_COLOR} strokeWidth="0.5" strokeLinecap="round" />
          <circle cx="50" cy={height / 2} r="12" fill="none" stroke={LINE_COLOR} strokeWidth="0.5" />
        </>
      ) : (
        <CourtEnd />
      )}
    </svg>
  );
}
