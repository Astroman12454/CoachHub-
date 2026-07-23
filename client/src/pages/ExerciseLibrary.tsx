import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import ExerciseCard from "@/components/ExerciseCard";
import ExerciseForm from "@/components/ExerciseForm";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import type { Exercise } from "@shared/schema";
import { EXERCISE_CATEGORIES, DIFFICULTY_LEVELS } from "@/lib/types";

export default function ExerciseLibrary() {
  const search = useSearch();
  const initialCategory = new URLSearchParams(search).get("category") ?? "all";

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategory);
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [exerciseToDelete, setExerciseToDelete] = useState<Exercise | null>(null);

  const { data: exercises = [], isLoading } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/exercises",
    errorMessage: "Failed to delete exercise",
  });

  const confirmDeleteExercise = () => {
    if (exerciseToDelete) {
      requestDelete(exerciseToDelete.id, `"${exerciseToDelete.name}" deleted.`);
      setExerciseToDelete(null);
    }
  };

  // Filter exercises; exercises mid-undo-window are hidden immediately
  // rather than waiting on the server.
  const filteredExercises = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return exercises.filter(exercise => {
      if (isPendingDelete(exercise.id)) return false;
      const matchesSearch = exercise.name.toLowerCase().includes(query) ||
                           exercise.description.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "all" || exercise.category === categoryFilter;
      const matchesDifficulty = difficultyFilter === "all" || exercise.difficulty === difficultyFilter;

      return matchesSearch && matchesCategory && matchesDifficulty;
    });
  }, [exercises, searchQuery, categoryFilter, difficultyFilter, isPendingDelete]);

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
            onClick={() => setIsCreateFormOpen(true)}
          >
            <i className="fas fa-plus mr-2"></i>
            Add Exercise
          </Button>
        </div>

        {/* Exercise Grid */}
        {filteredExercises.length === 0 ? (
          <EmptyState
            icon="fas fa-dumbbell"
            title="No Exercises Found"
            description={
              searchQuery || categoryFilter !== "all" || difficultyFilter !== "all"
                ? "No exercises match your current filters."
                : "Get started by adding your first exercise to the library."
            }
            action={!searchQuery && categoryFilter === "all" && difficultyFilter === "all" ? {
              label: "Add First Exercise",
              icon: "fas fa-plus",
              onClick: () => setIsCreateFormOpen(true),
            } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredExercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                onEdit={() => setEditingExercise(exercise)}
                onDelete={() => setExerciseToDelete(exercise)}
              />
            ))}
          </div>
        )}
      </main>

      {isCreateFormOpen && (
        <ExerciseForm
          isOpen={isCreateFormOpen}
          onClose={() => setIsCreateFormOpen(false)}
        />
      )}

      {editingExercise && (
        <ExerciseForm
          isOpen={!!editingExercise}
          onClose={() => setEditingExercise(null)}
          exercise={editingExercise}
        />
      )}

      <ConfirmDialog
        open={!!exerciseToDelete}
        onOpenChange={(open) => !open && setExerciseToDelete(null)}
        title="Delete exercise?"
        description={`This will permanently delete "${exerciseToDelete?.name}". This can't be undone.`}
        onConfirm={confirmDeleteExercise}
      />
    </div>
  );
}
