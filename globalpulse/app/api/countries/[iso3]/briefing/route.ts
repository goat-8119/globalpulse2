import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { generateCountryBriefing } from "@/lib/briefing";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params;
  const sql = getSql();

  const countryRows = await sql`SELECT id, name FROM countries WHERE iso3 = ${iso3.toUpperCase()}`;
  const country = countryRows[0];
  if (!country) {
    return NextResponse.json({ error: `Country '${iso3}' not found` }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC

  const cached = await sql`
    SELECT briefing_text, generated_at FROM country_briefings
    WHERE country_id = ${country.id} AND briefing_date = ${today}
  `;
  if (cached[0]) {
    return NextResponse.json({ iso3, briefing: cached[0].briefing_text, generatedAt: cached[0].generated_at, cached: true });
  }

  // Gather the same data the growth indexes are built from, so the briefing
  // never says anything the dashboard doesn't already show.
  const growthRows = await sql`
    SELECT DISTINCT ON (index_type) index_type, score FROM growth_indexes
    WHERE country_id = ${country.id} ORDER BY index_type, computed_at DESC
  `;
  const momentumScore = growthRows.find((r) => r.index_type === "market_momentum")?.score ?? null;
  const macroHealthScore = growthRows.find((r) => r.index_type === "macro_health")?.score ?? null;

  const topMoversRows = await sql`
    SELECT i.display_name, lo.pct_change_1d
    FROM indicators i JOIN latest_observation lo ON lo.indicator_id = i.id
    WHERE i.country_id = ${country.id} AND i.category = 'Markets' AND lo.pct_change_1d IS NOT NULL
    ORDER BY abs(lo.pct_change_1d) DESC LIMIT 3
  `;

  const macroFactsRows = await sql`
    SELECT i.display_name, i.unit, lo.value
    FROM indicators i JOIN latest_observation lo ON lo.indicator_id = i.id
    WHERE i.country_id = ${country.id} AND i.source = 'worldbank'
  `;

  if (momentumScore === null && macroHealthScore === null && topMoversRows.length === 0 && macroFactsRows.length === 0) {
    return NextResponse.json({ error: "No data available yet for this country" }, { status: 404 });
  }

  let briefingText: string;
  try {
    briefingText = await generateCountryBriefing({
      countryName: country.name,
      momentumScore: momentumScore === null ? null : Number(momentumScore),
      macroHealthScore: macroHealthScore === null ? null : Number(macroHealthScore),
      topMovers: topMoversRows.map((r) => ({ displayName: r.display_name, pctChange1d: r.pct_change_1d === null ? null : Number(r.pct_change_1d) })),
      macroFacts: macroFactsRows.map((r) => ({ displayName: r.display_name, value: r.value === null ? null : Number(r.value), unit: r.unit })),
    });
  } catch (err) {
    return NextResponse.json({ error: `Briefing generation failed: ${(err as Error).message}` }, { status: 502 });
  }

  await sql`
    INSERT INTO country_briefings (country_id, briefing_date, briefing_text, generated_at)
    VALUES (${country.id}, ${today}, ${briefingText}, ${new Date().toISOString()})
    ON CONFLICT (country_id, briefing_date) DO NOTHING
  `;

  return NextResponse.json({ iso3, briefing: briefingText, generatedAt: new Date().toISOString(), cached: false });
}
