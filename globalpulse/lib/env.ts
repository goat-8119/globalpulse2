import { z } from "zod";

// Section 12: every one of these is required. A missing key should fail immediately
// at process startup — for a cron script that means "crash before doing any work",
// not "crash halfway through a batch of writes with a partial job_runs row."
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Neon connection string)"),
  FRED_API_KEY: z.string().min(1, "FRED_API_KEY is required (fred.stlouisfed.org)").optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  API_KEY_SALT: z.string().min(16, "API_KEY_SALT should be a long random string").optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Validates process.env against the schema above. Call this once at the top of
 * every entrypoint (API route module scope, or the first line of a script's main()).
 * Throws synchronously on a missing/invalid var instead of letting a bad fetch
 * or DB write fail mysteriously three steps later.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid/missing environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Strict variant for scripts that specifically need FRED (macro ingestion). */
export function requireFredKey(): string {
  const env = getEnv();
  if (!env.FRED_API_KEY) throw new Error("FRED_API_KEY is required for this script but is not set.");
  return env.FRED_API_KEY;
}

export function requireAnthropicKey(): string {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for AI briefings but is not set.");
  return env.ANTHROPIC_API_KEY;
}

export function requireApiKeySalt(): string {
  const env = getEnv();
  if (!env.API_KEY_SALT) throw new Error("API_KEY_SALT is required for public API auth but is not set.");
  return env.API_KEY_SALT;
}
