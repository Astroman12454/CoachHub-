import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Activity, Bookmark, Compass, Download, Heart, MessageCircle, UserCheck, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import PhysicalTestCommentsDialog from "@/components/PhysicalTestCommentsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";

interface CommunityPhysicalTest {
  id: number;
  name: string;
  unit: string;
  lowerIsBetter: number;
  description: string | null;
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

// Physical-test twin of CommunityExercises.tsx / CommunityPlays.tsx —
// browsing surface for test templates other coaches have opted into the
// cross-account community library (see PUT /api/physical-tests/:id/
// share-community and PhysicalTests' Globe toggle).
export default function CommunityPhysicalTests() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "popular">("recent");
  const [feedTab, setFeedTab] = useState<FeedTab>("discover");
  const [commentsTest, setCommentsTest] = useState<CommunityPhysicalTest | null>(null);

  const queryKey = feedTab === "following"
    ? ['/api/community-physical-tests?following=true']
    : feedTab === "saved"
      ? ['/api/community-physical-tests?saved=true']
      : ['/api/community-physical-tests'];

  const { data: communityTests = [], isLoading, isError, refetch } = useQuery<CommunityPhysicalTest[]>({
    queryKey,
  });

  // Same account-wide "who to follow" signal as CommunityExercises — the
  // endpoint ranks by overall community activity, not test templates
  // specifically, so the row reads as "coaches worth following" rather than
  // "coaches with tests," which is why the stats text still cites
  // exercises/likes.
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
      queryClient.invalidateQueries({ queryKey: ['/api/community-physical-tests?following=true'] });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/community-physical-tests/${id}/import`),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/physical-tests'] });
      const imported = communityTests.find((t) => t.id === id);
      toast({ title: t("communityPhysicalTests.imported"), description: t("communityPhysicalTests.importedDescription", { name: imported?.name ?? "" }) });
    },
    onError: (error) => {
      toast({
        title: t("communityPhysicalTests.couldntImport"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async ({ id, liked }: { id: number; liked: boolean }) =>
      apiRequest(liked ? "POST" : "DELETE", `/api/community-physical-tests/${id}/like`),
    onMutate: async ({ id, liked }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CommunityPhysicalTest[]>(queryKey);
      queryClient.setQueryData<CommunityPhysicalTest[]>(queryKey, (old = []) =>
        old.map((t) => t.id === id ? { ...t, likedByMe: liked, likeCount: t.likeCount + (liked ? 1 : -1) } : t)
      );
      return { previous, queryKey };
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previous);
      toast({
        title: t("communityPhysicalTests.couldntUpdateLike"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && (query.queryKey[0] as string).startsWith("/api/community-physical-tests") && query.queryKey[0] !== queryKey[0],
      });
    },
  });

  const toggleSaveMutation = useMutation({
    mutationFn: async ({ id, saved }: { id: number; saved: boolean }) =>
      apiRequest(saved ? "POST" : "DELETE", `/api/community-physical-tests/${id}/save`),
    onMutate: async ({ id, saved }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CommunityPhysicalTest[]>(queryKey);
      queryClient.setQueryData<CommunityPhysicalTest[]>(queryKey, (old = []) =>
        saved
          ? old.map((t) => t.id === id ? { ...t, savedByMe: true } : t)
          : (feedTab === "saved" ? old.filter((t) => t.id !== id) : old.map((t) => t.id === id ? { ...t, savedByMe: false } : t))
      );
      return { previous, queryKey };
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previous);
      toast({
        title: t("communityPhysicalTests.couldntUpdateSave"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && (query.queryKey[0] as string).startsWith("/api/community-physical-tests") && query.queryKey[0] !== queryKey[0],
      });
    },
  });

  const handleCommentCountChange = (testId: number, delta: number) => {
    queryClient.setQueriesData<CommunityPhysicalTest[]>(
      { predicate: (query) => typeof query.queryKey[0] === "string" && (query.queryKey[0] as string).startsWith("/api/community-physical-tests") },
      (old) => old?.map((t) => t.id === testId ? { ...t, commentCount: Math.max(0, t.commentCount + delta) } : t)
    );
  };

  const filteredTests = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = communityTests.filter((test) => test.name.toLowerCase().includes(query));

    if (sortBy === "popular") {
      return [...filtered].sort((a, b) => b.likeCount - a.likeCount || b.id - a.id);
    }
    return filtered;
  }, [communityTests, searchQuery, sortBy]);

  const header = (
    <TopBar
      title={t("communityPhysicalTests.title")}
      subtitle={t("communityPhysicalTests.subtitle")}
      onSearch={setSearchQuery}
      searchPlaceholder={t("physicalTests.searchPlaceholder")}
    />
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40" />)}
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
    : feedTab === "saved" ? t("communityPhysicalTests.emptySavedTitle")
    : t("communityPhysicalTests.emptyTitle");
  const emptyDescription = searchQuery
    ? t("communityExercises.emptyFilterDescription")
    : feedTab === "following" ? t("communityPhysicalTests.emptyFollowingDescription")
    : feedTab === "saved" ? t("communityPhysicalTests.emptySavedDescription")
    : t("communityPhysicalTests.emptyDescription");

  return (
    <div className="flex flex-col h-full">
      {header}

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="flex items-center gap-1 mb-4 border border-border rounded-md p-1 w-fit flex-wrap">
          <Button type="button" size="sm" variant={feedTab === "discover" ? "default" : "ghost"} aria-pressed={feedTab === "discover"} onClick={() => setFeedTab("discover")} className={feedTab === "discover" ? "basketball-orange basketball-orange-hover text-white" : ""}>
            <Compass className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
            {t("communityExercises.discoverTab")}
          </Button>
          <Button type="button" size="sm" variant={feedTab === "following" ? "default" : "ghost"} aria-pressed={feedTab === "following"} onClick={() => setFeedTab("following")} className={feedTab === "following" ? "basketball-orange basketball-orange-hover text-white" : ""}>
            <UserCheck className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
            {t("communityExercises.followingTab")}
          </Button>
          <Button type="button" size="sm" variant={feedTab === "saved" ? "default" : "ghost"} aria-pressed={feedTab === "saved"} onClick={() => setFeedTab("saved")} className={feedTab === "saved" ? "basketball-orange basketball-orange-hover text-white" : ""}>
            <Bookmark className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
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
            <Button type="button" variant="ghost" onClick={() => setLocation("/physical-tests")} className="justify-start sm:justify-center">
              <ArrowLeft className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
              {t("communityPhysicalTests.backToTests")}
            </Button>

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

        {filteredTests.length === 0 ? (
          <EmptyState icon={feedTab === "saved" ? Bookmark : feedTab === "following" ? UserCheck : Activity} title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTests.map((test, index) => (
              <Card key={test.id} className="fade-in" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-2">
                    <span className="truncate">{test.name}</span>
                    <Badge variant="secondary" className="shrink-0 gap-1">
                      {test.lowerIsBetter === 1
                        ? <ArrowDown className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                        : <ArrowUp className="w-3 h-3" strokeWidth={2} aria-hidden="true" />}
                      {test.unit}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {test.publishedBy.publicName && (
                    <Link href={`/coaches/${test.publishedBy.accountId}`} className="text-xs text-muted-foreground hover:text-basketball-orange hover:underline mb-2 inline-block">
                      {t("communityExercises.byCoach", { name: test.publishedBy.publicName })}
                    </Link>
                  )}
                  {test.description && <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{test.description}</p>}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => toggleLikeMutation.mutate({ id: test.id, liked: !test.likedByMe })}
                        className="flex items-center gap-1.5 hover:text-red-500 transition-colors"
                        aria-pressed={test.likedByMe}
                        aria-label={test.likedByMe ? t("communityPhysicalTests.unlike", { name: test.name }) : t("communityPhysicalTests.like", { name: test.name })}
                      >
                        <Heart className={`w-3.5 h-3.5 ${test.likedByMe ? "text-red-500 fill-red-500" : ""}`} aria-hidden="true" />
                        <span className="text-xs font-medium">{test.likeCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommentsTest(test)}
                        className="flex items-center gap-1.5 hover:text-basketball-orange transition-colors"
                        aria-label={t("communityPhysicalTests.viewComments", { name: test.name })}
                      >
                        <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="text-xs font-medium">{test.commentCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSaveMutation.mutate({ id: test.id, saved: !test.savedByMe })}
                        className="flex items-center gap-1.5 hover:text-basketball-orange transition-colors"
                        aria-pressed={test.savedByMe}
                        aria-label={test.savedByMe ? t("communityPhysicalTests.unsave", { name: test.name }) : t("communityPhysicalTests.save", { name: test.name })}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${test.savedByMe ? "text-basketball-orange fill-basketball-orange" : ""}`} aria-hidden="true" />
                      </button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => importMutation.mutate(test.id)}
                      disabled={importMutation.isPending}
                      aria-label={t("communityPhysicalTests.importName", { name: test.name })}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                      {t("communityExercises.import")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <PhysicalTestCommentsDialog
        testId={commentsTest?.id ?? null}
        testName={commentsTest?.name ?? ""}
        onOpenChange={(next) => { if (!next) setCommentsTest(null); }}
        onCommentCountChange={handleCommentCountChange}
      />
    </div>
  );
}
