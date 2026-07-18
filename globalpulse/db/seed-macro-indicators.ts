import "dotenv/config";
import { getSql } from "../lib/db";

type MacroIndicatorDef = {
  canonicalKey: string;
  category: string;
  displayName: string;
  code: string; // World Bank series code
  unit: string;
};

// Section 4B, expanded to cover more of the Trading Economics "Main
// Indicators" taxonomy (Prices/GDP/Money/Trade/Housing/Business/Energy/
// Taxes/Consumer/Climate/Health/Government/Labour/Markets — see reference
// screenshots). Not every category has a World Bank equivalent — Housing,
// Business, Consumer, News, Calendar, and UN Comtrade are national
// statistical office / specialty-provider data, out of scope for the
// World Bank/IMF/FRED source set this app uses (see README).
const MACRO_INDICATORS: MacroIndicatorDef[] = [
  { canonicalKey: "gdp_growth_annual", category: "GDP", displayName: "GDP Growth Rate", code: "NY.GDP.MKTP.KD.ZG", unit: "%" },
  { canonicalKey: "gdp_current_usd", category: "GDP", displayName: "GDP", code: "NY.GDP.MKTP.CD", unit: "US$" },
  { canonicalKey: "gdp_per_capita", category: "GDP", displayName: "GDP per Capita", code: "NY.GDP.PCAP.CD", unit: "US$" },
  { canonicalKey: "gross_fixed_capital_formation_pct_gdp", category: "GDP", displayName: "Gross Fixed Capital Formation (% of GDP)", code: "NE.GDI.FTOT.ZS", unit: "% of GDP" },
  { canonicalKey: "inflation_cpi_annual", category: "Prices", displayName: "Inflation (CPI)", code: "FP.CPI.TOTL.ZG", unit: "%" },
  { canonicalKey: "unemployment_rate", category: "Labour", displayName: "Unemployment Rate", code: "SL.UEM.TOTL.ZS", unit: "%" },
  { canonicalKey: "labor_force_participation_rate", category: "Labour", displayName: "Labor Force Participation Rate", code: "SL.TLF.CACT.ZS", unit: "%" },
  { canonicalKey: "gov_debt_pct_gdp", category: "Government", displayName: "Government Debt (% of GDP)", code: "GC.DOD.TOTL.GD.ZS", unit: "% of GDP" },
  { canonicalKey: "military_expenditure_pct_gdp", category: "Government", displayName: "Military Expenditure (% of GDP)", code: "MS.MIL.XPND.GD.ZS", unit: "% of GDP" },
  { canonicalKey: "population_total", category: "Government", displayName: "Population", code: "SP.POP.TOTL", unit: "people" },
  { canonicalKey: "current_account_pct_gdp", category: "Trade", displayName: "Current Account Balance (% of GDP)", code: "BN.CAB.XOKA.GD.ZS", unit: "% of GDP" },
  { canonicalKey: "trade_pct_gdp", category: "Trade", displayName: "Trade (% of GDP)", code: "NE.TRD.GNFS.ZS", unit: "% of GDP" },
  { canonicalKey: "exports_pct_gdp", category: "Trade", displayName: "Exports (% of GDP)", code: "NE.EXP.GNFS.ZS", unit: "% of GDP" },
  { canonicalKey: "imports_pct_gdp", category: "Trade", displayName: "Imports (% of GDP)", code: "NE.IMP.GNFS.ZS", unit: "% of GDP" },
  { canonicalKey: "fdi_net_inflows_pct_gdp", category: "Trade", displayName: "Foreign Direct Investment (% of GDP)", code: "BX.KLT.DINV.WD.GD.ZS", unit: "% of GDP" },
  { canonicalKey: "tax_revenue_pct_gdp", category: "Taxes", displayName: "Tax Revenue (% of GDP)", code: "GC.TAX.TOTL.GD.ZS", unit: "% of GDP" },
  { canonicalKey: "real_interest_rate", category: "Money", displayName: "Real Interest Rate", code: "FR.INR.RINR", unit: "%" },
  { canonicalKey: "hospital_beds_per_1000", category: "Health", displayName: "Hospital Beds (per 1,000 people)", code: "SH.MED.BEDS.ZS", unit: "per 1,000 people" },
  { canonicalKey: "co2_emissions_per_capita", category: "Climate", displayName: "CO2 Emissions (metric tons per capita)", code: "EN.ATM.CO2E.PC", unit: "metric tons per capita" },
];

