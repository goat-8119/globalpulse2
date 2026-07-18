import { createHash } from "node:crypto";
import { getSql } from "./db";
import { requireApiKeySalt } from "./env";

/** Raw keys are never stored — only this hash. Salted so a leaked DB dump alone can't be brute-forced against known key formats. */
export function hashApiKey(rawKey: string): string {
  const salt = requireApiKeySalt();
  return createHash("sha256").update(`${salt}:${rawKey}`).digest("hex");
}

export type ApiKeyRecord = { id: number; keyHash: string; ownerLabel: string | null; rateLimitPerMin: number };

export async function validateApiKey(rawKey: string | null): Promise<{ ok: true; key: ApiKeyRecord } | { ok: false; reason: string }> {
  if (!rawKey) return { ok: false, reason: "Missing API key" };

  const sql = getSql();
  const keyHash = hashApiKey(rawKey);
  const rows = await sql`
    SELECT id, key_hash, owner_label, rate_limit_per_min FROM api_keys
    WHERE key_hash = ${keyHash} AND revoked_at IS NULL
  `;
  const row = rows[0];
  if (!row) return { ok: false, reason: "Invalid or revoked API key" };

  return {
    ok: true,
    key: { id: row.id, keyHash: row.key_hash, ownerLabel: row.owner_label, rateLimitPerMin: row.rate_limit_per_min },
  };
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Fixed-window counter (Section 8): count this key's requests in the current
 * 60-second window; if under the limit, log this request and allow it.
 * "Enough at this scale" per spec — not sliding-window-precise, but correct
 * and cheap, and it's DB-backed so it holds up across concurrent serverless
 * instances (see api_request_log in schema.sql).
 */
export async function checkRateLimit(keyHash: string, limitPerMin: number): Promise<RateLimitResult> {
  const sql = getSql();
  const windowStart = new Date(Date.now() - 60_000);

  const countRows = await sql`
    SELECT count(*)::int AS n FROM api_request_log
    WHERE key_hash = ${keyHash} AND requested_at >= ${windowStart.toISOString()}
  `;
  const currentCount = countRows[0]?.n ?? 0;

  if (currentCount >= limitPerMin) {
    return { allowed: false, retryAfterSeconds: 60 };
  }

  await sql`INSERT INTO api_request_log (key_hash, requested_at) VALUES (${keyHash}, now())`;
  return { allowed: true };
}

/** Extracts a bearer/x-api-key style token from an incoming Request. */
export function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key");
}
