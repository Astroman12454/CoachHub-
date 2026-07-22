import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertTrainingSessionSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useSaveMutation } from "@/hooks/use-save-mutation";
import type { Exercise, TrainingSession } from "@shared/schema";
import { CATEGORY_COLORS } from "@/lib/types";

const sessionFormSchema = insertTrainingSessionSchema.extend({
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
});

type SessionFormData = z.infer<typeof sessionFormSchema>;

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session?: TrainingSession | null;
}

export default function SessionModal({ isOpen, onClose, session }: SessionModalProps) {
  const isEditing = !!session;

  // Fetch exercises for selection
  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  const initialExerciseIds = session?.exerciseIds ?? [];
  const [selectedExercises, setSelectedExercises] = useState<Exercise[]>(() =>
    exercises.filter(ex => initialExerciseIds.includes(ex.id.toString()))
  );
  const [exerciseCategory, setExerciseCategory] = useState<string>("all");

  const form = useForm<SessionFormData>({
    resolver: zodResolver(sessionFormSchema),
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
      onClose();
      form.reset();
      setSelectedExercises([]);
    },
  });

  const onSubmit = (data: SessionFormData) => {
    saveSessionMutation.mutate({
      ...data,
      exerciseIds: selectedExercises.map(ex => ex.id.toString()),
    });
  };

  const addExercise = (exercise: Exercise) => {
    if (!selectedExercises.find(ex => ex.id === exercise.id)) {
      setSelectedExercises(prev => [...prev, exercise]);
    }
  };

  const removeExercise = (exerciseId: number) => {
    setSelectedExercises(prev => prev.filter(ex => ex.id !== exerciseId));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? "Edit Training Session" : "Create Training Session"}
          </DialogTitle>
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
                    <FormControl>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="60">60 minutes</SelectItem>
                          <SelectItem value="90">90 minutes</SelectItem>
                          <SelectItem value="120">120 minutes</SelectItem>
                          <SelectItem value="150">150 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
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
              <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Add Exercises</h4>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center space-x-4 mb-4">
                  <Select value={exerciseCategory} onValueChange={setExerciseCategory}>
                    <SelectTrigger className="w-48">
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
                    <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Selected Exercises:</h5>
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
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            aria-label={`Remove ${exercise.name}`}
                          >
                            <i className="fas fa-times text-xs" aria-hidden="true"></i>
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Available Exercises */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-64 overflow-y-auto">
                  {filteredExercises.map(exercise => (
                    <div
                      key={exercise.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => addExercise(exercise)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge
                          variant="secondary"
                          className={CATEGORY_COLORS[exercise.category as keyof typeof CATEGORY_COLORS]}
                        >
                          {exercise.category}
                        </Badge>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{exercise.duration} min</span>
                      </div>
                      <h6 className="font-medium text-gray-900 dark:text-gray-100 mb-1">{exercise.name}</h6>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{exercise.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="outline" onClick={onClose}>
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
