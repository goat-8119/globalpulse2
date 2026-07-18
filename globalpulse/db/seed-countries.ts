import "dotenv/config";
import { getSql } from "../lib/db";

type RestCountry = {
  cca2?: string;
  cca3: string;
  name: { common: string };
  region?: string;
  flag?: string; // emoji
};

const PSEUDO_ROWS: Array<{ iso3: string; name: string; flag: string }> = [
  { iso3: "GLB", name: "Global", flag: "🌐" },
  { iso3: "EUZ", name: "Euro Area", flag: "🇪🇺" },
];

async function fetchCountries(): Promise<RestCountry[]> {
  const fields = "cca2,cca3,name,region,flag";
  const res = await fetch(`https://restcountries.com/v3.1/all?fields=${fields}`);
  if (!res.ok) {
    throw new Error(`restcountries.com returned HTTP ${res.status}`);
  }
  return res.json();
}

async function main() {
  const sql = getSql();

  console.log("Fetching country list from restcountries.com...");
  const countries = await fetchCountries();
  console.log(`Fetched ${countries.length} countries.`);

  let written = 0;
  for (const c of countries) {
    // A handful of restcountries entries lack a 2-letter code (e.g. disputed
    // territories); iso3 is what we actually key on, so iso2 is nullable.
    await sql`
      INSERT INTO countries (iso2, iso3, name, region, flag_emoji, is_aggregate)
      VALUES (${c.cca2 ?? null}, ${c.cca3}, ${c.name.common}, ${c.region ?? null}, ${c.flag ?? null}, false)
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
