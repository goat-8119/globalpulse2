import { describe, it, expect } from "vitest";
import {
  computeMarketMomentumIndex,
  computeMacroHealthIndex,
  computeTrendProjection,
  detectAnomaly,
  MarketChangeSnapshot,
} from "./growth-index";

describe("computeMarketMomentumIndex", () => {
  it("returns 50 (neutral) when all changes are zero", () => {
    const flat: MarketChangeSnapshot = { pctChange1d: 0, pctChange1w: 0, pctChange1m: 0, pctChangeYtd: 0, pctChange1y: 0 };
    const result = computeMarketMomentumIndex([flat, flat]);
    expect(result).not.toBeNull();
    expect(result!.score).toBeCloseTo(50, 1);
    expect(result!.confidence).toBe(1);
  });

  it("scores above 50 when indicators are broadly up", () => {
    const bullish: MarketChangeSnapshot = { pctChange1d: 2, pctChange1w: 5, pctChange1m: 8, pctChangeYtd: 12, pctChange1y: 20 };
    const result = computeMarketMomentumIndex([bullish]);
    expect(result!.score).toBeGreaterThan(50);
  });

  it("scores below 50 when indicators are broadly down", () => {
    const bearish: MarketChangeSnapshot = { pctChange1d: -2, pctChange1w: -5, pctChange1m: -8, pctChangeYtd: -12, pctChange1y: -20 };
    const result = computeMarketMomentumIndex([bearish]);
    expect(result!.score).toBeLessThan(50);
  });

  it("weighs recent moves more heavily when horizons disagree in direction", () => {
    // Same magnitude, opposite signs at each horizon — if recency dominates,
    // "recent positive / older negative" should net positive, and the
    // mirror-image indicator should net negative.
    const recentUp: MarketChangeSnapshot = { pctChange1d: 5, pctChange1w: null, pctChange1m: null, pctChangeYtd: null, pctChange1y: -5 };
    const recentDown: MarketChangeSnapshot = { pctChange1d: -5, pctChange1w: null, pctChange1m: null, pctChangeYtd: null, pctChange1y: 5 };
    const resultUp = computeMarketMomentumIndex([recentUp]);
    const resultDown = computeMarketMomentumIndex([recentDown]);
    expect(resultUp!.score).toBeGreaterThan(50);
    expect(resultDown!.score).toBeLessThan(50);
  });

  it("returns null when no indicator has any data", () => {
    const empty: MarketChangeSnapshot = { pctChange1d: null, pctChange1w: null, pctChange1m: null, pctChangeYtd: null, pctChange1y: null };
    expect(computeMarketMomentumIndex([empty])).toBeNull();
  });
});

describe("computeMacroHealthIndex", () => {
  it("scores a textbook-healthy economy well above 50", () => {
    const result = computeMacroHealthIndex({
      gdpGrowthPct: 3,
      inflationPct: 2,
      unemploymentPct: 4,
      currentAccountPctGdp: 1,
      govDebtPctGdp: 40,
    });
    expect(result!.score).toBeGreaterThan(60);
    expect(result!.confidence).toBe(1);
  });

  it("scores a stressed economy well below 50", () => {
    const result = computeMacroHealthIndex({
      gdpGrowthPct: -3,
      inflationPct: 15,
      unemploymentPct: 14,
      currentAccountPctGdp: -8,
      govDebtPctGdp: 180,
    });
    expect(result!.score).toBeLessThan(40);
  });

  it("lowers confidence when data is partial", () => {
    const full = computeMacroHealthIndex({ gdpGrowthPct: 2, inflationPct: 2, unemploymentPct: 5, currentAccountPctGdp: 0, govDebtPctGdp: 60 });
    const partial = computeMacroHealthIndex({ gdpGrowthPct: 2, inflationPct: null, unemploymentPct: null, currentAccountPctGdp: null, govDebtPctGdp: null });
    expect(partial!.confidence).toBeLessThan(full!.confidence);
  });

  it("returns null when nothing is reported", () => {
    expect(computeMacroHealthIndex({ gdpGrowthPct: null, inflationPct: null, unemploymentPct: null, currentAccountPctGdp: null, govDebtPctGdp: null })).toBeNull();
  });
});

describe("computeTrendProjection", () => {
  it("projects a perfect linear series exactly", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ t: i, value: 100 + i * 2 })); // slope=2
    const result = computeTrendProjection(points, 1);
    expect(result!.slopePerPeriod).toBeCloseTo(2, 5);
    expect(result!.projectedValue).toBeCloseTo(100 + 9 * 2 + 2, 5);
    expect(result!.rSquared).toBeCloseTo(1, 5);
  });

  it("returns null with too few points", () => {
    const points = [{ t: 0, value: 1 }, { t: 1, value: 2 }];
    expect(computeTrendProjection(points)).toBeNull();
  });

  it("gives lower confidence to noisy data than clean data", () => {
    const clean = Array.from({ length: 10 }, (_, i) => ({ t: i, value: 100 + i * 2 }));
    const noisy = clean.map((p, i) => ({ ...p, value: p.value + (i % 2 === 0 ? 8 : -8) }));
    const cleanResult = computeTrendProjection(clean);
    const noisyResult = computeTrendProjection(noisy);
    expect(noisyResult!.confidence).toBeLessThan(cleanResult!.confidence);
  });

  it("only uses the trailing 12 points even if more are given", () => {
    // 20 wild points, then a clean 12-point slope=2 tail with no overlap
    // (trailing(12) on a 32-length array grabs exactly indices 20-31).
    const wild = Array.from({ length: 20 }, (_, i) => ({ t: i, value: 1000 }));
    const tail = Array.from({ length: 12 }, (_, i) => ({ t: 20 + i, value: 100 + i * 2 }));
    const result = computeTrendProjection([...wild, ...tail], 1);
    expect(result!.slopePerPeriod).toBeCloseTo(2, 1);
  });
});

describe("detectAnomaly", () => {
  it("does not flag a move within normal historical variance", () => {
    const history = Array.from({ length: 60 }, () => 0);
    const result = detectAnomaly(history, 0.1);
    expect(result.isOutlier).toBe(false);
  });

  it("flags a move far outside historical variance", () => {
    const history = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0.1 : -0.1));
    const result = detectAnomaly(history, 15); // a 15% single-day move against a ~0.1% history
    expect(result.isOutlier).toBe(true);
    expect(result.zScore).not.toBeNull();
    expect(Math.abs(result.zScore!)).toBeGreaterThan(3);
  });

  it("declines to judge with insufficient history", () => {
    const result = detectAnomaly([0.1, 0.2, -0.1], 5);
    expect(result.isOutlier).toBe(false);
    expect(result.zScore).toBeNull();
  });
});
