import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, ClipboardList, Compass, Download, Flag, Heart, MessageCircle, UserCheck, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import PlayCommentsDialog from "@/components/PlayCommentsDialog";
import ReportContentDialog, { type ReportTarget } from "@/components/ReportContentDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { PLAY_SITUATIONS } from "@shared/schema";

interface CommunityPlay {
  id: number;
  name: string;
  category: string;
  courtType: string;
  situation: string | null;
  notes: string | null;
  likeCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  commentCount: number;
  publishedBy: { accountId: number; publicName: string | null };
}

interface SuggestedCoach {
  accountId: number;
  publicName: string;
  exerciseCount: number;
  likeCount: number;
  followerCount: number;
}

type FeedTab = "discover" | "following" | "saved";

// Play-side twin of CommunityExercises.tsx — browsing surface for plays
// other coaches have opted into the cross-team community library (see
// PUT /api/plays/:id/share-community and Playbook's Globe toggle). A play
// belongs to a team, not directly to an account, but publishedBy is still
// resolved to the owning coach's public name for a consistent identity
// model across every community page.
export default function CommunityPlays() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [situationFilter, setSituationFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "popular">("recent");
  const [feedTab, setFeedTab] = useState<FeedTab>("discover");
  const [commentsPlay, setCommentsPlay] = useState<CommunityPlay | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const queryKey = feedTab === "following"
    ? ['/api/community-plays?following=true']
    : feedTab === "saved"
      ? ['/api/community-plays?saved=true']
      : ['/api/community-plays'];

  const { data: communityPlays = [], isLoading, isError, refetch } = useQuery<CommunityPlay[]>({
    queryKey,
  });

  // Same account-wide "who to follow" signal as CommunityExercises — the
  // endpoint ranks by overall community activity, not plays specifically,
  // so the row reads as "coaches worth following" rather than "coaches with
  // plays," which is why the stats text still cites exercises/likes.
  const { data: suggestedCoaches = [] } = useQuery<SuggestedCoach[]>({
    queryKey: ['/api/coaches/suggested'],
  });

  const followSuggestedMutation = useMutation({
    mutationFn: async (accountId: number) => apiRequest("POST", `/api/coaches/${accountId}/follow`),
    onMutate: async (accountId) => {
      const suggestedKey = ['/api/coaches/suggested'];
      await queryClient.cancelQueries({ queryKey: suggestedKey });
      const previousSuggestions = queryClient.getQueryData<SuggestedCoach[]>(suggestedKey);
      queryClient.setQueryData<SuggestedCoach[]>(suggestedKey, (old = []) => old.filter((c) => c.accountId !== accountId));
      return { previousSuggestions };
    },
    onError: (error, _accountId, context) => {
      if (context?.previousSuggestions) queryClient.setQueryData(['/api/coaches/suggested'], context.previousSuggestions);
      toast({
        title: t("communityExercises.couldntFollow"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community-plays?following=true'] });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/community-plays/${id}/import`),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/plays'] });
      const imported = communityPlays.find((p) => p.id === id);
      toast({ title: t("communityPlays.imported"), description: t("communityPlays.importedDescription", { name: imported?.name ?? "" }) });
    },
    onError: (error) => {
      toast({
        title: t("communityPlays.couldntImport"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async ({ id, liked }: { id: number; liked: boolean }) =>
      apiRequest(liked ? "POST" : "DELETE", `/api/community-plays/${id}/like`),
    onMutate: async ({ id, liked }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CommunityPlay[]>(queryKey);
      queryClient.setQueryData<CommunityPlay[]>(queryKey, (old = []) =>
        old.map((p) => p.id === id ? { ...p, likedByMe: liked, likeCount: p.likeCount + (liked ? 1 : -1) } : p)
      );
      return { previous, queryKey };
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previous);
      toast({
        title: t("communityPlays.couldntUpdateLike"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && (query.queryKey[0] as string).startsWith("/api/community-plays") && query.queryKey[0] !== queryKey[0],
      });
    },
  });

  // "Guardado" is a private bookmark, distinct from liking — see playSaves
  // in shared/schema.ts. Toggling it also invalidates the Saved tab's own
  // cached query (this page has no other copy of "what's saved").
  const toggleSaveMutation = useMutation({
    mutationFn: async ({ id, saved }: { id: number; saved: boolean }) =>
      apiRequest(saved ? "POST" : "DELETE", `/api/community-plays/${id}/save`),
    onMutate: async ({ id, saved }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CommunityPlay[]>(queryKey);
      queryClient.setQueryData<CommunityPlay[]>(queryKey, (old = []) =>
        saved
          ? old.map((p) => p.id === id ? { ...p, savedByMe: true } : p)
          : (feedTab === "saved" ? old.filter((p) => p.id !== id) : old.map((p) => p.id === id ? { ...p, savedByMe: false } : p))
      );
      return { previous, queryKey };
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previous);
      toast({
        title: t("communityPlays.couldntUpdateSave"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && (query.queryKey[0] as string).startsWith("/api/community-plays") && query.queryKey[0] !== queryKey[0],
      });
    },
  });

  const handleCommentCountChange = (playId: number, delta: number) => {
    queryClient.setQueriesData<CommunityPlay[]>(
      { predicate: (query) => typeof query.queryKey[0] === "string" && (query.queryKey[0] as string).startsWith("/api/community-plays") },
      (old) => old?.map((p) => p.id === playId ? { ...p, commentCount: Math.max(0, p.commentCount + delta) } : p)
    );
  };

  const filteredPlays = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = communityPlays.filter((play) => {
      const matchesSearch = play.name.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "all" || play.category === categoryFilter;
      const matchesSituation = situationFilter === "all" || play.situation === situationFilter;
      return matchesSearch && matchesCategory && matchesSituation;
    });

    if (sortBy === "popular") {
      return [...filtered].sort((a, b) => b.likeCount - a.likeCount || b.id - a.id);
    }
    return filtered;
  }, [communityPlays, searchQuery, categoryFilter, situationFilter, sortBy]);

  const header = (
    <TopBar
      title={t("communityPlays.title")}
      subtitle={t("communityPlays.subtitle")}
      onSearch={setSearchQuery}
      searchPlaceholder={t("playbook.searchPlaceholder")}
    />
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48" />)}
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

  const emptyTitle = feedTab === "following" ? t("communityPlays.emptyFollowingTitle")
    : feedTab === "saved" ? t("communityPlays.emptySavedTitle")
    : t("communityPlays.emptyTitle");
  const emptyDescription = searchQuery || categoryFilter !== "all" || situationFilter !== "all"
    ? t("communityPlays.emptyFilterDescription")
    : feedTab === "following" ? t("communityPlays.emptyFollowingDescription")
    : feedTab === "saved" ? t("communityPlays.emptySavedDescription")
    : t("communityPlays.emptyDescription");

  return (
    <div className="flex flex-col h-full">
      {header}

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="flex items-center gap-1 mb-4 border border-border rounded-md p-1 w-fit flex-wrap">
          <Button type="button" size="sm" variant={feedTab === "discover" ? "default" : "ghost"} aria-pressed={feedTab === "discover"} onClick={() => setFeedTab("discover")} className={feedTab === "discover" ? "basketball-orange basketball-orange-hover text-white" : ""}>
            <Compass className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t("communityExercises.discoverTab")}
          </Button>
          <Button type="button" size="sm" variant={feedTab === "following" ? "default" : "ghost"} aria-pressed={feedTab === "following"} onClick={() => setFeedTab("following")} className={feedTab === "following" ? "basketball-orange basketball-orange-hover text-white" : ""}>
            <UserCheck className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t("communityExercises.followingTab")}
          </Button>
          <Button type="button" size="sm" variant={feedTab === "saved" ? "default" : "ghost"} aria-pressed={feedTab === "saved"} onClick={() => setFeedTab("saved")} className={feedTab === "saved" ? "basketball-orange basketball-orange-hover text-white" : ""}>
            <Bookmark className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t("communityPlays.savedTab")}
          </Button>
        </div>

        {feedTab === "discover" && suggestedCoaches.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">{t("communityExercises.suggestedCoaches")}</h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {suggestedCoaches.map((coach) => (
                <div key={coach.accountId} className="flex-shrink-0 w-56 bg-card border border-border rounded-lg p-4">
                  <Link
                    href={`/coaches/${coach.accountId}`}
                    className="font-display font-semibold uppercase tracking-tight text-sm text-foreground hover:text-basketball-orange hover:underline block truncate"
                  >
                    {coach.publicName}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    {t("communityExercises.suggestedCoachStats", { exercises: coach.exerciseCount, likes: coach.likeCount })}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => followSuggestedMutation.mutate(coach.accountId)}
                    disabled={followSuggestedMutation.isPending}
                    aria-label={t("communityExercises.followName", { name: coach.publicName })}
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                    {t("coachProfile.follow")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4">
            <Button type="button" variant="ghost" onClick={() => setLocation("/playbook")} className="justify-start sm:justify-center">
              <ArrowLeft className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
              {t("communityPlays.backToPlaybook")}
            </Button>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("playbook.filterBySituation")}>
                <SelectValue placeholder={t("sessionModal.filterByCategory")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sessionModal.allCategories")}</SelectItem>
                {["offense", "defense", "inbound", "special"].map(category => (
                  <SelectItem key={category} value={category}>{t(`categories.play.${category}`, category)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

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

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as "recent" | "popular")}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("communityExercises.sortBy")}>
                <SelectValue placeholder={t("communityExercises.sortBy")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{t("communityExercises.sortRecent")}</SelectItem>
                <SelectItem value="popular">{t("communityExercises.sortPopular")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredPlays.length === 0 ? (
          <EmptyState icon={feedTab === "saved" ? Bookmark : feedTab === "following" ? UserCheck : ClipboardList} title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlays.map((play, index) => (
              <div key={play.id} className="fade-in bg-card border border-border rounded-lg p-5" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <Badge variant="secondary">{t(`categories.play.${play.category}`, play.category)}</Badge>
                  <Badge variant="outline" className="capitalize">{t(`playbook.courtType.${play.courtType}`, play.courtType)}</Badge>
                  {play.situation && (
                    <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-900/40 dark:text-orange-300 dark:bg-orange-950/40">
                      {t(`categories.playSituation.${play.situation}`, play.situation)}
                    </Badge>
                  )}
                </div>

                <h3 className="font-display font-semibold uppercase tracking-tight text-foreground mb-1">{play.name}</h3>
                {play.publishedBy.publicName && (
                  <Link href={`/coaches/${play.publishedBy.accountId}`} className="text-xs text-muted-foreground hover:text-basketball-orange hover:underline mb-2 inline-block">
                    {t("communityExercises.byCoach", { name: play.publishedBy.publicName })}
                  </Link>
                )}
                {play.notes && <p className="text-sm text-muted-foreground mb-4 line-clamp-2 mt-1">{play.notes}</p>}

                <div className="flex items-center justify-between gap-2 mt-4">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => toggleLikeMutation.mutate({ id: play.id, liked: !play.likedByMe })}
                      className="flex items-center gap-1.5 hover:text-red-500 transition-colors"
                      aria-pressed={play.likedByMe}
                      aria-label={play.likedByMe ? t("communityPlays.unlike", { name: play.name }) : t("communityPlays.like", { name: play.name })}
                    >
                      <Heart className={`w-3.5 h-3.5 ${play.likedByMe ? "text-red-500 fill-red-500" : ""}`} aria-hidden="true" />
                      <span className="text-xs font-medium">{play.likeCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommentsPlay(play)}
                      className="flex items-center gap-1.5 hover:text-basketball-orange transition-colors"
                      aria-label={t("communityPlays.viewComments", { name: play.name })}
                    >
                      <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="text-xs font-medium">{play.commentCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSaveMutation.mutate({ id: play.id, saved: !play.savedByMe })}
                      className="flex items-center gap-1.5 hover:text-basketball-orange transition-colors"
                      aria-pressed={play.savedByMe}
                      aria-label={play.savedByMe ? t("communityPlays.unsave", { name: play.name }) : t("communityPlays.save", { name: play.name })}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${play.savedByMe ? "text-basketball-orange fill-basketball-orange" : ""}`} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportTarget({ endpoint: `/api/community-plays/${play.id}/report`, name: play.name })}
                      className="flex items-center gap-1.5 hover:text-destructive transition-colors"
                      aria-label={t("communityExercises.report", { name: play.name })}
                    >
                      <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => importMutation.mutate(play.id)}
                    disabled={importMutation.isPending}
                    aria-label={t("communityPlays.importName", { name: play.name })}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                    {t("communityExercises.import")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <PlayCommentsDialog
        playId={commentsPlay?.id ?? null}
        playName={commentsPlay?.name ?? ""}
        onOpenChange={(next) => { if (!next) setCommentsPlay(null); }}
        onCommentCountChange={handleCommentCountChange}
      />
      <ReportContentDialog target={reportTarget} onOpenChange={(next) => { if (!next) setReportTarget(null); }} />
    </div>
  );
}
