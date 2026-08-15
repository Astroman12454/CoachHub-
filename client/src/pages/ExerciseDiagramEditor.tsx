import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MousePointer2, Circle, X as XIcon, CircleDot as BallIcon, TrafficCone, ArrowRight, MoveRight,
  Waves, Shield, Type, Eraser, Plus, Play as PlayIcon, Pause, Trash2, Menu, Loader2,
  Undo2, Redo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import BasketballCourt from "@/components/BasketballCourt";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ConfirmDialog from "@/components/ConfirmDialog";
import ErrorState from "@/components/ErrorState";
import DiagramEditorSkeleton from "@/components/DiagramEditorSkeleton";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { smoothPath, DRAWING_COLORS } from "@/lib/playDrawing";
import { useDiagramBoard, type EditorStep, type Tool } from "@/hooks/use-diagram-board";
import { useScrollEdges } from "@/hooks/use-scroll-edges";
import PlayStepMarks from "@/components/PlayStepMarks";
import { localizedExerciseText } from "@/lib/exerciseI18n";
import { COURT_TYPES } from "@shared/schema";
import type { Exercise } from "@shared/schema";

// A thin wrapper around the shared useDiagramBoard hook (see
// client/src/hooks/use-diagram-board.ts) adapted for an exercise's diagram
// instead of a play — no category/situation/notes here, and no PDF export;
// the exercise's own name/description/etc. are edited elsewhere, in
// ExerciseForm.
export default function ExerciseDiagramEditor() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();
  const exerciseId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { openMobile } = useSidebar();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: existingExercise, isLoading, isError, refetch } = useQuery<Exercise & { steps: (EditorStep & { stepIndex: number })[] }>({
    queryKey: [`/api/exercises/${exerciseId}`],
  });

  const [courtType, setCourtType] = useState<string>("half");
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoveDiagramOpen, setIsRemoveDiagramOpen] = useState(false);
  const [isRemovingDiagram, setIsRemovingDiagram] = useState(false);

  const board = useDiagramBoard(courtType);

  // Whether the exercise already had a saved diagram when this page loaded
  // — distinct from `board.steps.length`, which also counts the blank
  // starting step of a brand-new diagram that hasn't been saved yet.
  const [hasSavedDiagram, setHasSavedDiagram] = useState(false);

  useEffect(() => {
    if (existingExercise) {
      setCourtType(existingExercise.courtType);
      board.loadSteps(existingExercise.steps.map((s) => ({ tokens: s.tokens, drawings: s.drawings })));
      setHasSavedDiagram(existingExercise.steps.length > 0);
    }
    // board.loadSteps is stable (useCallback with no deps); only re-run when a new exercise loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingExercise]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await apiRequest("PUT", `/api/exercises/${exerciseId}/diagram`, { courtType, steps: board.steps });
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

  const toolButtons: { tool: Tool; label: string; icon: typeof MousePointer2 }[] = useMemo(() => [
    { tool: "select", label: t("exerciseDiagramEditor.tools.move"), icon: MousePointer2 },
    { tool: "offense", label: t("exerciseDiagramEditor.tools.offense"), icon: Circle },
    { tool: "defense", label: t("exerciseDiagramEditor.tools.defense"), icon: XIcon },
    { tool: "ball", label: t("exerciseDiagramEditor.tools.ball"), icon: BallIcon },
    { tool: "cone", label: t("exerciseDiagramEditor.tools.cone"), icon: TrafficCone },
    { tool: "move", label: t("exerciseDiagramEditor.tools.moveArrow"), icon: ArrowRight },
    { tool: "pass", label: t("exerciseDiagramEditor.tools.pass"), icon: MoveRight },
    { tool: "dribble", label: t("exerciseDiagramEditor.tools.dribble"), icon: Waves },
    { tool: "screen", label: t("exerciseDiagramEditor.tools.screen"), icon: Shield },
    { tool: "text", label: t("exerciseDiagramEditor.tools.text"), icon: Type },
    { tool: "erase", label: t("exerciseDiagramEditor.tools.erase"), icon: Eraser },
  ], [t]);

  const toolsScroll = useScrollEdges<HTMLDivElement>();
  const stepsScroll = useScrollEdges<HTMLDivElement>([board.steps.length]);

  // Same "stuck forever" trap as a failed board.currentStep would leave
  // behind — a failed fetch never populates existingExercise, so
  // board.loadSteps (the effect above) never runs and !board.currentStep
  // would otherwise loop back into the loading branch indefinitely.
  if (isError) {
    return (
      <main className="flex items-center justify-center h-full p-4">
        <ErrorState onRetry={() => refetch()} />
      </main>
    );
  }

  if (isLoading || !board.currentStep) {
    return <DiagramEditorSkeleton />;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* pt-[max(...)] reserves space under iOS's black-translucent status
          bar when this app is added to the home screen — see TopBar.tsx. */}
      <header className="bg-card border-b border-border px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex flex-col gap-2">
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
            <h1 className="font-display uppercase tracking-tight text-foreground truncate max-w-[240px]">{existingExercise ? localizedExerciseText(existingExercise, i18n.language).name : ""}</h1>
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
      <div className="relative border-b border-border">
      <div ref={toolsScroll.ref} className="bg-card px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {toolButtons.map(({ tool: toolValue, label, icon: Icon }) => (
          <button
            key={toolValue}
            type="button"
            onClick={() => board.setTool(toolValue)}
            aria-label={label}
            aria-pressed={board.tool === toolValue}
            title={label}
            className={`flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center border transition-colors ${
              board.tool === toolValue
                ? "basketball-orange text-white border-transparent"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Icon className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
          </button>
        ))}
        <div className="w-px h-6 bg-border flex-shrink-0 mx-1" />
        <button
          type="button"
          onClick={board.undo}
          disabled={!board.canUndo}
          aria-label={t("exerciseDiagramEditor.undo")}
          title={t("exerciseDiagramEditor.undo")}
          className="flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          <Undo2 className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={board.redo}
          disabled={!board.canRedo}
          aria-label={t("exerciseDiagramEditor.redo")}
          title={t("exerciseDiagramEditor.redo")}
          className="flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          <Redo2 className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="w-px h-6 bg-border flex-shrink-0 mx-1" />
        {DRAWING_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => board.setColor(c)}
            aria-label={t("exerciseDiagramEditor.colorSwatch", { color: c })}
            aria-pressed={board.color === c}
            className={`flex-shrink-0 w-7 h-7 rounded-full border-2 ${board.color === c ? "border-foreground" : "border-border"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      {!toolsScroll.atStart && <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent" />}
      {!toolsScroll.atEnd && <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />}
      </div>

      {/* Canvas */}
      <main className="flex-1 overflow-auto p-4 flex items-start justify-center bg-muted/30" tabIndex={0} aria-label={t("exerciseDiagramEditor.diagramCanvas")}>
        <div className={`w-full max-w-xl ${courtType === "full" ? "aspect-[100/188]" : "aspect-[100/94]"}`}>
          <div className="relative w-full h-full bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="absolute inset-0">
              <BasketballCourt courtType={courtType as "full" | "half"} />
            </div>
            <svg
              ref={board.svgRef}
              viewBox={`0 0 100 ${courtType === "full" ? 188 : 94}`}
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: "none" }}
              onPointerDown={board.handlePointerDown}
              onPointerMove={board.handlePointerMove}
              onPointerUp={board.handlePointerUp}
              role="img"
              aria-label={courtType === "full" ? t("exerciseDiagramEditor.fullCourtDiagramEditor") : t("exerciseDiagramEditor.halfCourtDiagramEditor")}
            >
              {board.drawPreview && board.drawPreview.length > 1 && (
                <path
                  d={smoothPath(board.drawPreview, board.toViewBoxY)}
                  stroke={board.color}
                  strokeWidth="0.7"
                  strokeDasharray="1.5,1.5"
                  strokeLinecap="round"
                  fill="none"
                />
              )}

              <PlayStepMarks tokens={board.displayTokens} drawings={board.displayDrawings} toViewBoxY={board.toViewBoxY} />
            </svg>

            {board.textDraft && (
              <div
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${board.textDraft.x}%`, top: `${board.textDraft.y}%` }}
              >
                <input
                  autoFocus
                  value={board.textDraft.value}
                  onChange={(e) => board.setTextDraft((d) => (d ? { ...d, value: e.target.value } : d))}
                  onKeyDown={(e) => { if (e.key === "Enter") board.commitTextDraft(); if (e.key === "Escape") board.setTextDraft(null); }}
                  onBlur={board.commitTextDraft}
                  aria-label={t("exerciseDiagramEditor.annotationText")}
                  className="text-xs px-1.5 py-0.5 rounded border border-basketball-orange bg-card text-foreground w-28"
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Step strip */}
      <div className="relative border-t border-border">
      <div ref={stepsScroll.ref} className="bg-card px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={board.isPlaying ? board.stopPlayback : board.startPlayback}
          disabled={board.steps.length < 2}
          aria-label={board.isPlaying ? t("exerciseDiagramEditor.stopPlayback") : t("exerciseDiagramEditor.playAnimation")}
          className="flex-shrink-0"
        >
          {board.isPlaying ? <Pause className="w-4 h-4" aria-hidden="true" /> : <PlayIcon className="w-4 h-4" aria-hidden="true" />}
        </Button>
        <div className="w-px h-6 bg-border flex-shrink-0" />
        {board.steps.map((_, i) => (
          <div key={i} className="flex-shrink-0 flex items-center">
            <button
              type="button"
              onClick={() => { board.stopPlayback(); board.setCurrentStepIndex(i); }}
              aria-pressed={board.currentStepIndex === i && !board.isPlaying}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                board.currentStepIndex === i && !board.isPlaying
                  ? "basketball-orange text-white border-transparent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("exerciseDiagramEditor.stepNumber", { number: i + 1 })}
            </button>
            {board.steps.length > 1 && (
              <button
                type="button"
                onClick={() => board.setStepToDelete(i)}
                aria-label={t("exerciseDiagramEditor.deleteStep", { number: i + 1 })}
                className="ml-0.5 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-600"
              >
                <Trash2 className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={board.addStep} className="flex-shrink-0">
          <Plus className="w-3.5 h-3.5 mr-1" strokeWidth={2} aria-hidden="true" />
          {t("exerciseDiagramEditor.step")}
        </Button>
      </div>
      {!stepsScroll.atStart && <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent" />}
      {!stepsScroll.atEnd && <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />}
      </div>

      <ConfirmDialog
        open={board.stepToDelete !== null}
        onOpenChange={(open) => !open && board.setStepToDelete(null)}
        title={t("exerciseDiagramEditor.deleteStepConfirmTitle")}
        description={t("exerciseDiagramEditor.deleteStepConfirmDescription")}
        onConfirm={board.confirmDeleteStep}
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
