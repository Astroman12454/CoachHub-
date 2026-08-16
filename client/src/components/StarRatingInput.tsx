import { useState } from "react";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StarRatingInputProps {
  value: number; // 0 = no rating yet
  onChange: (rating: number) => void;
  disabled?: boolean;
  ariaLabelPrefix: string;
}

// Five clickable stars, filled up to the hovered (or, absent a hover,
// current) value — the same "preview before commit" behavior as any
// star-rating widget. Used on Community Exercises for a coach's own 1-5
// rating of another coach's drill; the read-only average shown alongside
// it (CommunityExercises/CoachProfile) is plain text, not this component.
export default function StarRatingInput({ value, onChange, disabled, ariaLabelPrefix }: StarRatingInputProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value;

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          aria-label={t("starRating.rateStars", { name: ariaLabelPrefix, count: star })}
          aria-pressed={value === star}
          className="disabled:opacity-50 disabled:pointer-events-none"
        >
          <Star
            className={`w-4 h-4 transition-colors ${star <= display ? "text-basketball-orange fill-basketball-orange" : "text-muted-foreground"}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}
