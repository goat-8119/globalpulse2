import "dotenv/config";
import { getSql } from "../lib/db";
import { fetchChartSeries } from "./lib/yahoo";
import { computeChanges } from "./lib/changes";
import { upsertObservation, startJobRun, finishJobRun } from "./lib/upsert";
import { chunk, sleep, CircuitBreaker } from "./lib/retry";

// Run ONCE, not on the recurring schedule (that's ingest-market.ts, Phase 3).
// Bulk historical pulls hit Yahoo harder than the steady-state cron, hence the
// smaller batch size and longer delay than Section 7's live-quote job.
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1500;
const RANGE = "2y";
const JOB_NAME = "backfill-market";

async function main() {
  const sql = getSql();
  const { startedAt } = await startJobRun(JOB_NAME);
  const breaker = new CircuitBreaker(5);
  let totalWritten = 0;
  let failedSymbols: string[] = [];

  const instruments = await sql`
    SELECT id, external_ref, display_name FROM indicators WHERE source = 'yahoo'
  `;

  if (instruments.length === 0) {
    console.warn("No Yahoo-sourced indicators found. Run db:seed-indicators first.");
    await finishJobRun(JOB_NAME, startedAt, "failed", 0, "No indicators to backfill");
    return;
  }

  console.log(`Backfilling ${instruments.length} instruments over range=${RANGE}...`);

  for (const batch of chunk(instruments, BATCH_SIZE)) {
    if (breaker.isOpen) {
      console.error("Circuit breaker open — too many consecutive failures. Stopping run.");
      break;
    }

    await Promise.all(
      batch.map(async (inst) => {
        try {
          const { timestamps, closes } = await fetchChartSeries(inst.external_ref, RANGE);

          for (let i = 0; i < timestamps.length; i++) {
            const close = closes[i];
            const ts = timestamps[i];
            if (close === undefined || ts === undefined) continue;
            const changes = computeChanges(closes, timestamps, i);
            await upsertObservation(inst.id, close, changes, new Date(ts * 1000));
            totalWritten++;
          }

          breaker.recordSuccess();
          console.log(`  OK  ${inst.display_name} (${inst.external_ref}) — ${timestamps.length} days`);
        } catch (err) {
          breaker.recordFailure();
          failedSymbols.push(inst.external_ref);
          console.error(`  FAIL ${inst.display_name} (${inst.external_ref}): ${(err as Error).message}`);
        }
      })
    );

    await sleep(BATCH_DELAY_MS);
  }

  const status = failedSymbols.length === 0 ? "success" : breaker.isOpen ? "partial" : "partial";
  await finishJobRun(
    JOB_NAME,
    startedAt,
    instruments.length > 0 && totalWritten === 0 ? "failed" : status,
    totalWritten,
    failedSymbols.length ? `Failed symbols: ${failedSymbols.join(", ")}` : null
  );

  console.log(`\nDone. ${totalWritten} observation rows written.`);
  if (failedSymbols.length) {
    console.log(`Failed: ${failedSymbols.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
