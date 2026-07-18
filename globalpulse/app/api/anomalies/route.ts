import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { listAnomalies } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const anomalies = await listAnomalies(getSql(), limit);
  return NextResponse.json({ anomalies });
}
