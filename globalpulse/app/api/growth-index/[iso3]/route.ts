import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params;
  const sql = getSql();

  const countryRows = await sql`SELECT id, name, flag_emoji FROM countries WHERE iso3 = ${iso3.toUpperCase()}`;
  const country = countryRows[0];
  if (!country) {
    return NextResponse.json({ error: `Country '${iso3}' not found` }, { status: 404 });
  }

  const rows = await sql`
    SELECT DISTINCT ON (index_type) index_type, score, confidence, methodology_version, computed_at
    FROM growth_indexes
    WHERE country_id = ${country.id}
    ORDER BY index_type, computed_at DESC
  `;

  return NextResponse.json({
    iso3: iso3.toUpperCase(),
    name: country.name,
    flagEmoji: country.flag_emoji,
    indexes: Object.fromEntries(
      rows.map((r) => [
        r.index_type,
        { score: Number(r.score), confidence: r.confidence === null ? null : Number(r.confidence), methodologyVersion: r.methodology_version, computedAt: r.computed_at },
      ])
    ),
  });
}
