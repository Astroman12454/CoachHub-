interface BasketballCourtProps {
  courtType: "full" | "half";
}

// Renders one basket end (baseline at y=0, basket pointing "up" out of the
// court) — reused twice, mirrored, for a full court.
function CourtEnd({ mirror }: { mirror?: boolean }) {
  const t = mirror ? "scale(1,-1)" : undefined;
  return (
    <g transform={t}>
      {/* Baseline */}
      <line x1="0" y1="0" x2="100" y2="0" stroke="currentColor" strokeWidth="0.5" />
      {/* Lane / key */}
      <rect x="34" y="0" width="32" height="38" fill="none" stroke="currentColor" strokeWidth="0.5" />
      {/* Free-throw circle */}
      <circle cx="50" cy="38" r="12" fill="none" stroke="currentColor" strokeWidth="0.5" />
      {/* Backboard */}
      <line x1="44" y1="4" x2="56" y2="4" stroke="currentColor" strokeWidth="1" />
      {/* Basket */}
      <circle cx="50" cy="5.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="0.5" />
      {/* Three-point arc — a circle of radius 44 centered on the basket
          (50, 5.5), same as real courts measure the line from the hoop.
          The old version used an arbitrary radius/endpoint pair that
          wasn't centered on the basket at all, so its apex landed just
          past the free-throw line instead of well beyond it. */}
      <path d="M 6.3 0 A 44 44 0 1 0 93.7 0" fill="none" stroke="currentColor" strokeWidth="0.5" />
    </g>
  );
}

// A coaching-tool court, not a regulation blueprint — accurate enough to
// read at a glance, simple enough to stay crisp at any size (pure SVG, no
// raster assets, themed via currentColor so it matches light/dark mode).
export default function BasketballCourt({ courtType }: BasketballCourtProps) {
  const height = courtType === "full" ? 188 : 94;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="w-full h-full text-border"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="100" height={height} fill="none" stroke="currentColor" strokeWidth="0.5" />
      {courtType === "full" ? (
        <>
          <g transform={`translate(0, ${height})`}>
            <CourtEnd mirror />
          </g>
          <CourtEnd />
          <line x1="0" y1={height / 2} x2="100" y2={height / 2} stroke="currentColor" strokeWidth="0.5" />
          <circle cx="50" cy={height / 2} r="12" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </>
      ) : (
        <CourtEnd />
      )}
    </svg>
  );
}
