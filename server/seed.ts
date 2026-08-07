import { storage } from "./storage";
import type { InsertExercise, CreatePlay } from "@shared/schema";

// Starter library copied into every new account at signup, so a free-plan
// coach (who can't create their own exercises) still has something usable
// on day one instead of an empty library. Real, commonly-taught drills
// (Mikan Drill, 3-man weave, 2-3 zone shell work, etc.), not filler —
// three per exercise category.
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
    name: "Mikan Drill",
    description: "Classic under-the-basket drill for soft touch, footwork, and finishing with either hand",
    category: "shooting",
    duration: 10,
    difficulty: "medium",
    instructions: "Start under the basket. Lay the ball in with the right hand, catch it out of the net with the left, lay it in with the left hand, catch with the right — alternate continuously. Once comfortable, add the two-step footwork (jump stop into each layup) to build timing for game-speed finishes.",
    imageUrl: null,
  },
  {
    name: "Spot Shooting (5 Spots)",
    description: "Game-speed catch-and-shoot reps from five real scoring spots on the floor",
    category: "shooting",
    duration: 15,
    difficulty: "medium",
    instructions: "Shoot from both elbows, both wings, and the top of the key. Rebound your own shot, pass to the next line, and rotate spots after each make (or after a set number of attempts). Emphasize a quick catch-and-release, not just makes.",
    imageUrl: null,
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
    name: "Two-Ball Dribbling",
    description: "Simultaneous two-ball control to force both hands to work independently",
    category: "dribbling",
    duration: 10,
    difficulty: "hard",
    instructions: "Dribble two balls at once, stationary at first (both hands together, then alternating), then walking the length of the court. Progress to one ball high and one low, and crossovers with both balls together.",
    imageUrl: null,
  },
  {
    name: "Figure-8 Dribbling",
    description: "Low, tight ball control weaving the ball between and around the legs",
    category: "dribbling",
    duration: 8,
    difficulty: "medium",
    instructions: "Straddle the ball and weave it in a figure-8 pattern between your legs, staying low. Start stationary, then repeat while walking forward the length of the court.",
    imageUrl: null,
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
    name: "Closeout Drill",
    description: "Controlled sprint-to-contest technique for closing out on a shooter",
    category: "defense",
    duration: 15,
    difficulty: "medium",
    instructions: "Start in help position and sprint out to a shooter on the perimeter, chopping the feet down into a low, balanced stance on the last two steps with a high hand to contest the shot without fouling or flying by.",
    imageUrl: null,
  },
  {
    name: "4-on-4 Shell Drill",
    description: "No-dribble positioning drill for on-ball, deny, and help-side rotations",
    category: "defense",
    duration: 20,
    difficulty: "hard",
    instructions: "Four offensive players hold spots around the perimeter and reverse the ball with passes only (no dribbling, no shooting). Four defenders practice ball, deny, and help positioning, rotating every time the ball moves — the classic shell drill for team defensive shape.",
    imageUrl: null,
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
    name: "Star Passing Drill",
    description: "Five-spot passing pattern that builds crisp, on-time passes on the move",
    category: "passing",
    duration: 12,
    difficulty: "medium",
    instructions: "Set up five players in a star (pentagon) shape. Pass and follow your pass to the back of the next line, continuing the pattern around the star. Rotate pass types (chest, bounce, overhead) each round and pick up the pace once the pattern is clean.",
    imageUrl: null,
  },
  {
    name: "Partner Rapid-Fire Passing",
    description: "Fast, close-range passing for quick hands and target accuracy",
    category: "passing",
    duration: 8,
    difficulty: "easy",
    instructions: "Partners stand about 10 feet apart and pass back and forth as fast as possible for 30-45 seconds, alternating chest and bounce passes each set. Keep the target at chest height and the passes crisp, not lobbed.",
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
  {
    name: "Three-Man Weave",
    description: "Full-court passing-and-cutting conditioning drill that finishes with a layup",
    category: "conditioning",
    duration: 15,
    difficulty: "medium",
    instructions: "Three players form three lines at the baseline. The middle player passes to one side and sprints behind them to the opposite lane; the drill continues weaving up the court (pass, sprint behind, pass, sprint behind) and finishes with a layup, then jog back and repeat.",
    imageUrl: null,
  },
  {
    name: "17s",
    description: "Classic sideline-to-sideline conditioning benchmark under a time limit",
    category: "conditioning",
    duration: 10,
    difficulty: "hard",
    instructions: "Sprint sideline to sideline and back 17 times (34 lines) before the time cap expires. Used as both a conditioning drill and a fitness benchmark players can try to beat over the season.",
    imageUrl: null,
  },
];

