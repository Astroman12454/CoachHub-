import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trash2, Plus, ClipboardList, Menu, Layers, Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSidebar } from "@/hooks/use-sidebar";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import type { Play, PlayPracticeStats } from "@shared/schema";

type SortMode = "name" | "most-practiced" | "least-practiced";

function formatLastPracticed(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Playbook() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { openMobile } = useSidebar();
  const [playToDelete, setPlayToDelete] = useState<Play | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("name");

  const { data: plays = [], isLoading, isError, refetch } = useQuery<Play[]>({
    queryKey: ["/api/plays"],
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
    const remaining = plays.filter((p) => !isPendingDelete(p.id));
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
  }, [plays, isPendingDelete, sortMode, statsByPlayId]);

  const confirmDelete = () => {
    if (playToDelete) {
      requestDelete(playToDelete.id, t("playbook.deletedToast", { name: playToDelete.name }));
      setPlayToDelete(null);
    }
  };

  const header = (
    <header className="bg-card border-b border-border px-4 py-4 lg:px-7 lg:py-5">
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
        {visiblePlays.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t("playbook.emptyTitle")}
            description={t("playbook.emptyDescription")}
            action={{ label: t("playbook.drawFirstPlay"), icon: Plus, onClick: () => setLocation("/playbook/new") }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiblePlays.map((play) => (
              <Card
                key={play.id}
                className="hover:border-basketball-orange hover:shadow-sm transition-all cursor-pointer"
                onClick={() => setLocation(`/playbook/${play.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="font-display uppercase tracking-tight text-lg text-foreground mb-1">
                      {play.name}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-400 -mt-1 -mr-1"
                      onClick={(e) => { e.stopPropagation(); setPlayToDelete(play); }}
                      aria-label={t("playbook.deleteName", { name: play.name })}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{t(`categories.play.${play.category}`, play.category)}</Badge>
                    <Badge variant="outline" className="capitalize">{t(`playbook.courtType.${play.courtType}`, play.courtType)}</Badge>
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
    </div>
  );
}
