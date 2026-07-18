/**
 * Tier 2: correlation matrix. Not specified in Section 10's methodology (that
 * section only covers momentum/macro-health/trend/anomaly) — this is a new
 * pure function following the same pattern: aligned time series in, Pearson
 * correlation coefficient out, no DB/network so it's directly testable.
 */

export type Series = number[]; // same-length, same-cadence values for two entities being compared

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Pearson correlation coefficient between two equal-length numeric series.
 * Returns null if either series has zero variance (correlation undefined)
 * or the series are too short / mismatched in length to be meaningful.
 */
export function pearsonCorrelation(a: Series, b: Series): number | null {
  if (a.length !== b.length || a.length < 3) return null;

  const meanA = mean(a);
  const meanB = mean(b);

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

export type CorrelationMatrix = { labels: string[]; matrix: (number | null)[][] };

/**
 * Builds an NxN correlation matrix from a map of label -> aligned series.
 * Every series must be the same length (callers are responsible for aligning
 * by date/index before calling this — see compute-correlation-matrix.ts).
 */
export function buildCorrelationMatrix(seriesByLabel: Record<string, Series>): CorrelationMatrix {
  const labels = Object.keys(seriesByLabel);
  const matrix = labels.map((rowLabel) =>
    labels.map((colLabel) => {
      if (rowLabel === colLabel) return 1;
      return pearsonCorrelation(seriesByLabel[rowLabel]!, seriesByLabel[colLabel]!);
    })
  );
  return { labels, matrix };
}
