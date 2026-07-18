import { getSql } from "../../lib/db";
import { ComputedChanges } from "./changes";

/**
 * Idempotent write (Section 7): ON CONFLICT DO NOTHING on (indicator_id, captured_at)
 * means re-running a backfill or a cron tick twice never creates duplicate rows.
 */
export async function upsertObservation(
  indicatorId: number,
  value: number,
  changes: ComputedChanges,
  capturedAt: Date,
  periodLabel: string | null = null
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO observations (
      indicator_id, value, change, pct_change_1d, pct_change_1w, pct_change_1m,
      pct_change_ytd, pct_change_1y, period_label, captured_at
    )
    VALUES (
      ${indicatorId}, ${value}, ${changes.change}, ${changes.pctChange1d}, ${changes.pctChange1w},
      ${changes.pctChange1m}, ${changes.pctChangeYtd}, ${changes.pctChange1y}, ${periodLabel}, ${capturedAt.toISOString()}
    )
    ON CONFLICT (indicator_id, captured_at) DO NOTHING
  `;
}

export async function startJobRun(jobName: string): Promise<{ startedAt: Date }> {
  return { startedAt: new Date() };
}

export async function finishJobRun(
  jobName: string,
  startedAt: Date,
  status: "success" | "partial" | "failed",
  recordsWritten: number,
  errorMessage: string | null = null
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO job_runs (job_name, status, records_written, error_message, started_at, finished_at)
    VALUES (${jobName}, ${status}, ${recordsWritten}, ${errorMessage}, ${startedAt.toISOString()}, ${new Date().toISOString()})
  `;
}
