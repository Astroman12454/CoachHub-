import { db } from "./db";
import { exercises, trainingSessions, players } from "@shared/schema";
import type { InsertExercise, InsertTrainingSession, InsertPlayer } from "@shared/schema";

export async function seedDatabase() {
  try {
    // Check if data already exists
    const existingExercises = await db.select().from(exercises);
    if (existingExercises.length > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    // Sample exercises
    const sampleExercises: InsertExercise[] = [
      {
        name: "Free Throw Form Drill",
        description: "Focus on consistent shooting form and follow-through technique",
        category: "shooting",
        duration: 15,
        difficulty: "medium",
        instructions: "Stand at the free throw line, focus on form and follow-through",
        imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200"
      },
      {
        name: "Cone Weaving Drill",
        description: "Improve ball handling and agility through cone navigation",
        category: "dribbling",
        duration: 10,
        difficulty: "easy",
        instructions: "Dribble through cones using both hands",
        imageUrl: "https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200"
      },
      {
        name: "Defensive Sliding Drill",
        description: "Build lateral quickness and proper defensive stance",
        category: "defense",
        duration: 20,
        difficulty: "hard",
        instructions: "Maintain low stance, slide laterally without crossing feet",
        imageUrl: "https://images.unsplash.com/photo-1518611012118-696072aa579a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200"
      },
      {
        name: "Chest Pass Accuracy",
        description: "Improve passing accuracy and technique",
        category: "passing",
        duration: 12,
        difficulty: "medium",
        instructions: "Pass the ball using proper chest pass technique to targets",
      },
      {
        name: "Suicide Sprints",
        description: "Build cardiovascular endurance and speed",
        category: "conditioning",
        duration: 8,
        difficulty: "hard",
        instructions: "Sprint to each line and back, touch each line",
      }
    ];

    // Insert exercises
    await db.insert(exercises).values(sampleExercises);

    // Sample training sessions for this week
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    
    const sampleSessions: InsertTrainingSession[] = [
      {
        name: "Fundamentos Ofensivos",
        date: monday.toISOString().split('T')[0],
        time: "16:00",
        duration: 120,
        exerciseIds: ["1", "4"],
        notes: "Enfoque en forma de tiro y movimiento de balón",
        attendanceCount: 16,
        totalPlayers: 18,
        status: "completed"
      },
      {
        name: "Ejercicios Defensivos",
        date: new Date(monday.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Wednesday
        time: "15:30",
        duration: 120,
        exerciseIds: ["3"],
        notes: "Énfasis en defensa de equipo",
        attendanceCount: 18,
        totalPlayers: 18,
        status: "scheduled"
      },
      {
        name: "Práctica de Tiros Libres",
        date: new Date(monday.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Friday
        time: "17:00",
        duration: 90,
        exerciseIds: ["1"],
        notes: "Sesión enfocada en precisión",
        attendanceCount: 0,
        totalPlayers: 18,
        status: "scheduled"
      }
    ];

    // Insert training sessions
    await db.insert(trainingSessions).values(sampleSessions);

    // Sample players
    const samplePlayers: InsertPlayer[] = [
      { name: "Carlos García", position: "Point Guard", isActive: 1 },
      { name: "Miguel Rodriguez", position: "Shooting Guard", isActive: 1 },
      { name: "Antonio López", position: "Center", isActive: 1 },
      { name: "José Martínez", position: "Power Forward", isActive: 1 },
      { name: "Luis Hernández", position: "Small Forward", isActive: 1 },
      { name: "Francisco Silva", position: "Point Guard", isActive: 1 },
      { name: "Pablo Ruiz", position: "Shooting Guard", isActive: 1 },
      { name: "Diego Morales", position: "Center", isActive: 1 },
      { name: "Andrés Vásquez", position: "Power Forward", isActive: 1 },
      { name: "Ricardo Torres", position: "Small Forward", isActive: 1 },
      { name: "Alejandro Pérez", position: "Point Guard", isActive: 1 },
      { name: "Fernando Castro", position: "Shooting Guard", isActive: 1 },
      { name: "Javier Mendoza", position: "Small Forward", isActive: 1 },
      { name: "Roberto Jiménez", position: "Power Forward", isActive: 1 },
      { name: "Sergio Romero", position: "Center", isActive: 1 },
      { name: "Manuel Gutiérrez", position: "Point Guard", isActive: 1 },
      { name: "Raúl Vargas", position: "Shooting Guard", isActive: 1 },
      { name: "Eduardo Ramos", position: "Small Forward", isActive: 1 }
    ];

    // Insert players
    await db.insert(players).values(samplePlayers);

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}