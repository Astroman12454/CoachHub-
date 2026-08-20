import { useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import ErrorState from "@/components/ErrorState";
import LanguageToggle from "@/components/LanguageToggle";
import SharedExerciseCard, { type SharedExerciseData } from "@/components/SharedExerciseCard";
import { localizedExerciseText } from "@/lib/exerciseI18n";

// The public, indexable counterpart to ExerciseShare.tsx: that page is
// reached only by an unguessable per-exercise token (a private link one
// coach hands another), so it's deliberately excluded from robots.txt. This
// one is keyed by the exercise's own id — safe to be public because
// sharedToCommunity=1 already means the coach opted into publishing it —
// and is meant to actually turn up in search results (see robots.txt and
// GET /sitemap.xml, server/routes.ts), with a sign-up CTA for whoever
// arrives from one. Sets its own document title/meta description since
// this is a client-rendered SPA with no server-side rendering — crawlers
// that execute JS (Googlebot does) still pick up the final DOM.
export default function CommunityExercisePublic() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useQuery<SharedExerciseData>({
    queryKey: [`/api/community-exercises/${id}/public`],
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    const localized = localizedExerciseText(data, i18n.language);
    const previousTitle = document.title;
    document.title = t("communityExercisePublic.pageTitle", { name: localized.name });

    // index.html already ships one static <meta name="description"> for the
    // app as a whole — update that one in place rather than appending a
    // second tag, which would leave two competing descriptions in the DOM
    // and defeat the point of a page-specific one for crawlers.
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", localized.description);

    return () => {
      document.title = previousTitle;
      if (previousDescription !== null) meta?.setAttribute("content", previousDescription);
    };
  }, [data, i18n.language, t]);

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
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 text-foreground">
          <LanguageToggle />
        </div>
        <div className="w-full max-w-sm">
          <ErrorState
            title={t("communityExercisePublic.notAvailable")}
            description={t("communityExercisePublic.notAvailableDescription")}
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

        <div className="bg-card border border-basketball-orange/30 rounded-lg p-5 text-center space-y-3">
          <p className="text-sm text-foreground">{t("communityExercisePublic.ctaDescription")}</p>
          <Link href="/login?signup=1">
            <Button className="basketball-orange basketball-orange-hover text-white">
              {t("communityExercisePublic.ctaButton")}
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
