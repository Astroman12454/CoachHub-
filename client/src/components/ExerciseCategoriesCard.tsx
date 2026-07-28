import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_SOLID_COLORS, CATEGORY_ICONS } from "@/lib/types";

interface ExerciseCategoriesCardProps {
  exercisesByCategory: Record<string, number>;
  onCategoryClick: (category: string) => void;
}

export default function ExerciseCategoriesCard({ exercisesByCategory, onCategoryClick }: ExerciseCategoriesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exercise Categories</CardTitle>
      </CardHeader>
      <div className="px-2 pb-2">
        {Object.entries(exercisesByCategory).map(([category, count]) => {
          const solidColorClass = CATEGORY_SOLID_COLORS[category as keyof typeof CATEGORY_SOLID_COLORS];
          const CategoryIcon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS];

          return (
            <button
              type="button"
              key={category}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted transition-colors text-left"
              onClick={() => onCategoryClick(category)}
            >
              <span className={`w-2 h-2 rounded-full ${solidColorClass} flex-shrink-0`} aria-hidden="true" />
              <CategoryIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="font-medium capitalize flex-1">{category}</span>
              <span className="font-display font-semibold text-muted-foreground tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
