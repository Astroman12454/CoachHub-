import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MousePointer2, Circle, X as XIcon, CircleDot as BallIcon, ArrowRight, MoveRight,
  Waves, Shield, Type, Eraser, Plus, Play as PlayIcon, Pause, Trash2, Menu, Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import BasketballCourt from "@/components/BasketballCourt";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { straightPath, DRAWING_COLORS } from "@/lib/playDrawing";
import PlayStepMarks from "@/components/PlayStepMarks";
import { COURT_TYPES } from "@shared/schema";
import type { Token, Drawing, Exercise } from "@shared/schema";

interface EditorStep {
  tokens: Token[];
  drawings: Drawing[];
}

type Tool = "select" | "offense" | "defense" | "ball" | "move" | "pass" | "dribble" | "screen" | "text" | "erase";

const uid = () => Math.random().toString(36).slice(2, 10);
const HIT_RADIUS = 4.2;

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const ex = x1 + t * dx;
  const ey = y1 + t * dy;
  return Math.hypot(px - ex, py - ey);
}

function nextLabel(tokens: Token[], type: Token["type"]): string {
  if (type === "ball") return "";
  const count = tokens.filter((t) => t.type === type).length;
  return String(count + 1);
}

function emptyStep(): EditorStep {
  return { tokens: [], drawings: [] };
}

