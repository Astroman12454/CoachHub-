import {
  Target, Hand, Shield, ArrowLeftRight, Activity,
  Crosshair, CircleDot, Goal, Footprints, Move, Zap,
  ShieldAlert, ShieldCheck, Users, ArrowRightLeft, Send,
  MoveHorizontal, Flame, Timer,
} from "lucide-react";
import { EXERCISE_CATEGORIES, DIFFICULTY_LEVELS } from "@shared/schema";

export { EXERCISE_CATEGORIES, DIFFICULTY_LEVELS };
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
  shooting: Target,
  dribbling: Hand,
  defense: Shield,
  passing: ArrowLeftRight,
  conditioning: Activity,
} as const;

// A handful of icons per category, so cards without a real photo (most of
// the library today) don't all render as the exact same glyph — picked
// deterministically from the exercise id below rather than at random, so a
// given exercise's card looks the same on every render/reload.
export const CATEGORY_ICON_VARIANTS = {
  shooting: [Target, Crosshair, CircleDot, Goal],
  dribbling: [Hand, Footprints, Move, Zap],
  defense: [Shield, ShieldAlert, ShieldCheck, Users],
  passing: [ArrowLeftRight, ArrowRightLeft, Send, MoveHorizontal],
  conditioning: [Activity, Flame, Timer, Zap],
} as const;

export function getExerciseVisualIcon(category: string, id: number) {
  const variants = CATEGORY_ICON_VARIANTS[category as keyof typeof CATEGORY_ICON_VARIANTS];
  if (!variants) return CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] ?? Target;
  return variants[id % variants.length];
}

export const DIFFICULTY_COLORS = {
  easy: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300',
  hard: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
} as const;
