import { useState } from "react";
import { Pencil, Trash2, Clock, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { Exercise } from "@shared/schema";
import { CATEGORY_COLORS, CATEGORY_SOLID_COLORS, DIFFICULTY_COLORS, CATEGORY_ICONS } from "@/lib/types";

interface ExerciseCardProps {
  exercise: Exercise;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function ExerciseCard({ exercise, onClick, onEdit, onDelete }: ExerciseCardProps) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const categoryColorClass = CATEGORY_COLORS[exercise.category as keyof typeof CATEGORY_COLORS];
  const categorySolidClass = CATEGORY_SOLID_COLORS[exercise.category as keyof typeof CATEGORY_SOLID_COLORS];
  const CategoryIcon = CATEGORY_ICONS[exercise.category as keyof typeof CATEGORY_ICONS];
  const difficultyColorClass = DIFFICULTY_COLORS[exercise.difficulty as keyof typeof DIFFICULTY_COLORS];

  return (
    <div
      className="bg-card border border-border rounded-lg p-5 hover:border-basketball-orange hover:shadow-md transition-all duration-200 cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
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

        {(onEdit || onDelete) ? (
          // Always visible on mobile/tablet (no hover to reveal them on
          // touch); fades in on hover only once there's room to spare on
          // desktop.
          <div className="flex items-center gap-1.5 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="w-10 h-10 bg-card shadow-sm border border-border hover:bg-muted rounded-full flex items-center justify-center"
                aria-label={t("exerciseCard.editName", { name: exercise.name })}
              >
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="w-10 h-10 bg-card shadow-sm border border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full flex items-center justify-center"
                aria-label={t("exerciseCard.deleteName", { name: exercise.name })}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <div className="w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <ArrowRight className="w-3.5 h-3.5 text-basketball-orange" />
          </div>
        )}
      </div>

      {exercise.imageUrl && !imageFailed ? (
        <img
          src={exercise.imageUrl}
          alt={exercise.name}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="w-full h-32 object-cover rounded-md mb-4"
        />
      ) : (
        <div className={`w-full h-32 ${categoryColorClass} rounded-md mb-4 flex items-center justify-center`}>
          <CategoryIcon className="w-9 h-9 opacity-40" strokeWidth={1.5} />
        </div>
      )}

      <h3 className="font-display font-semibold uppercase tracking-tight text-foreground mb-2 group-hover:text-basketball-orange transition-colors duration-200">
        {exercise.name}
      </h3>
      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{exercise.description}</p>

      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="text-xs font-medium">{t("sessionModal.minAbbrev", { count: exercise.duration })}</span>
      </div>
    </div>
  );
}
