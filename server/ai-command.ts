import { getAIClient, parseJSONResponse } from "./ai-client";
import type { TrainingSession } from "@shared/schema";

export { isAIConfigured } from "./ai-client";

export type ParsedCommand =
  | { action: "create_session"; name: string | null; date: string; time: string | null; duration: number | null }
  | { action: "duplicate_session"; sourceSessionId: number; date: string }
  | { action: "unrecognized" };

const SYSTEM_PROMPT = `You translate a basketball coach's short natural-language request into exactly one of a small set of app actions. Respond with ONLY a JSON object, no markdown fences, no commentary.

You'll be given today's date (YYYY-MM-DD) and a numbered list of the coach's recent training sessions (id, date, weekday, name).

Shape 1 — the coach wants to schedule a brand-new session ("create a session tomorrow at 6pm", "book practice next Friday"):
{"action": "create_session", "name": string | null, "date": "YYYY-MM-DD", "time": "HH:MM" | null, "duration": number | null}
- Resolve relative dates ("tomorrow", "next Tuesday", "the 15th") against today's date.
- "time" in 24-hour HH:MM, or null if the coach didn't give one.
- "duration" in minutes, or null if not mentioned.
- "name" only if the coach described a focus (e.g. "shooting practice"), otherwise null.

Shape 2 — the coach wants to repeat/duplicate a past session onto a new date ("repeat Tuesday's practice", "do last week's session again on Friday"):
{"action": "duplicate_session", "sourceSessionId": number, "date": "YYYY-MM-DD"}
- sourceSessionId MUST be one of the ids in the recent-sessions list you were given — pick whichever one best matches what the coach described (by weekday, recency, or name). Never invent an id.
- "date" is when the repeat should happen: the date the coach specified, or if they only named a weekday with no date, the next upcoming occurrence of that weekday after today.

Shape 3 — anything else (editing exercises within an existing session, adjusting something already scheduled, or unrelated to scheduling):
{"action": "unrecognized"}

When genuinely ambiguous between shapes, prefer "unrecognized" over guessing.`;

function normalize(parsed: unknown, validSessionIds: Set<number>): ParsedCommand {
  const p = parsed as Record<string, unknown>;
  const dateOk = typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date);

  if (p.action === "create_session" && dateOk) {
    return {
      action: "create_session",
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : null,
      date: p.date as string,
      time: typeof p.time === "string" && /^\d{2}:\d{2}$/.test(p.time) ? p.time : null,
      duration: typeof p.duration === "number" && Number.isFinite(p.duration) && p.duration > 0 ? Math.round(p.duration) : null,
    };
  }

  if (p.action === "duplicate_session" && dateOk && typeof p.sourceSessionId === "number" && validSessionIds.has(p.sourceSessionId)) {
    return { action: "duplicate_session", sourceSessionId: p.sourceSessionId, date: p.date as string };
  }

  return { action: "unrecognized" };
}

// Costs real money (Anthropic API) like generateSessionPlan — the caller
// gates this behind the same paid-plan check and rate limiter. Never
// mutates anything itself: the client uses the parsed result to prefill
// SessionModal, so the coach always reviews and confirms before saving.
export async function parseCommand(text: string, todayISO: string, recentSessions: TrainingSession[]): Promise<ParsedCommand> {
  const anthropic = getAIClient();

  const sessionsList = recentSessions.length > 0
    ? recentSessions
        .slice(0, 15)
        .map((s) => `${s.id}. ${s.date} (${new Date(`${s.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" })}) — "${s.name}"`)
        .join("\n")
    : "No past sessions yet.";

  const userText = `Today's date: ${todayISO}\n\nRecent sessions:\n${sessionsList}\n\nCoach's request: ${text.trim()}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 300,
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

  return normalize(parsed, new Set(recentSessions.map((s) => s.id)));
}
