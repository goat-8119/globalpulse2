export type ComputedChanges = {
  change: number | null;
  pctChange1d: number | null;
  pctChange1w: number | null;
  pctChange1m: number | null;
  pctChangeYtd: number | null;
  pctChange1y: number | null;
};

const DAY_SECONDS = 86400;

/**
 * Scans backward from `upTo` for the latest index whose timestamp is <= target.
 * Timestamps are assumed ascending (Yahoo returns them in chronological order).
 */
function findIndexAtOrBefore(timestamps: number[], targetTs: number, upTo: number): number | null {
  const start = Math.min(upTo, timestamps.length - 1);
  for (let j = start; j >= 0; j--) {
    const ts = timestamps[j];
    if (ts !== undefined && ts <= targetTs) return j;
  }
  return null;
}

function pctChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function closeAt(closes: number[], idx: number | null): number | null {
  if (idx === null) return null;
  const v = closes[idx];
  return v === undefined ? null : v;
}

/**
 * Computes day/week/month/YTD/year-over-year change for the close at index `i`
 * in a chronologically-ordered series. Used identically by the one-time
 * backfill (Section 6) and by the steady-state ingest job, so historical and
 * live rows are always comparable.
 */
export function computeChanges(closes: number[], timestamps: number[], i: number): ComputedChanges {
  const current = closes[i];
  const currentTs = timestamps[i];

  if (current === undefined || currentTs === undefined) {
    throw new Error(`computeChanges: index ${i} is out of bounds for the given series`);
  }

  const prevDayIdx = i > 0 ? i - 1 : null;
  const weekIdx = findIndexAtOrBefore(timestamps, currentTs - 7 * DAY_SECONDS, i - 1);
  const monthIdx = findIndexAtOrBefore(timestamps, currentTs - 30 * DAY_SECONDS, i - 1);
  const yearIdx = findIndexAtOrBefore(timestamps, currentTs - 365 * DAY_SECONDS, i - 1);

  const currentDate = new Date(currentTs * 1000);
  const jan1Ts = Date.UTC(currentDate.getUTCFullYear(), 0, 1) / 1000;
  const ytdIdx = findIndexAtOrBefore(timestamps, jan1Ts, i - 1);

  const prevDayClose = closeAt(closes, prevDayIdx);

  return {
    change: prevDayClose !== null ? current - prevDayClose : null,
    pctChange1d: pctChange(current, prevDayClose),
    pctChange1w: pctChange(current, closeAt(closes, weekIdx)),
    pctChange1m: pctChange(current, closeAt(closes, monthIdx)),
    pctChangeYtd: pctChange(current, closeAt(closes, ytdIdx)),
    pctChange1y: pctChange(current, closeAt(closes, yearIdx)),
  };
}
