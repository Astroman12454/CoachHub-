import { useState } from "react";
import { ArrowUp, ArrowDown, X, Clock, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_COLORS, CATEGORY_SOLID_COLORS } from "@/lib/types";
import { addMinutesToClock } from "@/lib/time";
import { localizedExerciseText } from "@/lib/exerciseI18n";
import { cn } from "@/lib/utils";
import type { Exercise } from "@shared/schema";

interface SessionTimelineProps {
  selectedIds: string[];
  exercises: Exercise[];
  onReorder: (newIds: string[]) => void;
  onRemove: (id: number) => void;
  startTime: string;
  sessionDuration: number;
}

// Renders the coach's picks as an ordered run-of-show — a proportional bar
// plus a reorderable list — instead of the flat, unordered badge chips this
// replaced. Reordering is up/down buttons, kept as the primary interaction
// since they're trivially keyboard- and touch-operable — a grip handle adds
// native HTML5 drag-and-drop as a faster desktop-mouse alternative, without
// pulling in a drag library (native DnD doesn't reach touchscreens, which is
// exactly why the buttons stay rather than being replaced).
export default function SessionTimeline({
  selectedIds,
  exercises,
  onReorder,
  onRemove,
  startTime,
  sessionDuration,
}: SessionTimelineProps) {
  const { t, i18n } = useTranslation();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const blocks = selectedIds
    .map((id) => exercises.find((ex) => ex.id.toString() === id))
    .filter((ex): ex is Exercise => !!ex);

  const totalPlanned = blocks.reduce((sum, ex) => sum + ex.duration, 0);
  const diff = sessionDuration - totalPlanned;

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...selectedIds];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReorder(next);
  };

  const resetDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("sessionTimeline.noExercisesYet")}</p>;
  }

  let cumulative = 0;

  return (
    <div className="space-y-3">
      <div className="flex h-3 rounded-full overflow-hidden bg-muted" role="img" aria-label={t("sessionTimeline.timelineAriaLabel")}>
        {blocks.map((ex) => (
          <div
            key={ex.id}
            style={{ width: `${(ex.duration / totalPlanned) * 100}%` }}
            className={`${CATEGORY_SOLID_COLORS[ex.category as keyof typeof CATEGORY_SOLID_COLORS] ?? "bg-basketball-orange"} first:rounded-l-full last:rounded-r-full`}
            title={t("sessionTimeline.blockTitle", { name: localizedExerciseText(ex, i18n.language).name, duration: ex.duration })}
          />
        ))}
      </div>

      <p className={`text-xs ${diff < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
        {t("sessionTimeline.plannedOfSession", { planned: totalPlanned, total: sessionDuration })}
        {diff > 0 && ` — ${t("sessionTimeline.unscheduled", { count: diff })}`}
        {diff < 0 && ` — ${t("sessionTimeline.over", { count: Math.abs(diff) })}`}
      </p>

      <ol className="space-y-2">
        {blocks.map((ex, index) => {
          const start = cumulative;
          cumulative += ex.duration;
          const clockStart = startTime ? addMinutesToClock(startTime, start) : null;
          const clockEnd = startTime ? addMinutesToClock(startTime, cumulative) : null;
          const name = localizedExerciseText(ex, i18n.language).name;

          return (
            <li
              key={ex.id}
              onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setOverIndex(index); } }}
              onDragLeave={() => setOverIndex((prev) => (prev === index ? null : prev))}
              onDrop={(e) => { e.preventDefault(); handleDrop(index); resetDrag(); }}
              className={cn(
                "flex items-center gap-2 border rounded-lg p-2.5 transition-colors",
                overIndex === index && dragIndex !== null && dragIndex !== index
                  ? "border-basketball-orange border-dashed bg-basketball-orange/5"
                  : "border-border",
                dragIndex === index && "opacity-50"
              )}
            >
              <div
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={resetDrag}
                className="hidden sm:flex items-center self-stretch text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
                aria-hidden="true"
              >
                <GripVertical className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="flex flex-col flex-shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t("sessionTimeline.moveEarlier", { name })}
                >
                  <ArrowUp className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => move(index, 1)}
                  disabled={index === blocks.length - 1}
                  aria-label={t("sessionTimeline.moveLater", { name })}
                >
                  <ArrowDown className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                </Button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className={CATEGORY_COLORS[ex.category as keyof typeof CATEGORY_COLORS]}>
                    {t(`categories.exercise.${ex.category}`, ex.category)}
                  </Badge>
                  <span className="font-medium text-foreground truncate">{name}</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" strokeWidth={1.75} aria-hidden="true" />
                  {clockStart && clockEnd ? `${clockStart} – ${clockEnd}` : t("sessionTimeline.minutesRange", { start, end: cumulative })}
                  <span className="tabular-nums">{t("sessionTimeline.durationParens", { count: ex.duration })}</span>
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => onRemove(ex.id)}
                aria-label={t("sessionTimeline.remove", { name })}
              >
                <X className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
