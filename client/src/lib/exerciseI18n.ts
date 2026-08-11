import type { Exercise } from "@shared/schema";

// Only the seed library (server/seed.ts) carries Spanish translations —
// a coach's own custom exercises have no *Es fields and simply fall back
// to the English ones, same as an exercise created before this existed.
type LocalizableExercise = Pick<
  Exercise,
  "name" | "description" | "instructions" | "nameEs" | "descriptionEs" | "instructionsEs"
>;

export interface LocalizedExerciseText {
  name: string;
  description: string;
  instructions: string | null;
}

export function localizedExerciseText(exercise: LocalizableExercise, language: string): LocalizedExerciseText {
  const useSpanish = language.startsWith("es");
  return {
    name: (useSpanish && exercise.nameEs) || exercise.name,
    description: (useSpanish && exercise.descriptionEs) || exercise.description,
    instructions: (useSpanish && exercise.instructionsEs) || exercise.instructions,
  };
}
