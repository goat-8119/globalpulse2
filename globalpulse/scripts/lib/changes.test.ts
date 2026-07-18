import { describe, it, expect } from "vitest";
import { computeChanges } from "./changes";

const DAY = 86400;

function series(startTs: number, closes: number[]) {
  const timestamps = closes.map((_, i) => startTs + i * DAY);
  return { timestamps, closes };
}

describe("computeChanges", () => {
  it("returns nulls for every field on the first observation", () => {
    const { timestamps, closes } = series(1700000000, [100]);
    const result = computeChanges(closes, timestamps, 0);
    expect(result).toEqual({
      change: null,
      pctChange1d: null,
      pctChange1w: null,
      pctChange1m: null,
      pctChangeYtd: null,
      pctChange1y: null,
    });
  });

  it("computes 1-day change correctly", () => {
    const { timestamps, closes } = series(1700000000, [100, 110]);
    const result = computeChanges(closes, timestamps, 1);
    expect(result.change).toBeCloseTo(10);
    expect(result.pctChange1d).toBeCloseTo(10);
  });

  it("computes 1-week change using the nearest prior trading day", () => {
    // 10 daily closes, evenly spaced — index 9 is "today"
    const closes = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
    const { timestamps } = series(1700000000, closes);
    const result = computeChanges(closes, timestamps, 9);
    // 7 days back from index 9 (day 9) lands on day 2 (index 2, value 102)
    expect(result.pctChange1w).toBeCloseTo(((109 - 102) / 102) * 100);
  });

  it("handles gaps (missing trading days) by picking the closest prior timestamp", () => {
    // Skip day 3 and day 4 (e.g. a weekend) — timestamps are non-contiguous
    const rawDays = [0, 1, 2, 5, 6, 7, 8, 9, 12, 13];
    const closes = [100, 102, 101, 103, 104, 106, 105, 107, 109, 110];
    const timestamps = rawDays.map((d) => 1700000000 + d * DAY);
    const result = computeChanges(closes, timestamps, 9); // "today" = day 13, value 110
    // 7 days back from day 13 = day 6 -> nearest ts <= day6 is day 6 itself (index 4, value 104)
    expect(result.pctChange1w).toBeCloseTo(((110 - 104) / 104) * 100);
  });

  it("never divides by zero when the reference close is 0", () => {
    const { timestamps, closes } = series(1700000000, [0, 5]);
    const result = computeChanges(closes, timestamps, 1);
    expect(result.pctChange1d).toBeNull();
  });

  it("computes YTD relative to the closest trading day on/after Jan 1", () => {
    // Dec 20, 2024 through Jan 10, 2025 (UTC), one close per day
    const start = Date.UTC(2024, 11, 20) / 1000; // Dec 20 2024
    const closes = Array.from({ length: 22 }, (_, i) => 100 + i); // 100..121
    const timestamps = closes.map((_, i) => start + i * DAY);
    // "today" = Jan 10 2025 -> index 21, value 121
    const todayIdx = timestamps.findIndex((t) => new Date(t * 1000).getUTCDate() === 10 && new Date(t * 1000).getUTCMonth() === 0);
    const result = computeChanges(closes, timestamps, todayIdx);
    // Jan 1 2025 -> index 12, value 112
    const jan1Idx = timestamps.findIndex((t) => new Date(t * 1000).getUTCDate() === 1 && new Date(t * 1000).getUTCMonth() === 0);
    const todayClose = closes[todayIdx]!;
    const jan1Close = closes[jan1Idx]!;
    expect(result.pctChangeYtd).toBeCloseTo(((todayClose - jan1Close) / jan1Close) * 100);
  });
});
