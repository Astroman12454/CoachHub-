import { useCallback, useEffect, useRef, useState } from "react";
import { resamplePoints, pathLength } from "@/lib/playDrawing";
import { tokensAtProgress } from "@/lib/playAnimation";
import type { Token, Drawing } from "@shared/schema";

export interface EditorStep {
  tokens: Token[];
  drawings: Drawing[];
}

export type Tool = "select" | "offense" | "defense" | "ball" | "cone" | "move" | "pass" | "dribble" | "screen" | "text" | "erase";

const uid = () => Math.random().toString(36).slice(2, 10);
const HIT_RADIUS = 4.2;
const MIN_SAMPLE_DIST = 1.4; // percent-space distance between recorded drag points
const MAX_DRAWING_POINTS = 16; // cap on points persisted per drawing (drawingSchema allows up to 40)
const MAX_HISTORY = 50;
const TAP_MOVE_THRESHOLD = 0.8; // percent-space; below this, a select-tool press is a tap, not a drag

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
  if (type === "ball" || type === "cone") return "";
  const count = tokens.filter((t) => t.type === type).length;
  return String(count + 1);
}

export function emptyStep(): EditorStep {
  return { tokens: [], drawings: [] };
}

// The interactive canvas/tool/step/undo/playback mechanics behind both
// PlayEditor and ExerciseDiagramEditor — a play and an exercise diagram are
// the same kind of thing (a sequence of court snapshots with drawn arrows),
// so this used to be duplicated between the two editors on purpose, to keep
// PlayEditor's already-tested behavior isolated from a newer, riskier
// feature. Now that curved multi-point arrows, path-following playback,
// undo/redo, and cones all need to land identically in both places, hand-
// keeping two ~600-line copies in sync is the bigger risk — a fix or a bug
// in one would silently not exist in the other. Each editor page keeps only
// what's actually different about it (a play's name/category/notes/PDF
// export vs. an exercise's single court-type select and "remove diagram").
export interface DiagramBoardOptions {
  /** Fired when a token is tapped without being dragged (pointerdown and
   * pointerup landed on the same token with negligible movement between) —
   * lets a caller like PlayEditor offer "assign a real player" on tap
   * without this hook needing to know that concept exists. */
  onTokenTap?: (token: Token) => void;
}

