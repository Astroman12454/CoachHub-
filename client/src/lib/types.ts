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
  shooting: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  dribbling: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
  defense: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  passing: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
  conditioning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300'
} as const;

// Solid (500-weight) counterpart of CATEGORY_COLORS, for icon chips that
// need a filled background with white icon/text on top instead of a
// soft badge.
export const CATEGORY_SOLID_COLORS = {
  shooting: 'bg-blue-500',
  dribbling: 'bg-green-500',
  defense: 'bg-red-500',
  passing: 'bg-purple-500',
  conditioning: 'bg-yellow-500'
} as const;

export const CATEGORY_ICONS = {
  shooting: 'fas fa-basketball-ball',
  dribbling: 'fas fa-hand-paper',
  defense: 'fas fa-shield-alt', 
  passing: 'fas fa-exchange-alt',
  conditioning: 'fas fa-running'
} as const;

export const DIFFICULTY_COLORS = {
  easy: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300',
  hard: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
} as const;
