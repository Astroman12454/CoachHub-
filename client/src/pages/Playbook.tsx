import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trash2, Plus, ClipboardList, Globe, Menu, Layers, Flame, Search, Star, Copy, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import SetPublicNameDialog from "@/components/SetPublicNameDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSidebar } from "@/hooks/use-sidebar";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage, extractErrorCode } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { PLAY_SITUATIONS } from "@shared/schema";
import type { Play, PlayPracticeStats } from "@shared/schema";

type SortMode = "name" | "most-practiced" | "least-practiced";

function formatLastPracticed(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Playbook() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { openMobile } = useSidebar();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [playToDelete, setPlayToDelete] = useState<Play | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [situationFilter, setSituationFilter] = useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [pendingPublishId, setPendingPublishId] = useState<number | null>(null);

  const { data: plays = [], isLoading, isError, refetch } = useQuery<Play[]>({
    queryKey: ["/api/plays"],
  });

  const toggleCommunityShareMutation = useMutation({
    mutationFn: async ({ id, shared }: { id: number; shared: boolean }) =>
      apiRequest("PUT", `/api/plays/${id}/share-community`, { shared }),
    onMutate: async ({ id, shared }) => {
      const queryKey = ["/api/plays"];
      await queryClient.cancelQueries({ queryKey });
      const previousPlays = queryClient.getQueryData<Play[]>(queryKey);
      queryClient.setQueryData<Play[]>(queryKey, (old = []) =>
        old.map((p) => (p.id === id ? { ...p, sharedToCommunity: shared ? 1 : 0 } : p))
      );
      return { previousPlays, queryKey };
    },
    onError: (error, variables, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previousPlays);
      if (extractErrorCode(error) === "PUBLIC_NAME_REQUIRED") {
        setPendingPublishId(variables.id);
        return;
      }
      toast({ title: t("playbook.couldntUpdateCommunityShare"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: number; isFavorite: boolean }) =>
      apiRequest("PUT", `/api/plays/${id}/favorite`, { isFavorite }),
    onMutate: async ({ id, isFavorite }) => {
      const queryKey = ["/api/plays"];
      await queryClient.cancelQueries({ queryKey });
      const previousPlays = queryClient.getQueryData<Play[]>(queryKey);
      queryClient.setQueryData<Play[]>(queryKey, (old = []) =>
        old.map((p) => (p.id === id ? { ...p, isFavorite: isFavorite ? 1 : 0 } : p))
      );
      return { previousPlays, queryKey };
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previousPlays);
      toast({ title: t("playbook.couldntUpdateFavorite"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  const duplicatePlayMutation = useMutation({
    mutationFn: async (play: Play) => {
      const res = await apiRequest("GET", `/api/plays/${play.id}`);
      const full = await res.json();
      const created = await apiRequest("POST", "/api/plays", {
        name: t("playbook.duplicateName", { name: play.name }),
        category: full.category,
        courtType: full.courtType,
        situation: full.situation,
        notes: full.notes,
        steps: full.steps.map((s: { tokens: unknown; drawings: unknown }) => ({ tokens: s.tokens, drawings: s.drawings })),
      });
      return (await created.json()) as Play;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plays"] });
      setLocation(`/playbook/${created.id}`);
    },
    onError: (error) => {
      toast({ title: t("playbook.couldntDuplicate"), description: extractErrorMessage(error) ?? t("common.tryAgain"), variant: "destructive" });
    },
  });

  // Best-effort: a stats fetch failing shouldn't block the Playbook itself
  // from rendering, so this just falls back to "no data yet" per play.
  const { data: practiceStats = [] } = useQuery<PlayPracticeStats[]>({
    queryKey: ["/api/plays/stats"],
  });
  const statsByPlayId = useMemo(
    () => new Map(practiceStats.map((s) => [s.playId, s])),
    [practiceStats],
  );

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/plays",
    errorMessage: t("playbook.failedToDelete"),
  });

  const visiblePlays = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const remaining = plays.filter((p) =>
      !isPendingDelete(p.id) &&
      (!query || p.name.toLowerCase().includes(query)) &&
      (situationFilter === "all" || p.situation === situationFilter) &&
      (!favoritesOnly || p.isFavorite === 1)
    );
    if (sortMode === "name") {
      return remaining.sort((a, b) => a.name.localeCompare(b.name));
    }
    const direction = sortMode === "most-practiced" ? -1 : 1;
    return remaining.sort((a, b) => {
      const countA = statsByPlayId.get(a.id)?.timesPracticed ?? 0;
      const countB = statsByPlayId.get(b.id)?.timesPracticed ?? 0;
      if (countA !== countB) return (countA - countB) * direction;
      return a.name.localeCompare(b.name);
    });
  }, [plays, isPendingDelete, sortMode, statsByPlayId, searchQuery, situationFilter, favoritesOnly]);

  const confirmDelete = () => {
    if (playToDelete) {
      requestDelete(playToDelete.id, t("playbook.deletedToast", { name: playToDelete.name }));
      setPlayToDelete(null);
    }
  };

  // pt-[max(...)] reserves space under iOS's black-translucent status bar
  // when this app is added to the home screen — see TopBar.tsx.
  const header = (
    <header className="bg-card border-b border-border px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 lg:px-7 lg:pt-[max(1.25rem,env(safe-area-inset-top))] lg:pb-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={openMobile}
            className="lg:hidden w-11 h-11 flex-shrink-0 basketball-orange rounded-md flex items-center justify-center"
            aria-label={t("common.openNavigationMenu")}
          >
            <Menu className="w-4 h-4 text-white" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div>
            <h2 className="font-display font-bold uppercase tracking-tight text-2xl lg:text-3xl text-foreground leading-tight">{t("nav.playbook")}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t("playbook.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-44" aria-label={t("playbook.sortPlays")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{t("playbook.sortName")}</SelectItem>
              <SelectItem value="most-practiced">{t("playbook.sortMostPracticed")}</SelectItem>
              <SelectItem value="least-practiced">{t("playbook.sortLeastPracticed")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setLocation("/playbook/community")} className="whitespace-nowrap">
            <Users className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">{t("playbook.community")}</span>
            <span className="sm:hidden">{t("playbook.community")}</span>
          </Button>
          <Button onClick={() => setLocation("/playbook/new")} className="basketball-orange basketball-orange-hover text-white whitespace-nowrap">
            <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
            <span className="hidden sm:inline">{t("playbook.newPlay")}</span>
            <span className="sm:hidden">{t("topBar.new")}</span>
          </Button>
        </div>
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
          <div className="relative flex-1 sm:max-w-xs">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("playbook.searchPlaceholder")}
              aria-label={t("playbook.searchPlaceholder")}
              className="pl-9"
            />
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <Select value={situationFilter} onValueChange={setSituationFilter}>
            <SelectTrigger className="w-full sm:w-52" aria-label={t("playbook.filterBySituation")}>
              <SelectValue placeholder={t("playbook.filterBySituation")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("playbook.allSituations")}</SelectItem>
              {PLAY_SITUATIONS.map((s) => (
                <SelectItem key={s} value={s}>{t(`categories.playSituation.${s}`, s)}</SelectItem>
              ))}
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
            {t("playbook.favoritesOnly")}
          </Button>
        </div>

        {visiblePlays.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t("playbook.emptyTitle")}
            description={
              searchQuery || situationFilter !== "all" || favoritesOnly
                ? t("playbook.emptyFilterDescription")
                : t("playbook.emptyDescription")
            }
            action={!searchQuery && situationFilter === "all" && !favoritesOnly ? {
              label: t("playbook.drawFirstPlay"), icon: Plus, onClick: () => setLocation("/playbook/new"),
            } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiblePlays.map((play, index) => (
              <Card
                key={play.id}
                className="fade-in hover:border-basketball-orange hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                onClick={() => setLocation(`/playbook/${play.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-display uppercase tracking-tight text-lg text-foreground mb-1 min-w-0 truncate">
                      {play.name}
                    </CardTitle>
                    <div className="flex items-center gap-0.5 -mt-1 -mr-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); toggleFavoriteMutation.mutate({ id: play.id, isFavorite: play.isFavorite !== 1 }); }}
                        aria-label={play.isFavorite === 1 ? t("playbook.unfavoriteName", { name: play.name }) : t("playbook.favoriteName", { name: play.name })}
                        aria-pressed={play.isFavorite === 1}
                      >
                        <Star className={cn("w-4 h-4", play.isFavorite === 1 ? "text-basketball-orange fill-basketball-orange" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); toggleCommunityShareMutation.mutate({ id: play.id, shared: play.sharedToCommunity !== 1 }); }}
                        aria-label={play.sharedToCommunity === 1 ? t("playbook.removeFromCommunity", { name: play.name }) : t("playbook.addToCommunity", { name: play.name })}
                        aria-pressed={play.sharedToCommunity === 1}
                      >
                        <Globe className={cn("w-4 h-4", play.sharedToCommunity === 1 ? "text-court" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); duplicatePlayMutation.mutate(play); }}
                        aria-label={t("playbook.duplicateAction", { name: play.name })}
                      >
                        <Copy className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        onClick={(e) => { e.stopPropagation(); setPlayToDelete(play); }}
                        aria-label={t("playbook.deleteName", { name: play.name })}
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{t(`categories.play.${play.category}`, play.category)}</Badge>
                    <Badge variant="outline" className="capitalize">{t(`playbook.courtType.${play.courtType}`, play.courtType)}</Badge>
                    {play.situation && (
                      <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-900/40 dark:text-orange-300 dark:bg-orange-950/40">
                        {t(`categories.playSituation.${play.situation}`, play.situation)}
                      </Badge>
                    )}
                  </div>
                  {play.notes && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{play.notes}</p>
                  )}
                  <div className="flex items-center gap-1.5 text-sm">
                    <Flame className={`w-3.5 h-3.5 flex-shrink-0 ${statsByPlayId.get(play.id) ? "text-basketball-orange" : "text-muted-foreground"}`} strokeWidth={1.75} aria-hidden="true" />
                    {statsByPlayId.get(play.id) ? (
                      <span className="text-foreground">
                        {t("playbook.practicedX", { count: statsByPlayId.get(play.id)!.timesPracticed })}
                        {statsByPlayId.get(play.id)!.lastPracticedDate && (
                          <span className="text-muted-foreground"> · {t("playbook.lastPracticed", { date: formatLastPracticed(statsByPlayId.get(play.id)!.lastPracticedDate!) })}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("playbook.notPracticedYet")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Layers className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {t("playbook.tapToViewOrEdit")}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!playToDelete}
        onOpenChange={(open) => !open && setPlayToDelete(null)}
        title={t("playbook.deleteConfirmTitle")}
        description={t("playbook.deleteConfirmDescription", { name: playToDelete?.name })}
        onConfirm={confirmDelete}
      />

      <SetPublicNameDialog
        open={pendingPublishId !== null}
        onOpenChange={(open) => !open && setPendingPublishId(null)}
        onSuccess={() => {
          if (pendingPublishId !== null) toggleCommunityShareMutation.mutate({ id: pendingPublishId, shared: true });
          setPendingPublishId(null);
        }}
      />
    </div>
  );
}