export function useDiagramBoard(courtType: string, options: DiagramBoardOptions = {}) {
  const { onTokenTap } = options;
  const [steps, setSteps] = useState<EditorStep[]>([emptyStep()]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [stepToDelete, setStepToDelete] = useState<number | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);

  const [undoStack, setUndoStack] = useState<EditorStep[][]>([]);
  const [redoStack, setRedoStack] = useState<EditorStep[][]>([]);

  const loadSteps = useCallback((newSteps: EditorStep[]) => {
    setSteps(newSteps.length > 0 ? newSteps : [emptyStep()]);
    setCurrentStepIndex(0);
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const pushHistory = useCallback(() => {
    setUndoStack((u) => [...u, steps].slice(-MAX_HISTORY));
    setRedoStack([]);
  }, [steps]);

  const mutateCurrentStep = useCallback((updater: (step: EditorStep) => EditorStep) => {
    setSteps((prev) => prev.map((s, i) => (i === currentStepIndex ? updater(s) : s)));
  }, [currentStepIndex]);

  const commitCurrentStep = useCallback((updater: (step: EditorStep) => EditorStep) => {
    pushHistory();
    mutateCurrentStep(updater);
  }, [pushHistory, mutateCurrentStep]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, steps]);
    setUndoStack((u) => u.slice(0, -1));
    setSteps(last);
    setCurrentStepIndex((i) => Math.min(i, last.length - 1));
  }, [undoStack, steps]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, steps]);
    setRedoStack((r) => r.slice(0, -1));
    setSteps(next);
    setCurrentStepIndex((i) => Math.min(i, next.length - 1));
  }, [redoStack, steps]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragTokenId = useRef<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const drawPointsRef = useRef<{ x: number; y: number }[] | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number }[] | null>(null);
  const [color, setColor] = useState<string>("#000000");

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

  // --- coordinate math ---
  // Tokens/drawings store x/y as percent-of-width and percent-of-height
  // (both 0-100) so a play/exercise's data doesn't depend on court type. The
  // SVG viewBox itself is 100 wide but 94 (half) or 188 (full) tall, so x
  // maps 1:1 but y needs scaling by viewBoxHeight in both directions.
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

  const hitTestToken = useCallback((x: number, y: number): Token | null => {
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
  }, [currentStep]);

  const hitTestDrawing = useCallback((x: number, y: number): Drawing | null => {
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
  }, [currentStep]);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (isPlaying) return;
    // Without this, the browser's default pointerdown focus-management runs
    // right after this handler and steals focus back from the annotation
    // input we just autoFocus'd in the "text" tool branch below.
    e.preventDefault();
    const p = toSVGPoint(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "select") {
      const hit = hitTestToken(p.x, p.y);
      if (hit) {
        pushHistory();
        dragTokenId.current = hit.id;
        dragStartPos.current = { x: hit.x, y: hit.y };
      }
      return;
    }

    if (tool === "erase") {
      const hitToken = hitTestToken(p.x, p.y);
      if (hitToken) {
        commitCurrentStep((s) => ({ ...s, tokens: s.tokens.filter((t) => t.id !== hitToken.id) }));
        return;
      }
      const hitDrawing = hitTestDrawing(p.x, p.y);
      if (hitDrawing) {
        commitCurrentStep((s) => ({ ...s, drawings: s.drawings.filter((d) => d.id !== hitDrawing.id) }));
      }
      return;
    }

    if (tool === "offense" || tool === "defense" || tool === "ball" || tool === "cone") {
      const token: Token = { id: uid(), type: tool, label: nextLabel(currentStep.tokens, tool), x: p.x, y: p.y };
      commitCurrentStep((s) => ({ ...s, tokens: [...s.tokens, token] }));
      return;
    }

    if (tool === "text") {
      setTextDraft({ x: p.x, y: p.y, value: "" });
      return;
    }

    // Drawing tools: move / pass / dribble / screen — capture a multi-point
    // drag gesture, smoothed into a curve on release (see playDrawing.ts).
    const hit = hitTestToken(p.x, p.y);
    const start = hit ? { x: hit.x, y: hit.y } : p;
    drawPointsRef.current = [start];
    setDrawPreview([start]);
  }, [isPlaying, tool, toSVGPoint, hitTestToken, hitTestDrawing, pushHistory, commitCurrentStep, currentStep]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (isPlaying) return;
    const p = toSVGPoint(e.clientX, e.clientY);
    if (!p) return;

    if (tool === "select" && dragTokenId.current) {
      const id = dragTokenId.current;
      mutateCurrentStep((s) => ({
        ...s,
        tokens: s.tokens.map((t) => (t.id === id ? { ...t, x: p.x, y: p.y } : t)),
      }));
      return;
    }

    if (drawPointsRef.current) {
      const pts = drawPointsRef.current;
      const last = pts[pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= MIN_SAMPLE_DIST) {
        pts.push(p);
      }
      setDrawPreview([...pts, p]);
    }
  }, [isPlaying, tool, toSVGPoint, mutateCurrentStep]);

  const handlePointerUp = useCallback(() => {
    if (isPlaying) return;
    const draggedId = dragTokenId.current;
    const start = dragStartPos.current;
    dragTokenId.current = null;
    dragStartPos.current = null;

    if (draggedId && onTokenTap) {
      const token = currentStep.tokens.find((t) => t.id === draggedId);
      if (token && start && Math.hypot(token.x - start.x, token.y - start.y) < TAP_MOVE_THRESHOLD) {
        onTokenTap(token);
      }
    }

    if (drawPointsRef.current) {
      const raw = [...drawPointsRef.current];
      if (drawPreview && drawPreview.length) {
        const finalP = drawPreview[drawPreview.length - 1];
        const last = raw[raw.length - 1];
        if (Math.hypot(finalP.x - last.x, finalP.y - last.y) > 0.05) raw.push(finalP);
      }
      if (raw.length >= 2 && pathLength(raw) > 2) {
        const points = resamplePoints(raw, MAX_DRAWING_POINTS);
        const drawing: Drawing = { id: uid(), tool: tool as Drawing["tool"], points, color };
        commitCurrentStep((s) => ({ ...s, drawings: [...s.drawings, drawing] }));
      }
    }
    drawPointsRef.current = null;
    setDrawPreview(null);
  }, [isPlaying, drawPreview, tool, color, commitCurrentStep, currentStep, onTokenTap]);

  const commitTextDraft = useCallback(() => {
    if (textDraft && textDraft.value.trim()) {
      const drawing: Drawing = {
        id: uid(),
        tool: "text",
        points: [{ x: textDraft.x, y: textDraft.y }],
        text: textDraft.value.trim().slice(0, 60),
        color,
      };
      commitCurrentStep((s) => ({ ...s, drawings: [...s.drawings, drawing] }));
    }
    setTextDraft(null);
  }, [textDraft, color, commitCurrentStep]);

  const addStep = useCallback(() => {
    pushHistory();
    setSteps((prev) => [...prev, { tokens: currentStep.tokens.map((t) => ({ ...t })), drawings: [] }]);
    setCurrentStepIndex(steps.length);
  }, [pushHistory, currentStep, steps.length]);

  const confirmDeleteStep = useCallback(() => {
    if (stepToDelete === null) return;
    pushHistory();
    setSteps((prev) => prev.filter((_, i) => i !== stepToDelete));
    setCurrentStepIndex((i) => Math.max(0, Math.min(i, steps.length - 2)));
    setStepToDelete(null);
  }, [stepToDelete, pushHistory, steps.length]);

  // A token's id is stable across steps (addStep clones tokens, keeping
  // their id), so relabeling one — e.g. assigning it to a real roster
  // player — updates every step at once instead of leaving the other steps
  // showing a stale label for what's still the same player/marker.
  const assignTokenLabel = useCallback((tokenId: string, label: string) => {
    pushHistory();
    setSteps((prev) => prev.map((s) => ({
      ...s,
      tokens: s.tokens.map((t) => (t.id === tokenId ? { ...t, label } : t)),
    })));
  }, [pushHistory]);

  const displayTokens = playbackTokens ?? currentStep?.tokens ?? [];
  const displayDrawings = isPlaying ? [] : currentStep?.drawings ?? [];

  return {
    steps, loadSteps, currentStepIndex, setCurrentStepIndex, currentStep,
    tool, setTool, color, setColor,
    canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, undo, redo,
    svgRef, drawPreview, textDraft, setTextDraft, commitTextDraft,
    handlePointerDown, handlePointerMove, handlePointerUp,
    isPlaying, startPlayback, stopPlayback, displayTokens, displayDrawings,
    addStep, stepToDelete, setStepToDelete, confirmDeleteStep,
    toViewBoxY, viewBoxHeight, assignTokenLabel,
  };
}
