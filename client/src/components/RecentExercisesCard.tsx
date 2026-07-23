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
  return (
    <Card className="mt-8">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent Exercises</CardTitle>
        <Button
          variant="link"
          className="text-basketball-orange"
          onClick={onBrowseLibrary}
        >
          Browse Library
        </Button>
      </CardHeader>
      <CardContent>
        {exercises.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">No exercises in library</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
