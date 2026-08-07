import { useCallback, useRef } from "react";
import BasketballCourt from "@/components/BasketballCourt";

const SHOT_RADIUS = 2.2;
const VIEWBOX_HEIGHT = 94; // half-court only — shot charts are always the scoring end

interface ShotMarker {
  id: number;
  x: number;
  y: number;
  made: number; // 1 or 0
}

interface ShotChartProps {
  shots: ShotMarker[];
  /** When provided, the court becomes clickable and reports the tapped spot
   * as x/y percent (0-100 of width/height) — same convention as a play's
   * Token, see PlayEditor's toSVGPoint. Omit for a read-only chart. */
  onCourtClick?: (x: number, y: number) => void;
  className?: string;
  ariaLabel: string;
}

// A half-court diagram with green/red dots marking where shots were made or
// missed. Reuses BasketballCourt (same one used by the playbook) so a
// player's shot chart reads visually consistent with the rest of the app;
// the click-to-log path mirrors PlayEditor's own pointer-to-percent math.
export default function ShotChart({ shots, onCourtClick, className, ariaLabel }: ShotChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!onCourtClick) return;
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const local = pt.matrixTransform(ctm.inverse());
      const vb = svg.viewBox.baseVal;
      const x = Math.max(0, Math.min(100, ((local.x - vb.x) / vb.width) * 100));
      const y = Math.max(0, Math.min(100, ((local.y - vb.y) / vb.height) * 100));
      onCourtClick(x, y);
    },
    [onCourtClick],
  );

  return (
    <div className={className}>
      <div className={`relative w-full aspect-[100/94] ${onCourtClick ? "cursor-crosshair" : ""}`}>
        <div className="absolute inset-0">
          <BasketballCourt courtType="half" />
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 100 ${VIEWBOX_HEIGHT}`}
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-label={ariaLabel}
          onClick={handleClick}
        >
          {shots.map((shot) => (
            <circle
              key={shot.id}
              cx={shot.x}
              cy={(shot.y / 100) * VIEWBOX_HEIGHT}
              r={SHOT_RADIUS}
              fill={shot.made === 1 ? "#16a34a" : "#dc2626"}
              stroke="#fff"
              strokeWidth="0.5"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
