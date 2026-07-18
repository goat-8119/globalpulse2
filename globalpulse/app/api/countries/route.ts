import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { listCountries } from "@/lib/queries";

export const dynamic = "force-dynamic"; // always read the latest DB state, never statically cache

export async function GET() {
  const countries = await listCountries(getSql());
  return NextResponse.json({ countries });
}
