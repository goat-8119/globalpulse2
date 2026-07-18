import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ iso3: string; canonicalKey: string }> }
) {
  const { iso3, canonicalKey } = await params;
  const sql = getSql();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "500"), 5000);

  const indicatorRows = await sql`
    SELECT i.id, i.display_name, i.unit
    FROM indicators i
    JOIN countries c ON c.id = i.country_id
    WHERE c.iso3 = ${iso3.toUpperCase()} AND i.canonical_key = ${canonicalKey}
  `;
  const indicator = indicatorRows[0];
  if (!indicator) {
    return NextResponse.json({ error: `No indicator '${canonicalKey}' for country '${iso3}'` }, { status: 404 });
  }

  const history = await sql`
    SELECT value, change, pct_change_1d, pct_change_1w, pct_change_1m, pct_change_ytd, pct_change_1y,
           is_outlier, period_label, captured_at
    FROM observations
    WHERE indicator_id = ${indicator.id}
    ORDER BY captured_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json({
    indicator: { displayName: indicator.display_name, unit: indicator.unit, canonicalKey },
    // Ascending order — natural for charting libraries (Recharts expects oldest-first).
    history: history
      .slice()
      .reverse()
      .map((r) => ({
        value: Number(r.value),
        change: r.change === null ? null : Number(r.change),
        pctChange1d: r.pct_change_1d === null ? null : Number(r.pct_change_1d),
        pctChange1w: r.pct_change_1w === null ? null : Number(r.pct_change_1w),
        pctChange1m: r.pct_change_1m === null ? null : Number(r.pct_change_1m),
        pctChangeYtd: r.pct_change_ytd === null ? null : Number(r.pct_change_ytd),
        pctChange1y: r.pct_change_1y === null ? null : Number(r.pct_change_1y),
        isOutlier: r.is_outlier ?? false,
        periodLabel: r.period_label,
        capturedAt: r.captured_at,
      })),
  });
}
