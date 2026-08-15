import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPlainDate } from "@/lib/time";
import { computeEvaluationScore } from "@shared/evaluationScore";

interface EvaluationScoreChartProps {
  results: { value: number; date: string }[]; // oldest first
  unit: string;
  worstValue: number;
  bestValue: number;
}

const WIDTH = 300;
const HEIGHT = 110;
const PAD_X = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 20;
const MIN_SCORE = 1;
const MAX_SCORE = 100;

// A hand-rolled SVG line chart plotted against the fixed 1-100 score axis
// (via computeEvaluationScore) instead of each test's own dynamic value
// range — so score trends read consistently no matter which evaluation
// test is expanded.
export default function EvaluationScoreChart({ results, unit, worstValue, bestValue }: EvaluationScoreChartProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);

  if (results.length < 2) return null;

  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotWidth = WIDTH - PAD_X * 2;
  const scoreRange = MAX_SCORE - MIN_SCORE;

  const points = results.map((r, i) => {
    const score = computeEvaluationScore(r.value, worstValue, bestValue);
    const x = PAD_X + (i / (results.length - 1)) * plotWidth;
    const y = PAD_TOP + plotHeight - ((score - MIN_SCORE) / scoreRange) * plotHeight;
    return { x, y, score, value: r.value, date: r.date };
  });
  const linePath = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1];
  const best = Math.max(...points.map((p) => p.score));

  const trendDirection = points[points.length - 1].score === points[0].score
    ? "flat"
    : points[points.length - 1].score > points[0].score
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
        aria-label={t("evaluationScoreChart.ariaLabel", {
          first: points[0].score, last: last.score, trend: t(`evaluationScoreChart.trend.${trendDirection}`),
        })}
      >
        {/* Gridlines at the fixed score floor/ceiling */}
        {[MIN_SCORE, MAX_SCORE].map((v) => {
          const y = PAD_TOP + plotHeight - ((v - MIN_SCORE) / scoreRange) * plotHeight;
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
            {/* Transparent hit target, larger than the visible marker.
                onClick is what makes this work on a phone — only the last
                point had a value visible at all on mobile before this,
                since touch has no persistent hover state. Hover uses
                onPointerEnter/Leave gated to pointerType==="mouse" rather
                than onMouseEnter/Leave: a tap synthesizes a compatibility
                mouseenter *and* mouseleave around the click (enter, then
                click, then leave, all for that one tap), so plain mouse
                events would close the tooltip onClick had just opened.
                Real mice don't carry that gate, so hover still works there;
                tapping a different point just switches the tooltip to it. */}
            <circle
              cx={p.x}
              cy={p.y}
              r="12"
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${formatPlainDate(p.date)}: ${t("evaluationScoreChart.scoreLabel", { score: p.score, value: p.value, unit })}`}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(i); }}
              onPointerLeave={(e) => { if (e.pointerType === "mouse") setHovered((h) => (h === i ? null : h)); }}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((h) => (h === i ? null : h))}
              onClick={() => setHovered(i)}
              className="cursor-pointer outline-none"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={p.score === best ? "5" : "4"}
              fill="var(--basketball-orange, #CC3600)"
              stroke="var(--background, white)"
              strokeWidth="2"
              className="pointer-events-none"
            />
          </g>
        ))}

        {/* Direct label on the endpoint, per line-chart labeling convention.
            paintOrder="stroke" + a background-colored stroke halo keeps this
            legible when the endpoint sits low in the chart and the label
            would otherwise sit right on top of the incoming line segment. */}
        <text
          x={last.x}
          y={last.y - 12}
          textAnchor="end"
          fontSize="10"
          fontWeight="600"
          fill="currentColor"
          stroke="var(--background, white)"
          strokeWidth="4"
          strokeLinejoin="round"
          paintOrder="stroke"
          className="text-foreground pointer-events-none"
        >
          {last.score}
        </text>
      </svg>

      {hovered !== null && (
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-md px-2 py-1 text-xs shadow-md pointer-events-none whitespace-nowrap"
          style={{ left: `${(points[hovered].x / WIDTH) * 100}%` }}
        >
          <span className="font-semibold text-foreground">{points[hovered].score}</span>
          <span className="text-muted-foreground ml-1.5">{points[hovered].value} {unit}</span>
          <span className="text-muted-foreground ml-1.5">{formatPlainDate(points[hovered].date)}</span>
        </div>
      )}
    </div>
  );
}
