import type Anthropic from "@anthropic-ai/sdk";
import { getAIClient, parseJSONResponse } from "./ai-client";

export { isAIConfigured } from "./ai-client";

export interface ExtractedPlayerLine {
  name: string;
  jerseyNumber: string | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
}

export interface ExtractedBoxScore {
  opponent: string | null;
  date: string | null;
  teamScore: number | null;
  opponentScore: number | null;
  players: ExtractedPlayerLine[];
}

const SYSTEM_PROMPT = `You read basketball box scores from photos or scanned PDFs (handwritten or printed scorekeeping sheets, scoreboard photos, league stat exports) and extract the data as JSON.

Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "opponent": string | null,
  "date": string | null,       // ISO format YYYY-MM-DD if a date is visible, else null
  "teamScore": number | null,
  "opponentScore": number | null,
  "players": [
    {
      "name": string,          // as written on the sheet; use "#<number>" if only a jersey number is legible
      "jerseyNumber": string | null,
      "points": number, "rebounds": number, "assists": number,
      "steals": number, "blocks": number, "turnovers": number, "fouls": number
    }
  ]
}

Use 0 for any stat column that's present but blank for a player. Omit a player row entirely rather than guessing if their line is illegible. If the whole image isn't a basketball box score, return every field null and an empty players array.`;

// This is the one route in the app that costs real money per call — kept
// behind isAIConfigured() so the rest of the app runs fine without an
// ANTHROPIC_API_KEY, same as the Stripe integration degrades gracefully
// without STRIPE_SECRET_KEY.
export async function extractBoxScore(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<ExtractedBoxScore> {
  const anthropic = getAIClient();
  const base64 = fileBuffer.toString("base64");

  const content: Anthropic.ContentBlockParam[] =
    mimeType === "application/pdf"
      ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }]
      : [{
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64,
          },
        }];

  content.push({ type: "text", text: "Extract the box score from this file." });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
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

  return normalizeExtracted(parsed);
}

function normalizeExtracted(parsed: unknown): ExtractedBoxScore {
  const p = parsed as Record<string, unknown>;
  const players = Array.isArray(p.players) ? p.players : [];
  return {
    opponent: typeof p.opponent === "string" ? p.opponent : null,
    date: typeof p.date === "string" ? p.date : null,
    teamScore: typeof p.teamScore === "number" ? p.teamScore : null,
    opponentScore: typeof p.opponentScore === "number" ? p.opponentScore : null,
    players: players.map((line: Record<string, unknown>) => ({
      name: typeof line.name === "string" && line.name.trim() ? line.name.trim() : "Unknown player",
      jerseyNumber: typeof line.jerseyNumber === "string" ? line.jerseyNumber : null,
      points: numberOr0(line.points),
      rebounds: numberOr0(line.rebounds),
      assists: numberOr0(line.assists),
      steals: numberOr0(line.steals),
      blocks: numberOr0(line.blocks),
      turnovers: numberOr0(line.turnovers),
      fouls: numberOr0(line.fouls),
    })),
  };
}

function numberOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
}
