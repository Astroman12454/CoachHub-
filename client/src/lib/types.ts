export const EXERCISE_CATEGORIES = [
  'shooting',
  'dribbling', 
  'defense',
  'passing',
  'conditioning'
] as const;

export const DIFFICULTY_LEVELS = [
  'easy',
  'medium',
  'hard'
] as const;

export type ExerciseCategory = typeof EXERCISE_CATEGORIES[number];
export type DifficultyLevel = typeof DIFFICULTY_LEVELS[number];

export const CATEGORY_COLORS = {
  shooting: 'bg-blue-100 text-blue-800',
  dribbling: 'bg-green-100 text-green-800', 
  defense: 'bg-red-100 text-red-800',
  passing: 'bg-purple-100 text-purple-800',
  conditioning: 'bg-yellow-100 text-yellow-800'
} as const;

export const CATEGORY_ICONS = {
  shooting: 'fas fa-basketball-ball',
  dribbling: 'fas fa-hand-paper',
  defense: 'fas fa-shield-alt', 
  passing: 'fas fa-exchange-alt',
  conditioning: 'fas fa-running'
} as const;

export const DIFFICULTY_COLORS = {
  easy: 'text-green-600',
  medium: 'text-yellow-600',
  hard: 'text-red-600'
} as const;
