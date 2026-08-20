import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DiagramPlayback from "@/components/DiagramPlayback";
import { CATEGORY_COLORS, CATEGORY_SOLID_COLORS, DIFFICULTY_COLORS, CATEGORY_ICONS } from "@/lib/types";
import { localizedExerciseText } from "@/lib/exerciseI18n";
import type { Token, Drawing } from "@shared/schema";

export interface SharedExerciseData {
  id: number;
  name: string;
  description: string;
  category: string;
  duration: number;
  difficulty: string;
  instructions: string | null;
  imageUrl: string | null;
  courtType: "half" | "full";
  nameEs: string | null;
  descriptionEs: string | null;
  instructionsEs: string | null;
  steps: { tokens: Token[]; drawings: Drawing[] }[];
}

// The read-only exercise view shared by ExerciseShare.tsx (private,
// unguessable-token link) and CommunityExercisePublic.tsx (public,
// indexable page keyed by exercise id) — same data shape, same card, only
// how it's fetched and what wraps it (SEO meta tags, a signup CTA) differs
// between the two.
export default function SharedExerciseCard({ data }: { data: SharedExerciseData }) {
  const { t, i18n } = useTranslation();
  const categoryColorClass = CATEGORY_COLORS[data.category as keyof typeof CATEGORY_COLORS];
  const categorySolidClass = CATEGORY_SOLID_COLORS[data.category as keyof typeof CATEGORY_SOLID_COLORS];
  const CategoryIcon = CATEGORY_ICONS[data.category as keyof typeof CATEGORY_ICONS];
  const difficultyColorClass = DIFFICULTY_COLORS[data.difficulty as keyof typeof DIFFICULTY_COLORS];
  const localized = localizedExerciseText(data, i18n.language);

  return (
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
        <h1 className="font-display uppercase tracking-tight text-2xl font-semibold leading-none">{localized.name}</h1>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.imageUrl ? (
          <img src={data.imageUrl} alt={localized.name} loading="lazy" className="w-full h-48 object-cover rounded-md" />
        ) : (
          <div className={`w-full h-32 ${categoryColorClass} rounded-md flex items-center justify-center`}>
            {CategoryIcon && <CategoryIcon className="w-9 h-9 opacity-40" strokeWidth={1.5} />}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-sm font-medium">{t("sessionModal.minAbbrev", { count: data.duration })}</span>
        </div>

        <p className="text-sm text-foreground">{localized.description}</p>

        {data.steps.length > 0 && (
          <div className="border-t border-border pt-4">
            <h2 className="text-sm font-semibold text-foreground mb-2">{t("exerciseShare.diagram")}</h2>
            <DiagramPlayback courtType={data.courtType} steps={data.steps} />
          </div>
        )}

        {localized.instructions && (
          <div className="border-t border-border pt-4">
            <h2 className="text-sm font-semibold text-foreground mb-1">{t("exerciseShare.instructions")}</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{localized.instructions}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
