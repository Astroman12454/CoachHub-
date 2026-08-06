import { useTranslation } from "react-i18next";
import { SKILL_CATEGORIES } from "@shared/schema";

// Wider than tall: the two side vertices' labels ("Dribbling",
// "Conditioning") need real horizontal room to avoid clipping against the
// viewBox edge — see the directional text-anchor below, the other half of
// that fix.
const WIDTH = 320;
const HEIGHT = 230;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const RADIUS = 65;
const MAX_RATING = 10;
const RING_COUNT = 4;

// Evenly spaced points around a circle, starting straight up (-90°) and
// going clockwise — standard radar/pentagon layout.
function pointFor(index: number, total: number, radius: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return { x: CENTER_X + radius * Math.cos(angle), y: CENTER_Y + radius * Math.sin(angle) };
}

function polygonPoints(radius: number, total: number): string {
  return Array.from({ length: total }, (_, i) => {
    const p = pointFor(i, total, radius);
    return `${p.x},${p.y}`;
  }).join(" ");
}

// A point on the right half of the chart should have its label grow
// further right (anchor "start"), a point on the left should grow further
// left (anchor "end") — anchoring everything "middle" is what let long
// words like "Conditioning" overflow past the viewBox edge before.
function anchorFor(index: number, total: number): "start" | "middle" | "end" {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const cos = Math.cos(angle);
  if (cos > 0.15) return "start";
  if (cos < -0.15) return "end";
  return "middle";
}

interface SkillRadarChartProps {
  ratings: Record<string, number> | null;
}

// A hand-rolled SVG radar chart rather than pulling in a charting library —
// this is the only chart in the app and the axes are fixed (the 5 exercise
// categories), so a general-purpose charting dependency would be a lot of
// weight for one shape.
export default function SkillRadarChart({ ratings }: SkillRadarChartProps) {
  const { t } = useTranslation();
  const categories = SKILL_CATEGORIES;
  const total = categories.length;

  const dataPoints = categories.map((cat, i) => {
    const value = ratings?.[cat] ?? 0;
    return pointFor(i, total, (Math.max(0, value) / MAX_RATING) * RADIUS);
  });
  const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto max-w-sm mx-auto"
      role="img"
      aria-label={t("skillRadarChart.ariaLabel")}
    >
      {/* Grid rings */}
      {Array.from({ length: RING_COUNT }, (_, i) => {
        const r = (RADIUS * (i + 1)) / RING_COUNT;
        return (
          <polygon
            key={i}
            points={polygonPoints(r, total)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-border"
          />
        );
      })}

      {/* Axis lines */}
      {categories.map((cat, i) => {
        const p = pointFor(i, total, RADIUS);
        return (
          <line
            key={cat}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={p.x}
            y2={p.y}
            stroke="currentColor"
            strokeWidth="1"
            className="text-border"
          />
        );
      })}

      {/* Data polygon */}
      {ratings && (
        <polygon
          points={dataPath}
          fill="var(--basketball-orange, #CC3600)"
          fillOpacity="0.25"
          stroke="var(--basketball-orange, #CC3600)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {ratings &&
        dataPoints.map((p, i) => (
          <circle key={categories[i]} cx={p.x} cy={p.y} r="3" fill="var(--basketball-orange, #CC3600)" />
        ))}

      {/* Labels */}
      {categories.map((cat, i) => {
        const p = pointFor(i, total, RADIUS + 14);
        const anchor = anchorFor(i, total);
        const dx = anchor === "start" ? 4 : anchor === "end" ? -4 : 0;
        return (
          <text
            key={cat}
            x={p.x + dx}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline="central"
            fontSize="11"
            fontWeight="600"
            fill="currentColor"
            className="text-muted-foreground select-none"
          >
            {t(`categories.exercise.${cat}`, cat)}
          </text>
        );
      })}
    </svg>
  );
}
