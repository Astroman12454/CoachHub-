import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import LanguageToggle from "@/components/LanguageToggle";
import DiagramPlayback from "@/components/DiagramPlayback";
import { CATEGORY_COLORS, CATEGORY_SOLID_COLORS, DIFFICULTY_COLORS, CATEGORY_ICONS } from "@/lib/types";
import type { Token, Drawing } from "@shared/schema";

interface SharedExercise {
  id: number;
  name: string;
  description: string;
  category: string;
  duration: number;
  difficulty: string;
  instructions: string | null;
  imageUrl: string | null;
  courtType: "half" | "full";
  steps: { tokens: Token[]; drawings: Drawing[] }[];
}

// A completely standalone page — not wrapped in the authenticated Layout —
// reachable by anyone with the link (see server/auth.ts's requireAuth
// exemption for /exercise-share/:token). Read-only, same shape as Portal.tsx.
export default function ExerciseShare() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError, refetch } = useQuery<SharedExercise>({
    queryKey: [`/api/exercise-share/${token}`],
    retry: false,
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background p-4 lg:p-8">
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
        <div className="absolute top-4 right-4 text-foreground">
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

  const categoryColorClass = CATEGORY_COLORS[data.category as keyof typeof CATEGORY_COLORS];
  const categorySolidClass = CATEGORY_SOLID_COLORS[data.category as keyof typeof CATEGORY_SOLID_COLORS];
  const CategoryIcon = CATEGORY_ICONS[data.category as keyof typeof CATEGORY_ICONS];
  const difficultyColorClass = DIFFICULTY_COLORS[data.difficulty as keyof typeof DIFFICULTY_COLORS];

  return (
    <main className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex justify-end text-foreground">
          <LanguageToggle />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {CategoryIcon && (
                <div className={`w-9 h-9 flex-shrink-0 ${categorySolidClass} rounded-md flex items-center justify-center`}>
                  <CategoryIcon className="w-4 h-4 text-white" strokeWidth={2} />
                </div>
              )}
              <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-900/40 dark:text-orange-300 dark:bg-orange-950/40">
                {t(`categories.exercise.${data.category}`, data.category).toLowerCase()}
              </Badge>
              <Badge className={`${difficultyColorClass} shadow-sm`}>
                {t(`categories.difficulty.${data.difficulty}`, data.difficulty).toLowerCase()}
              </Badge>
            </div>
            <h1 className="font-display uppercase tracking-tight text-2xl font-semibold leading-none">{data.name}</h1>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.imageUrl ? (
              <img src={data.imageUrl} alt={data.name} loading="lazy" className="w-full h-48 object-cover rounded-md" />
            ) : (
              <div className={`w-full h-32 ${categoryColorClass} rounded-md flex items-center justify-center`}>
                {CategoryIcon && <CategoryIcon className="w-9 h-9 opacity-40" strokeWidth={1.5} />}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="text-sm font-medium">{t("sessionModal.minAbbrev", { count: data.duration })}</span>
            </div>

            <p className="text-sm text-foreground">{data.description}</p>

            {data.steps.length > 0 && (
              <div className="border-t border-border pt-4">
                <h2 className="text-sm font-semibold text-foreground mb-2">{t("exerciseShare.diagram")}</h2>
                <DiagramPlayback courtType={data.courtType} steps={data.steps} />
              </div>
            )}

            {data.instructions && (
              <div className="border-t border-border pt-4">
                <h2 className="text-sm font-semibold text-foreground mb-1">{t("exerciseShare.instructions")}</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.instructions}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
