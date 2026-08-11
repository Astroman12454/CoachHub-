import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Download, Globe, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { startCheckout } from "@/lib/billing";
import { canUseCustomExercises } from "@shared/entitlements";
import { CATEGORY_COLORS, CATEGORY_SOLID_COLORS, DIFFICULTY_COLORS, CATEGORY_ICONS, EXERCISE_CATEGORIES, DIFFICULTY_LEVELS } from "@/lib/types";
import { localizedExerciseText } from "@/lib/exerciseI18n";

interface CommunityExercise {
  id: number;
  name: string;
  description: string;
  category: string;
  duration: number;
  difficulty: string;
  instructions: string | null;
  imageUrl: string | null;
  minPlayers: number | null;
  nameEs: string | null;
  descriptionEs: string | null;
  instructionsEs: string | null;
}

// Browsing surface for exercises other coaches have opted into the
// cross-account community library (see PUT /api/exercises/:id/share-community
// and ExerciseCard's Globe toggle). Read-only besides the "Import" action,
// which copies a drill into the current account's own library — everything
// else (favoriting, editing, sharing) happens back on the normal library
// page once it's imported.
export default function CommunityExercises() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { account } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canImport = canUseCustomExercises(account?.plan ?? "free");

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");

  const { data: exercises = [], isLoading, isError, refetch } = useQuery<CommunityExercise[]>({
    queryKey: ['/api/community-exercises'],
  });

  const importMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/community-exercises/${id}/import`),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/exercises'] });
      const imported = exercises.find((ex) => ex.id === id);
      const importedName = imported ? localizedExerciseText(imported, i18n.language).name : "";
      toast({ title: t("communityExercises.imported"), description: t("communityExercises.importedDescription", { name: importedName }) });
    },
    onError: (error) => {
      toast({
        title: t("communityExercises.couldntImport"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const handleImportClick = (exercise: CommunityExercise) => {
    if (!canImport) {
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
    importMutation.mutate(exercise.id);
  };

  const filteredExercises = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return exercises.filter((exercise) => {
      const localized = localizedExerciseText(exercise, i18n.language);
      const matchesSearch = localized.name.toLowerCase().includes(query) ||
        localized.description.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "all" || exercise.category === categoryFilter;
      const matchesDifficulty = difficultyFilter === "all" || exercise.difficulty === difficultyFilter;
      return matchesSearch && matchesCategory && matchesDifficulty;
    });
  }, [exercises, searchQuery, categoryFilter, difficultyFilter, i18n.language]);

  const header = (
    <TopBar
      title={t("communityExercises.title")}
      subtitle={t("communityExercises.subtitle")}
      onSearch={setSearchQuery}
      searchPlaceholder={t("exerciseLibrary.searchPlaceholder")}
    />
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-64" />)}
          </div>
        </main>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState onRetry={() => refetch()} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {header}

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4">
            <Button type="button" variant="ghost" onClick={() => setLocation("/exercise-library")} className="justify-start sm:justify-center">
              <ArrowLeft className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
              {t("communityExercises.backToLibrary")}
            </Button>

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
        </div>

        {filteredExercises.length === 0 ? (
          <EmptyState
            icon={Globe}
            title={t("communityExercises.emptyTitle")}
            description={
              searchQuery || categoryFilter !== "all" || difficultyFilter !== "all"
                ? t("communityExercises.emptyFilterDescription")
                : t("communityExercises.emptyDescription")
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExercises.map((exercise, index) => {
              const categoryColorClass = CATEGORY_COLORS[exercise.category as keyof typeof CATEGORY_COLORS];
              const categorySolidClass = CATEGORY_SOLID_COLORS[exercise.category as keyof typeof CATEGORY_SOLID_COLORS];
              const CategoryIcon = CATEGORY_ICONS[exercise.category as keyof typeof CATEGORY_ICONS];
              const difficultyColorClass = DIFFICULTY_COLORS[exercise.difficulty as keyof typeof DIFFICULTY_COLORS];
              const localized = localizedExerciseText(exercise, i18n.language);

              return (
                <div key={exercise.id} className="fade-in bg-card border border-border rounded-lg p-5" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    <div className={`w-9 h-9 flex-shrink-0 ${categorySolidClass} rounded-md flex items-center justify-center`}>
                      <CategoryIcon className="w-4 h-4 text-white" strokeWidth={2} />
                    </div>
                    <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-900/40 dark:text-orange-300 dark:bg-orange-950/40">
                      {t(`categories.exercise.${exercise.category}`, exercise.category).toLowerCase()}
                    </Badge>
                    <Badge className={`${difficultyColorClass} shadow-sm`}>
                      {t(`categories.difficulty.${exercise.difficulty}`, exercise.difficulty).toLowerCase()}
                    </Badge>
                  </div>

                  {exercise.imageUrl ? (
                    <img src={exercise.imageUrl} alt={localized.name} loading="lazy" decoding="async" className="w-full h-32 object-cover rounded-md mb-4" />
                  ) : (
                    <div className={`w-full h-32 ${categoryColorClass} rounded-md mb-4 flex items-center justify-center`}>
                      <CategoryIcon className="w-9 h-9 opacity-40" strokeWidth={1.5} />
                    </div>
                  )}

                  <h3 className="font-display font-semibold uppercase tracking-tight text-foreground mb-2">{localized.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{localized.description}</p>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="text-xs font-medium">{t("sessionModal.minAbbrev", { count: exercise.duration })}</span>
                      </div>
                      {!!exercise.minPlayers && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" aria-hidden="true" />
                          <span className="text-xs font-medium">{t("exerciseCard.minPlayers", { count: exercise.minPlayers })}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleImportClick(exercise)}
                      disabled={importMutation.isPending}
                      aria-label={t("communityExercises.importName", { name: localized.name })}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                      {t("communityExercises.import")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
