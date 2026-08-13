import { useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Dumbbell, Globe, Heart, UserCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import StatCard from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { CATEGORY_COLORS, CATEGORY_SOLID_COLORS, DIFFICULTY_COLORS, CATEGORY_ICONS } from "@/lib/types";
import { localizedExerciseText } from "@/lib/exerciseI18n";

interface CoachProfileData {
  accountId: number;
  publicName: string;
  exerciseCount: number;
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
  isOwnProfile: boolean;
}

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
  likeCount: number;
  publishedBy: { accountId: number; publicName: string | null };
}

// A coach's public mini-profile — reached from the "published by" link on a
// community exercise card. Shows their public stats and the drills they've
// shared, with a follow button; everything else about their account (email,
// teams, roster) stays private, same as the rest of this social layer.
export default function CoachProfile() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ accountId: string }>();
  const accountId = parseInt(params.accountId, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const profileQueryKey = [`/api/coaches/${accountId}`];
  const { data: profile, isLoading, isError, refetch } = useQuery<CoachProfileData>({
    queryKey: profileQueryKey,
    enabled: !isNaN(accountId),
  });

  const { data: communityExercises = [] } = useQuery<CommunityExercise[]>({
    queryKey: ['/api/community-exercises'],
  });

  const coachExercises = useMemo(
    () => communityExercises.filter((exercise) => exercise.publishedBy.accountId === accountId),
    [communityExercises, accountId]
  );

  const toggleFollowMutation = useMutation({
    mutationFn: async (follow: boolean) =>
      apiRequest(follow ? "POST" : "DELETE", `/api/coaches/${accountId}/follow`),
    onMutate: async (follow) => {
      await queryClient.cancelQueries({ queryKey: profileQueryKey });
      const previousProfile = queryClient.getQueryData<CoachProfileData>(profileQueryKey);

      queryClient.setQueryData<CoachProfileData>(profileQueryKey, (old) => old && ({
        ...old,
        followedByMe: follow,
        followerCount: old.followerCount + (follow ? 1 : -1),
      }));

      return { previousProfile };
    },
    onError: (error, _follow, context) => {
      if (context) {
        queryClient.setQueryData(profileQueryKey, context.previousProfile);
      }
      toast({
        title: t("coachProfile.couldntUpdateFollow"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const header = (
    <TopBar
      title={profile?.publicName ?? t("coachProfile.title")}
      subtitle={t("coachProfile.subtitle")}
    />
  );

  if (isNaN(accountId)) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState onRetry={() => setLocation("/exercise-library/community")} />
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Skeleton className="h-40 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}
          </div>
        </main>
      </div>
    );
  }

  if (isError || !profile) {
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
        <Button type="button" variant="ghost" onClick={() => setLocation("/exercise-library/community")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
          {t("communityExercises.backToLibrary")}
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">{profile.publicName}</h2>
          {!profile.isOwnProfile && (
            <Button
              type="button"
              onClick={() => toggleFollowMutation.mutate(!profile.followedByMe)}
              disabled={toggleFollowMutation.isPending}
              aria-pressed={profile.followedByMe}
              className={profile.followedByMe ? "" : "basketball-orange basketball-orange-hover text-white"}
              variant={profile.followedByMe ? "outline" : "default"}
            >
              <UserCheck className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
              {profile.followedByMe ? t("coachProfile.following") : t("coachProfile.follow")}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard label={t("coachProfile.sharedExercises")} value={profile.exerciseCount} icon={Dumbbell} color="orange" />
          <StatCard label={t("coachProfile.followers")} value={profile.followerCount} icon={Users} color="court" />
          <StatCard label={t("coachProfile.followingCount")} value={profile.followingCount} icon={UserCheck} color="violet" />
        </div>

        <h3 className="font-display font-semibold uppercase tracking-tight text-lg text-foreground mb-4">{t("coachProfile.sharedExercises")}</h3>

        {coachExercises.length === 0 ? (
          <EmptyState
            icon={Globe}
            title={t("coachProfile.emptyExercisesTitle")}
            description={t("coachProfile.emptyExercisesDescription")}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coachExercises.map((exercise, index) => {
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

                  <div className="flex items-center gap-3 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="text-xs font-medium">{t("sessionModal.minAbbrev", { count: exercise.duration })}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="text-xs font-medium">{exercise.likeCount}</span>
                    </div>
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
