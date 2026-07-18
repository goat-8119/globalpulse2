import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getCountryDashboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params;
  const dashboard = await getCountryDashboard(getSql(), iso3);
  if (!dashboard) {
    return NextResponse.json({ error: `Country '${iso3}' not found` }, { status: 404 });
  }
  return NextResponse.json(dashboard);
}
