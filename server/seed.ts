import { storage } from "./storage";
import type { InsertExercise } from "@shared/schema";

// Starter library copied into every new account at signup, so a free-plan
// coach (who can't create their own exercises) still has something usable
// on day one instead of an empty library.
export const DEFAULT_EXERCISES: InsertExercise[] = [
  {
    name: "Free Throw Form Drill",
    description: "Focus on consistent shooting form and follow-through technique",
    category: "shooting",
    duration: 15,
    difficulty: "medium",
    instructions: "Stand at the free throw line, focus on form and follow-through",
    imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200",
  },
  {
    name: "Cone Weaving Drill",
    description: "Improve ball handling and agility through cone navigation",
    category: "dribbling",
    duration: 10,
    difficulty: "easy",
    instructions: "Dribble through cones using both hands",
    imageUrl: "https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200",
  },
  {
    name: "Defensive Sliding Drill",
    description: "Build lateral quickness and proper defensive stance",
    category: "defense",
    duration: 20,
    difficulty: "hard",
    instructions: "Maintain low stance, slide laterally without crossing feet",
    imageUrl: "https://images.unsplash.com/photo-1518611012118-696072aa579a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200",
  },
  {
    name: "Chest Pass Accuracy",
    description: "Improve passing accuracy and technique",
    category: "passing",
    duration: 12,
    difficulty: "medium",
    instructions: "Pass the ball using proper chest pass technique to targets",
    imageUrl: null,
  },
  {
    name: "Suicide Sprints",
    description: "Build cardiovascular endurance and speed",
    category: "conditioning",
    duration: 8,
    difficulty: "hard",
    instructions: "Sprint to each line and back, touch each line",
    imageUrl: null,
  },
];

export async function seedDefaultExercises(accountId: number): Promise<void> {
  for (const exercise of DEFAULT_EXERCISES) {
    await storage.createExercise(accountId, exercise as InsertExercise);
  }
}
