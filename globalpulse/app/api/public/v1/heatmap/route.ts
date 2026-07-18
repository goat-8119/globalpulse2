import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractApiKey, validateApiKey, checkRateLimit } from "@/lib/api-auth";
import { getHeatmap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await validateApiKey(extractApiKey(req));
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const rateLimit = await checkRateLimit(auth.key.keyHash, auth.key.rateLimitPerMin);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const { searchParams } = new URL(req.url);
  const metric = searchParams.get("metric") ?? "momentum";
  const values = await getHeatmap(getSql(), metric);
  if (values === null) return NextResponse.json({ error: `Unknown metric '${metric}'` }, { status: 400 });
  return NextResponse.json({ metric, values });
}
