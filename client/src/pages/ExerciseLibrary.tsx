import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import ExerciseCard from "@/components/ExerciseCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { insertExerciseSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import type { Exercise } from "@shared/schema";
import { EXERCISE_CATEGORIES, DIFFICULTY_LEVELS } from "@/lib/types";

const exerciseFormSchema = insertExerciseSchema.extend({
  name: z.string().min(1, "Exercise name is required"),
  description: z.string().min(1, "Description is required"),
  duration: z.number().min(1, "Duration must be at least 1 minute"),
});

type ExerciseFormData = z.infer<typeof exerciseFormSchema>;

export default function ExerciseLibrary() {
  const search = useSearch();
  const initialCategory = new URLSearchParams(search).get("category") ?? "all";

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategory);
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const isEditing = !!editingExercise;

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: exercises = [], isLoading } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  const emptyFormValues: ExerciseFormData = {
    name: "",
    description: "",
    category: "shooting",
    duration: 15,
    difficulty: "medium",
    instructions: "",
    imageUrl: "",
  };

  const form = useForm<ExerciseFormData>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: emptyFormValues,
  });

  const openCreateForm = () => {
    setEditingExercise(null);
    form.reset(emptyFormValues);
    setIsFormOpen(true);
  };

  const openEditForm = (exercise: Exercise) => {
    setEditingExercise(exercise);
    form.reset({
      name: exercise.name,
      description: exercise.description,
      category: exercise.category,
      duration: exercise.duration,
      difficulty: exercise.difficulty,
      instructions: exercise.instructions ?? "",
      imageUrl: exercise.imageUrl ?? "",
    });
    setIsFormOpen(true);
  };

  const saveExerciseMutation = useMutation({
    mutationFn: async (data: ExerciseFormData) => {
      return isEditing
        ? apiRequest("PUT", `/api/exercises/${editingExercise.id}`, data)
        : apiRequest("POST", "/api/exercises", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exercises'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Success",
        description: isEditing ? "Exercise updated successfully" : "Exercise created successfully",
      });
      setIsFormOpen(false);
      form.reset(emptyFormValues);
    },
    onError: () => {
      toast({
        title: "Error",
        description: isEditing ? "Failed to update exercise" : "Failed to create exercise",
        variant: "destructive",
      });
    },
  });

  const deleteExerciseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/exercises/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exercises'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Success",
        description: "Exercise deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete exercise",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ExerciseFormData) => {
    saveExerciseMutation.mutate(data);
  };

  const handleDeleteExercise = (id: number) => {
    if (confirm("Are you sure you want to delete this exercise?")) {
      deleteExerciseMutation.mutate(id);
    }
  };

  // Filter exercises
  const filteredExercises = exercises.filter(exercise => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         exercise.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || exercise.category === categoryFilter;
    const matchesDifficulty = difficultyFilter === "all" || exercise.difficulty === difficultyFilter;
    
    return matchesSearch && matchesCategory && matchesDifficulty;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar 
          title="Exercise Library" 
          subtitle="Browse and manage your basketball training exercises"
          onSearch={setSearchQuery}
          searchPlaceholder="Search exercises..."
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-80" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar 
        title="Exercise Library" 
        subtitle="Browse and manage your basketball training exercises"
        onSearch={setSearchQuery}
        searchPlaceholder="Search exercises..."
      />
      
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {/* Filters and Add Button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {EXERCISE_CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulties</SelectItem>
                {DIFFICULTY_LEVELS.map(difficulty => (
                  <SelectItem key={difficulty} value={difficulty}>
                    {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="basketball-orange basketball-orange-hover text-white w-full sm:w-auto"
            onClick={openCreateForm}
          >
            <i className="fas fa-plus mr-2"></i>
            Add Exercise
          </Button>

          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Exercise" : "Create New Exercise"}</DialogTitle>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exercise Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Free Throw Form Drill" {...field} />
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
                            <Input 
                              type="number" 
                              min="1"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                              <SelectContent>
                                {EXERCISE_CATEGORIES.map(category => (
                                  <SelectItem key={category} value={category}>
                                    {category.charAt(0).toUpperCase() + category.slice(1)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="difficulty"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Difficulty</FormLabel>
                          <FormControl>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select difficulty" />
                              </SelectTrigger>
                              <SelectContent>
                                {DIFFICULTY_LEVELS.map(difficulty => (
                                  <SelectItem key={difficulty} value={difficulty}>
                                    {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Brief description of the exercise..."
                            className="min-h-20"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="instructions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Instructions (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Detailed instructions for the exercise..."
                            className="min-h-32"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="imageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Image URL (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="https://example.com/image.jpg"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsFormOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="basketball-orange basketball-orange-hover text-white"
                      disabled={saveExerciseMutation.isPending}
                    >
                      {saveExerciseMutation.isPending
                        ? (isEditing ? "Saving..." : "Creating...")
                        : (isEditing ? "Save Changes" : "Create Exercise")}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Exercise Grid */}
        {filteredExercises.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-dumbbell text-gray-400 text-3xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Exercises Found</h3>
              <p className="text-gray-600 mb-6">
                {searchQuery || categoryFilter !== "all" || difficultyFilter !== "all"
                  ? "No exercises match your current filters."
                  : "Get started by adding your first exercise to the library."
                }
              </p>
              {!searchQuery && categoryFilter === "all" && difficultyFilter === "all" && (
                <Button
                  className="basketball-orange basketball-orange-hover text-white"
                  onClick={openCreateForm}
                >
                  <i className="fas fa-plus mr-2"></i>
                  Add First Exercise
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredExercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                onEdit={() => openEditForm(exercise)}
                onDelete={() => handleDeleteExercise(exercise.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
