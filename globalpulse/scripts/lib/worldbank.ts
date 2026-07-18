import { z } from "zod";
import { fetchWithRetry } from "./retry";

// World Bank's response is a 2-element array: [pagination metadata, data rows].
// format=json&per_page=100 returns full available history by default (per
// Section 6), which is what makes this the same code path for backfill and
// steady-state ingestion — see ingest-macro.ts.
const WorldBankRowSchema = z.object({
  countryiso3code: z.string(),
  date: z.string(), // year, e.g. "2023"
  value: z.number().nullable(),
});
const WorldBankResponseSchema = z.tuple([z.unknown(), z.array(WorldBankRowSchema).nullable()]);

export type WorldBankObservation = { year: string; value: number };

/**
 * Fetches full available history for one (country, indicator code) pair.
 * `iso3Override` lets aggregate rows (Euro Area) use World Bank's own
 * aggregate code ("EMU") instead of our internal pseudo iso3 ("EUZ") — see
 * WORLD_BANK_ISO3_OVERRIDES in seed-macro-indicators.ts.
 */
export async function fetchWorldBankIndicator(iso3: string, code: string): Promise<WorldBankObservation[]> {
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${code}?format=json&per_page=100`;
  const raw = await fetchWithRetry(url);
  const parsed = WorldBankResponseSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(`Unexpected World Bank response shape for ${iso3}/${code}: ${parsed.error.message}`);
  }

  const rows = parsed.data[1] ?? [];
  return rows
    .filter((r): r is z.infer<typeof WorldBankRowSchema> & { value: number } => r.value !== null)
    .map((r) => ({ year: r.date, value: r.value }));
}

export type MacroSource = "worldbank" | "imf" | "fred";

// Section 5: "before writing, the ingestion script checks whether
// (country_id, canonical_key) is already owned by a higher-priority source."
const SOURCE_PRIORITY: Record<MacroSource, number> = { worldbank: 0, imf: 1, fred: 2 };

/** True if `incoming` is allowed to write/own a slot currently held by `existing`. */
export function sourceCanOverride(existing: MacroSource, incoming: MacroSource): boolean {
  return SOURCE_PRIORITY[incoming] <= SOURCE_PRIORITY[existing];
}
