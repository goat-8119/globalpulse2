import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getHeatmap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const metric = searchParams.get("metric") ?? "momentum";

  const values = await getHeatmap(getSql(), metric);
  if (values === null) {
    return NextResponse.json({ error: `Unknown metric '${metric}'. Valid: momentum, macro_health, gdp_growth` }, { status: 400 });
  }

  return NextResponse.json({ metric, values });
}
