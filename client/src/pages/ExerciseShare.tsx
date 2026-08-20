import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import LanguageToggle from "@/components/LanguageToggle";
import SharedExerciseCard, { type SharedExerciseData } from "@/components/SharedExerciseCard";

// A completely standalone page — not wrapped in the authenticated Layout —
// reachable by anyone with the link (see server/auth.ts's requireAuth
// exemption for /exercise-share/:token). Read-only, same shape as Portal.tsx.
export default function ExerciseShare() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError, refetch } = useQuery<SharedExerciseData>({
    queryKey: [`/api/exercise-share/${token}`],
    retry: false,
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:p-8 lg:pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="max-w-xl mx-auto space-y-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-64" />
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4 relative">
        {/* top-[max(...)] reserves space under iOS's black-translucent
            status bar when this app is added to the home screen. */}
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 text-foreground">
          <LanguageToggle />
        </div>
        <div className="w-full max-w-sm">
          <ErrorState
            title={t("exerciseShare.linkNotAvailable")}
            description={t("exerciseShare.linkNotAvailableDescription")}
            onRetry={() => refetch()}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:p-8 lg:pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex justify-end text-foreground">
          <LanguageToggle />
        </div>

        <SharedExerciseCard data={data} />
      </div>
    </main>
  );
}
