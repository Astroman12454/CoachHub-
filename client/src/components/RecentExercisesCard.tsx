import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ExerciseCard from "@/components/ExerciseCard";
import type { Exercise } from "@shared/schema";

interface RecentExercisesCardProps {
  exercises: Exercise[];
  onExerciseClick: (exerciseId: number) => void;
  onBrowseLibrary: () => void;
}

export default function RecentExercisesCard({ exercises, onExerciseClick, onBrowseLibrary }: RecentExercisesCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("dashboard.recentExercises")}</CardTitle>
        <Button
          variant="link"
          className="text-basketball-orange"
          onClick={onBrowseLibrary}
        >
          {t("dashboard.browseLibrary")}
        </Button>
      </CardHeader>
      <CardContent>
        {exercises.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t("dashboard.noExercisesInLibrary")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                onClick={() => onExerciseClick(exercise.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
