import { requireAnthropicKey } from "./env";

export type BriefingInput = {
  countryName: string;
  momentumScore: number | null;
  macroHealthScore: number | null;
  topMovers: { displayName: string; pctChange1d: number | null }[];
  macroFacts: { displayName: string; value: number | null; unit: string | null }[];
};

/**
 * Section 10E: short, structured AI briefing per country. Server-side only —
 * ANTHROPIC_API_KEY never reaches the client bundle (this file is only ever
 * imported from a route handler, not a client component). Claude Haiku 4.5
 * is a good fit here: short, structured summaries, not deep reasoning.
 */
export async function generateCountryBriefing(input: BriefingInput): Promise<string> {
  const apiKey = requireAnthropicKey();

  const factLines = [
    input.momentumScore !== null ? `Market momentum index: ${input.momentumScore.toFixed(0)}/100` : null,
    input.macroHealthScore !== null ? `Macro health index: ${input.macroHealthScore.toFixed(0)}/100` : null,
    ...input.topMovers
      .filter((m) => m.pctChange1d !== null)
      .map((m) => `${m.displayName}: ${m.pctChange1d! > 0 ? "+" : ""}${m.pctChange1d!.toFixed(2)}% today`),
    ...input.macroFacts.filter((f) => f.value !== null).map((f) => `${f.displayName}: ${f.value}${f.unit ? ` ${f.unit}` : ""}`),
  ].filter((line): line is string => line !== null);

  const prompt = `You are a terse financial data terminal. Write a 2-3 sentence briefing on ${input.countryName} based ONLY on the data below. No speculation beyond the numbers, no investment advice. Plain, factual tone.

Data:
${factLines.map((l) => `- ${l}`).join("\n")}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API returned HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("Anthropic API response had no text content");

  return textBlock.text.trim();
}