// A near-mirror of PlayEditor's canvas/tool/step/playback mechanics, adapted
// for an exercise's diagram instead of a play. Kept as its own component
// rather than sharing code with PlayEditor — the two entities' surrounding
// forms differ enough (no category/situation/notes here; the exercise's own
// name/description/etc. are edited elsewhere, in ExerciseForm) that a shared
// abstraction would mostly be indirection, and duplicating this rather than
// refactoring PlayEditor keeps its already-tested behavior untouched.
export default function ExerciseDiagramEditor() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const exerciseId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { openMobile } = useSidebar();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: existingExercise, isLoading } = useQuery<Exercise & { steps: (EditorStep & { stepIndex: number })[] }>({
    queryKey: [`/api/exercises/${exerciseId}`],
  });

  const [courtType, setCourtType] = useState<string>("half");
  const [steps, setSteps] = useState<EditorStep[]>([emptyStep()]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(DRAWING_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<number | null>(null);
  const [isRemoveDiagramOpen, setIsRemoveDiagramOpen] = useState(false);
  const [isRemovingDiagram, setIsRemovingDiagram] = useState(false);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);

  // Whether the exercise already had a saved diagram when this page loaded
  // — distinct from `steps.length`, which also counts the blank starting
  // step of a brand-new diagram that hasn't been saved yet.
  const [hasSavedDiagram, setHasSavedDiagram] = useState(false);

  useEffect(() => {
    if (existingExercise) {
      setCourtType(existingExercise.courtType);
      if (existingExercise.steps.length > 0) {
        setSteps(existingExercise.steps.map((s) => ({ tokens: s.tokens, drawings: s.drawings })));
        setHasSavedDiagram(true);
      } else {
        setSteps([emptyStep()]);
        setHasSavedDiagram(false);
      }
      setCurrentStepIndex(0);
    }
  }, [existingExercise]);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragTokenId = useRef<string | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number } | null>(null);

  // --- playback ---
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
    setTool("select");
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
      const fromMap = new Map(from.tokens.map((t) => [t.id, t]));
      const toMap = new Map(to.tokens.map((t) => [t.id, t]));
      const allIds = Array.from(new Set([...Array.from(fromMap.keys()), ...Array.from(toMap.keys())]));
      const start = performance.now();

      function frame(now: number) {
        const progress = Math.min(1, (now - start) / STEP_DURATION);
        const tokens: Token[] = allIds.map((id) => {
          const a = fromMap.get(id);
          const b = toMap.get(id);
          if (a && b) return { ...b, x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
          return (b ?? a)!;
        });
        setPlaybackTokens(tokens);

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

  // --- coordinate math ---
  const viewBoxHeight = courtType === "full" ? 188 : 94;
  const toViewBoxY = useCallback((percentY: number) => (percentY / 100) * viewBoxHeight, [viewBoxHeight]);

  const toSVGPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    const vb = svg.viewBox.baseVal;
    return {
      x: Math.max(0, Math.min(100, ((local.x - vb.x) / vb.width) * 100)),
      y: Math.max(0, Math.min(100, ((local.y - vb.y) / vb.height) * 100)),
    };
  }, []);

  const currentStep = steps[currentStepIndex];

  const updateCurrentStep = (updater: (step: EditorStep) => EditorStep) => {
    setSteps((prev) => prev.map((s, i) => (i === currentStepIndex ? updater(s) : s)));
  };

  const hitTestToken = (x: number, y: number): Token | null => {
    let closest: Token | null = null;
    let closestDist = HIT_RADIUS;
    for (const t of currentStep.tokens) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < closestDist) {
        closest = t;
        closestDist = d;
      }
    }
    return closest;
  };

  const hitTestDrawing = (x: number, y: number): Drawing | null => {
    for (const d of currentStep.drawings) {
      if (d.points.length === 1) {
        if (Math.hypot(d.points[0].x - x, d.points[0].y - y) < HIT_RADIUS) return d;
        continue;
      }
      for (let i = 0; i < d.points.length - 1; i++) {
        const a = d.points[i];
        const b = d.points[i + 1];
        if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) < 2.5) return d;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isPlaying) return;
    e.preventDefault();
    const p = toSVGPoint(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "select") {
      const hit = hitTestToken(p.x, p.y);
      dragTokenId.current = hit?.id ?? null;
      return;
    }

    if (tool === "erase") {
      const hitToken = hitTestToken(p.x, p.y);
      if (hitToken) {
        updateCurrentStep((s) => ({ ...s, tokens: s.tokens.filter((t) => t.id !== hitToken.id) }));
        return;
      }
      const hitDrawing = hitTestDrawing(p.x, p.y);
      if (hitDrawing) {
        updateCurrentStep((s) => ({ ...s, drawings: s.drawings.filter((d) => d.id !== hitDrawing.id) }));
      }
      return;
    }

    if (tool === "offense" || tool === "defense" || tool === "ball") {
      const token: Token = { id: uid(), type: tool, label: nextLabel(currentStep.tokens, tool), x: p.x, y: p.y };
      updateCurrentStep((s) => ({ ...s, tokens: [...s.tokens, token] }));
      return;
    }

    if (tool === "text") {
      setTextDraft({ x: p.x, y: p.y, value: "" });
      return;
    }

    const hit = hitTestToken(p.x, p.y);
    drawStart.current = hit ? { x: hit.x, y: hit.y } : p;
    setDrawPreview(drawStart.current);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isPlaying) return;
    const p = toSVGPoint(e.clientX, e.clientY);
    if (!p) return;

    if (tool === "select" && dragTokenId.current) {
      const id = dragTokenId.current;
      updateCurrentStep((s) => ({
        ...s,
        tokens: s.tokens.map((t) => (t.id === id ? { ...t, x: p.x, y: p.y } : t)),
      }));
      return;
    }

    if (drawStart.current) {
      setDrawPreview(p);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isPlaying) return;
    dragTokenId.current = null;

    if (drawStart.current && drawPreview) {
      const start = drawStart.current;
      const dist = Math.hypot(drawPreview.x - start.x, drawPreview.y - start.y);
      if (dist > 2) {
        const drawing: Drawing = {
          id: uid(),
          tool: tool as Drawing["tool"],
          points: [start, drawPreview],
          color,
        };
        updateCurrentStep((s) => ({ ...s, drawings: [...s.drawings, drawing] }));
      }
    }
    drawStart.current = null;
    setDrawPreview(null);
  };

  const commitTextDraft = () => {
    if (textDraft && textDraft.value.trim()) {
      const drawing: Drawing = {
        id: uid(),
        tool: "text",
        points: [{ x: textDraft.x, y: textDraft.y }],
        text: textDraft.value.trim().slice(0, 60),
        color,
      };
      updateCurrentStep((s) => ({ ...s, drawings: [...s.drawings, drawing] }));
    }
    setTextDraft(null);
  };

  const addStep = () => {
    setSteps((prev) => [...prev, { tokens: currentStep.tokens.map((t) => ({ ...t })), drawings: [] }]);
    setCurrentStepIndex(steps.length);
  };

  const confirmDeleteStep = () => {
    if (stepToDelete === null) return;
    setSteps((prev) => prev.filter((_, i) => i !== stepToDelete));
    setCurrentStepIndex((i) => Math.max(0, Math.min(i, steps.length - 2)));
    setStepToDelete(null);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await apiRequest("PUT", `/api/exercises/${exerciseId}/diagram`, { courtType, steps });
      await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/exercises"] });
      queryClient.invalidateQueries({ queryKey: [`/api/exercises/${exerciseId}`] });
      toast({ title: t("exerciseDiagramEditor.saved"), description: t("exerciseDiagramEditor.savedDescription") });
      setLocation("/exercise-library");
    } catch (error) {
      toast({ title: t("exerciseDiagramEditor.couldntSave"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveDiagram = async () => {
    if (isRemovingDiagram) return;
    setIsRemovingDiagram(true);
    try {
      await apiRequest("DELETE", `/api/exercises/${exerciseId}/diagram`);
      queryClient.invalidateQueries({ queryKey: ["/api/exercises"] });
      queryClient.invalidateQueries({ queryKey: [`/api/exercises/${exerciseId}`] });
      toast({ title: t("exerciseDiagramEditor.diagramRemoved") });
      setLocation("/exercise-library");
    } catch (error) {
      toast({ title: t("exerciseDiagramEditor.couldntRemove"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    } finally {
      setIsRemovingDiagram(false);
      setIsRemoveDiagramOpen(false);
    }
  };

  const displayTokens = playbackTokens ?? currentStep?.tokens ?? [];
  const displayDrawings = isPlaying ? [] : currentStep?.drawings ?? [];

  const toolButtons: { tool: Tool; label: string; icon: typeof MousePointer2 }[] = useMemo(() => [
    { tool: "select", label: t("exerciseDiagramEditor.tools.move"), icon: MousePointer2 },
    { tool: "offense", label: t("exerciseDiagramEditor.tools.offense"), icon: Circle },
    { tool: "defense", label: t("exerciseDiagramEditor.tools.defense"), icon: XIcon },
    { tool: "ball", label: t("exerciseDiagramEditor.tools.ball"), icon: BallIcon },
    { tool: "move", label: t("exerciseDiagramEditor.tools.moveArrow"), icon: ArrowRight },
    { tool: "pass", label: t("exerciseDiagramEditor.tools.pass"), icon: MoveRight },
    { tool: "dribble", label: t("exerciseDiagramEditor.tools.dribble"), icon: Waves },
    { tool: "screen", label: t("exerciseDiagramEditor.tools.screen"), icon: Shield },
    { tool: "text", label: t("exerciseDiagramEditor.tools.text"), icon: Type },
    { tool: "erase", label: t("exerciseDiagramEditor.tools.erase"), icon: Eraser },
  ], [t]);

  if (isLoading || !currentStep) {
    return <main className="flex items-center justify-center h-full text-muted-foreground">{t("exerciseDiagramEditor.loadingEllipsis")}</main>;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="bg-card border-b border-border px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={openMobile}
            className="lg:hidden w-10 h-10 flex-shrink-0 basketball-orange rounded-md flex items-center justify-center"
            aria-label={t("common.openNavigationMenu")}
          >
            <Menu className="w-4 h-4 text-white" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("exerciseDiagramEditor.diagramFor")}</p>
            <h1 className="font-display uppercase tracking-tight text-foreground truncate max-w-[240px]">{existingExercise?.name}</h1>
          </div>
          <Select value={courtType} onValueChange={setCourtType}>
            <SelectTrigger className="w-32" aria-label={t("exerciseDiagramEditor.court")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {COURT_TYPES.map((c) => (
                <SelectItem key={c} value={c}>{c === "half" ? t("exerciseDiagramEditor.halfCourt") : t("exerciseDiagramEditor.fullCourt")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          {hasSavedDiagram && (
            <Button type="button" variant="outline" className="text-red-700 hover:text-red-800 dark:hover:text-red-400" onClick={() => setIsRemoveDiagramOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
              {t("exerciseDiagramEditor.removeDiagram")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setLocation("/exercise-library")}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="basketball-orange basketball-orange-hover text-white"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? t("exerciseDiagramEditor.savingEllipsis") : t("exerciseDiagramEditor.saveDiagram")}
          </Button>
        </div>
      </header>

      {/* Tool palette */}
      <div className="bg-card border-b border-border px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {toolButtons.map(({ tool: toolValue, label, icon: Icon }) => (
          <button
            key={toolValue}
            type="button"
            onClick={() => setTool(toolValue)}
            aria-label={label}
            aria-pressed={tool === toolValue}
            title={label}
            className={`flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center border transition-colors ${
              tool === toolValue
                ? "basketball-orange text-white border-transparent"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Icon className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
          </button>
        ))}
        <div className="w-px h-6 bg-border flex-shrink-0 mx-1" />
        {DRAWING_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={t("exerciseDiagramEditor.colorSwatch", { color: c })}
            aria-pressed={color === c}
            className={`flex-shrink-0 w-7 h-7 rounded-full border-2 ${color === c ? "border-foreground" : "border-border"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {/* Canvas */}
      <main className="flex-1 overflow-auto p-4 flex items-start justify-center bg-muted/30" tabIndex={0} aria-label={t("exerciseDiagramEditor.diagramCanvas")}>
        <div className={`w-full max-w-xl ${courtType === "full" ? "aspect-[100/188]" : "aspect-[100/94]"}`}>
          <div className="relative w-full h-full bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="absolute inset-0">
              <BasketballCourt courtType={courtType as "full" | "half"} />
            </div>
            <svg
              ref={svgRef}
              viewBox={`0 0 100 ${courtType === "full" ? 188 : 94}`}
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: "none" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              role="img"
              aria-label={courtType === "full" ? t("exerciseDiagramEditor.fullCourtDiagramEditor") : t("exerciseDiagramEditor.halfCourtDiagramEditor")}
            >
              <defs>
                {/* PlayStepMarks hardcodes url(#play-arrowhead) for every
                    arrow-tipped drawing, so this id must match exactly —
                    it's not a play-specific reference, just the marker's
                    fixed name. */}
                <marker id="play-arrowhead" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke" />
                </marker>
              </defs>

              {drawStart.current && drawPreview && (
                <path
                  d={straightPath(drawStart.current.x, toViewBoxY(drawStart.current.y), drawPreview.x, toViewBoxY(drawPreview.y))}
                  stroke={color}
                  strokeWidth="0.7"
                  strokeDasharray="1.5,1.5"
                  fill="none"
                />
              )}

              <PlayStepMarks tokens={displayTokens} drawings={displayDrawings} toViewBoxY={toViewBoxY} />
            </svg>

            {textDraft && (
              <div
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${textDraft.x}%`, top: `${textDraft.y}%` }}
              >
                <input
                  autoFocus
                  value={textDraft.value}
                  onChange={(e) => setTextDraft((d) => (d ? { ...d, value: e.target.value } : d))}
                  onKeyDown={(e) => { if (e.key === "Enter") commitTextDraft(); if (e.key === "Escape") setTextDraft(null); }}
                  onBlur={commitTextDraft}
                  aria-label={t("exerciseDiagramEditor.annotationText")}
                  className="text-xs px-1.5 py-0.5 rounded border border-basketball-orange bg-card text-foreground w-28"
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Step strip */}
      <div className="bg-card border-t border-border px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={isPlaying ? stopPlayback : startPlayback}
          disabled={steps.length < 2}
          aria-label={isPlaying ? t("exerciseDiagramEditor.stopPlayback") : t("exerciseDiagramEditor.playAnimation")}
          className="flex-shrink-0"
        >
          {isPlaying ? <Pause className="w-4 h-4" aria-hidden="true" /> : <PlayIcon className="w-4 h-4" aria-hidden="true" />}
        </Button>
        <div className="w-px h-6 bg-border flex-shrink-0" />
        {steps.map((_, i) => (
          <div key={i} className="flex-shrink-0 flex items-center">
            <button
              type="button"
              onClick={() => { stopPlayback(); setCurrentStepIndex(i); }}
              aria-pressed={currentStepIndex === i && !isPlaying}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                currentStepIndex === i && !isPlaying
                  ? "basketball-orange text-white border-transparent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("exerciseDiagramEditor.stepNumber", { number: i + 1 })}
            </button>
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => setStepToDelete(i)}
                aria-label={t("exerciseDiagramEditor.deleteStep", { number: i + 1 })}
                className="ml-0.5 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-600"
              >
                <Trash2 className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addStep} className="flex-shrink-0">
          <Plus className="w-3.5 h-3.5 mr-1" strokeWidth={2} aria-hidden="true" />
          {t("exerciseDiagramEditor.step")}
        </Button>
      </div>

      <ConfirmDialog
        open={stepToDelete !== null}
        onOpenChange={(open) => !open && setStepToDelete(null)}
        title={t("exerciseDiagramEditor.deleteStepConfirmTitle")}
        description={t("exerciseDiagramEditor.deleteStepConfirmDescription")}
        onConfirm={confirmDeleteStep}
      />

      <ConfirmDialog
        open={isRemoveDiagramOpen}
        onOpenChange={setIsRemoveDiagramOpen}
        title={t("exerciseDiagramEditor.removeDiagramConfirmTitle")}
        description={t("exerciseDiagramEditor.removeDiagramConfirmDescription")}
        confirmLabel={t("exerciseDiagramEditor.removeDiagram")}
        isPending={isRemovingDiagram}
        onConfirm={handleRemoveDiagram}
      />
    </div>
  );
}
