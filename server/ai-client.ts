import Anthropic from "@anthropic-ai/sdk";

export function isAIConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
export function getAIClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Strips a ```json ... ``` fence if the model wraps its answer in one
// despite being told not to, then parses the result as JSON.
export function parseJSONResponse(text: string): unknown {
  const raw = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(raw);
}