// Section 4B/8: bond yields for economies where FRED's OECD-sourced series
// exists (IRLTLT01{ISO2}M156N, monthly, verified live via FRED search — see
// README). USA is excluded: it already owns bond_yield_10y via Yahoo (^TNX)
// from db:seed-indicators.ts, and source-priority (Section 5) means a
// second source can't take that slot without explicit reassignment.
const FRED_BOND_COUNTRIES: { iso3: string; iso2: string }[] = [
  { iso3: "DEU", iso2: "DE" }, { iso3: "GBR", iso2: "GB" }, { iso3: "JPN", iso2: "JP" },
  { iso3: "ITA", iso2: "IT" }, { iso3: "FRA", iso2: "FR" }, { iso3: "ESP", iso2: "ES" },
  { iso3: "CHE", iso2: "CH" }, { iso3: "CAN", iso2: "CA" }, { iso3: "AUS", iso2: "AU" },
  { iso3: "KOR", iso2: "KR" }, { iso3: "NLD", iso2: "NL" }, { iso3: "SWE", iso2: "SE" },
  { iso3: "BEL", iso2: "BE" }, { iso3: "MEX", iso2: "MX" }, { iso3: "NZL", iso2: "NZ" },
];

/**
 * Full coverage: every country already in the `countries` table gets every
 * World Bank macro indicator seeded. World Bank simply returns an empty
 * series for territories it doesn't cover — ingest-macro.ts already handles
 * that gracefully (writes 0 rows, logs it, moves on).
 */
async function seedWorldBankIndicators(sql: ReturnType<typeof getSql>): Promise<{ written: number; skipped: string[] }> {
  let written = 0;
  const skipped: string[] = [];

  const countryRows = await sql`SELECT id, iso3 FROM countries WHERE iso3 != 'GLB' ORDER BY iso3`;

  for (const country of countryRows) {
    for (const ind of MACRO_INDICATORS) {
      // Source-priority (Section 5): don't overwrite a slot a higher-priority
      // source already owns.
      const existing = await sql`
        SELECT source FROM indicators WHERE country_id = ${country.id} AND canonical_key = ${ind.canonicalKey}
      `;
      if (existing.length > 0 && existing[0]!.source !== "worldbank") {
        skipped.push(`${country.iso3}/${ind.canonicalKey} (owned by higher-priority source '${existing[0]!.source}')`);
        continue;
      }

      await sql`
        INSERT INTO indicators (country_id, category, subcategory, canonical_key, display_name, source, external_ref, update_frequency, unit, display_groups)
        VALUES (${country.id}, ${ind.category}, NULL, ${ind.canonicalKey}, ${ind.displayName}, 'worldbank', ${ind.code}, 'annual', ${ind.unit}, ARRAY['Main'])
        ON CONFLICT (country_id, canonical_key) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          external_ref = EXCLUDED.external_ref,
          unit = EXCLUDED.unit
      `;
      written++;
    }
  }
  return { written, skipped };
}

async function seedFredBondYields(sql: ReturnType<typeof getSql>): Promise<{ written: number; skipped: string[] }> {
  let written = 0;
  const skipped: string[] = [];

  for (const { iso3, iso2 } of FRED_BOND_COUNTRIES) {
    const countryRows = await sql`SELECT id FROM countries WHERE iso3 = ${iso3}`;
    if (countryRows.length === 0) {
      skipped.push(`${iso3} (not found — run db:seed-countries first)`);
      continue;
    }
    const countryId = countryRows[0]!.id;

    const existing = await sql`
      SELECT source FROM indicators WHERE country_id = ${countryId} AND canonical_key = 'bond_yield_10y'
    `;
    if (existing.length > 0 && existing[0]!.source !== "fred") {
      skipped.push(`${iso3}/bond_yield_10y (owned by higher-priority source '${existing[0]!.source}')`);
      continue;
    }

    await sql`
      INSERT INTO indicators (country_id, category, subcategory, canonical_key, display_name, source, external_ref, update_frequency, unit, display_groups)
      VALUES (${countryId}, 'Markets', 'Government Bond 10Y', 'bond_yield_10y', '10Y Government Bond Yield', 'fred', ${"IRLTLT01" + iso2 + "M156N"}, 'monthly', '%', ARRAY['Major'])
      ON CONFLICT (country_id, canonical_key) DO UPDATE SET external_ref = EXCLUDED.external_ref
    `;
    written++;
  }
  return { written, skipped };
}

async function main() {
  const sql = getSql();

  const countryCount = await sql`SELECT count(*)::int AS n FROM countries WHERE iso3 != 'GLB'`;
  if ((countryCount[0]?.n ?? 0) === 0) {
    console.error("No countries found. Run db:seed-countries first.");
    process.exit(1);
  }

  const wb = await seedWorldBankIndicators(sql);
  console.log(`World Bank: seeded ${wb.written} indicators.`);
  if (wb.skipped.length) console.warn(`  skipped ${wb.skipped.length} (owned by a higher-priority source)`);

  const fred = await seedFredBondYields(sql);
  console.log(`FRED: seeded ${fred.written} bond-yield indicators.`);
  if (fred.skipped.length) console.warn(`  skipped:\n${fred.skipped.map((s) => `    - ${s}`).join("\n")}`);
}

main().catch((err) => {
  console.error("Macro indicator seed failed:", err);
  process.exit(1);
});
