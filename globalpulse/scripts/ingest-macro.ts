import "dotenv/config";
import { getSql } from "../lib/db";
import { fetchWorldBankIndicator } from "./lib/worldbank";
import { fetchFredSeries } from "./lib/fred";
import { computeMacroYoyChanges } from "./lib/macro-changes";
import { computeChanges } from "./lib/changes";
import { startJobRun, finishJobRun } from "./lib/upsert";
import { sleep, CircuitBreaker } from "./lib/retry";
import { getEnv } from "../lib/env";

// Section 6: World Bank and FRED both return full available history on every
// call, and writes are idempotent (ON CONFLICT DO NOTHING on
// (indicator_id, captured_at)) — so this single script correctly serves as
// both the one-time backfill AND the daily cron for both sources.
const JOB_NAME = "ingest-macro";
const REQUEST_DELAY_MS = 300;

// World Bank uses its own codes for aggregates that don't have a normal
// ISO3 — our Euro Area pseudo-row (iso3 'EUZ') maps to World Bank's 'EMU'.
const WORLD_BANK_ISO3_OVERRIDES: Record<string, string> = {
  EUZ: "EMU",
};

async function ingestWorldBank(sql: ReturnType<typeof getSql>, breaker: CircuitBreaker): Promise<{ written: number; failed: string[] }> {
  let written = 0;
  const failed: string[] = [];

  const indicators = await sql`
    SELECT i.id, i.external_ref, i.display_name, c.iso3
    FROM indicators i JOIN countries c ON c.id = i.country_id
    WHERE i.source = 'worldbank'
  `;

  console.log(`World Bank: ${indicators.length} indicators to ingest.`);

  for (const ind of indicators) {
    if (breaker.isOpen) {
      console.error("Circuit breaker open — stopping World Bank ingestion early.");
      break;
    }
    const wbIso3 = WORLD_BANK_ISO3_OVERRIDES[ind.iso3] ?? ind.iso3;

    try {
      const raw = await fetchWorldBankIndicator(wbIso3, ind.external_ref);
      const withChanges = computeMacroYoyChanges(raw);

      for (const obs of withChanges) {
        const capturedAt = new Date(Date.UTC(Number(obs.year), 11, 31)); // year-end timestamp
        await sql`
          INSERT INTO observations (indicator_id, value, change, pct_change_1y, period_label, captured_at)
          VALUES (${ind.id}, ${obs.value}, ${obs.change}, ${obs.pctChange1y}, ${obs.year}, ${capturedAt.toISOString()})
          ON CONFLICT (indicator_id, captured_at) DO NOTHING
        `;
        written++;
      }
      breaker.recordSuccess();
      console.log(`  OK  ${ind.display_name} (${ind.iso3}) — ${withChanges.length} years`);
    } catch (err) {
      breaker.recordFailure();
      failed.push(`${ind.iso3}/${ind.external_ref}`);
      console.error(`  FAIL ${ind.display_name} (${ind.iso3}): ${(err as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return { written, failed };
}

async function ingestFred(sql: ReturnType<typeof getSql>, breaker: CircuitBreaker): Promise<{ written: number; failed: string[] }> {
  let written = 0;
  const failed: string[] = [];

  const { FRED_API_KEY } = getEnv();
  if (!FRED_API_KEY) {
    console.warn("FRED_API_KEY not set — skipping FRED-sourced indicators (bond yields for non-US countries).");
    return { written, failed };
  }

  const indicators = await sql`
    SELECT i.id, i.external_ref, i.display_name, c.iso3
    FROM indicators i JOIN countries c ON c.id = i.country_id
    WHERE i.source = 'fred'
  `;

  console.log(`FRED: ${indicators.length} indicators to ingest.`);

  for (const ind of indicators) {
    if (breaker.isOpen) {
      console.error("Circuit breaker open — stopping FRED ingestion early.");
      break;
    }

    try {
      const raw = await fetchFredSeries(ind.external_ref, FRED_API_KEY);
      // Monthly series: 1d/1w windows won't find anything meaningfully
      // different from 1m (there's no intra-month data), but computeChanges
      // handles that correctly on its own — it just returns the nearest
      // prior point for each window, so 1m/1y are the ones that matter here.
      const timestamps = raw.map((o) => Math.floor(new Date(o.date).getTime() / 1000));
      const values = raw.map((o) => o.value);

      for (let i = 0; i < raw.length; i++) {
        const changes = computeChanges(values, timestamps, i);
        const capturedAt = new Date(timestamps[i]! * 1000);
        await sql`
          INSERT INTO observations (indicator_id, value, change, pct_change_1d, pct_change_1w, pct_change_1m, pct_change_ytd, pct_change_1y, period_label, captured_at)
          VALUES (${ind.id}, ${values[i]}, ${changes.change}, ${changes.pctChange1d}, ${changes.pctChange1w}, ${changes.pctChange1m}, ${changes.pctChangeYtd}, ${changes.pctChange1y}, ${raw[i]!.date}, ${capturedAt.toISOString()})
          ON CONFLICT (indicator_id, captured_at) DO NOTHING
        `;
        written++;
      }
      breaker.recordSuccess();
      console.log(`  OK  ${ind.display_name} (${ind.iso3}) — ${raw.length} months`);
    } catch (err) {
      breaker.recordFailure();
      failed.push(`${ind.iso3}/${ind.external_ref}`);
      console.error(`  FAIL ${ind.display_name} (${ind.iso3}): ${(err as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return { written, failed };
}

async function main() {
  const sql = getSql();
  const { startedAt } = await startJobRun(JOB_NAME);
  const breaker = new CircuitBreaker(5);

  const wb = await ingestWorldBank(sql, breaker);
  breaker.recordSuccess(); // reset breaker between sources — a bad World Bank run shouldn't abort FRED
  const fred = await ingestFred(sql, breaker);

  const totalWritten = wb.written + fred.written;
  const allFailed = [...wb.failed, ...fred.failed];
  const status = allFailed.length === 0 ? "success" : totalWritten > 0 ? "partial" : "failed";
  await finishJobRun(JOB_NAME, startedAt, status, totalWritten, allFailed.length ? `Failed: ${allFailed.join(", ")}` : null);

  console.log(`\nDone. ${totalWritten} observation rows written (${wb.written} World Bank, ${fred.written} FRED).`);
  if (allFailed.length) console.log(`Failed: ${allFailed.join(", ")}`);
}

main().catch((err) => {
  console.error("Macro ingestion failed:", err);
  process.exit(1);
});
