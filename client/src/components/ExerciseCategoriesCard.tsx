import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <CardContent className="space-y-3">
        {Object.entries(exercisesByCategory).map(([category, count]) => {
          const solidColorClass = CATEGORY_SOLID_COLORS[category as keyof typeof CATEGORY_SOLID_COLORS];
          const iconClass = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS];

          return (
            <div
              key={category}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              onClick={() => onCategoryClick(category)}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 ${solidColorClass} rounded-lg flex items-center justify-center`}>
                  <i className={`${iconClass} text-white text-sm`}></i>
                </div>
                <span className="font-medium capitalize">{category}</span>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">{count} exercises</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
