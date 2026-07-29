import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
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
import { useSaveMutation } from "@/hooks/use-save-mutation";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import type { Exercise, TrainingSession } from "@shared/schema";
import { CATEGORY_COLORS } from "@/lib/types";

type SessionFormData = z.infer<typeof insertTrainingSessionSchema>;

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session?: TrainingSession | null;
}

export default function SessionModal({ isOpen, onClose, session }: SessionModalProps) {
  const isEditing = !!session;
  const restoreFocus = useDialogFocusReturn(isOpen);
  const handleOpenChange = (open: boolean) => {
    if (!open) restoreFocus();
    onClose();
  };

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
  const selectedExercises = exercises.filter(ex => selectedExerciseIds.includes(ex.id.toString()));
  const [exerciseCategory, setExerciseCategory] = useState<string>("all");

  const form = useForm<SessionFormData>({
    resolver: zodResolver(insertTrainingSessionSchema),
    defaultValues: {
      name: session?.name ?? "",
      date: session?.date ?? "",
      time: session?.time ?? "",
      duration: session?.duration ?? 120,
      exerciseIds: session?.exerciseIds ?? [],
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
    },
  });

  const onSubmit = (data: SessionFormData) => {
    if (saveSessionMutation.isPending) return;
    saveSessionMutation.mutate({
      ...data,
      exerciseIds: selectedExerciseIds,
    });
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
          <DialogTitle className="text-xl font-display uppercase tracking-tight">
            {isEditing ? "Edit Training Session" : "Create Training Session"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Set the session's name, date, time and duration, and choose which exercises to include.
          </DialogDescription>
        </DialogHeader>
        
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

                {/* Selected Exercises */}
                {selectedExercises.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-foreground mb-2">Selected Exercises:</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedExercises.map(exercise => (
                        <Badge
                          key={exercise.id}
                          variant="secondary"
                          className="flex items-center gap-2"
                        >
                          {exercise.name}
                          <button
                            type="button"
                            onClick={() => removeExercise(exercise.id)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Remove ${exercise.name}`}
                          >
                            <X className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

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
