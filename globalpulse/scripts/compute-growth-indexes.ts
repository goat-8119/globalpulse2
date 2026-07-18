import "dotenv/config";
import { getSql } from "../lib/db";
import {
  computeMarketMomentumIndex,
  computeMacroHealthIndex,
  computeTrendProjection,
  detectAnomaly,
  METHODOLOGY_VERSION,
  MarketChangeSnapshot,
  MacroSnapshot,
} from "./lib/growth-index";
import { momentumSignal, meanReversionSignal, volAdjustedMomentumSignal, computeCompositeSignal } from "./lib/quant-signals";
import { startJobRun, finishJobRun } from "./lib/upsert";

const JOB_NAME = "compute-growth-indexes";

async function writeIndex(
  sql: ReturnType<typeof getSql>,
  countryId: number,
  indexType: "market_momentum" | "macro_health" | "trend_projection" | "composite_signal",
  score: number,
  confidence: number
) {
  await sql`
    INSERT INTO growth_indexes (country_id, index_type, score, confidence, methodology_version, computed_at)
    VALUES (${countryId}, ${indexType}, ${score}, ${confidence}, ${METHODOLOGY_VERSION}, ${new Date().toISOString()})
  `;
}

async function computeMomentumForAllCountries(sql: ReturnType<typeof getSql>): Promise<number> {
  const countries = await sql`
    SELECT DISTINCT c.id, c.iso3 FROM countries c
    JOIN indicators i ON i.country_id = c.id
    WHERE i.category = 'Markets'
  `;

  let written = 0;
  for (const country of countries) {
    const rows = await sql`
      SELECT lo.pct_change_1d, lo.pct_change_1w, lo.pct_change_1m, lo.pct_change_ytd, lo.pct_change_1y
      FROM latest_observation lo
      JOIN indicators i ON i.id = lo.indicator_id
      WHERE i.country_id = ${country.id} AND i.category = 'Markets'
    `;
    if (rows.length === 0) continue;

    const snapshots: MarketChangeSnapshot[] = rows.map((r) => ({
      pctChange1d: r.pct_change_1d === null ? null : Number(r.pct_change_1d),
      pctChange1w: r.pct_change_1w === null ? null : Number(r.pct_change_1w),
      pctChange1m: r.pct_change_1m === null ? null : Number(r.pct_change_1m),
      pctChangeYtd: r.pct_change_ytd === null ? null : Number(r.pct_change_ytd),
      pctChange1y: r.pct_change_1y === null ? null : Number(r.pct_change_1y),
    }));

    const result = computeMarketMomentumIndex(snapshots);
    if (!result) continue;

    await writeIndex(sql, country.id, "market_momentum", result.score, result.confidence);
    written++;
  }
  return written;
}

async function computeMacroHealthForAllCountries(sql: ReturnType<typeof getSql>): Promise<number> {
  const countries = await sql`
    SELECT DISTINCT c.id, c.iso3 FROM countries c
    JOIN indicators i ON i.country_id = c.id
    WHERE i.source = 'worldbank'
  `;

  let written = 0;
  for (const country of countries) {
    const rows = await sql`
      SELECT i.canonical_key, lo.value
      FROM latest_observation lo
      JOIN indicators i ON i.id = lo.indicator_id
      WHERE i.country_id = ${country.id} AND i.source = 'worldbank'
    `;
    if (rows.length === 0) continue;

    const byKey = new Map(rows.map((r) => [r.canonical_key as string, r.value === null ? null : Number(r.value)]));
    const snapshot: MacroSnapshot = {
      gdpGrowthPct: byKey.get("gdp_growth_annual") ?? null,
      inflationPct: byKey.get("inflation_cpi_annual") ?? null,
      unemploymentPct: byKey.get("unemployment_rate") ?? null,
      currentAccountPctGdp: byKey.get("current_account_pct_gdp") ?? null,
      govDebtPctGdp: byKey.get("gov_debt_pct_gdp") ?? null,
    };

    const result = computeMacroHealthIndex(snapshot);
    if (!result) continue;

    await writeIndex(sql, country.id, "macro_health", result.score, result.confidence);
    written++;
  }
  return written;
}

/**
 * Trend projection uses each country's headline stock index as the
 * representative series — a country-level composite trend across every
 * indicator is a reasonable v2 extension, tracked via METHODOLOGY_VERSION.
 */
