import { describe, it, expect } from "vitest";
import { momentumSignal, meanReversionSignal, volAdjustedMomentumSignal, computeCompositeSignal } from "./quant-signals";

describe("momentumSignal", () => {
  it("is neutral (0) when everything is flat", () => {
    expect(momentumSignal({ pctChange1d: 0, pctChange1w: 0, pctChange1m: 0 })).toBeCloseTo(0, 5);
  });
  it("is positive when moves are broadly up", () => {
    expect(momentumSignal({ pctChange1d: 2, pctChange1w: 3, pctChange1m: 4 })!).toBeGreaterThan(0);
  });
  it("is negative when moves are broadly down", () => {
    expect(momentumSignal({ pctChange1d: -2, pctChange1w: -3, pctChange1m: -4 })!).toBeLessThan(0);
  });
  it("returns null with no data", () => {
    expect(momentumSignal({ pctChange1d: null, pctChange1w: null, pctChange1m: null })).toBeNull();
  });
});

describe("meanReversionSignal", () => {
  it("returns negative (expect pullback) when price is far above its own trailing average", () => {
    const history = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    const stretched = [...history, 140]; // last value way above the mildly-noisy history
    expect(meanReversionSignal(stretched)!).toBeLessThan(0);
  });
  it("returns positive (expect bounce) when price is far below its own trailing average", () => {
    const history = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    const dipped = [...history, 60];
    expect(meanReversionSignal(dipped)!).toBeGreaterThan(0);
  });
  it("is the opposite sign of a momentum-style read on the same stretch", () => {
    // This is the point of including both signals: a sharp recent rally
    // reads BULLISH on momentum but BEARISH on mean reversion.
    const history = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    const rallied = [...history, 130];
    const momentum = momentumSignal({ pctChange1d: 30, pctChange1w: 30, pctChange1m: 30 })!;
    const reversion = meanReversionSignal(rallied)!;
    expect(Math.sign(momentum)).not.toBe(Math.sign(reversion));
  });
  it("returns null with insufficient history", () => {
    expect(meanReversionSignal([100, 101, 102])).toBeNull();
  });
});

describe("volAdjustedMomentumSignal", () => {
  it("scores the same raw move lower when historical volatility is high", () => {
    const calmHistory = Array.from({ length: 20 }, () => 0.1);
    const volatileHistory = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 3 : -3));
    const calmResult = volAdjustedMomentumSignal([...calmHistory, 1.0])!;
    const volatileResult = volAdjustedMomentumSignal([...volatileHistory, 1.0])!;
    expect(Math.abs(calmResult)).toBeGreaterThan(Math.abs(volatileResult));
  });
  it("returns null with insufficient history", () => {
    expect(volAdjustedMomentumSignal([0.1, 0.2])).toBeNull();
  });
});

describe("computeCompositeSignal", () => {
  it("returns 50 (neutral) when all three signals are exactly 0", () => {
    const result = computeCompositeSignal(0, 0, 0);
    expect(result!.score).toBeCloseTo(50, 5);
    expect(result!.agreement).toBeCloseTo(1, 5);
  });

  it("reports high agreement when all signals point the same direction with similar magnitude", () => {
    const result = computeCompositeSignal(40, 45, 42);
    expect(result!.agreement).toBeGreaterThan(0.8);
    expect(result!.label).toBe("bullish tilt");
  });

  it("reports low agreement when signals sharply disagree, even if the average looks decisive", () => {
    // momentum strongly bullish, mean-reversion strongly bearish, vol-adj neutral
    const result = computeCompositeSignal(80, -80, 0);
    expect(result!.score).toBeCloseTo(50, 1); // average washes out to ~neutral
    expect(result!.agreement).toBeLessThan(0.4);
    expect(result!.label).toBe("mixed / low agreement");
  });

  it("handles partial data (fewer than 3 signals available)", () => {
    const result = computeCompositeSignal(60, null, null);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(50);
    expect(result!.components.meanReversion).toBeNull();
  });

  it("returns null when no signals are available at all", () => {
    expect(computeCompositeSignal(null, null, null)).toBeNull();
  });
});
