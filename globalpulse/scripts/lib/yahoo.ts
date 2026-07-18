import { z } from "zod";
import { fetchWithRetry } from "./retry";

// Validate the shape we actually rely on before it touches the DB (Section 7).
// Yahoo's undocumented endpoint returns a lot more than this; we only assert
// what we read.
const ChartResponseSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          timestamp: z.array(z.number()),
          indicators: z.object({
            quote: z.array(
              z.object({
                close: z.array(z.number().nullable()),
              })
            ),
          }),
        })
      )
      .nullable(),
    error: z.unknown().nullable().optional(),
  }),
});

export type ChartSeries = {
  timestamps: number[]; // unix seconds
  closes: number[];
};

/**
 * Fetches daily-close history for one symbol. `range` accepts anything Yahoo's
 * chart endpoint supports ("2y" for the Section 6 backfill, "5d" for a light
 * top-up, etc).
 */
export async function fetchChartSeries(symbol: string, range: string, interval = "1d"): Promise<ChartSeries> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const raw = await fetchWithRetry(url);
  const parsed = ChartResponseSchema.safeParse(raw);

  if (!parsed.success || !parsed.data.chart.result || parsed.data.chart.result.length === 0) {
    throw new Error(`Unexpected/empty chart response for ${symbol}: ${parsed.success ? "no result" : parsed.error.message}`);
  }

  const result = parsed.data.chart.result[0];
  if (!result) {
    throw new Error(`Unexpected/empty chart response for ${symbol}: no result`);
  }
  const rawCloses = result.indicators.quote[0]?.close ?? [];

  // Yahoo pads non-trading days with null closes — drop those timestamp/close
  // pairs together so both arrays stay aligned.
  const timestamps: number[] = [];
  const closes: number[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const c = rawCloses[i];
    const ts = result.timestamp[i];
    if (c !== null && c !== undefined && ts !== undefined) {
      timestamps.push(ts);
      closes.push(c);
    }
  }

  if (closes.length === 0) {
    throw new Error(`No valid close prices returned for ${symbol}`);
  }

  return { timestamps, closes };
}

/**
 * Batch quote endpoint (Section 4A) — up to ~50 symbols per call. Used by the
 * steady-state ingest script, not the backfill (backfill needs full history
 * per symbol, which only the chart endpoint provides).
 */
const QuoteSchema = z.object({
  symbol: z.string(),
  regularMarketPrice: z.number(),
  regularMarketChange: z.number().nullable(),
  regularMarketChangePercent: z.number().nullable(),
});
export type Quote = z.infer<typeof QuoteSchema>;

export async function fetchBatchQuotes(symbols: string[]): Promise<Quote[]> {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.map(encodeURIComponent).join(",")}`;
  const raw = await fetchWithRetry(url);
  const list = raw?.quoteResponse?.result ?? [];
  const out: Quote[] = [];
  for (const q of list) {
    const parsed = QuoteSchema.safeParse(q);
    if (parsed.success) {
      out.push(parsed.data);
    } else {
      console.warn(`Skipping malformed quote for ${q?.symbol ?? "unknown"}: ${parsed.error.message}`);
    }
  }
  return out;
}
