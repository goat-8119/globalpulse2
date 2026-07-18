import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { buildCorrelationMatrix } from "@/scripts/lib/correlation";

export const dynamic = "force-dynamic";

const DEFAULT_COUNTRIES = ["USA", "DEU", "JPN", "GBR", "CHN", "IND", "BRA", "CAN"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isoList = (searchParams.get("countries")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)) ?? DEFAULT_COUNTRIES;
  const days = Math.min(Number(searchParams.get("days") ?? "90"), 500);

  if (isoList.length < 2 || isoList.length > 12) {
    return NextResponse.json({ error: "Provide between 2 and 12 country codes" }, { status: 400 });
  }

  const sql = getSql();

  // One representative "headline" market series per country — see comment in
  // scripts/lib/correlation.ts for why this simplification exists.
  const indicatorRows = await sql`
    SELECT i.id, c.iso3
    FROM indicators i
    JOIN countries c ON c.id = i.country_id
    WHERE c.iso3 = ANY(${isoList}) AND i.canonical_key IN ('stock_index_headline', 'stock_index_sp500')
  `;

  if (indicatorRows.length < 2) {
    return NextResponse.json({ error: "Fewer than 2 of the requested countries have a headline market indicator seeded" }, { status: 404 });
  }

  const seriesByIso3: Record<string, number[]> = {};
  for (const row of indicatorRows) {
    const obs = await sql`
      SELECT pct_change_1d FROM observations
      WHERE indicator_id = ${row.id} AND pct_change_1d IS NOT NULL
      ORDER BY captured_at DESC
      LIMIT ${days}
    `;
    if (obs.length >= 3) {
      seriesByIso3[row.iso3 as string] = obs.map((o) => Number(o.pct_change_1d)).reverse();
    }
  }

  // Correlation requires equal-length aligned series — truncate every series
  // to the shortest available (an approximation of date-alignment, not exact
  // trading-calendar matching; documented as a v1 simplification).
  const lengths = Object.values(seriesByIso3).map((s) => s.length);
  if (lengths.length < 2) {
    return NextResponse.json({ error: "Not enough history yet for at least 2 of the requested countries" }, { status: 404 });
  }
  const minLength = Math.min(...lengths);
  const aligned = Object.fromEntries(Object.entries(seriesByIso3).map(([iso3, s]) => [iso3, s.slice(-minLength)]));

  const result = buildCorrelationMatrix(aligned);
  return NextResponse.json({ ...result, days: minLength });
}
