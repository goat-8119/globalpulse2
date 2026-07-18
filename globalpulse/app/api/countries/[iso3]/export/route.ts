import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getCountryDashboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params;
  const dashboard = await getCountryDashboard(getSql(), iso3);
  if (!dashboard) {
    return NextResponse.json({ error: `Country '${iso3}' not found` }, { status: 404 });
  }

  const headers = ["category", "subcategory", "display_name", "value", "unit", "pct_change_1d", "pct_change_1w", "pct_change_1m", "pct_change_ytd", "pct_change_1y", "is_outlier", "captured_at"];
  const rows = dashboard.indicators.map((i) =>
    [i.category, i.subcategory, i.displayName, i.value, i.unit, i.pctChange1d, i.pctChange1w, i.pctChange1m, i.pctChangeYtd, i.pctChange1y, i.isOutlier, i.capturedAt]
      .map(csvEscape)
      .join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="globalpulse-${dashboard.country.iso3.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