async function computeTrendProjectionsForAllCountries(sql: ReturnType<typeof getSql>): Promise<number> {
  const headlineIndicators = await sql`
    SELECT id, country_id FROM indicators
    WHERE canonical_key IN ('stock_index_headline', 'stock_index_sp500')
  `;

  let written = 0;
  for (const ind of headlineIndicators) {
    const history = await sql`
      SELECT value, captured_at FROM observations
      WHERE indicator_id = ${ind.id}
      ORDER BY captured_at DESC
      LIMIT 12
    `;
    if (history.length < 4) continue;

    const points = history
      .slice()
      .reverse()
      .map((h, idx) => ({ t: idx, value: Number(h.value) }));

    const result = computeTrendProjection(points, 1);
    if (!result) continue;

    await writeIndex(sql, ind.country_id, "trend_projection", result.projectedValue, result.confidence);
    written++;
  }
  return written;
}

/**
 * Composite Signal Score: an equal-weighted ensemble of momentum,
 * mean-reversion, and volatility-adjusted momentum signals (quant-signals.ts).
 * This is explicitly NOT a prediction — see the module header there. The
 * `agreement` value (stored in the confidence column, which is semantically
 * the right slot for it) tells the reader when the signals actually disagree
 * with each other, rather than letting a washed-out average hide that.
 */
async function computeCompositeSignalsForAllCountries(sql: ReturnType<typeof getSql>): Promise<number> {
  const headlineIndicators = await sql`
    SELECT id, country_id FROM indicators
    WHERE canonical_key IN ('stock_index_headline', 'stock_index_sp500')
  `;

  let written = 0;
  for (const ind of headlineIndicators) {
    const history = await sql`
      SELECT value, pct_change_1d FROM observations
      WHERE indicator_id = ${ind.id}
      ORDER BY captured_at DESC
      LIMIT 30
    `;
    if (history.length < 11) continue; // need at least 10 prior points + 1 current for the signals below

    const chronological = history.slice().reverse();
    const values = chronological.map((h) => Number(h.value));
    const dailyPctChanges = chronological.map((h) => (h.pct_change_1d === null ? 0 : Number(h.pct_change_1d)));

    const latest = chronological[chronological.length - 1]!;
    const momentum = momentumSignal({
      pctChange1d: latest.pct_change_1d === null ? null : Number(latest.pct_change_1d),
      pctChange1w: null, // not reliably available from this trailing window alone
      pctChange1m: null,
    });
    const reversion = meanReversionSignal(values);
    const volAdj = volAdjustedMomentumSignal(dailyPctChanges);

    const composite = computeCompositeSignal(momentum, reversion, volAdj);
    if (!composite) continue;

    await writeIndex(sql, ind.country_id, "composite_signal", composite.score, composite.agreement);
    written++;
  }
  return written;
}

async function flagAnomalies(sql: ReturnType<typeof getSql>): Promise<number> {
  const indicators = await sql`SELECT id FROM indicators WHERE category = 'Markets'`;
  let flagged = 0;

  for (const ind of indicators) {
    const history = await sql`
      SELECT id, pct_change_1d FROM observations
      WHERE indicator_id = ${ind.id} AND pct_change_1d IS NOT NULL
      ORDER BY captured_at DESC
      LIMIT 61
    `;
    if (history.length < 11) continue;

    const [latest, ...prior] = history;
    if (!latest) continue;
    const priorChanges = prior.map((r) => Number(r.pct_change_1d)).reverse(); // chronological
    const { isOutlier } = detectAnomaly(priorChanges, Number(latest.pct_change_1d));

    if (isOutlier) {
      await sql`UPDATE observations SET is_outlier = true WHERE id = ${latest.id}`;
      flagged++;
    }
  }
  return flagged;
}

async function main() {
  const sql = getSql();
  const { startedAt } = await startJobRun(JOB_NAME);

  try {
    const momentumCount = await computeMomentumForAllCountries(sql);
    const macroCount = await computeMacroHealthForAllCountries(sql);
    const trendCount = await computeTrendProjectionsForAllCountries(sql);
    const compositeCount = await computeCompositeSignalsForAllCountries(sql);
    const anomalyCount = await flagAnomalies(sql);

    const total = momentumCount + macroCount + trendCount + compositeCount;
    console.log(
      `Wrote ${momentumCount} momentum, ${macroCount} macro-health, ${trendCount} trend-projection, ${compositeCount} composite-signal rows. Flagged ${anomalyCount} anomalies.`
    );
    await finishJobRun(JOB_NAME, startedAt, "success", total);
  } catch (err) {
    await finishJobRun(JOB_NAME, startedAt, "failed", 0, (err as Error).message);
    throw err;
  }
}

main().catch((err) => {
  console.error("Growth index computation failed:", err);
  process.exit(1);
});
