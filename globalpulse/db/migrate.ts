import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { getEnv } from "../lib/env";

async function main() {
  const { DATABASE_URL } = getEnv();
  const sql = neon(DATABASE_URL);
  const schemaPath = join(process.cwd(), "db", "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  // Neon's HTTP driver runs one statement per call, so split on semicolons at
  // statement boundaries. Comments and blank lines are safe to leave in since
  // they don't produce empty statements after this split.
  const statements = schema
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log(`Applying ${statements.length} statements to ${DATABASE_URL.split("@")[1] ?? "database"}...`);

  for (const [i, stmt] of statements.entries()) {
    try {
      await sql(stmt);
      console.log(`  [${i + 1}/${statements.length}] OK`);
    } catch (err) {
      console.error(`  [${i + 1}/${statements.length}] FAILED:\n${stmt}\n`);
      throw err;
    }
  }

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
