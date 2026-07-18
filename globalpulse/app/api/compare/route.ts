import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isoParam = searchParams.get("countries");
  if (!isoParam) {
    return NextResponse.json({ error: "Missing required query param 'countries', e.g. ?countries=DEU,JPN,USA" }, { status: 400 });
  }
  const isoList = isoParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (isoList.length === 0 || isoList.length > 10) {
    return NextResponse.json({ error: "Provide between 1 and 10 country codes" }, { status: 400 });
  }

  const sql = getSql();

  const countries = await sql`SELECT * FROM countries WHERE iso3 = ANY(${isoList})`;
  if (countries.length === 0) {
    return NextResponse.json({ error: "None of the requested countries were found" }, { status: 404 });
  }

  const countryIds = countries.map((c) => c.id as number);

  const indicators = await sql`
    SELECT i.country_id, i.category, i.canonical_key, i.display_name, i.unit,
           lo.value, lo.pct_change_1d, lo.pct_change_ytd, lo.pct_change_1y
    FROM indicators i
    LEFT JOIN latest_observation lo ON lo.indicator_id = i.id
    WHERE i.country_id = ANY(${countryIds})
    ORDER BY i.category, i.canonical_key
  `;

  const growthIndexes = await sql`
    SELECT DISTINCT ON (country_id, index_type) country_id, index_type, score, confidence
    FROM growth_indexes
    WHERE country_id = ANY(${countryIds})
    ORDER BY country_id, index_type, computed_at DESC
  `;

  const payload = countries.map((c) => ({
    iso3: c.iso3,
    name: c.name,
    flagEmoji: c.flag_emoji,
    indicators: indicators
      .filter((i) => i.country_id === c.id)
      .map((i) => ({
        category: i.category,
        canonicalKey: i.canonical_key,
        displayName: i.display_name,
        unit: i.unit,
        value: i.value === null ? null : Number(i.value),
        pctChange1d: i.pct_change_1d === null ? null : Number(i.pct_change_1d),
        pctChangeYtd: i.pct_change_ytd === null ? null : Number(i.pct_change_ytd),
        pctChange1y: i.pct_change_1y === null ? null : Number(i.pct_change_1y),
      })),
    growthIndexes: Object.fromEntries(
      growthIndexes.filter((g) => g.country_id === c.id).map((g) => [g.index_type, { score: Number(g.score), confidence: g.confidence === null ? null : Number(g.confidence) }])
    ),
  }));

  return NextResponse.json({ countries: payload });
}
