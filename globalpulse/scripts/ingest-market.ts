import "dotenv/config";
import { getSql } from "../lib/db";
import { fetchBatchQuotes } from "./lib/yahoo";
import { computeChanges } from "./lib/changes";
import { upsertObservation, startJobRun, finishJobRun } from "./lib/upsert";
import { chunk, sleep, CircuitBreaker } from "./lib/retry";

// Steady-state cron (Section 7) — runs every 15 min during market hours via
// .github/workflows/refresh-market-data.yml. Uses the lightweight batch quote
// endpoint (up to ~50 symbols/call) for price, then computes 1w/1m/YTD/1y
// deltas from our OWN stored observation history — no second Yahoo call per
// symbol, and it's the same computeChanges() math the backfill uses, so
// historical and live rows stay comparable.
const JOB_NAME = "ingest-market";
const BATCH_SIZE = 50; // Yahoo's batch quote endpoint practical limit
const BATCH_DELAY_MS = 500;
const HISTORY_LOOKBACK_DAYS = 400; // enough trailing days to cover a 1y comparison

async function main() {
  const sql = getSql();
  const { startedAt } = await startJobRun(JOB_NAME);
  const breaker = new CircuitBreaker(5);
  let totalWritten = 0;
  const failed: string[] = [];

  const instruments = await sql`
    SELECT id, external_ref, display_name FROM indicators WHERE source = 'yahoo'
  `;

  if (instruments.length === 0) {
    console.warn("No Yahoo-sourced indicators found. Run db:seed-indicators first.");
    await finishJobRun(JOB_NAME, startedAt, "failed", 0, "No indicators to ingest");
    return;
  }

  const bySymbol = new Map(instruments.map((i) => [i.external_ref as string, i]));

  for (const batch of chunk(instruments, BATCH_SIZE)) {
    if (breaker.isOpen) {
      console.error("Circuit breaker open — too many consecutive failures. Stopping run.");
      break;
    }

    try {
      const symbols = batch.map((i) => i.external_ref as string);
      const quotes = await fetchBatchQuotes(symbols);
      const now = new Date();
      const cutoff = new Date(now.getTime() - HISTORY_LOOKBACK_DAYS * 86400 * 1000);

      for (const quote of quotes) {
        const inst = bySymbol.get(quote.symbol);
        if (!inst) continue;

        const history = await sql`
          SELECT value, captured_at FROM observations
          WHERE indicator_id = ${inst.id} AND captured_at >= ${cutoff.toISOString()}
          ORDER BY captured_at ASC
        `;

        const closes = history.map((h) => Number(h.value));
        const timestamps = history.map((h) => Math.floor(new Date(h.captured_at as string).getTime() / 1000));
        closes.push(quote.regularMarketPrice);
        timestamps.push(Math.floor(now.getTime() / 1000));

        const changes = computeChanges(closes, timestamps, closes.length - 1);
        await upsertObservation(inst.id, quote.regularMarketPrice, changes, now);
        totalWritten++;
      }

      breaker.recordSuccess();
      console.log(`  OK  batch of ${batch.length} — ${quotes.length} quotes written`);
    } catch (err) {
      breaker.recordFailure();
      failed.push(...batch.map((i) => i.external_ref as string));
      console.error(`  FAIL batch: ${(err as Error).message}`);
    }

    await sleep(BATCH_DELAY_MS);
  }

  const status = failed.length === 0 ? "success" : totalWritten > 0 ? "partial" : "failed";
  await finishJobRun(JOB_NAME, startedAt, status, totalWritten, failed.length ? `Failed symbols: ${failed.join(", ")}` : null);

  console.log(`\nDone. ${totalWritten} observation rows written.`);
}

main().catch((err) => {
  console.error("Market ingestion failed:", err);
  process.exit(1);
});
