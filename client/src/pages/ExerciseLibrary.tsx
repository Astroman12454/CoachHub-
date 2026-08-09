import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Dumbbell } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import ExerciseCard from "@/components/ExerciseCard";
import ExerciseForm from "@/components/ExerciseForm";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { startCheckout } from "@/lib/billing";
import type { Exercise } from "@shared/schema";
import { canUseCustomExercises } from "@shared/entitlements";
import { EXERCISE_CATEGORIES, DIFFICULTY_LEVELS } from "@/lib/types";

export default function ExerciseLibrary() {
  const { t } = useTranslation();
  const search = useSearch();
  const initialCategory = new URLSearchParams(search).get("category") ?? "all";
  const { account } = useAuth();
  const { toast } = useToast();
  const canEditExercises = canUseCustomExercises(account?.plan ?? "free");

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategory);
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [exerciseToDelete, setExerciseToDelete] = useState<Exercise | null>(null);

  const { data: exercises = [], isLoading, isError, refetch } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/exercises",
    errorMessage: t("exerciseLibrary.failedToDelete"),
  });

  const confirmDeleteExercise = () => {
    if (exerciseToDelete) {
      requestDelete(exerciseToDelete.id, t("exerciseLibrary.deletedToast", { name: exerciseToDelete.name }));
      setExerciseToDelete(null);
    }
  };

  const handleAddExerciseClick = () => {
    if (!canEditExercises) {
      toast({
        title: t("sessionModal.freePlan"),
        description: t("exerciseLibrary.upgradeToCreate"),
        action: (
          <ToastAction altText={t("sessionModal.upgrade")} onClick={() => startCheckout()}>
            {t("sessionModal.upgrade")}
          </ToastAction>
        ),
      });
      return;
    }
    setIsCreateFormOpen(true);
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
          title={t("nav.exerciseLibrary")}
          subtitle={t("exerciseLibrary.subtitle")}
          onSearch={setSearchQuery}
          searchPlaceholder={t("exerciseLibrary.searchPlaceholder")}
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

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <TopBar
          title={t("nav.exerciseLibrary")}
          subtitle={t("exerciseLibrary.subtitle")}
          onSearch={setSearchQuery}
          searchPlaceholder={t("exerciseLibrary.searchPlaceholder")}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState onRetry={() => refetch()} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={t("nav.exerciseLibrary")}
        subtitle={t("exerciseLibrary.subtitle")}
        onSearch={setSearchQuery}
        searchPlaceholder={t("exerciseLibrary.searchPlaceholder")}
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {/* Filters and Add Button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("sessionModal.filterByCategory")}>
                <SelectValue placeholder={t("sessionModal.filterByCategory")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sessionModal.allCategories")}</SelectItem>
                {EXERCISE_CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>
                    {t(`categories.exercise.${category}`, category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("exerciseLibrary.filterByDifficulty")}>
                <SelectValue placeholder={t("exerciseLibrary.filterByDifficulty")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("exerciseLibrary.allDifficulties")}</SelectItem>
                {DIFFICULTY_LEVELS.map(difficulty => (
                  <SelectItem key={difficulty} value={difficulty}>
                    {t(`categories.difficulty.${difficulty}`, difficulty)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="basketball-orange basketball-orange-hover text-white w-full sm:w-auto"
            onClick={handleAddExerciseClick}
          >
            <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
            {t("exerciseLibrary.addExercise")}
          </Button>
        </div>

        {/* Exercise Grid */}
        {filteredExercises.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={t("exerciseLibrary.emptyTitle")}
            description={
              searchQuery || categoryFilter !== "all" || difficultyFilter !== "all"
                ? t("exerciseLibrary.emptyFilterDescription")
                : t("exerciseLibrary.emptyDescription")
            }
            action={!searchQuery && categoryFilter === "all" && difficultyFilter === "all" ? {
              label: t("exerciseLibrary.addFirstExercise"),
              icon: Plus,
              onClick: handleAddExerciseClick,
            } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExercises.map((exercise, index) => (
              <div key={exercise.id} className="fade-in" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                <ExerciseCard
                  exercise={exercise}
                  onEdit={canEditExercises ? () => setEditingExercise(exercise) : undefined}
                  onDelete={canEditExercises ? () => setExerciseToDelete(exercise) : undefined}
                />
              </div>
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
        title={t("exerciseLibrary.deleteConfirmTitle")}
        description={t("exerciseLibrary.deleteConfirmDescription", { name: exerciseToDelete?.name })}
        onConfirm={confirmDeleteExercise}
      />
    </div>
  );
}
