export type MacroObservation = { year: string; value: number };
export type MacroObservationWithChange = MacroObservation & { change: number | null; pctChange1y: number | null };

/**
 * Annual macro data only ever has a meaningful year-over-year comparison —
 * there's no "1-day" or "1-week" change for a GDP-growth series. Sorted by
 * year so re-running against a World Bank response (which returns full
 * history, not just the latest point) always produces the same deltas.
 */
export function computeMacroYoyChanges(observations: MacroObservation[]): MacroObservationWithChange[] {
  const sorted = [...observations].sort((a, b) => Number(a.year) - Number(b.year));
  return sorted.map((obs, i) => {
    if (i === 0) return { ...obs, change: null, pctChange1y: null };
    const prev = sorted[i - 1]!;
    const change = obs.value - prev.value;
    const pctChange1y = prev.value === 0 ? null : (change / prev.value) * 100;
    return { ...obs, change, pctChange1y };
  });
}
