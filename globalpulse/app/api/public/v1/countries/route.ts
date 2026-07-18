import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractApiKey, validateApiKey, checkRateLimit } from "@/lib/api-auth";
import { listCountries } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await validateApiKey(extractApiKey(req));
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const rateLimit = await checkRateLimit(auth.key.keyHash, auth.key.rateLimitPerMin);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  return NextResponse.json({ countries: await listCountries(getSql()) });
}