export async function seedDefaultExercises(accountId: number): Promise<void> {
  for (const exercise of DEFAULT_EXERCISES) {
    await storage.createExercise(accountId, exercise as InsertExercise);
  }
}

// A starter playbook of real, commonly-run sets — not wired into signup
// (unlike the exercises above) because plays count against the free plan's
// creation limit (see FREE_PLAN_PLAY_LIMIT in shared/schema.ts); handing a
// free-plan coach 8 plays would eat most or all of their own quota before
// they've drawn anything themselves. Exported for callers (e.g. an admin
// backfill script) that want to add these to a specific team on purpose.
//
// Coordinates are x/y percent of a half-court diagram (0,0 = baseline
// corner nearest the basket at ~(50,11); y grows toward mid-court) — see
// PlayEditor's toSVGPoint/toViewBoxY comment for the same convention.
export const DEFAULT_PLAYS: CreatePlay[] = [
  {
    name: "Horns",
    category: "offense",
    courtType: "half",
    notes: "Both post players start at the elbows (the 'horns'). Great spacing, and it can attack man or zone with a pick-and-roll, a post entry, or dribble hand-off options.",
    steps: [
      {
        tokens: [
          { id: "h1", type: "offense", label: "1", x: 50, y: 62 },
          { id: "h2", type: "offense", label: "2", x: 8, y: 16 },
          { id: "h3", type: "offense", label: "3", x: 92, y: 16 },
          { id: "h4", type: "offense", label: "4", x: 34, y: 40 },
          { id: "h5", type: "offense", label: "5", x: 66, y: 40 },
          { id: "hb", type: "ball", label: "", x: 52, y: 60 },
        ],
        drawings: [
          { id: "hd1", tool: "screen", points: [{ x: 66, y: 40 }] },
          { id: "hd2", tool: "move", points: [{ x: 50, y: 62 }, { x: 66, y: 45 }] },
          { id: "hd3", tool: "move", points: [{ x: 66, y: 40 }, { x: 58, y: 20 }] },
        ],
      },
      {
        tokens: [
          { id: "h1", type: "offense", label: "1", x: 66, y: 45 },
          { id: "h2", type: "offense", label: "2", x: 8, y: 16 },
          { id: "h3", type: "offense", label: "3", x: 92, y: 16 },
          { id: "h4", type: "offense", label: "4", x: 34, y: 40 },
          { id: "h5", type: "offense", label: "5", x: 58, y: 20 },
          { id: "hb", type: "ball", label: "", x: 68, y: 45 },
        ],
        drawings: [],
      },
    ],
  },
  {
    name: "High Pick-and-Roll",
    category: "offense",
    courtType: "half",
    notes: "The bread-and-butter two-man action: the ball handler uses a screen from the 5 at the top of the key, reading whether to turn the corner, pull up, or hit the roller.",
    steps: [
      {
        tokens: [
          { id: "p1", type: "offense", label: "1", x: 50, y: 65 },
          { id: "p2", type: "offense", label: "2", x: 10, y: 45 },
          { id: "p3", type: "offense", label: "3", x: 90, y: 45 },
          { id: "p4", type: "offense", label: "4", x: 35, y: 18 },
          { id: "p5", type: "offense", label: "5", x: 50, y: 45 },
          { id: "pb", type: "ball", label: "", x: 52, y: 63 },
        ],
        drawings: [
          { id: "pd1", tool: "screen", points: [{ x: 50, y: 45 }] },
          { id: "pd2", tool: "dribble", points: [{ x: 50, y: 65 }, { x: 70, y: 50 }] },
          { id: "pd3", tool: "move", points: [{ x: 50, y: 45 }, { x: 55, y: 20 }] },
        ],
      },
      {
        tokens: [
          { id: "p1", type: "offense", label: "1", x: 70, y: 50 },
          { id: "p2", type: "offense", label: "2", x: 10, y: 45 },
          { id: "p3", type: "offense", label: "3", x: 90, y: 45 },
          { id: "p4", type: "offense", label: "4", x: 35, y: 18 },
          { id: "p5", type: "offense", label: "5", x: 55, y: 20 },
          { id: "pb", type: "ball", label: "", x: 72, y: 50 },
        ],
        drawings: [],
      },
    ],
  },
  {
    name: "Give-and-Go",
    category: "offense",
    courtType: "half",
    notes: "Simplest two-man game in basketball: pass to the wing, cut hard backdoor, get it right back for a layup if the defender ball-watches.",
    steps: [
      {
        tokens: [
          { id: "g1", type: "offense", label: "1", x: 50, y: 60 },
          { id: "g2", type: "offense", label: "2", x: 20, y: 45 },
          { id: "g3", type: "offense", label: "3", x: 80, y: 45 },
          { id: "g4", type: "offense", label: "4", x: 35, y: 20 },
          { id: "g5", type: "offense", label: "5", x: 65, y: 20 },
          { id: "gb", type: "ball", label: "", x: 50, y: 60 },
        ],
        drawings: [
          { id: "gd1", tool: "pass", points: [{ x: 50, y: 60 }, { x: 20, y: 45 }] },
          { id: "gd2", tool: "move", points: [{ x: 50, y: 60 }, { x: 50, y: 15 }] },
        ],
      },
      {
        tokens: [
          { id: "g1", type: "offense", label: "1", x: 50, y: 15 },
          { id: "g2", type: "offense", label: "2", x: 20, y: 45 },
          { id: "g3", type: "offense", label: "3", x: 80, y: 45 },
          { id: "g4", type: "offense", label: "4", x: 35, y: 20 },
          { id: "g5", type: "offense", label: "5", x: 65, y: 20 },
          { id: "gb", type: "ball", label: "", x: 50, y: 15 },
        ],
        drawings: [],
      },
    ],
  },
  {
    name: "2-3 Zone Defense",
    category: "defense",
    courtType: "half",
    notes: "Two guards up top, two wings/corners, one big protecting the middle. When the ball goes to a wing: the nearest corner closes out, the far guard slides to the top, and the middle shifts ball-side.",
    steps: [
      {
        tokens: [
          { id: "z1", type: "defense", label: "1", x: 30, y: 60 },
          { id: "z2", type: "defense", label: "2", x: 70, y: 60 },
          { id: "z3", type: "defense", label: "3", x: 15, y: 25 },
          { id: "z4", type: "defense", label: "4", x: 85, y: 25 },
          { id: "z5", type: "defense", label: "5", x: 50, y: 16 },
          { id: "zo", type: "offense", label: "1", x: 80, y: 45 },
          { id: "zb", type: "ball", label: "", x: 80, y: 45 },
        ],
        drawings: [
          { id: "zd1", tool: "move", points: [{ x: 85, y: 25 }, { x: 75, y: 35 }] },
          { id: "zd2", tool: "move", points: [{ x: 70, y: 60 }, { x: 55, y: 45 }] },
          { id: "zd3", tool: "move", points: [{ x: 50, y: 16 }, { x: 55, y: 19 }] },
        ],
      },
      {
        tokens: [
          { id: "z1", type: "defense", label: "1", x: 30, y: 60 },
          { id: "z2", type: "defense", label: "2", x: 55, y: 45 },
          { id: "z3", type: "defense", label: "3", x: 15, y: 25 },
          { id: "z4", type: "defense", label: "4", x: 75, y: 35 },
          { id: "z5", type: "defense", label: "5", x: 55, y: 19 },
          { id: "zo", type: "offense", label: "1", x: 80, y: 45 },
          { id: "zb", type: "ball", label: "", x: 80, y: 45 },
        ],
        drawings: [],
      },
    ],
  },
  {
    name: "Box Set (Baseline Inbound)",
    category: "inbound",
    courtType: "half",
    notes: "Baseline out-of-bounds box formation: the post players set down-screens for the wings, freeing one of them for a catch-and-shoot look.",
    steps: [
      {
        tokens: [
          { id: "b1", type: "offense", label: "1", x: 50, y: 1 },
          { id: "b2", type: "offense", label: "2", x: 38, y: 38 },
          { id: "b3", type: "offense", label: "3", x: 62, y: 38 },
          { id: "b4", type: "offense", label: "4", x: 38, y: 14 },
          { id: "b5", type: "offense", label: "5", x: 62, y: 14 },
        ],
        drawings: [
          { id: "bd1", tool: "screen", points: [{ x: 38, y: 14 }] },
          { id: "bd2", tool: "screen", points: [{ x: 62, y: 14 }] },
          { id: "bd3", tool: "move", points: [{ x: 38, y: 38 }, { x: 12, y: 18 }] },
          { id: "bd4", tool: "move", points: [{ x: 62, y: 38 }, { x: 88, y: 30 }] },
        ],
      },
      {
        tokens: [
          { id: "b1", type: "offense", label: "1", x: 50, y: 1 },
          { id: "b2", type: "offense", label: "2", x: 12, y: 18 },
          { id: "b3", type: "offense", label: "3", x: 88, y: 30 },
          { id: "b4", type: "offense", label: "4", x: 40, y: 20 },
          { id: "b5", type: "offense", label: "5", x: 60, y: 20 },
        ],
        drawings: [],
      },
    ],
  },
  {
    name: "Stack Sideline Inbound",
    category: "inbound",
    courtType: "half",
    notes: "Players stack along the lane on a sideline throw-in; the front of the stack cuts to the ball while the back of the stack clears to the opposite corner.",
    steps: [
      {
        tokens: [
          { id: "s1", type: "offense", label: "1", x: 95, y: 55 },
          { id: "s2", type: "offense", label: "2", x: 55, y: 40 },
          { id: "s3", type: "offense", label: "3", x: 55, y: 30 },
          { id: "s4", type: "offense", label: "4", x: 55, y: 20 },
          { id: "s5", type: "offense", label: "5", x: 55, y: 10 },
        ],
        drawings: [
          { id: "sd1", tool: "move", points: [{ x: 55, y: 40 }, { x: 82, y: 48 }] },
          { id: "sd2", tool: "move", points: [{ x: 55, y: 10 }, { x: 25, y: 14 }] },
        ],
      },
      {
        tokens: [
          { id: "s1", type: "offense", label: "1", x: 95, y: 55 },
          { id: "s2", type: "offense", label: "2", x: 82, y: 48 },
          { id: "s3", type: "offense", label: "3", x: 55, y: 30 },
          { id: "s4", type: "offense", label: "4", x: 55, y: 20 },
          { id: "s5", type: "offense", label: "5", x: 25, y: 14 },
        ],
        drawings: [],
      },
    ],
  },
  {
    name: "Fast Break 3-on-2",
    category: "special",
    courtType: "half",
    notes: "Transition read: the ball handler pushes the middle lane while the other two fill wide, reading the two back defenders to decide drive, dish, or pull-up.",
    steps: [
      {
        tokens: [
          { id: "f1", type: "offense", label: "1", x: 50, y: 75 },
          { id: "f2", type: "offense", label: "2", x: 15, y: 65 },
          { id: "f3", type: "offense", label: "3", x: 85, y: 65 },
          { id: "fx1", type: "defense", label: "1", x: 40, y: 30 },
          { id: "fx2", type: "defense", label: "2", x: 60, y: 30 },
          { id: "fb", type: "ball", label: "", x: 50, y: 75 },
        ],
        drawings: [
          { id: "fd1", tool: "dribble", points: [{ x: 50, y: 75 }, { x: 50, y: 45 }] },
          { id: "fd2", tool: "move", points: [{ x: 15, y: 65 }, { x: 12, y: 25 }] },
          { id: "fd3", tool: "move", points: [{ x: 85, y: 65 }, { x: 88, y: 25 }] },
        ],
      },
      {
        tokens: [
          { id: "f1", type: "offense", label: "1", x: 50, y: 45 },
          { id: "f2", type: "offense", label: "2", x: 12, y: 25 },
          { id: "f3", type: "offense", label: "3", x: 88, y: 25 },
          { id: "fx1", type: "defense", label: "1", x: 45, y: 25 },
          { id: "fx2", type: "defense", label: "2", x: 55, y: 25 },
          { id: "fb", type: "ball", label: "", x: 50, y: 45 },
        ],
        drawings: [],
      },
    ],
  },
  {
    name: "End-of-Game Isolation",
    category: "special",
    courtType: "half",
    notes: "Clear one side for your best scorer with a side ball-screen option; everyone else spaces to the three-point line to keep the driving lane open.",
    steps: [
      {
        tokens: [
          { id: "e1", type: "offense", label: "1", x: 55, y: 60 },
          { id: "e5", type: "offense", label: "5", x: 75, y: 55 },
          { id: "e2", type: "offense", label: "2", x: 10, y: 45 },
          { id: "e3", type: "offense", label: "3", x: 90, y: 20 },
          { id: "e4", type: "offense", label: "4", x: 15, y: 20 },
          { id: "eb", type: "ball", label: "", x: 55, y: 60 },
        ],
        drawings: [
          { id: "ed1", tool: "screen", points: [{ x: 75, y: 55 }] },
          { id: "ed2", tool: "dribble", points: [{ x: 55, y: 60 }, { x: 35, y: 25 }] },
          { id: "ed3", tool: "text", points: [{ x: 55, y: 70 }], text: "ISO" },
        ],
      },
      {
        tokens: [
          { id: "e1", type: "offense", label: "1", x: 35, y: 25 },
          { id: "e5", type: "offense", label: "5", x: 75, y: 55 },
          { id: "e2", type: "offense", label: "2", x: 10, y: 45 },
          { id: "e3", type: "offense", label: "3", x: 90, y: 20 },
          { id: "e4", type: "offense", label: "4", x: 15, y: 20 },
          { id: "eb", type: "ball", label: "", x: 35, y: 25 },
        ],
        drawings: [],
      },
    ],
  },
];

export async function seedDefaultPlays(teamId: number): Promise<void> {
  for (const play of DEFAULT_PLAYS) {
    await storage.createPlayWithSteps(teamId, play);
  }
}
