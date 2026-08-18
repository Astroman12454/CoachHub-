import { getAIClient, parseJSONResponse } from "./ai-client";
import type { Exercise, TrainingSession } from "@shared/schema";

export { isAIConfigured } from "./ai-client";

export interface GeneratedSessionPlan {
  name: string;
  notes: string | null;
  duration: number;
  exerciseIds: string[];
}

// A hard, deterministic floor the AI can't override: an exercise with no
// minPlayers set is assumed to fit any group size, so only ones with an
// explicit minimum that exceeds the attending count are dropped. When
// playerCount is undefined (the coach skipped the field), every exercise
// stays eligible — same as before this feature existed.
export function filterExercisesForPlayerCount(exercises: Exercise[], playerCount: number | undefined): Exercise[] {
  if (playerCount === undefined) return exercises;
  return exercises.filter((e) => !e.minPlayers || e.minPlayers <= playerCount);
}

// Everything the generator knows about the team beyond the exercise library
// and recent sessions — the difference between "picks drills" and "knows
// this team". All three come from data the app already collects elsewhere
// (injury tracking, drill/shot-chart logging, playbook practice stats); this
// is purely about feeding it into the one prompt that acts on it.
export interface SessionPlanContext {
  injuredPlayerNames: string[];
  weakDrills: { drillName: string; percentage: number; attempts: number }[];
  neglectedPlays: { name: string; category: string; timesPracticed: number }[];
}

const SYSTEM_PROMPT = `You help a basketball coach plan one training session by choosing drills from their own exercise library.

You will be given a numbered list of the team's exercises (id, name, category, difficulty, duration in minutes, description, and minimum players required when the coach set one), a summary of their recent sessions, optionally some team context (currently injured players, drills the team has been weak at, plays that haven't been practiced recently), optionally how many players will attend this session, and optionally the coach's own instructions for this session.

Rules:
- Only use exercise ids from the list you were given. Never invent a drill, and never use an id that isn't in the list.
- Pick 3 to 6 exercises that make sense together for one practice.
- Prefer variety across categories unless the coach's instructions say otherwise (e.g. "just shooting today").
- If recent sessions leaned heavily on a category, favor other categories unless the coach asked for that one specifically.
- If any players are listed as currently injured, avoid exercises whose name or description suggests they'd aggravate that injury (e.g. skip jump-heavy or high-impact conditioning drills for a listed ankle/knee/foot injury) — you don't need to name the player, just steer around it.
- If weak drills are listed, prefer exercises in the same category so the session addresses them.
- If the number of attending players is given, every exercise you pick is already guaranteed to fit that group size (the list has been pre-filtered), but still use judgment from each drill's name/description — e.g. don't pick something that reads as a full 5-on-5 scrimmage for a group of 4, even if it has no stated minimum.
- Mention in "notes" any injury, weak-area, neglected-play, or player-count consideration that actually shaped your choices, in plain language a coach would say out loud — one short clause is enough, don't write a report. Skip it entirely if none of that context changed your picks.

Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "name": string,              // a short, specific session name, e.g. "Transition Defense & Shooting"
  "notes": string | null,      // 1-2 sentences on the session's focus, or null
  "duration": number,          // total session length in minutes (typically 60-120)
  "exerciseIds": number[]      // the chosen exercise ids, from the list given
}`;

// Costs real money per call (Anthropic API), same as the box-score import —
// kept behind isAIConfigured() so the rest of the app runs fine without an
// ANTHROPIC_API_KEY.
export async function generateSessionPlan(
  exercises: Exercise[],
  recentSessions: TrainingSession[],
  instructions: string | undefined,
  context?: SessionPlanContext,
  playerCount?: number,
): Promise<GeneratedSessionPlan> {
  const anthropic = getAIClient();

  const library = exercises
    .map((e) => `${e.id}. ${e.name} [${e.category}, ${e.difficulty}, ${e.duration} min${e.minPlayers ? `, min ${e.minPlayers} players` : ""}] — ${e.description}`)
    .join("\n");

  const recentSummary = recentSessions.length > 0
    ? recentSessions
        .slice(0, 8)
        .map((s) => `- ${s.date}: "${s.name}" (${(s.exerciseIds ?? []).length} exercises, ${s.attendanceCount ?? 0}/${s.totalPlayers ?? "?"} attended)`)
        .join("\n")
    : "No past sessions yet.";

  const contextLines: string[] = [];
  if (context?.injuredPlayerNames.length) {
    // Never send a real player's name to a third-party API — the model
    // only needs to know an injured player exists and steer around
    // aggravating it, not who they are. Anonymized labels (never reused
    // across calls, so they carry no identity of their own) do that job
    // just as well as a real name would.
    const anonymizedLabels = context.injuredPlayerNames.map((_, i) => `Player ${i + 1}`);
    contextLines.push(`Currently injured (anonymized labels, avoid aggravating, no need to name them in your output): ${anonymizedLabels.join(", ")}.`);
  }
  if (context?.weakDrills.length) {
    contextLines.push(
      `Drills the team has struggled with recently: ${context.weakDrills.map((d) => `${d.drillName} (${d.percentage}% over ${d.attempts} attempts)`).join("; ")}.`,
    );
  }
  if (context?.neglectedPlays.length) {
    contextLines.push(
      `Playbook plays that haven't been practiced in a while: ${context.neglectedPlays.map((p) => `${p.name} (${p.category})`).join(", ")}. There's no drill for "running a play" in the library, so just note it if relevant — don't invent an exercise for it.`,
    );
  }
  if (playerCount) {
    contextLines.push(`Players attending this session: ${playerCount}. The exercise list above has already been filtered to drills whose stated minimum fits this group, but still favor ones that make sense for a group this size.`);
  }

  const userText = [
    `Exercise library:\n${library}`,
    `Recent sessions:\n${recentSummary}`,
    contextLines.length ? `Team context:\n${contextLines.join("\n")}` : null,
    instructions?.trim() ? `Coach's instructions for this session: ${instructions.trim()}` : "The coach gave no specific instructions — use your judgment.",
  ].filter((section): section is string => section !== null).join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from the model");
  }

  let parsed: unknown;
  try {
    parsed = parseJSONResponse(textBlock.text);
  } catch {
    throw new Error("Could not parse the model's response as JSON");
  }

  return normalize(parsed);
}

function normalize(parsed: unknown): GeneratedSessionPlan {
  const p = parsed as Record<string, unknown>;
  const rawIds = Array.isArray(p.exerciseIds) ? p.exerciseIds : [];
  return {
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Practice Session",
    notes: typeof p.notes === "string" && p.notes.trim() ? p.notes.trim() : null,
    duration: typeof p.duration === "number" && Number.isFinite(p.duration) && p.duration > 0
      ? Math.round(p.duration)
      : 90,
    // Stored as strings on the training_sessions row (exercise_ids is a text[]).
    exerciseIds: rawIds.filter((id): id is number => typeof id === "number").map((id) => String(id)),
  };
}
