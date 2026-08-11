import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import BasketballCourt from "@/components/BasketballCourt";
import PlayStepMarks from "@/components/PlayStepMarks";
import { tokensAtProgress } from "@/lib/playAnimation";
import type { Token, Drawing } from "@shared/schema";

interface DiagramStep {
  tokens: Token[];
  drawings: Drawing[];
}

interface DiagramPlaybackProps {
  courtType: "half" | "full";
  steps: DiagramStep[];
}

// A read-only viewer for an animated court diagram — same tween-between-
// snapshots playback as PlayEditor/ExerciseDiagramEditor, but with no
// editing tools, for contexts where a coach or a public visitor should only
// ever watch it (e.g. the public exercise share page).
export default function DiagramPlayback({ courtType, steps }: DiagramPlaybackProps) {
  const { t } = useTranslation();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTokens, setPlaybackTokens] = useState<Token[] | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPlayback = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    rafRef.current = null;
    timeoutRef.current = null;
    setIsPlaying(false);
    setPlaybackTokens(null);
  }, []);

  const startPlayback = useCallback(() => {
    if (steps.length < 2) return;
    setIsPlaying(true);
    setCurrentStepIndex(0);

    const STEP_DURATION = 1100;
    const HOLD_DURATION = 450;

    function animateSegment(fromIdx: number) {
      const from = steps[fromIdx];
      const to = steps[fromIdx + 1];
      if (!from || !to) {
        stopPlayback();
        return;
      }
      const start = performance.now();

      function frame(now: number) {
        const progress = Math.min(1, (now - start) / STEP_DURATION);
        setPlaybackTokens(tokensAtProgress(from, to, progress));

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          setCurrentStepIndex(fromIdx + 1);
          if (fromIdx + 1 < steps.length - 1) {
            timeoutRef.current = setTimeout(() => animateSegment(fromIdx + 1), HOLD_DURATION);
          } else {
            timeoutRef.current = setTimeout(() => stopPlayback(), HOLD_DURATION);
          }
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    animateSegment(0);
  }, [steps, stopPlayback]);

  useEffect(() => stopPlayback, [stopPlayback]);

  const viewBoxHeight = courtType === "full" ? 188 : 94;
  const toViewBoxY = useCallback((percentY: number) => (percentY / 100) * viewBoxHeight, [viewBoxHeight]);

  const currentStep = steps[currentStepIndex] ?? steps[0];
  const displayTokens = playbackTokens ?? currentStep?.tokens ?? [];
  const displayDrawings = isPlaying ? [] : currentStep?.drawings ?? [];

  if (!currentStep) return null;

  return (
    <div>
      <div className={`w-full ${courtType === "full" ? "aspect-[100/188]" : "aspect-[100/94]"}`}>
        <div className="relative w-full h-full bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          <div className="absolute inset-0">
            <BasketballCourt courtType={courtType} />
          </div>
          <svg
            viewBox={`0 0 100 ${courtType === "full" ? 188 : 94}`}
            className="absolute inset-0 w-full h-full"
            role="img"
            aria-label={t("diagramPlayback.diagramPreview")}
          >
            <PlayStepMarks tokens={displayTokens} drawings={displayDrawings} toViewBoxY={toViewBoxY} />
          </svg>
        </div>
      </div>

      {steps.length > 1 && (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={isPlaying ? stopPlayback : startPlayback}
            aria-label={isPlaying ? t("diagramPlayback.stopPlayback") : t("diagramPlayback.playAnimation")}
            className="w-9 h-9 flex-shrink-0 rounded-full basketball-orange basketball-orange-hover text-white flex items-center justify-center"
          >
            {isPlaying ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
          </button>
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { stopPlayback(); setCurrentStepIndex(i); }}
                aria-label={t("diagramPlayback.stepNumber", { number: i + 1 })}
                aria-pressed={currentStepIndex === i && !isPlaying}
                className="w-6 h-6 flex-shrink-0 flex items-center justify-center"
              >
                <span
                  className={`block w-2.5 h-2.5 rounded-full transition-colors ${
                    currentStepIndex === i && !isPlaying ? "basketball-orange" : "bg-border"
                  }`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
