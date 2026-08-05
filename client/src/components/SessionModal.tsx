import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertTrainingSessionSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
import SessionTimeline from "@/components/SessionTimeline";
import { useSaveMutation } from "@/hooks/use-save-mutation";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { startCheckout } from "@/lib/billing";
import type { Exercise, Play, TrainingSession } from "@shared/schema";
import { CATEGORY_COLORS } from "@/lib/types";

const PLAY_CATEGORY_LABEL: Record<string, string> = {
  offense: "Offense", defense: "Defense", inbound: "Inbound", special: "Special",
};

interface GeneratedSessionPlan {
  name: string;
  notes: string | null;
  duration: number;
  exerciseIds: string[];
}

type SessionFormData = z.infer<typeof insertTrainingSessionSchema>;

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session?: TrainingSession | null;
}

export default function SessionModal({ isOpen, onClose, session }: SessionModalProps) {
  const isEditing = !!session;
  const restoreFocus = useDialogFocusReturn(isOpen);
  const { account } = useAuth();
  const { toast } = useToast();
  const canGeneratePlan = account?.plan === "paid";
  const handleOpenChange = (open: boolean) => {
    if (!open) restoreFocus();
    onClose();
  };

  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  // Fetch exercises for selection
  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  // Tracked by id rather than by Exercise object so the selection doesn't
  // depend on `/api/exercises` having already loaded when this modal opens
  // for editing — otherwise a session's existing exercises would appear
  // (and get saved as) empty if this is the first query to fetch them.
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>(
    () => session?.exerciseIds ?? []
  );
  const [exerciseCategory, setExerciseCategory] = useState<string>("all");

  // Playbook plays this session will practice — same id-tracking rationale
  // as selectedExerciseIds above.
  const { data: plays = [] } = useQuery<Play[]>({ queryKey: ["/api/plays"] });
  const [selectedPlayIds, setSelectedPlayIds] = useState<string[]>(
    () => session?.playIds ?? []
  );
  const togglePlay = (playId: number) => {
    const id = playId.toString();
    setSelectedPlayIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const form = useForm<SessionFormData>({
    resolver: zodResolver(insertTrainingSessionSchema),
    defaultValues: {
      name: session?.name ?? "",
      date: session?.date ?? "",
      time: session?.time ?? "",
      duration: session?.duration ?? 120,
      exerciseIds: session?.exerciseIds ?? [],
      playIds: session?.playIds ?? [],
      notes: session?.notes ?? "",
      attendanceCount: session?.attendanceCount ?? 0,
      totalPlayers: session?.totalPlayers ?? 18,
    },
  });

  // Filter exercises by category
  const filteredExercises = exerciseCategory === "all"
    ? exercises
    : exercises.filter(ex => ex.category === exerciseCategory);

  const saveSessionMutation = useSaveMutation<SessionFormData>({
    endpoint: "/api/training-sessions",
    id: session?.id,
    successMessage: isEditing ? "Training session updated successfully" : "Training session created successfully",
    errorMessage: isEditing ? "Failed to update training session" : "Failed to create training session",
    onSuccess: () => {
      restoreFocus();
      onClose();
      form.reset();
      setSelectedExerciseIds([]);
      setSelectedPlayIds([]);
    },
  });

  const onSubmit = (data: SessionFormData) => {
    if (saveSessionMutation.isPending) return;
    saveSessionMutation.mutate({
      ...data,
      exerciseIds: selectedExerciseIds,
      playIds: selectedPlayIds,
    });
  };

  const handleGeneratePlanClick = () => {
    if (!canGeneratePlan) {
      toast({
        title: "Free plan",
        description: "Upgrade to a paid plan to generate a practice plan with AI.",
        action: (
          <ToastAction altText="Upgrade" onClick={() => startCheckout()}>
            Upgrade
          </ToastAction>
        ),
      });
      return;
    }
    setIsAIPanelOpen(true);
  };

  const generatePlan = async () => {
    if (isGeneratingPlan) return;
    setIsGeneratingPlan(true);
    try {
      const res = await apiRequest("POST", "/api/training-sessions/generate-plan", {
        instructions: aiInstructions.trim() || undefined,
      });
      const plan: GeneratedSessionPlan = await res.json();

      form.setValue("name", plan.name, { shouldDirty: true });
      form.setValue("notes", plan.notes ?? "", { shouldDirty: true });
      form.setValue("duration", plan.duration, { shouldDirty: true });
      setSelectedExerciseIds(plan.exerciseIds);
      setIsAIPanelOpen(false);
      setAiInstructions("");
      toast({ title: "Plan generated", description: "Review the details below, then adjust anything before saving." });
    } catch (error) {
      toast({
        title: "Couldn't generate a plan",
        description: extractErrorMessage(error) ?? "Try again, or build the session by hand.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const addExercise = (exercise: Exercise) => {
    const id = exercise.id.toString();
    setSelectedExerciseIds(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const removeExercise = (exerciseId: number) => {
    const id = exerciseId.toString();
    setSelectedExerciseIds(prev => prev.filter(exId => exId !== id));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 pr-8 sm:pr-0">
            <DialogTitle className="text-xl font-display uppercase tracking-tight">
              {isEditing ? "Edit Training Session" : "Create Training Session"}
            </DialogTitle>
            {!isEditing && !isAIPanelOpen && (
              <Button type="button" variant="outline" size="sm" onClick={handleGeneratePlanClick} className="flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} aria-hidden="true" />
                Generate with AI
                {!canGeneratePlan && <Badge variant="secondary" className="ml-2 text-xs">Paid</Badge>}
              </Button>
            )}
          </div>
          <DialogDescription className="sr-only">
            Set the session's name, date, time and duration, and choose which exercises to include.
          </DialogDescription>
        </DialogHeader>

        {!isEditing && isAIPanelOpen && (
          <div className="border border-basketball-orange/40 bg-basketball-orange/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-basketball-orange flex-shrink-0" strokeWidth={2} aria-hidden="true" />
              <h3 className="font-display uppercase tracking-tight text-sm text-foreground">Generate with AI</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Picks exercises from your own library based on your recent sessions. Optionally, tell it what to focus on:
            </p>
            <Textarea
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder="e.g., Focus on shooting, we have a game Saturday"
              rows={2}
              aria-label="Instructions for the AI-generated plan"
            />
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAIPanelOpen(false)} disabled={isGeneratingPlan}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="basketball-orange basketball-orange-hover text-white"
                onClick={generatePlan}
                disabled={isGeneratingPlan}
              >
                {isGeneratingPlan && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />}
                {isGeneratingPlan ? "Generating..." : "Generate Plan"}
              </Button>
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Session Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Session Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Offensive Fundamentals" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="60">60 minutes</SelectItem>
                        <SelectItem value="90">90 minutes</SelectItem>
                        <SelectItem value="120">120 minutes</SelectItem>
                        <SelectItem value="150">150 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Session objectives, special instructions..." {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Exercise Selection */}
            <div>
              <h3 className="font-display uppercase tracking-tight text-lg text-foreground mb-4">Session Timeline</h3>
              <div className="border border-border rounded-lg p-4 mb-4">
                <SessionTimeline
                  selectedIds={selectedExerciseIds}
                  exercises={exercises}
                  onReorder={setSelectedExerciseIds}
                  onRemove={removeExercise}
                  startTime={form.watch("time")}
                  sessionDuration={form.watch("duration") ?? 0}
                />
              </div>

              <h3 className="font-display uppercase tracking-tight text-lg text-foreground mb-4">Add Exercises</h3>
              <div className="border border-border rounded-lg p-4">
                <div className="flex items-center space-x-4 mb-4">
                  <Select value={exerciseCategory} onValueChange={setExerciseCategory}>
                    <SelectTrigger className="w-48" aria-label="Filter by category">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="shooting">Shooting</SelectItem>
                      <SelectItem value="dribbling">Dribbling</SelectItem>
                      <SelectItem value="defense">Defense</SelectItem>
                      <SelectItem value="passing">Passing</SelectItem>
                      <SelectItem value="conditioning">Conditioning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Available Exercises */}
                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-64 overflow-y-auto"
                  tabIndex={0}
                  role="region"
                  aria-label="Available exercises"
                >
                  {filteredExercises.map(exercise => (
                    <div
                      key={exercise.id}
                      className="border border-border rounded-lg p-3 hover:border-basketball-orange hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => addExercise(exercise)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge
                          variant="secondary"
                          className={CATEGORY_COLORS[exercise.category as keyof typeof CATEGORY_COLORS]}
                        >
                          {exercise.category}
                        </Badge>
                        <span className="text-xs tabular-nums text-muted-foreground">{exercise.duration} min</span>
                      </div>
                      <h4 className="font-medium text-foreground mb-1">{exercise.name}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">{exercise.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Plays to Practice */}
            {plays.length > 0 && (
              <div>
                <h3 className="font-display uppercase tracking-tight text-lg text-foreground mb-4">Plays to Practice</h3>
                <div className="border border-border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Tap a play to mark it as practiced this session — see how often each one comes up on the Playbook page.
                  </p>
                  <div
                    className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto"
                    tabIndex={0}
                    role="region"
                    aria-label="Plays to practice"
                  >
                    {plays.map(play => {
                      const selected = selectedPlayIds.includes(play.id.toString());
                      return (
                        <button
                          type="button"
                          key={play.id}
                          onClick={() => togglePlay(play.id)}
                          aria-pressed={selected}
                          className={`flex items-center justify-between gap-2 border rounded-lg p-3 text-left transition-all ${
                            selected
                              ? "border-basketball-orange bg-basketball-orange/5"
                              : "border-border hover:border-basketball-orange hover:shadow-sm"
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-foreground truncate block">{play.name}</span>
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {PLAY_CATEGORY_LABEL[play.category] ?? play.category}
                            </Badge>
                          </div>
                          {selected && <Check className="w-4 h-4 text-basketball-orange flex-shrink-0" strokeWidth={2.5} aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-border">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="basketball-orange basketball-orange-hover text-white"
                disabled={saveSessionMutation.isPending}
              >
                {saveSessionMutation.isPending
                  ? (isEditing ? "Saving..." : "Creating...")
                  : (isEditing ? "Save Changes" : "Create Session")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
