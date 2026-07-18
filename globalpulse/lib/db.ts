import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { getEnv } from "./env";

let sqlClient: NeonQueryFunction<false, false> | null = null;

/**
 * Returns a tagged-template SQL client, e.g.:
 *   const rows = await sql`SELECT * FROM countries WHERE iso3 = ${iso3}`;
 */
export function getSql(): NeonQueryFunction<false, false> {
  if (sqlClient) return sqlClient;
  const { DATABASE_URL } = getEnv();
  sqlClient = neon(DATABASE_URL);
  return sqlClient;
}
