import { z } from "zod";
import { fetchWithRetry } from "./retry";

const FredObservationSchema = z.object({ date: z.string(), value: z.string() });
const FredResponseSchema = z.object({ observations: z.array(FredObservationSchema) });

export type FredObservation = { date: string; value: number };

/**
 * Fetches a full FRED series. FRED uses "." as a sentinel for missing values
 * (e.g. a country that hasn't reported yet for the latest month) — those are
 * filtered out here rather than passed downstream as NaN.
 */
export async function fetchFredSeries(seriesId: string, apiKey: string): Promise<FredObservation[]> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json`;
  const raw = await fetchWithRetry(url);
  const parsed = FredResponseSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(`Unexpected FRED response shape for ${seriesId}: ${parsed.error.message}`);
  }

  return parsed.data.observations
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date, value: Number(o.value) }));
}
