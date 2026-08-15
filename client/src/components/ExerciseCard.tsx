import { useState } from "react";
import { Pencil, Trash2, Clock, ArrowRight, Star, Copy, Share2, Globe, Users, Waypoints } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { Exercise } from "@shared/schema";
import { CATEGORY_COLORS, CATEGORY_SOLID_COLORS, DIFFICULTY_COLORS, CATEGORY_ICONS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { localizedExerciseText } from "@/lib/exerciseI18n";

interface ExerciseCardProps {
  exercise: Exercise;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleFavorite?: () => void;
  onDuplicate?: () => void;
  onShare?: () => void;
  onToggleCommunityShare?: () => void;
  onOpenDiagram?: () => void;
}

export default function ExerciseCard({ exercise, onClick, onEdit, onDelete, onToggleFavorite, onDuplicate, onShare, onToggleCommunityShare, onOpenDiagram }: ExerciseCardProps) {
  const { t, i18n } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const localized = localizedExerciseText(exercise, i18n.language);
  const categoryColorClass = CATEGORY_COLORS[exercise.category as keyof typeof CATEGORY_COLORS];
  const categorySolidClass = CATEGORY_SOLID_COLORS[exercise.category as keyof typeof CATEGORY_SOLID_COLORS];
  const CategoryIcon = CATEGORY_ICONS[exercise.category as keyof typeof CATEGORY_ICONS];
  const difficultyColorClass = DIFFICULTY_COLORS[exercise.difficulty as keyof typeof DIFFICULTY_COLORS];
  const isFavorite = exercise.isFavorite === 1;
  const isSharedToCommunity = exercise.sharedToCommunity === 1;

  return (
    <div
      className="bg-card border border-border rounded-lg p-5 hover:border-basketball-orange hover:shadow-md transition-all duration-200 cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className={`w-9 h-9 flex-shrink-0 ${categorySolidClass} rounded-md flex items-center justify-center`}>
          <CategoryIcon className="w-4 h-4 text-white" strokeWidth={2} />
        </div>
        <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-900/40 dark:text-orange-300 dark:bg-orange-950/40">
          {t(`categories.exercise.${exercise.category}`, exercise.category).toLowerCase()}
        </Badge>
        <Badge className={`${difficultyColorClass} shadow-sm`}>
          {t(`categories.difficulty.${exercise.difficulty}`, exercise.difficulty).toLowerCase()}
        </Badge>
        {exercise.phase && (
          <Badge variant="outline" className="border-border text-muted-foreground">
            {t(`categories.phase.${exercise.phase}`, exercise.phase).toLowerCase()}
          </Badge>
        )}
      </div>

      {/* Its own full-width row, separate from the badges above — with up to
          7 action buttons possible (favorite/diagram/community/share/
          duplicate/edit/delete) at 40px each, sharing a row with the badges
          (as it used to) reliably overflowed the card on anything but the
          widest desktop columns. w-full here is what lets flex-wrap below
          actually wrap onto a second line instead of just being sized by
          its own unwrapped content (a flex item with no explicit width
          isn't reliably constrained by its parent's own wrap). */}
      <div className="flex items-center flex-wrap justify-end gap-1.5 w-full mb-4">
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className="w-10 h-10 bg-card shadow-sm border border-border hover:bg-muted rounded-full flex items-center justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 data-[favorite=true]:opacity-100 transition-opacity duration-200"
            data-favorite={isFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? t("exerciseCard.unfavoriteName", { name: localized.name }) : t("exerciseCard.favoriteName", { name: localized.name })}
          >
            <Star className={cn("w-3.5 h-3.5", isFavorite ? "text-basketball-orange fill-basketball-orange" : "text-muted-foreground")} aria-hidden="true" />
          </button>
        )}
        {(onEdit || onDelete || onDuplicate || onShare || onToggleCommunityShare || onOpenDiagram) ? (
          // Always visible on mobile/tablet (no hover to reveal them on
          // touch); fades in on hover only once there's room to spare on
          // desktop.
          <div className="flex items-center flex-wrap justify-end gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
              {onOpenDiagram && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenDiagram(); }}
                  className="w-10 h-10 bg-card shadow-sm border border-border hover:bg-muted rounded-full flex items-center justify-center"
                  aria-label={t("exerciseCard.diagramName", { name: localized.name })}
                >
                  <Waypoints className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              )}
              {onToggleCommunityShare && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleCommunityShare(); }}
                  className="w-10 h-10 bg-card shadow-sm border border-border hover:bg-muted rounded-full flex items-center justify-center"
                  aria-pressed={isSharedToCommunity}
                  aria-label={isSharedToCommunity ? t("exerciseCard.unshareCommunityName", { name: localized.name }) : t("exerciseCard.shareCommunityName", { name: localized.name })}
                >
                  <Globe className={cn("w-3.5 h-3.5", isSharedToCommunity ? "text-basketball-orange" : "text-muted-foreground")} aria-hidden="true" />
                </button>
              )}
              {onShare && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onShare(); }}
                  className="w-10 h-10 bg-card shadow-sm border border-border hover:bg-muted rounded-full flex items-center justify-center"
                  aria-label={t("exerciseCard.shareName", { name: localized.name })}
                >
                  <Share2 className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              )}
              {onDuplicate && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                  className="w-10 h-10 bg-card shadow-sm border border-border hover:bg-muted rounded-full flex items-center justify-center"
                  aria-label={t("exerciseCard.duplicateName", { name: localized.name })}
                >
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="w-10 h-10 bg-card shadow-sm border border-border hover:bg-muted rounded-full flex items-center justify-center"
                  aria-label={t("exerciseCard.editName", { name: localized.name })}
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="w-10 h-10 bg-card shadow-sm border border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full flex items-center justify-center"
                  aria-label={t("exerciseCard.deleteName", { name: localized.name })}
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
          alt={localized.name}
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
        {localized.name}
      </h3>
      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{localized.description}</p>

      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-xs font-medium">{t("sessionModal.minAbbrev", { count: exercise.duration })}</span>
        </div>
        {!!exercise.minPlayers && (
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="text-xs font-medium">{t("exerciseCard.minPlayers", { count: exercise.minPlayers })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
