import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MousePointer2, Circle, X as XIcon, CircleDot as BallIcon, TrafficCone, ArrowRight, MoveRight,
  Waves, Shield, Type, Eraser, Plus, Play as PlayIcon, Pause, Trash2, Menu, FileDown, Loader2,
  Undo2, Redo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import BasketballCourt from "@/components/BasketballCourt";
import { exportPlayPdf } from "@/lib/exportPlayPdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { smoothPath, DRAWING_COLORS } from "@/lib/playDrawing";
import { useDiagramBoard, type EditorStep, type Tool } from "@/hooks/use-diagram-board";
import PlayStepMarks from "@/components/PlayStepMarks";
import { PLAY_CATEGORIES, COURT_TYPES, PLAY_SITUATIONS } from "@shared/schema";
import type { Play as PlayType } from "@shared/schema";

export default function PlayEditor() {
  const { t } = useTranslation();
  const params = useParams<{ id?: string }>();
  const isEditing = !!params.id && params.id !== "new";
  const playId = isEditing ? parseInt(params.id!, 10) : null;
  const [, setLocation] = useLocation();
  const { openMobile } = useSidebar();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: existingPlay, isLoading } = useQuery<PlayType & { steps: (EditorStep & { stepIndex: number })[] }>({
    queryKey: [`/api/plays/${playId}`],
    enabled: isEditing,
  });

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("offense");
  const [courtType, setCourtType] = useState<string>("half");
  // "none" is the sentinel for "no specific situation" — Radix Select can't
  // take an empty-string item value, and the field itself is nullable.
  const [situation, setSituation] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const board = useDiagramBoard(courtType);

  // Load existing play into editor state once it arrives.
  useEffect(() => {
    if (existingPlay) {
      setName(existingPlay.name);
      setCategory(existingPlay.category);
      setCourtType(existingPlay.courtType);
      setSituation(existingPlay.situation ?? "none");
      setNotes(existingPlay.notes ?? "");
      board.loadSteps(existingPlay.steps.map((s) => ({ tokens: s.tokens, drawings: s.drawings })));
    }
    // board.loadSteps is stable (useCallback with no deps); only re-run when a new play loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPlay]);

  const handleSave = async () => {
    if (isSaving) return;
    if (!name.trim()) {
      toast({ title: t("playEditor.nameRequired"), description: t("playEditor.nameRequiredDescription"), variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const payload = { name: name.trim(), category, courtType, situation: situation === "none" ? null : situation, notes: notes.trim() || null, steps: board.steps };
      const res = isEditing
        ? await apiRequest("PUT", `/api/plays/${playId}`, payload)
        : await apiRequest("POST", "/api/plays", payload);
      const saved = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/plays"] });
      queryClient.invalidateQueries({ queryKey: [`/api/plays/${saved.id}`] });
      toast({ title: t("playEditor.saved"), description: t("playEditor.savedDescription", { name: saved.name }) });
      setLocation("/playbook");
    } catch (error) {
      toast({ title: t("playEditor.couldntSave"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportPlayPdf(
        { name: name.trim() || t("playEditor.untitledPlay"), category, courtType, notes },
        board.steps,
      );
    } catch (error) {
      toast({ title: t("playEditor.couldntExportPdf"), description: t("common.tryAgain"), variant: "destructive" });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const toolButtons: { tool: Tool; label: string; icon: typeof MousePointer2 }[] = useMemo(() => [
    { tool: "select", label: t("playEditor.tools.move"), icon: MousePointer2 },
    { tool: "offense", label: t("categories.play.offense"), icon: Circle },
    { tool: "defense", label: t("categories.play.defense"), icon: XIcon },
    { tool: "ball", label: t("playEditor.tools.ball"), icon: BallIcon },
    { tool: "cone", label: t("playEditor.tools.cone"), icon: TrafficCone },
    { tool: "move", label: t("playEditor.tools.moveArrow"), icon: ArrowRight },
    { tool: "pass", label: t("playEditor.tools.pass"), icon: MoveRight },
    { tool: "dribble", label: t("playEditor.tools.dribble"), icon: Waves },
    { tool: "screen", label: t("playEditor.tools.screen"), icon: Shield },
    { tool: "text", label: t("playEditor.tools.text"), icon: Type },
    { tool: "erase", label: t("playEditor.tools.erase"), icon: Eraser },
  ], [t]);

  if (isEditing && isLoading) {
    return <main className="flex items-center justify-center h-full text-muted-foreground">{t("playEditor.loadingPlay")}</main>;
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
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("playEditor.playName")}
            aria-label={t("playEditor.playName")}
            className="max-w-[220px] font-display uppercase tracking-tight"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-36" aria-label={t("playEditor.category")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLAY_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{t(`categories.play.${c}`, c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={courtType} onValueChange={setCourtType}>
            <SelectTrigger className="w-32" aria-label={t("playEditor.court")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {COURT_TYPES.map((c) => (
                <SelectItem key={c} value={c}>{c === "half" ? t("playEditor.halfCourt") : t("playEditor.fullCourt")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={situation} onValueChange={setSituation}>
            <SelectTrigger className="w-44" aria-label={t("playEditor.situation")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("playEditor.noSituation")}</SelectItem>
              {PLAY_SITUATIONS.map((s) => (
                <SelectItem key={s} value={s}>{t(`categories.playSituation.${s}`, s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button
            type="button"
            variant="outline"
            onClick={handleExportPdf}
            disabled={isExportingPdf || board.steps.length === 0}
          >
            {isExportingPdf
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
              : <FileDown className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />}
            {isExportingPdf ? t("playEditor.exportingEllipsis") : t("playEditor.exportPdf")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setLocation("/playbook")}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="basketball-orange basketball-orange-hover text-white"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? t("playEditor.savingEllipsis") : t("playEditor.savePlay")}
          </Button>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("playEditor.explanationPlaceholder")}
          aria-label={t("playEditor.playExplanation")}
          rows={2}
          className="resize-none text-sm"
        />
      </header>

      {/* Tool palette */}
      <div className="bg-card border-b border-border px-4 py-2 flex items-center gap-2 overflow-x-auto">
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
          aria-label={t("playEditor.undo")}
          title={t("playEditor.undo")}
          className="flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          <Undo2 className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={board.redo}
          disabled={!board.canRedo}
          aria-label={t("playEditor.redo")}
          title={t("playEditor.redo")}
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
            aria-label={t("playEditor.colorSwatch", { color: c })}
            aria-pressed={board.color === c}
            className={`flex-shrink-0 w-7 h-7 rounded-full border-2 ${board.color === c ? "border-foreground" : "border-border"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {/* Canvas */}
      <main className="flex-1 overflow-auto p-4 flex items-start justify-center bg-muted/30" tabIndex={0} aria-label={t("playEditor.playCanvas")}>
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
              aria-label={courtType === "full" ? t("playEditor.fullCourtDiagramEditor") : t("playEditor.halfCourtDiagramEditor")}
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
                  aria-label={t("playEditor.annotationText")}
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
          onClick={board.isPlaying ? board.stopPlayback : board.startPlayback}
          disabled={board.steps.length < 2}
          aria-label={board.isPlaying ? t("playEditor.stopPlayback") : t("playEditor.playAnimation")}
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
              {t("playEditor.stepNumber", { number: i + 1 })}
            </button>
            {board.steps.length > 1 && (
              <button
                type="button"
                onClick={() => board.setStepToDelete(i)}
                aria-label={t("playEditor.deleteStep", { number: i + 1 })}
                className="ml-0.5 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-600"
              >
                <Trash2 className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={board.addStep} className="flex-shrink-0">
          <Plus className="w-3.5 h-3.5 mr-1" strokeWidth={2} aria-hidden="true" />
          {t("playEditor.step")}
        </Button>
      </div>

      <ConfirmDialog
        open={board.stepToDelete !== null}
        onOpenChange={(open) => !open && board.setStepToDelete(null)}
        title={t("playEditor.deleteStepConfirmTitle")}
        description={t("playEditor.deleteStepConfirmDescription")}
        onConfirm={board.confirmDeleteStep}
      />
    </div>
  );
}
