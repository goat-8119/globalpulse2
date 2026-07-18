import "dotenv/config";
import { getSql } from "../lib/db";

type IndicatorSeed = {
  iso3: string;               // country this indicator belongs to (GLB for global instruments)
  category: string;
  subcategory: string;
  canonicalKey: string;
  displayName: string;
  externalRef: string;        // Yahoo Finance symbol
  displayGroups: string[];
};

// Market indices. Real coverage ceiling: most of the ~190 seeded countries
// don't have a stock index that's actually tracked on Yahoo Finance at all —
// this isn't a scoping choice, it's what exists. Every symbol below was
// either verified via a live Yahoo Finance search result or is a
// long-standing, widely-referenced ticker (S&P 500, DAX, etc.). Where I
// wasn't confident, I left the country out rather than guess — a wrong
// symbol fails loudly in ingest (zod validation + retry, then a skipped
// symbol in the job_runs error log), so it's safe to extend this list later,
// just verify the ticker on finance.yahoo.com first.
const MARKET_INDICATORS: IndicatorSeed[] = [
  // Indices (Section 4A)
  { iso3: "USA", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_sp500", displayName: "S&P 500 (US500)", externalRef: "^GSPC", displayGroups: ["Major"] },
  { iso3: "USA", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_dow", displayName: "Dow Jones (US30)", externalRef: "^DJI", displayGroups: ["Major"] },
  { iso3: "USA", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_nasdaq", displayName: "Nasdaq (US100)", externalRef: "^IXIC", displayGroups: ["Major"] },
  { iso3: "JPN", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Nikkei 225", externalRef: "^N225", displayGroups: ["Major", "Asia"] },
  { iso3: "GBR", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "FTSE 100", externalRef: "^FTSE", displayGroups: ["Major", "Europe"] },
  { iso3: "DEU", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "DAX (DE40)", externalRef: "^GDAXI", displayGroups: ["Major", "Europe"] },
  { iso3: "HKG", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Hang Seng", externalRef: "^HSI", displayGroups: ["Major", "Asia"] },
  { iso3: "IND", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "BSE Sensex", externalRef: "^BSESN", displayGroups: ["Major", "Asia"] },
  { iso3: "CHN", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Shanghai Composite", externalRef: "000001.SS", displayGroups: ["Major", "Asia"] },
  { iso3: "BRA", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Bovespa", externalRef: "^BVSP", displayGroups: ["Major", "Americas"] },
  { iso3: "CAN", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "S&P/TSX Composite", externalRef: "^GSPTSE", displayGroups: ["Major", "Americas"] },

  // Additional coverage — verified live against Yahoo Finance search results
  // or long-standing well-documented tickers (see header comment above).
  { iso3: "FRA", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "CAC 40", externalRef: "^FCHI", displayGroups: ["Major", "Europe"] },
  { iso3: "ITA", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "FTSE MIB", externalRef: "FTSEMIB.MI", displayGroups: ["Europe"] },
  { iso3: "ESP", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "IBEX 35", externalRef: "^IBEX", displayGroups: ["Europe"] },
  { iso3: "NLD", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "AEX", externalRef: "^AEX", displayGroups: ["Europe"] },
  { iso3: "CHE", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Swiss Market Index (SMI)", externalRef: "^SSMI", displayGroups: ["Europe"] },
  { iso3: "SWE", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "OMX Stockholm 30", externalRef: "^OMX", displayGroups: ["Europe"] },
  { iso3: "BEL", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "BEL 20", externalRef: "^BFX", displayGroups: ["Europe"] },
  { iso3: "KOR", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "KOSPI", externalRef: "^KS11", displayGroups: ["Major", "Asia"] },
  { iso3: "TWN", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Taiwan Weighted", externalRef: "^TWII", displayGroups: ["Asia"] },
  { iso3: "SGP", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Straits Times Index", externalRef: "^STI", displayGroups: ["Asia"] },
  { iso3: "AUS", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "ASX 200", externalRef: "^AXJO", displayGroups: ["Major", "Oceania"] },
  { iso3: "NZL", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "NZX 50", externalRef: "^NZ50", displayGroups: ["Oceania"] },
  { iso3: "MEX", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "IPC Mexico", externalRef: "^MXX", displayGroups: ["Americas"] },
  { iso3: "ARG", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Merval", externalRef: "^MERV", displayGroups: ["Americas"] },
  { iso3: "ZAF", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "JSE All Share", externalRef: "^J203.JO", displayGroups: ["Africa"] },
  { iso3: "TUR", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "BIST 100", externalRef: "XU100.IS", displayGroups: ["Europe"] },
  { iso3: "IDN", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Jakarta Composite", externalRef: "^JKSE", displayGroups: ["Asia"] },
  { iso3: "MYS", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "FTSE Bursa Malaysia KLCI", externalRef: "^KLSE", displayGroups: ["Asia"] },
  { iso3: "RUS", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "MOEX Russia Index", externalRef: "IMOEX.ME", displayGroups: ["Europe"] },
  { iso3: "EUZ", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "EURO STOXX 50", externalRef: "^STOXX50E", displayGroups: ["Major", "Europe"] },

  // Second batch — verified live against Yahoo Finance search results (July 2026).
  { iso3: "IND", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_nifty50", displayName: "NIFTY 50", externalRef: "^NSEI", displayGroups: ["Major", "Asia"] },
  { iso3: "ISR", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "TA-125", externalRef: "^TA125.TA", displayGroups: ["Asia"] },
  { iso3: "EGY", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "EGX 30", externalRef: "^CASE30", displayGroups: ["Africa"] },
  { iso3: "CHL", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "S&P IPSA", externalRef: "^IPSA", displayGroups: ["Americas"] },
  { iso3: "CHN", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_shenzhen", displayName: "Shenzhen Component", externalRef: "399001.SZ", displayGroups: ["Asia"] },
  { iso3: "AUT", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "ATX", externalRef: "^ATX", displayGroups: ["Europe"] },
  { iso3: "POL", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "WIG20", externalRef: "WIG20.WA", displayGroups: ["Europe"] },
  { iso3: "HUN", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "BUX", externalRef: "^BUX.BD", displayGroups: ["Europe"] },
  { iso3: "SAU", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "Tadawul All-Share (TASI)", externalRef: "^TASI.SR", displayGroups: ["Asia"] },
  { iso3: "VNM", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "VN-Index", externalRef: "^VNINDEX.VN", displayGroups: ["Asia"] },
  { iso3: "IRL", category: "Markets", subcategory: "Stock Market", canonicalKey: "stock_index_headline", displayName: "ISEQ All-Share", externalRef: "^ISEQ", displayGroups: ["Europe"] },

  // Commodities (Global pseudo-row)
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_crude_oil", displayName: "Crude Oil (WTI)", externalRef: "CL=F", displayGroups: ["Energy"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_brent", displayName: "Brent Crude", externalRef: "BZ=F", displayGroups: ["Energy"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_natural_gas", displayName: "Natural Gas", externalRef: "NG=F", displayGroups: ["Energy"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_gold", displayName: "Gold", externalRef: "GC=F", displayGroups: ["Metals"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_silver", displayName: "Silver", externalRef: "SI=F", displayGroups: ["Metals"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_copper", displayName: "Copper", externalRef: "HG=F", displayGroups: ["Metals"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_corn", displayName: "Corn", externalRef: "ZC=F", displayGroups: ["Agriculture"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_wheat", displayName: "Wheat", externalRef: "ZW=F", displayGroups: ["Agriculture"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_soybeans", displayName: "Soybeans", externalRef: "ZS=F", displayGroups: ["Agriculture"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_coffee", displayName: "Coffee", externalRef: "KC=F", displayGroups: ["Agriculture"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_sugar", displayName: "Sugar", externalRef: "SB=F", displayGroups: ["Agriculture"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_cocoa", displayName: "Cocoa", externalRef: "CC=F", displayGroups: ["Agriculture"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_gasoline", displayName: "RBOB Gasoline", externalRef: "RB=F", displayGroups: ["Energy"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_heating_oil", displayName: "Heating Oil", externalRef: "HO=F", displayGroups: ["Energy"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_platinum", displayName: "Platinum", externalRef: "PL=F", displayGroups: ["Metals"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_palladium", displayName: "Palladium", externalRef: "PA=F", displayGroups: ["Metals"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_oat", displayName: "Oat", externalRef: "ZO=F", displayGroups: ["Agriculture"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_rice", displayName: "Rice", externalRef: "ZR=F", displayGroups: ["Agriculture"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_cotton", displayName: "Cotton", externalRef: "CT=F", displayGroups: ["Agriculture"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_live_cattle", displayName: "Live Cattle", externalRef: "LE=F", displayGroups: ["Livestock"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_feeder_cattle", displayName: "Feeder Cattle", externalRef: "GF=F", displayGroups: ["Livestock"] },
  { iso3: "GLB", category: "Markets", subcategory: "Commodity", canonicalKey: "commodity_lean_hogs", displayName: "Lean Hogs", externalRef: "HE=F", displayGroups: ["Livestock"] },

  // Forex (Global pseudo-row). Only USD pairs ingested directly — other
  // cross-rates are derived at read time per Section 5, not stored here.
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_eurusd", displayName: "EUR/USD", externalRef: "EURUSD=X", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_gbpusd", displayName: "GBP/USD", externalRef: "GBPUSD=X", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdjpy", displayName: "USD/JPY", externalRef: "USDJPY=X", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdcny", displayName: "USD/CNY", externalRef: "USDCNY=X", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdinr", displayName: "USD/INR", externalRef: "USDINR=X", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_dxy", displayName: "US Dollar Index (DXY)", externalRef: "DX-Y.NYB", displayGroups: ["Major"] },

  // Additional USD pairs — Yahoo's forex tickers follow a standardized
  // BASEQUOTE=X convention, so this list is much lower ticker-risk than the
  // indices above (no per-instrument lookup needed, just the ISO currency code).
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_audusd", displayName: "AUD/USD", externalRef: "AUDUSD=X", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_nzdusd", displayName: "NZD/USD", externalRef: "NZDUSD=X", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdchf", displayName: "USD/CHF", externalRef: "USDCHF=X", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdcad", displayName: "USD/CAD", externalRef: "USDCAD=X", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdmxn", displayName: "USD/MXN", externalRef: "USDMXN=X", displayGroups: ["Americas"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdbrl", displayName: "USD/BRL", externalRef: "USDBRL=X", displayGroups: ["Americas"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdars", displayName: "USD/ARS", externalRef: "USDARS=X", displayGroups: ["Americas"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdclp", displayName: "USD/CLP", externalRef: "USDCLP=X", displayGroups: ["Americas"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdtry", displayName: "USD/TRY", externalRef: "USDTRY=X", displayGroups: ["Europe"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdsek", displayName: "USD/SEK", externalRef: "USDSEK=X", displayGroups: ["Europe"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdnok", displayName: "USD/NOK", externalRef: "USDNOK=X", displayGroups: ["Europe"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdpln", displayName: "USD/PLN", externalRef: "USDPLN=X", displayGroups: ["Europe"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usddkk", displayName: "USD/DKK", externalRef: "USDDKK=X", displayGroups: ["Europe"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdczk", displayName: "USD/CZK", externalRef: "USDCZK=X", displayGroups: ["Europe"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdhuf", displayName: "USD/HUF", externalRef: "USDHUF=X", displayGroups: ["Europe"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdzar", displayName: "USD/ZAR", externalRef: "USDZAR=X", displayGroups: ["Africa"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdils", displayName: "USD/ILS", externalRef: "USDILS=X", displayGroups: ["Asia"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdhkd", displayName: "USD/HKD", externalRef: "USDHKD=X", displayGroups: ["Asia"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdsgd", displayName: "USD/SGD", externalRef: "USDSGD=X", displayGroups: ["Asia"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdkrw", displayName: "USD/KRW", externalRef: "USDKRW=X", displayGroups: ["Asia"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdtwd", displayName: "USD/TWD", externalRef: "USDTWD=X", displayGroups: ["Asia"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdthb", displayName: "USD/THB", externalRef: "USDTHB=X", displayGroups: ["Asia"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdidr", displayName: "USD/IDR", externalRef: "USDIDR=X", displayGroups: ["Asia"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdphp", displayName: "USD/PHP", externalRef: "USDPHP=X", displayGroups: ["Asia"] },
  { iso3: "GLB", category: "Markets", subcategory: "Currency", canonicalKey: "fx_usdvnd", displayName: "USD/VND", externalRef: "USDVND=X", displayGroups: ["Asia"] },

  // Crypto (Global pseudo-row)
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_btc", displayName: "Bitcoin", externalRef: "BTC-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_eth", displayName: "Ethereum", externalRef: "ETH-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_sol", displayName: "Solana", externalRef: "SOL-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_xrp", displayName: "XRP", externalRef: "XRP-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_bnb", displayName: "BNB", externalRef: "BNB-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_ada", displayName: "Cardano", externalRef: "ADA-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_dot", displayName: "Polkadot", externalRef: "DOT-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_avax", displayName: "Avalanche", externalRef: "AVAX-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_atom", displayName: "Cosmos", externalRef: "ATOM-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_ltc", displayName: "Litecoin", externalRef: "LTC-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_link", displayName: "Chainlink", externalRef: "LINK-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_bch", displayName: "Bitcoin Cash", externalRef: "BCH-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_xlm", displayName: "Stellar", externalRef: "XLM-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_algo", displayName: "Algorand", externalRef: "ALGO-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_trx", displayName: "TRON", externalRef: "TRX-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_xmr", displayName: "Monero", externalRef: "XMR-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_usdt", displayName: "Tether", externalRef: "USDT-USD", displayGroups: ["Major"] },
  { iso3: "GLB", category: "Markets", subcategory: "Crypto", canonicalKey: "crypto_usdc", displayName: "USD Coin", externalRef: "USDC-USD", displayGroups: ["Major"] },

  // Bond yields (US only for now — other countries need FRED or bond-ETF
  // proxies per Section 4A, deferred to the macro phase)
  { iso3: "USA", category: "Markets", subcategory: "Government Bond 10Y", canonicalKey: "bond_yield_5y", displayName: "US 5Y Treasury Yield", externalRef: "^FVX", displayGroups: ["Major"] },
  { iso3: "USA", category: "Markets", subcategory: "Government Bond 10Y", canonicalKey: "bond_yield_10y", displayName: "US 10Y Treasury Yield", externalRef: "^TNX", displayGroups: ["Major"] },
  { iso3: "USA", category: "Markets", subcategory: "Government Bond 10Y", canonicalKey: "bond_yield_30y", displayName: "US 30Y Treasury Yield", externalRef: "^TYX", displayGroups: ["Major"] },
];

async function main() {
  const sql = getSql();
  let written = 0;
  let skipped: string[] = [];

  for (const ind of MARKET_INDICATORS) {
    const countryRows = await sql`SELECT id FROM countries WHERE iso3 = ${ind.iso3}`;
    if (countryRows.length === 0) {
      skipped.push(`${ind.displayName} (country ${ind.iso3} not found — run db:seed-countries first)`);
      continue;
    }
    const countryId = countryRows[0]!.id;

    await sql`
      INSERT INTO indicators (country_id, category, subcategory, canonical_key, display_name, source, external_ref, update_frequency, display_groups)
      VALUES (${countryId}, ${ind.category}, ${ind.subcategory}, ${ind.canonicalKey}, ${ind.displayName}, 'yahoo', ${ind.externalRef}, 'realtime', ${ind.displayGroups})
      ON CONFLICT (country_id, canonical_key) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        external_ref = EXCLUDED.external_ref,
        display_groups = EXCLUDED.display_groups
    `;
    written++;
  }

  console.log(`Seeded ${written} market indicators.`);
  if (skipped.length) {
    console.warn(`Skipped ${skipped.length}:\n${skipped.map((s) => `  - ${s}`).join("\n")}`);
  }
}

main().catch((err) => {
  console.error("Indicator seed failed:", err);
  process.exit(1);
});
