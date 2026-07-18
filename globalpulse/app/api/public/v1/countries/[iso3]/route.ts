import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractApiKey, validateApiKey, checkRateLimit } from "@/lib/api-auth";
import { getCountryDashboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const auth = await validateApiKey(extractApiKey(req));
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const rateLimit = await checkRateLimit(auth.key.keyHash, auth.key.rateLimitPerMin);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const { iso3 } = await params;
  const dashboard = await getCountryDashboard(getSql(), iso3);
  if (!dashboard) return NextResponse.json({ error: `Country '${iso3}' not found` }, { status: 404 });
  return NextResponse.json(dashboard);
}
