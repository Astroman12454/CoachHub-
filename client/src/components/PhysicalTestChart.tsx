import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPlainDate } from "@/lib/time";

interface PhysicalTestChartProps {
  results: { value: number; date: string }[]; // oldest first
  unit: string;
  lowerIsBetter: boolean;
}

const WIDTH = 300;
const HEIGHT = 110;
const PAD_X = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 20;

// A hand-rolled SVG line chart, same rationale as SkillRadarChart: this is a
// small, fixed-shape widget (one series, evenly spaced by test occasion, not
// by calendar date), not worth a charting library dependency for.
export default function PhysicalTestChart({ results, unit, lowerIsBetter }: PhysicalTestChartProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);

  if (results.length < 2) return null;

  const values = results.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotWidth = WIDTH - PAD_X * 2;

  const points = results.map((r, i) => {
    const x = PAD_X + (i / (results.length - 1)) * plotWidth;
    const y = PAD_TOP + plotHeight - ((r.value - min) / range) * plotHeight;
    return { x, y, value: r.value, date: r.date };
  });
  const linePath = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1];
  const best = lowerIsBetter ? min : max;

  const trendDirection = results[results.length - 1].value === results[0].value
    ? "flat"
    : (lowerIsBetter ? results[results.length - 1].value < results[0].value : results[results.length - 1].value > results[0].value)
      ? "up"
      : "down";

  return (
    <div className="relative">
      {/* No role="img" here — unlike SkillRadarChart, this chart's points are
          individually focusable (see the per-point hit targets below), and
          role="img" forbids focusable descendants. The aria-label still
          gives the whole chart a spoken summary; each point adds its own. */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        aria-label={t("physicalTestChart.ariaLabel", {
          first: results[0].value, last: last.value, unit, trend: t(`physicalTestChart.trend.${trendDirection}`),
        })}
      >
        {/* Gridlines at the best and worst values in this window */}
        {[min, max].map((v) => {
          const y = PAD_TOP + plotHeight - ((v - min) / range) * plotHeight;
          return (
            <line key={v} x1={PAD_X} y1={y} x2={WIDTH - PAD_X} y2={y} stroke="currentColor" strokeWidth="1" className="text-border" />
          );
        })}

        <polyline
          points={linePath}
          fill="none"
          stroke="var(--basketball-orange, #CC3600)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <g key={i}>
            {/* Transparent hit target, larger than the visible marker */}
            <circle
              cx={p.x}
              cy={p.y}
              r="12"
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${formatPlainDate(p.date)}: ${p.value} ${unit}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((h) => (h === i ? null : h))}
              className="cursor-pointer outline-none"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={p.value === best ? "5" : "4"}
              fill="var(--basketball-orange, #CC3600)"
              stroke="var(--background, white)"
              strokeWidth="2"
              className="pointer-events-none"
            />
          </g>
        ))}

        {/* Direct label on the endpoint, per line-chart labeling convention */}
        <text x={last.x} y={last.y - 10} textAnchor="end" fontSize="10" fontWeight="600" fill="currentColor" className="text-foreground pointer-events-none">
          {last.value} {unit}
        </text>
      </svg>

      {hovered !== null && (
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-md px-2 py-1 text-xs shadow-md pointer-events-none whitespace-nowrap"
          style={{ left: `${(points[hovered].x / WIDTH) * 100}%` }}
        >
          <span className="font-semibold text-foreground">{points[hovered].value} {unit}</span>
          <span className="text-muted-foreground ml-1.5">{formatPlainDate(points[hovered].date)}</span>
        </div>
      )}
    </div>
  );
}
