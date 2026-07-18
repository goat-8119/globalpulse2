// Composite Signal Score — an equal-weighted ensemble of three standard,
// genuinely-used quant signal types. This is NOT a prediction. Averaging
// reduces noise across weak statistical signals; it does not manufacture
// accuracy that isn't in the underlying data. Every score here should be
// read as "what several standard techniques currently say," not "what will
// happen." The `agreement` field is the honest part: when the three signals
// point different directions, that's shown explicitly rather than smoothed
// away by the average.

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stddev(xs: number[], m = mean(xs)): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
/** Squashes an unbounded value to [-100, 100], centered at 0. */
function squash(x: number, steepness: number): number {
  return 200 / (1 + Math.exp(-x / steepness)) - 100;
}

// ---------------------------------------------------------------------------
// Signal 1: Momentum (trend-following) — weighted recent % changes.
// ---------------------------------------------------------------------------
export type MomentumInput = {
  pctChange1d: number | null;
  pctChange1w: number | null;
  pctChange1m: number | null;
};
const MOMENTUM_WEIGHTS = { pctChange1d: 0.5, pctChange1w: 0.3, pctChange1m: 0.2 };

export function momentumSignal(input: MomentumInput): number | null {
  let sum = 0;
  let weight = 0;
  for (const key of Object.keys(MOMENTUM_WEIGHTS) as (keyof MomentumInput)[]) {
    const v = input[key];
    if (v !== null) {
      sum += v * MOMENTUM_WEIGHTS[key];
      weight += MOMENTUM_WEIGHTS[key];
    }
  }
  if (weight === 0) return null;
  return squash(sum / weight, 4);
}

// ---------------------------------------------------------------------------
// Signal 2: Mean reversion (contrarian) — z-score of current value vs its
// own trailing mean. Deliberately the OPPOSITE sign convention from
// momentum: a price far above its recent average scores NEGATIVE here
// (statistically "stretched," a pullback is more likely on average — though
// far from certain), which is exactly why these two signals often disagree.
// ---------------------------------------------------------------------------
export function meanReversionSignal(trailingValues: number[]): number | null {
  if (trailingValues.length < 10) return null;
  const current = trailingValues[trailingValues.length - 1]!;
  const history = trailingValues.slice(0, -1);
  const m = mean(history);
  const sd = stddev(history, m);
  if (sd === 0) return null;
  const z = (current - m) / sd;
  return squash(-z * 20, 40); // inverted: positive z (stretched high) -> negative signal
}

// ---------------------------------------------------------------------------
// Signal 3: Volatility-adjusted momentum — same idea as Signal 1, but a
// given % move counts for less when realized volatility is already high
// (standard risk-scaling: a 3% day means something different in a calm
// market than a chaotic one).
// ---------------------------------------------------------------------------
export function volAdjustedMomentumSignal(dailyPctChanges: number[]): number | null {
  if (dailyPctChanges.length < 10) return null;
  const recent = dailyPctChanges[dailyPctChanges.length - 1]!;
  const history = dailyPctChanges.slice(0, -1);
  const vol = stddev(history);
  if (vol === 0) return null;
  const riskAdjusted = recent / vol; // ~ a single-day Sharpe-like ratio
  return squash(riskAdjusted * 15, 40);
}

// ---------------------------------------------------------------------------
// Ensemble
// ---------------------------------------------------------------------------
export type CompositeSignalResult = {
  score: number; // 0-100, 50 = neutral (mapped from the -100..100 ensemble average)
  agreement: number; // 0-1. 1 = all signals fully agree in direction/magnitude, 0 = maximally split
  label: "bullish tilt" | "bearish tilt" | "mixed / low agreement";
  components: { momentum: number | null; meanReversion: number | null; volAdjustedMomentum: number | null };
};

/**
 * Equal-weighted average of whichever of the three signals could be
 * computed. `agreement` is 1 minus the normalized dispersion across the
 * available signals — this is the number that keeps the composite honest:
 * a high score with low agreement means "the average looks bullish, but the
 * underlying signals actually disagree with each other," which is a very
 * different and more useful statement than the score alone.
 */
export function computeCompositeSignal(
  momentum: number | null,
  meanReversion: number | null,
  volAdjustedMomentum: number | null
): CompositeSignalResult | null {
  const available = [momentum, meanReversion, volAdjustedMomentum].filter((v): v is number => v !== null);
  if (available.length === 0) return null;

  const avg = mean(available);
  const score = clamp(50 + avg / 2, 0, 100); // map -100..100 -> 0..100

  // Agreement: dispersion relative to the maximum possible spread (-100..100).
  // With only one signal available there's nothing to disagree with, so
  // agreement is reported as 1 but should be read alongside a low implicit
  // confidence from having just one input (the caller has that info too).
  const spread = available.length > 1 ? stddev(available) : 0;
  const agreement = clamp(1 - spread / 100, 0, 1);

  const label: CompositeSignalResult["label"] = agreement < 0.4 ? "mixed / low agreement" : avg > 10 ? "bullish tilt" : avg < -10 ? "bearish tilt" : "mixed / low agreement";

  return {
    score,
    agreement,
    label,
    components: { momentum, meanReversion, volAdjustedMomentum },
  };
}
