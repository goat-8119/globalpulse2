// Section 10: Growth Index Methodology. All four functions here are pure —
// no DB, no network — so they're unit tested directly (growth-index.test.ts)
// the same way changes.ts is. The script that calls these against real data
// (compute-growth-indexes.ts) is a thin wrapper that fetches rows and writes
// results to growth_indexes.

export const METHODOLOGY_VERSION = "v1";

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], m = mean(xs)): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

// ---------------------------------------------------------------------------
// A. Market Momentum Index (0-100, per country)
// ---------------------------------------------------------------------------

export type MarketChangeSnapshot = {
  pctChange1d: number | null;
  pctChange1w: number | null;
  pctChange1m: number | null;
  pctChangeYtd: number | null;
  pctChange1y: number | null;
};

// Recent moves weighted higher, per spec. Weights sum to 1 and are
// renormalized over whatever horizons are actually present for a given
// indicator (an indicator missing YTD/1y, e.g. a newly-listed instrument,
// still produces a usable score).
const MOMENTUM_WEIGHTS: Record<keyof MarketChangeSnapshot, number> = {
  pctChange1d: 0.35,
  pctChange1w: 0.25,
  pctChange1m: 0.2,
  pctChangeYtd: 0.1,
  pctChange1y: 0.1,
};

function weightedIndicatorScore(s: MarketChangeSnapshot): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const key of Object.keys(MOMENTUM_WEIGHTS) as (keyof MarketChangeSnapshot)[]) {
    const v = s[key];
    if (v !== null) {
      weightedSum += v * MOMENTUM_WEIGHTS[key];
      weightTotal += MOMENTUM_WEIGHTS[key];
    }
  }
  if (weightTotal === 0) return null;
  return weightedSum / weightTotal; // renormalized weighted average % change
}

/**
 * Squashes an unbounded weighted-%-change value into 0-100, centered at 50.
 * steepness controls how quickly extreme moves saturate toward 0/100 —
 * roughly, a weighted move of +/-steepness*4.4 sits at the 99/1 percentile.
 */
function squashToScore(x: number, steepness = 5): number {
  return 100 / (1 + Math.exp(-x / steepness));
}

export type IndexResult = { score: number; confidence: number };

/**
 * One country's Market Momentum Index: average the weighted per-indicator
 * scores across every category='Markets' indicator for that country, then
 * squash to 0-100. Confidence reflects how much of the weight schema was
 * actually populated across indicators (stale/missing horizons lower it).
 */
export function computeMarketMomentumIndex(snapshots: MarketChangeSnapshot[]): IndexResult | null {
  const perIndicator = snapshots.map(weightedIndicatorScore).filter((v): v is number => v !== null);
  if (perIndicator.length === 0) return null;

  const avgWeightedChange = mean(perIndicator);
  const score = clamp(squashToScore(avgWeightedChange), 0, 100);
  const confidence = clamp(perIndicator.length / snapshots.length, 0, 1);

  return { score, confidence };
}

// ---------------------------------------------------------------------------
// B. Macro Health Index (0-100, per country)
// ---------------------------------------------------------------------------

export type MacroSnapshot = {
  gdpGrowthPct: number | null;
  inflationPct: number | null;
  unemploymentPct: number | null;
  currentAccountPctGdp: number | null;
  govDebtPctGdp: number | null;
};

// Each sub-score is a documented, revisable linear mapping onto 0-100 around
// a "healthy" reference point — not an empirical model. Bump
// METHODOLOGY_VERSION if these mappings change, since growth_indexes rows
// are versioned for exactly this reason.
function subScores(s: MacroSnapshot): number[] {
  const scores: number[] = [];
  if (s.gdpGrowthPct !== null) scores.push(clamp(50 + s.gdpGrowthPct * 8, 0, 100));
  if (s.inflationPct !== null) scores.push(clamp(100 - Math.abs(s.inflationPct - 2) * 10, 0, 100));
  if (s.unemploymentPct !== null) scores.push(clamp(100 - s.unemploymentPct * 8, 0, 100));
  if (s.currentAccountPctGdp !== null) scores.push(clamp(50 + s.currentAccountPctGdp * 5, 0, 100));
  if (s.govDebtPctGdp !== null) scores.push(clamp(100 - s.govDebtPctGdp * 0.5, 0, 100));
  return scores;
}

export function computeMacroHealthIndex(s: MacroSnapshot): IndexResult | null {
  const scores = subScores(s);
  if (scores.length === 0) return null;
  return {
    score: mean(scores),
    confidence: clamp(scores.length / 5, 0, 1),
  };
}

// ---------------------------------------------------------------------------
// C. Trend Projection ("future growth") — explicitly trend extrapolation,
// not a forecast.
// ---------------------------------------------------------------------------

export type TrendPoint = { t: number; value: number };

export type TrendProjection = {
  projectedValue: number;
  slopePerPeriod: number;
  rSquared: number;
  confidence: number;
};

/** Ordinary least-squares fit on trailing 8-12 points, per spec. */
export function computeTrendProjection(points: TrendPoint[], periodsAhead = 1): TrendProjection | null {
  const trailing = points.slice(-12);
  if (trailing.length < 4) return null; // not enough history for a meaningful fit

  const n = trailing.length;
  const tMean = mean(trailing.map((p) => p.t));
  const vMean = mean(trailing.map((p) => p.value));

  let num = 0;
  let den = 0;
  for (const p of trailing) {
    num += (p.t - tMean) * (p.value - vMean);
    den += (p.t - tMean) ** 2;
  }
  if (den === 0) return null; // all points at the same t

  const slope = num / den;
  const intercept = vMean - slope * tMean;

  // R^2: 1 - SSres/SStot
  let ssRes = 0;
  let ssTot = 0;
  for (const p of trailing) {
    const predicted = intercept + slope * p.t;
    ssRes += (p.value - predicted) ** 2;
    ssTot += (p.value - vMean) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : clamp(1 - ssRes / ssTot, 0, 1);

  const lastT = trailing[trailing.length - 1]!.t;
  const projectedValue = intercept + slope * (lastT + periodsAhead);

  return {
    projectedValue,
    slopePerPeriod: slope,
    rSquared,
    // Confidence blends fit quality with sample size — a perfect fit on 4
    // points shouldn't outrank a strong fit on 12.
    confidence: clamp(rSquared * (n / 12), 0, 1),
  };
}

// ---------------------------------------------------------------------------
// D. Anomaly detection
// ---------------------------------------------------------------------------

export type AnomalyResult = { isOutlier: boolean; zScore: number | null };

/**
 * Compares `currentPctChange` against the rolling mean/stddev of the prior
 * trailing window (up to 60 daily observations, per spec) — the current
 * observation is deliberately excluded from its own baseline so the z-score
 * measures "how unusual is today vs. history," not "vs. a baseline that
 * already includes today."
 */
export function detectAnomaly(priorPctChanges: number[], currentPctChange: number, threshold = 3): AnomalyResult {
  const window = priorPctChanges.slice(-60);
  if (window.length < 10) return { isOutlier: false, zScore: null }; // not enough history to judge

  const m = mean(window);
  const sd = stddev(window, m);
  if (sd === 0) return { isOutlier: false, zScore: null };

  const z = (currentPctChange - m) / sd;
  return { isOutlier: Math.abs(z) > threshold, zScore: z };
}
