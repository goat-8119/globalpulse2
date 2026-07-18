import { describe, it, expect } from "vitest";
import { computeMacroYoyChanges } from "./macro-changes";

describe("computeMacroYoyChanges", () => {
  it("leaves the earliest year with null change", () => {
    const result = computeMacroYoyChanges([{ year: "2020", value: 100 }]);
    expect(result[0]!.change).toBeNull();
    expect(result[0]!.pctChange1y).toBeNull();
  });

  it("computes correct YoY deltas across years", () => {
    const result = computeMacroYoyChanges([
      { year: "2020", value: 100 },
      { year: "2021", value: 110 },
      { year: "2022", value: 99 },
    ]);
    expect(result[1]!.change).toBeCloseTo(10);
    expect(result[1]!.pctChange1y).toBeCloseTo(10);
    expect(result[2]!.change).toBeCloseTo(-11);
    expect(result[2]!.pctChange1y).toBeCloseTo(-10);
  });

  it("sorts out-of-order input before computing", () => {
    const result = computeMacroYoyChanges([
      { year: "2022", value: 120 },
      { year: "2020", value: 100 },
      { year: "2021", value: 110 },
    ]);
    expect(result.map((r) => r.year)).toEqual(["2020", "2021", "2022"]);
  });

  it("returns null pct change when the prior value is zero", () => {
    const result = computeMacroYoyChanges([
      { year: "2020", value: 0 },
      { year: "2021", value: 5 },
    ]);
    expect(result[1]!.change).toBeCloseTo(5);
    expect(result[1]!.pctChange1y).toBeNull();
  });
});
