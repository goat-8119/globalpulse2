import "dotenv/config";
import { getSql } from "../lib/db";
import { COUNTRIES, flagEmoji } from "./country-data";

const PSEUDO_ROWS: Array<{ iso3: string; name: string; flag: string }> = [
  { iso3: "GLB", name: "Global", flag: "🌐" },
  { iso3: "EUZ", name: "Euro Area", flag: "🇪🇺" },
];

async function main() {
  const sql = getSql();
  let written = 0;

  console.log(`Seeding ${COUNTRIES.length} countries from static reference data...`);
  for (const c of COUNTRIES) {
    await sql`
      INSERT INTO countries (iso2, iso3, name, region, flag_emoji, is_aggregate)
      VALUES (${c.iso2}, ${c.iso3}, ${c.name}, ${c.region}, ${flagEmoji(c.iso2)}, false)
      ON CONFLICT (iso3) DO UPDATE SET
        name = EXCLUDED.name,
        region = EXCLUDED.region,
        flag_emoji = EXCLUDED.flag_emoji
    `;
    written++;
  }

  console.log("Appending pseudo-rows (Global, Euro Area)...");
  for (const p of PSEUDO_ROWS) {
    await sql`
      INSERT INTO countries (iso2, iso3, name, region, flag_emoji, is_aggregate)
      VALUES (NULL, ${p.iso3}, ${p.name}, NULL, ${p.flag}, true)
      ON CONFLICT (iso3) DO NOTHING
    `;
    written++;
  }

  console.log(`Done. ${written} country rows upserted.`);
}

main().catch((err) => {
  console.error("Country seed failed:", err);
  process.exit(1);
});
