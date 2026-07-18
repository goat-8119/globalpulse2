import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Rough expected cadence per job, used only to label staleness in the
// response — the underlying data is always the actual minutes-since-last-run.
const EXPECTED_INTERVAL_MINUTES: Record<string, number> = {
  "ingest-market": 15,
  "ingest-macro": 24 * 60,
  "backfill-market": Infinity, // one-time job, never "stale"
  "compute-growth-indexes": 24 * 60,
};

export async function GET() {
  const sql = getSql();

  const rows = await sql`
    SELECT DISTINCT ON (job_name) job_name, status, records_written, error_message, started_at, finished_at
    FROM job_runs
    ORDER BY job_name, started_at DESC
  `;

  const now = Date.now();
  const jobs = rows.map((r) => {
    const finishedAt = r.finished_at ? new Date(r.finished_at as string) : null;
    const minutesSince = finishedAt ? (now - finishedAt.getTime()) / 60000 : null;
    const expected = EXPECTED_INTERVAL_MINUTES[r.job_name as string] ?? null;
    const isStale = minutesSince !== null && expected !== null && expected !== Infinity ? minutesSince > expected * 3 : false;

    return {
      jobName: r.job_name,
      status: r.status,
      recordsWritten: r.records_written,
      errorMessage: r.error_message,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      minutesSinceLastRun: minutesSince === null ? null : Math.round(minutesSince),
      isStale,
    };
  });

  const overallHealthy = jobs.length > 0 && jobs.every((j) => j.status !== "failed" && !j.isStale);

  return NextResponse.json({ healthy: overallHealthy, jobs });
}
