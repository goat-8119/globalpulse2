import { describe, it, expect } from "vitest";
import { pearsonCorrelation, buildCorrelationMatrix } from "./correlation";

describe("pearsonCorrelation", () => {
  it("returns 1 for identical series", () => {
    const a = [1, 2, 3, 4, 5];
    expect(pearsonCorrelation(a, a)).toBeCloseTo(1, 5);
  });

  it("returns -1 for perfectly inverse series", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [5, 4, 3, 2, 1];
    expect(pearsonCorrelation(a, b)).toBeCloseTo(-1, 5);
  });

  it("returns close to 0 for unrelated series", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [3, 7, 1, 8, 2, 6, 4, 5];
    const r = pearsonCorrelation(a, b);
    expect(r).not.toBeNull();
    expect(Math.abs(r!)).toBeLessThan(0.5);
  });

  it("returns null for mismatched lengths", () => {
    expect(pearsonCorrelation([1, 2, 3], [1, 2])).toBeNull();
  });

  it("returns null for series shorter than 3", () => {
    expect(pearsonCorrelation([1, 2], [3, 4])).toBeNull();
  });

  it("returns null when one series has zero variance", () => {
    expect(pearsonCorrelation([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });

  it("scales linearly with a positive transform (correlation is scale-invariant)", () => {
    const a = [1, 2, 3, 4, 5];
    const b = a.map((x) => x * 3 + 7);
    expect(pearsonCorrelation(a, b)).toBeCloseTo(1, 5);
  });
});

describe("buildCorrelationMatrix", () => {
  it("puts 1 on the diagonal for every label", () => {
    const result = buildCorrelationMatrix({
      USA: [1, 2, 3, 4, 5],
      DEU: [5, 4, 3, 2, 1],
      JPN: [2, 4, 1, 5, 3],
    });
    result.labels.forEach((label, i) => {
      expect(result.matrix[i]![i]).toBe(1);
    });
  });

  it("is symmetric", () => {
    const result = buildCorrelationMatrix({
      USA: [1, 2, 3, 4, 5, 6],
      DEU: [2, 1, 4, 3, 6, 5],
    });
    expect(result.matrix[0]![1]).toBeCloseTo(result.matrix[1]![0]!, 10);
  });

  it("returns the labels in insertion order", () => {
    const result = buildCorrelationMatrix({ ZAF: [1, 2, 3], USA: [3, 2, 1] });
    expect(result.labels).toEqual(["ZAF", "USA"]);
  });
});
