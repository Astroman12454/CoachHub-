import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, Check, BookmarkPlus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { insertTrainingSessionSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
import SessionTimeline from "@/components/SessionTimeline";
import { useSaveMutation } from "@/hooks/use-save-mutation";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { startCheckout } from "@/lib/billing";
import type { Exercise, Play, TrainingSession, SessionTemplate } from "@shared/schema";
import { canGenerateAiSessionPlan } from "@shared/entitlements";
import { CATEGORY_COLORS } from "@/lib/types";

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
  const { t } = useTranslation();
  const isEditing = !!session;
  const restoreFocus = useDialogFocusReturn(isOpen);
  const { account } = useAuth();
  const { toast } = useToast();
  const canGeneratePlan = canGenerateAiSessionPlan(account?.plan ?? "free");
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

  const queryClient = useQueryClient();
  const { data: templates = [] } = useQuery<SessionTemplate[]>({ queryKey: ["/api/session-templates"] });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id.toString() === templateId);
    if (!template) return;
    form.setValue("name", template.name, { shouldDirty: true });
    form.setValue("duration", template.duration, { shouldDirty: true });
    form.setValue("notes", template.notes ?? "", { shouldDirty: true });
    setSelectedExerciseIds(template.exerciseIds ?? []);
    setSelectedPlayIds(template.playIds ?? []);
  };

  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/session-templates", {
        name,
        duration: form.getValues("duration"),
        exerciseIds: selectedExerciseIds,
        playIds: selectedPlayIds,
        notes: form.getValues("notes") || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session-templates"] });
      setIsSaveTemplateOpen(false);
      setTemplateName("");
      toast({ title: t("sessionModal.templateSaved"), description: t("sessionModal.templateSavedDescription") });
    },
    onError: (error) => {
      toast({ title: t("sessionModal.couldntSaveTemplate"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/session-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session-templates"] });
      setSelectedTemplateId("");
      toast({ title: t("sessionModal.templateDeleted") });
    },
    onError: (error) => {
      toast({ title: t("sessionModal.couldntDeleteTemplate"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

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
    successMessage: isEditing ? t("sessionModal.updatedSuccessfully") : t("sessionModal.createdSuccessfully"),
    errorMessage: isEditing ? t("sessionModal.failedToUpdate") : t("sessionModal.failedToCreate"),
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
        title: t("sessionModal.freePlan"),
        description: t("sessionModal.upgradeToGenerate"),
        action: (
          <ToastAction altText={t("sessionModal.upgrade")} onClick={() => startCheckout()}>
            {t("sessionModal.upgrade")}
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
      toast({ title: t("sessionModal.planGenerated"), description: t("sessionModal.planGeneratedDescription") });
    } catch (error) {
      toast({
        title: t("sessionModal.couldntGeneratePlan"),
        description: extractErrorMessage(error) ?? t("sessionModal.tryAgainOrBuildByHand"),
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
              {isEditing ? t("sessionModal.editTitle") : t("sessionModal.createTitle")}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsSaveTemplateOpen(true)}>
                <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} aria-hidden="true" />
                {t("sessionModal.saveAsTemplate")}
              </Button>
              {!isEditing && !isAIPanelOpen && (
                <Button type="button" variant="outline" size="sm" onClick={handleGeneratePlanClick}>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} aria-hidden="true" />
                  {t("sessionModal.generateWithAi")}
                  {!canGeneratePlan && <Badge variant="secondary" className="ml-2 text-xs">{t("sessionModal.paid")}</Badge>}
                </Button>
              )}
            </div>
          </div>
          <DialogDescription className="sr-only">
            {t("sessionModal.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {!isEditing && isAIPanelOpen && (
          <div className="border border-basketball-orange/40 bg-basketball-orange/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-basketball-orange flex-shrink-0" strokeWidth={2} aria-hidden="true" />
              <h3 className="font-display uppercase tracking-tight text-sm text-foreground">{t("sessionModal.generateWithAi")}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("sessionModal.aiPanelDescription")}
            </p>
            <Textarea
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder={t("sessionModal.aiPanelPlaceholder")}
              rows={2}
              aria-label={t("sessionModal.aiPanelAriaLabel")}
            />
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAIPanelOpen(false)} disabled={isGeneratingPlan}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="basketball-orange basketball-orange-hover text-white"
                onClick={generatePlan}
                disabled={isGeneratingPlan}
              >
                {isGeneratingPlan && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />}
                {isGeneratingPlan ? t("sessionModal.generating") : t("sessionModal.generatePlan")}
              </Button>
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {!isEditing && templates.length > 0 && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="template-select" className="text-sm font-medium text-foreground mb-2 block">
                    {t("sessionModal.startFromTemplate")}
                  </label>
                  <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                    <SelectTrigger id="template-select" aria-label={t("sessionModal.startFromTemplate")}>
                      <SelectValue placeholder={t("sessionModal.chooseTemplatePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedTemplateId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("sessionModal.deleteTemplate")}
                    onClick={() => deleteTemplateMutation.mutate(parseInt(selectedTemplateId))}
                    disabled={deleteTemplateMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}

            {/* Session Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sessionModal.sessionName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("sessionModal.sessionNamePlaceholder")} {...field} />
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
                    <FormLabel>{t("sessionModal.durationMinutes")}</FormLabel>
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("sessionModal.selectDuration")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="60">{t("sessionModal.minutesOption", { count: 60 })}</SelectItem>
                        <SelectItem value="90">{t("sessionModal.minutesOption", { count: 90 })}</SelectItem>
                        <SelectItem value="120">{t("sessionModal.minutesOption", { count: 120 })}</SelectItem>
                        <SelectItem value="150">{t("sessionModal.minutesOption", { count: 150 })}</SelectItem>
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
                    <FormLabel>{t("sessionModal.date")}</FormLabel>
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
                    <FormLabel>{t("sessionModal.time")}</FormLabel>
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
                  <FormLabel>{t("sessionModal.notesOptional")}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t("sessionModal.notesPlaceholder")} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Exercise Selection */}
            <div>
              <h3 className="font-display uppercase tracking-tight text-lg text-foreground mb-4">{t("sessionModal.sessionTimeline")}</h3>
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

              <h3 className="font-display uppercase tracking-tight text-lg text-foreground mb-4">{t("sessionModal.addExercises")}</h3>
              <div className="border border-border rounded-lg p-4">
                <div className="flex items-center space-x-4 mb-4">
                  <Select value={exerciseCategory} onValueChange={setExerciseCategory}>
                    <SelectTrigger className="w-48" aria-label={t("sessionModal.filterByCategory")}>
                      <SelectValue placeholder={t("sessionModal.filterByCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("sessionModal.allCategories")}</SelectItem>
                      <SelectItem value="shooting">{t("categories.exercise.shooting")}</SelectItem>
                      <SelectItem value="dribbling">{t("categories.exercise.dribbling")}</SelectItem>
                      <SelectItem value="defense">{t("categories.exercise.defense")}</SelectItem>
                      <SelectItem value="passing">{t("categories.exercise.passing")}</SelectItem>
                      <SelectItem value="conditioning">{t("categories.exercise.conditioning")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Available Exercises */}
                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-64 overflow-y-auto"
                  tabIndex={0}
                  role="region"
                  aria-label={t("sessionModal.availableExercises")}
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
                          {t(`categories.exercise.${exercise.category}`, exercise.category)}
                        </Badge>
                        <span className="text-xs tabular-nums text-muted-foreground">{t("sessionModal.minAbbrev", { count: exercise.duration })}</span>
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
                <h3 className="font-display uppercase tracking-tight text-lg text-foreground mb-4">{t("sessionModal.playsToPractice")}</h3>
                <div className="border border-border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    {t("sessionModal.playsToPracticeDescription")}
                  </p>
                  <div
                    className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto"
                    tabIndex={0}
                    role="region"
                    aria-label={t("sessionModal.playsToPracticeAriaLabel")}
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
                              {t(`categories.play.${play.category}`, play.category)}
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
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="basketball-orange basketball-orange-hover text-white"
                disabled={saveSessionMutation.isPending}
              >
                {saveSessionMutation.isPending
                  ? (isEditing ? t("common.saving") : t("common.creating"))
                  : (isEditing ? t("sessionModal.saveChanges") : t("sessionModal.createSession"))}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      <Dialog open={isSaveTemplateOpen} onOpenChange={setIsSaveTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sessionModal.saveAsTemplate")}</DialogTitle>
            <DialogDescription>
              {t("sessionModal.saveTemplateDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (templateName.trim()) saveTemplateMutation.mutate(templateName.trim());
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="template-name" className="text-sm font-medium text-foreground mb-2 block">
                {t("sessionModal.templateName")}
              </label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t("sessionModal.templateNamePlaceholder")}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSaveTemplateOpen(false)}
                disabled={saveTemplateMutation.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="basketball-orange basketball-orange-hover text-white"
                disabled={!templateName.trim() || saveTemplateMutation.isPending}
              >
                {saveTemplateMutation.isPending ? t("common.saving") : t("sessionModal.saveTemplate")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
