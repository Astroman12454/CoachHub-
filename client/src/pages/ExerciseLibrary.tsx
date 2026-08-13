import { useMemo, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Dumbbell, Star, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import ExerciseCard from "@/components/ExerciseCard";
import ExerciseForm from "@/components/ExerciseForm";
import ExerciseShareDialog from "@/components/ExerciseShareDialog";
import SetPublicNameDialog from "@/components/SetPublicNameDialog";
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
import { apiRequest, extractErrorMessage, extractErrorCode } from "@/lib/queryClient";
import { startCheckout } from "@/lib/billing";
import { EXERCISE_PHASES } from "@shared/schema";
import type { Exercise } from "@shared/schema";
import { canUseCustomExercises } from "@shared/entitlements";
import { EXERCISE_CATEGORIES, DIFFICULTY_LEVELS } from "@/lib/types";
import { localizedExerciseText } from "@/lib/exerciseI18n";

type ExerciseUsageStats = Record<string, { count: number; lastUsedDate: string | null }>;

export default function ExerciseLibrary() {
  const { t, i18n } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const initialCategory = new URLSearchParams(search).get("category") ?? "all";
  const { account } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEditExercises = canUseCustomExercises(account?.plan ?? "free");

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategory);
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [durationFilter, setDurationFilter] = useState<"all" | "short" | "medium" | "long">("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"default" | "recentlyUsed">("default");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [duplicatingExercise, setDuplicatingExercise] = useState<Exercise | null>(null);
  const [sharingExercise, setSharingExercise] = useState<Exercise | null>(null);
  const [exerciseToDelete, setExerciseToDelete] = useState<Exercise | null>(null);
  // Set while a publish attempt is waiting on the coach to choose a public
  // name for the first time — retried automatically once they save one.
  const [pendingPublishId, setPendingPublishId] = useState<number | null>(null);

  const { data: exercises = [], isLoading, isError, refetch } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  const { data: usageStats = {} } = useQuery<ExerciseUsageStats>({
    queryKey: ['/api/exercises/usage-stats'],
  });

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/exercises",
    errorMessage: t("exerciseLibrary.failedToDelete"),
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: number; isFavorite: boolean }) =>
      apiRequest("PUT", `/api/exercises/${id}/favorite`, { isFavorite }),
    // Flips the star immediately — the same instant-feedback pattern as
    // Players' active/inactive toggle.
    onMutate: async ({ id, isFavorite }) => {
      const queryKey = ['/api/exercises'];
      await queryClient.cancelQueries({ queryKey });
      const previousExercises = queryClient.getQueryData<Exercise[]>(queryKey);

      queryClient.setQueryData<Exercise[]>(queryKey, (old = []) =>
        old.map(ex => ex.id === id ? { ...ex, isFavorite: isFavorite ? 1 : 0 } : ex)
      );

      return { previousExercises, queryKey };
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousExercises);
      }
      toast({
        title: t("exerciseLibrary.couldntUpdateFavorite"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const toggleCommunityShareMutation = useMutation({
    mutationFn: async ({ id, shared }: { id: number; shared: boolean }) =>
      apiRequest("PUT", `/api/exercises/${id}/share-community`, { shared }),
    onMutate: async ({ id, shared }) => {
      const queryKey = ['/api/exercises'];
      await queryClient.cancelQueries({ queryKey });
      const previousExercises = queryClient.getQueryData<Exercise[]>(queryKey);

      queryClient.setQueryData<Exercise[]>(queryKey, (old = []) =>
        old.map(ex => ex.id === id ? { ...ex, sharedToCommunity: shared ? 1 : 0 } : ex)
      );

      return { previousExercises, queryKey };
    },
    onError: (error, variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousExercises);
      }
      if (extractErrorCode(error) === "PUBLIC_NAME_REQUIRED") {
        setPendingPublishId(variables.id);
        return;
      }
      toast({
        title: t("exerciseLibrary.couldntUpdateCommunityShare"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
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

  const handleDuplicateClick = (exercise: Exercise) => {
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
    setDuplicatingExercise(exercise);
  };

  // Filter (and optionally sort) exercises; exercises mid-undo-window are
  // hidden immediately rather than waiting on the server.
  const filteredExercises = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = exercises.filter(exercise => {
      if (isPendingDelete(exercise.id)) return false;
      const localized = localizedExerciseText(exercise, i18n.language);
      const matchesSearch = localized.name.toLowerCase().includes(query) ||
                           localized.description.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "all" || exercise.category === categoryFilter;
      const matchesDifficulty = difficultyFilter === "all" || exercise.difficulty === difficultyFilter;
      const matchesDuration = durationFilter === "all" ||
        (durationFilter === "short" && exercise.duration < 15) ||
        (durationFilter === "medium" && exercise.duration >= 15 && exercise.duration <= 30) ||
        (durationFilter === "long" && exercise.duration > 30);
      const matchesPhase = phaseFilter === "all" || exercise.phase === phaseFilter;
      const matchesFavorite = !favoritesOnly || exercise.isFavorite === 1;

      return matchesSearch && matchesCategory && matchesDifficulty && matchesDuration && matchesPhase && matchesFavorite;
    });

    if (sortBy === "recentlyUsed") {
      return [...filtered].sort((a, b) => {
        const dateA = usageStats[a.id.toString()]?.lastUsedDate;
        const dateB = usageStats[b.id.toString()]?.lastUsedDate;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB.localeCompare(dateA);
      });
    }
    return filtered;
  }, [exercises, searchQuery, categoryFilter, difficultyFilter, durationFilter, phaseFilter, favoritesOnly, sortBy, usageStats, isPendingDelete, i18n.language]);

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

            <Select value={durationFilter} onValueChange={(v) => setDurationFilter(v as "all" | "short" | "medium" | "long")}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("exerciseLibrary.filterByDuration")}>
                <SelectValue placeholder={t("exerciseLibrary.filterByDuration")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("exerciseLibrary.allDurations")}</SelectItem>
                <SelectItem value="short">{t("exerciseLibrary.durationShort")}</SelectItem>
                <SelectItem value="medium">{t("exerciseLibrary.durationMedium")}</SelectItem>
                <SelectItem value="long">{t("exerciseLibrary.durationLong")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={phaseFilter} onValueChange={setPhaseFilter}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("exerciseLibrary.filterByPhase")}>
                <SelectValue placeholder={t("exerciseLibrary.filterByPhase")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("exerciseLibrary.allPhases")}</SelectItem>
                {EXERCISE_PHASES.map(phase => (
                  <SelectItem key={phase} value={phase}>
                    {t(`categories.phase.${phase}`, phase)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "default" | "recentlyUsed")}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("exerciseLibrary.sortBy")}>
                <SelectValue placeholder={t("exerciseLibrary.sortBy")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t("exerciseLibrary.sortDefault")}</SelectItem>
                <SelectItem value="recentlyUsed">{t("exerciseLibrary.sortRecentlyUsed")}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((prev) => !prev)}
              className={favoritesOnly ? "border-basketball-orange text-basketball-orange bg-basketball-orange/5" : ""}
            >
              <Star className={`w-4 h-4 mr-1.5 ${favoritesOnly ? "fill-basketball-orange" : ""}`} strokeWidth={1.75} aria-hidden="true" />
              {t("exerciseLibrary.favoritesOnly")}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setLocation("/exercise-library/community")}
            >
              <Globe className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
              {t("exerciseLibrary.community")}
            </Button>
            <Button
              className="basketball-orange basketball-orange-hover text-white w-full sm:w-auto"
              onClick={handleAddExerciseClick}
            >
              <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
              {t("exerciseLibrary.addExercise")}
            </Button>
          </div>
        </div>

        {/* Exercise Grid */}
        {filteredExercises.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={t("exerciseLibrary.emptyTitle")}
            description={
              searchQuery || categoryFilter !== "all" || difficultyFilter !== "all" || durationFilter !== "all" || phaseFilter !== "all" || favoritesOnly
                ? t("exerciseLibrary.emptyFilterDescription")
                : t("exerciseLibrary.emptyDescription")
            }
            action={!searchQuery && categoryFilter === "all" && difficultyFilter === "all" && durationFilter === "all" && phaseFilter === "all" && !favoritesOnly ? {
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
                  onToggleFavorite={() => toggleFavoriteMutation.mutate({ id: exercise.id, isFavorite: exercise.isFavorite !== 1 })}
                  onDuplicate={() => handleDuplicateClick(exercise)}
                  onShare={() => setSharingExercise(exercise)}
                  onToggleCommunityShare={() => toggleCommunityShareMutation.mutate({ id: exercise.id, shared: exercise.sharedToCommunity !== 1 })}
                  onOpenDiagram={canEditExercises ? () => setLocation(`/exercise-library/${exercise.id}/diagram`) : undefined}
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

      {duplicatingExercise && (
        <ExerciseForm
          isOpen={!!duplicatingExercise}
          onClose={() => setDuplicatingExercise(null)}
          duplicateFrom={duplicatingExercise}
        />
      )}

      <ExerciseShareDialog
        exercise={sharingExercise}
        onOpenChange={(open) => !open && setSharingExercise(null)}
      />

      <ConfirmDialog
        open={!!exerciseToDelete}
        onOpenChange={(open) => !open && setExerciseToDelete(null)}
        title={t("exerciseLibrary.deleteConfirmTitle")}
        description={t("exerciseLibrary.deleteConfirmDescription", { name: exerciseToDelete?.name })}
        onConfirm={confirmDeleteExercise}
      />

      <SetPublicNameDialog
        open={pendingPublishId !== null}
        onOpenChange={(open) => !open && setPendingPublishId(null)}
        onSuccess={() => {
          if (pendingPublishId !== null) {
            toggleCommunityShareMutation.mutate({ id: pendingPublishId, shared: true });
          }
          setPendingPublishId(null);
        }}
      />
    </div>
  );
}
