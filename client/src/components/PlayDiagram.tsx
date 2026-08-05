import BasketballCourt from "@/components/BasketballCourt";
import PlayStepMarks from "@/components/PlayStepMarks";
import type { Token, Drawing } from "@shared/schema";

interface PlayDiagramProps {
  courtType: "full" | "half";
  tokens: Token[];
  drawings: Drawing[];
  className?: string;
}

// A static (non-interactive) render of one play step — same visual output as
// PlayEditor's live canvas, minus the pointer handlers and in-progress draw
// preview. Used for the PDF export (captured via html2canvas) and anywhere
// else a play needs to be shown read-only.
export default function PlayDiagram({ courtType, tokens, drawings, className }: PlayDiagramProps) {
  const viewBoxHeight = courtType === "full" ? 188 : 94;
  const toViewBoxY = (percentY: number) => (percentY / 100) * viewBoxHeight;

  return (
    <div className={className}>
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <BasketballCourt courtType={courtType} />
        </div>
        <svg
          viewBox={`0 0 100 ${viewBoxHeight}`}
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-label="Play diagram"
        >
          <defs>
            <marker id="play-arrowhead" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke" />
            </marker>
          </defs>
          <PlayStepMarks tokens={tokens} drawings={drawings} toViewBoxY={toViewBoxY} />
        </svg>
      </div>
    </div>
  );
}
