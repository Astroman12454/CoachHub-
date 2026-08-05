import { ArrowUp, ArrowDown, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_COLORS, CATEGORY_SOLID_COLORS } from "@/lib/types";
import { addMinutesToClock } from "@/lib/time";
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
// replaced. Reordering is up/down buttons rather than drag-and-drop: the
// list is short (a handful of blocks), and buttons are trivially keyboard-
// and touch-operable without a drag library or its edge cases.
export default function SessionTimeline({
  selectedIds,
  exercises,
  onReorder,
  onRemove,
  startTime,
  sessionDuration,
}: SessionTimelineProps) {
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

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">No exercises added yet — pick some below to build the timeline.</p>;
  }

  let cumulative = 0;

  return (
    <div className="space-y-3">
      <div className="flex h-3 rounded-full overflow-hidden bg-muted" role="img" aria-label="Session timeline, proportional to each exercise's duration">
        {blocks.map((ex) => (
          <div
            key={ex.id}
            style={{ width: `${(ex.duration / totalPlanned) * 100}%` }}
            className={`${CATEGORY_SOLID_COLORS[ex.category as keyof typeof CATEGORY_SOLID_COLORS] ?? "bg-basketball-orange"} first:rounded-l-full last:rounded-r-full`}
            title={`${ex.name} (${ex.duration} min)`}
          />
        ))}
      </div>

      <p className={`text-xs ${diff < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
        {totalPlanned} min planned of {sessionDuration} min session
        {diff > 0 && ` — ${diff} min unscheduled`}
        {diff < 0 && ` — ${Math.abs(diff)} min over`}
      </p>

      <ol className="space-y-2">
        {blocks.map((ex, index) => {
          const start = cumulative;
          cumulative += ex.duration;
          const clockStart = startTime ? addMinutesToClock(startTime, start) : null;
          const clockEnd = startTime ? addMinutesToClock(startTime, cumulative) : null;

          return (
            <li key={ex.id} className="flex items-center gap-2 border border-border rounded-lg p-2.5">
              <div className="flex flex-col flex-shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${ex.name} earlier`}
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
                  aria-label={`Move ${ex.name} later`}
                >
                  <ArrowDown className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                </Button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className={CATEGORY_COLORS[ex.category as keyof typeof CATEGORY_COLORS]}>
                    {ex.category}
                  </Badge>
                  <span className="font-medium text-foreground truncate">{ex.name}</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" strokeWidth={1.75} aria-hidden="true" />
                  {clockStart && clockEnd ? `${clockStart} – ${clockEnd}` : `${start}–${cumulative} min`}
                  <span className="tabular-nums">({ex.duration} min)</span>
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => onRemove(ex.id)}
                aria-label={`Remove ${ex.name}`}
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
