import { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

export async function listCountries(sql: Sql) {
  const rows = await sql`
    SELECT
      c.iso3, c.iso2, c.name, c.region, c.flag_emoji, c.is_aggregate,
      mm.score AS momentum_score,
      mh.score AS macro_health_score
    FROM countries c
    LEFT JOIN LATERAL (
      SELECT score FROM growth_indexes WHERE country_id = c.id AND index_type = 'market_momentum' ORDER BY computed_at DESC LIMIT 1
    ) mm ON true
    LEFT JOIN LATERAL (
      SELECT score FROM growth_indexes WHERE country_id = c.id AND index_type = 'macro_health' ORDER BY computed_at DESC LIMIT 1
    ) mh ON true
    ORDER BY c.name ASC
  `;

  return rows.map((r) => ({
    iso3: r.iso3,
    iso2: r.iso2,
    name: r.name,
    region: r.region,
    flagEmoji: r.flag_emoji,
    isAggregate: r.is_aggregate,
    momentumScore: r.momentum_score === null ? null : Number(r.momentum_score),
    macroHealthScore: r.macro_health_score === null ? null : Number(r.macro_health_score),
  }));
}

export async function getCountryDashboard(sql: Sql, iso3: string) {
  const countryRows = await sql`SELECT * FROM countries WHERE iso3 = ${iso3.toUpperCase()}`;
  const country = countryRows[0];
  if (!country) return null;

  const indicatorRows = await sql`
    SELECT
      i.id, i.category, i.subcategory, i.canonical_key, i.display_name, i.source, i.unit, i.display_groups,
      lo.value, lo.change, lo.pct_change_1d, lo.pct_change_1w, lo.pct_change_1m, lo.pct_change_ytd, lo.pct_change_1y,
      lo.is_outlier, lo.period_label, lo.captured_at
    FROM indicators i
    LEFT JOIN latest_observation lo ON lo.indicator_id = i.id
    WHERE i.country_id = ${country.id}
    ORDER BY i.category, i.canonical_key
  `;

  const growthIndexRows = await sql`
    SELECT DISTINCT ON (index_type) index_type, score, confidence, methodology_version, computed_at
    FROM growth_indexes
    WHERE country_id = ${country.id}
    ORDER BY index_type, computed_at DESC
  `;

  // Tier 4: sparklines. One windowed query for every indicator's trailing 14
  // points, instead of N+1 per-indicator queries.
  const indicatorIds = indicatorRows.map((r) => r.id as number);
  const sparklineMap = new Map<number, number[]>();
  if (indicatorIds.length > 0) {
    const sparkRows = await sql`
      SELECT indicator_id, value FROM (
        SELECT indicator_id, value, captured_at,
               ROW_NUMBER() OVER (PARTITION BY indicator_id ORDER BY captured_at DESC) AS rn
        FROM observations
        WHERE indicator_id = ANY(${indicatorIds})
      ) sub
      WHERE rn <= 14
      ORDER BY indicator_id, captured_at ASC
    `;
    for (const row of sparkRows) {
      const id = row.indicator_id as number;
      if (!sparklineMap.has(id)) sparklineMap.set(id, []);
      sparklineMap.get(id)!.push(Number(row.value));
    }
  }

  return {
    country: {
      iso3: country.iso3,
      iso2: country.iso2,
      name: country.name,
      region: country.region,
      flagEmoji: country.flag_emoji,
      isAggregate: country.is_aggregate,
    },
    indicators: indicatorRows.map((r) => ({
      id: r.id,
      category: r.category,
      subcategory: r.subcategory,
      canonicalKey: r.canonical_key,
      displayName: r.display_name,
      source: r.source,
      unit: r.unit,
      displayGroups: r.display_groups,
      value: r.value === null ? null : Number(r.value),
      change: r.change === null ? null : Number(r.change),
      pctChange1d: r.pct_change_1d === null ? null : Number(r.pct_change_1d),
      pctChange1w: r.pct_change_1w === null ? null : Number(r.pct_change_1w),
      pctChange1m: r.pct_change_1m === null ? null : Number(r.pct_change_1m),
      pctChangeYtd: r.pct_change_ytd === null ? null : Number(r.pct_change_ytd),
      pctChange1y: r.pct_change_1y === null ? null : Number(r.pct_change_1y),
      isOutlier: r.is_outlier ?? false,
      periodLabel: r.period_label,
      capturedAt: r.captured_at,
      sparkline: sparklineMap.get(r.id as number) ?? [],
    })),
    growthIndexes: Object.fromEntries(
      growthIndexRows.map((r) => [
        r.index_type,
        { score: Number(r.score), confidence: r.confidence === null ? null : Number(r.confidence), methodologyVersion: r.methodology_version, computedAt: r.computed_at },
      ])
    ) as Record<string, { score: number; confidence: number | null; methodologyVersion: string; computedAt: string }>,
  };
}

export async function listAnomalies(sql: Sql, limit = 50) {
  const rows = await sql`
    SELECT
      c.iso3, c.name AS country_name, c.flag_emoji,
      i.display_name, i.canonical_key, i.category,
      o.value, o.pct_change_1d, o.captured_at
    FROM observations o
    JOIN indicators i ON i.id = o.indicator_id
    JOIN countries c ON c.id = i.country_id
    WHERE o.is_outlier = true
    ORDER BY o.captured_at DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    countryIso3: r.iso3,
    countryName: r.country_name,
    flagEmoji: r.flag_emoji,
    indicatorDisplayName: r.display_name,
    canonicalKey: r.canonical_key,
    category: r.category,
    value: Number(r.value),
    pctChange1d: r.pct_change_1d === null ? null : Number(r.pct_change_1d),
    capturedAt: r.captured_at as string,
  }));
}

export async function getJobFreshness(sql: Sql, jobName: string): Promise<{ finishedAt: string; minutesSince: number } | null> {
  const rows = await sql`
    SELECT finished_at FROM job_runs
    WHERE job_name = ${jobName} AND finished_at IS NOT NULL
    ORDER BY started_at DESC LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const finishedAt = row.finished_at as string;
  const minutesSince = Math.round((Date.now() - new Date(finishedAt).getTime()) / 60000);
  return { finishedAt, minutesSince };
}

const METRIC_TO_INDEX_TYPE: Record<string, string> = {
  momentum: "market_momentum",
  macro_health: "macro_health",
};
const METRIC_TO_CANONICAL_KEY: Record<string, string> = {
  gdp_growth: "gdp_growth_annual",
};

export async function getHeatmap(sql: Sql, metric: string) {
  if (METRIC_TO_CANONICAL_KEY[metric]) {
    const canonicalKey = METRIC_TO_CANONICAL_KEY[metric];
    const rows = await sql`
      SELECT c.iso3, c.name, lo.value AS score
      FROM countries c
      JOIN indicators i ON i.country_id = c.id AND i.canonical_key = ${canonicalKey}
      JOIN latest_observation lo ON lo.indicator_id = i.id
    `;
    return rows.map((r) => ({ iso3: r.iso3, name: r.name, score: Number(r.score) }));
  }

  const indexType = METRIC_TO_INDEX_TYPE[metric];
  if (!indexType) return null;

  const rows = await sql`
    SELECT DISTINCT ON (c.iso3) c.iso3, c.name, gi.score
    FROM countries c
    JOIN growth_indexes gi ON gi.country_id = c.id AND gi.index_type = ${indexType}
    ORDER BY c.iso3, gi.computed_at DESC
  `;
  return rows.map((r) => ({ iso3: r.iso3, name: r.name, score: Number(r.score) }));
}
