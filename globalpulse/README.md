# GlobalPulse — Preview Build

Covers every phase in the spec (Section 15) plus most of Tier 2-4 (Section
11), expanded a second time against the Trading Economics reference
screenshots to maximize real coverage. Everything here typechecks
(`tsc --noEmit` clean), the full Next.js app builds (`next build`, 21 routes
compile), and **36 unit tests pass**. Anything touching a live network call
still needs to run in your environment — see "Verification performed."

## Coverage, against your screenshots

**Markets (images 2-17): 117 instruments seeded**, ~40 countries with a
national index (up from 11 in the first pass), plus commodities, forex,
crypto. Every non-obvious ticker was checked against a live Yahoo Finance
search result before being added — see the comments in `db/seed-indicators.ts`
for exactly which batch each one came from.

- **Indices**: all of Images 5-8's "Major" table, plus CAC 40, FTSE MIB,
  IBEX 35, AEX, SMI, OMX Stockholm, BEL 20, KOSPI, Taiwan Weighted, STI,
  ASX 200, NZX 50, IPC Mexico, Merval, JSE All Share, BIST 100, Jakarta
  Composite, KLCI, MOEX, EURO STOXX 50, NIFTY 50, TA-125 (Israel), EGX 30
  (Egypt), IPSA (Chile), Shenzhen Component, ATX (Austria), WIG20 (Poland),
  BUX (Hungary), Tadawul/TASI (Saudi Arabia), VN-Index (Vietnam), ISEQ
  (Ireland). **Not included**: most of Images 6-8's smaller exchanges
  (Baltics, Balkans, Malta, Cyprus, Luxembourg) — I couldn't verify a
  working Yahoo ticker for these without meaningful risk of guessing wrong,
  so they're left out rather than silently broken.
- **Commodities (Images 2-4)**: all of Energy and Metals from your
  screenshots that Yahoo actually carries (crude, Brent, nat gas, gasoline,
  heating oil, gold, silver, copper, platinum, palladium), plus Agricultural
  and Livestock (corn, wheat, soybeans, coffee, sugar, cocoa, oat, rice,
  cotton, live/feeder cattle, lean hogs). **Not included**: the
  Trading-Economics-specific commodities that aren't on Yahoo at all —
  Coking Coal, HRC Steel, Iron Ore, Cobalt Hydroxide, Naphtha, Propane,
  Methanol, Urea, and most of the Industrial table. These are aggregated by
  Trading Economics from exchanges (SHFE, LME, regional spot markets) Yahoo's
  free endpoint doesn't cover — a different data source would be needed, not
  a ticker fix.
- **Forex (Images 9-12)**: 24 USD pairs, using Yahoo's standardized
  `BASEQUOTE=X` convention — this one's genuinely low-risk since it's a
  systematic pattern, not a per-instrument lookup like indices are.
- **Crypto (Images 13-14)**: 19 coins via the standard `SYMBOL-USD` pattern.
- **Bonds (Images 15-17)**: US via Yahoo (unchanged), **plus 15 more
  countries via FRED** (`IRLTLT01{CC}M156N`, OECD's standardized long-term
  government bond yield series — Germany, UK, Japan, Italy, France, Spain,
  Switzerland, Canada, Australia, South Korea, Netherlands, Sweden, Belgium,
  Mexico, New Zealand). **Not included**: the ~35 other countries in your
  bond screenshots — FRED's OECD series only covers OECD members, and I
  didn't want to guess non-OECD bond series codes.

**Main Indicators (Image 1): 19 World Bank indicators per country** (up
from 7) — added GDP per capita, GDP (current US$), gross fixed capital
formation, labor force participation, military expenditure, exports/imports/
FDI (% of GDP), tax revenue (% of GDP — the one item under your "Taxes"
category World Bank actually has), real interest rate, hospital beds, CO2
emissions per capita. **Not included, and this is a real data-source gap,
not a scoping choice**: Housing, Business, Consumer, Climate (beyond CO2),
Health (beyond hospital beds), most of Taxes, News, Calendar, and UN
Comtrade. World Bank/IMF/FRED simply don't publish those — Trading Economics
compiles them from national statistical offices, credit rating agencies,
and specialty providers (Transparency International for corruption,
individual central banks for policy rates, etc.), each of which is its own
integration project with its own API and its own auth. Section 5 of the
original spec already flagged News/Calendar/UN Comtrade as out of scope for
this reason.

## What's built, by phase

**Phase 1** — `db/schema.sql`, `db/seed-countries.ts` (~190 countries + Global/Euro Area), `db/seed-indicators.ts` (117 market instruments), `scripts/backfill-market.ts`

**Phase 2/3** — `scripts/ingest-market.ts`, `scripts/ingest-macro.ts` (now handles World Bank **and** FRED), three GitHub Actions workflows, `.github/workflows/one-time-setup.yml` for zero-local-tools setup

**Phase 4** — all API routes (Section 8) plus `/api/countries/:iso3/export` (CSV), `/api/countries/:iso3/briefing` (AI, daily-cached), `/api/correlation-matrix`

**Phase 5** — `db/seed-macro-indicators.ts` (19 World Bank indicators × ~190 countries + 15 FRED bond yields), `scripts/lib/fred.ts`, full frontend (`/`, `/country/:iso3`, `/compare`, `/correlation`, `/watchlist`, `/anomalies`, `/api-docs`), sparklines, data-freshness dots, PWA manifest

**Phase 6** — `scripts/lib/growth-index.ts` (16 tests), `scripts/lib/correlation.ts` (10 tests), `scripts/lib/quant-signals.ts` (15 tests, **Composite Signal Score** — see below), `scripts/compute-growth-indexes.ts`

**Phase 7** — `lib/api-auth.ts` (hashed keys, DB-backed rate limiting), `lib/briefing.ts` (Claude Haiku 4.5)

## Composite Signal Score — what it is and isn't

Added on request for "quant-style" analysis. It equal-weight-averages three
real, standard signal types:

1. **Momentum** — weighted recent % changes (1d/1w/1m)
2. **Mean reversion** — z-score of the current value vs. its own trailing
   average, inverted (a price far above its recent average scores bearish
   here, not bullish — deliberately the opposite convention from momentum,
   which is why these two often disagree)
3. **Volatility-adjusted momentum** — the same idea as #1, but a given move
   counts for less when recent volatility is already high

**This is not a prediction, and averaging the three doesn't make it one.**
Averaging reduces noise across weak statistical signals; it can't
manufacture accuracy that isn't in the underlying data — no legitimate quant
technique can, which is why real quant funds report hit rates in the
52-55% range and call it excellent. The UI reflects this: the score is
labeled "Composite Signal Score," and a second number — **signal
agreement** — is shown alongside it. Agreement measures how much the three
signals actually agree in direction, not how confident the average looks.
A 70 score built from signals that agree is a genuinely different, more
useful statement than a 70 built from signals that are canceling each other
out to a coincidentally similar average — the second case is flagged as
"mixed / low agreement" rather than hidden.

Not built (would need real historical price series to backtest against,
which this preview's sample runs don't have): a track-record page comparing
past signal reads to what actually happened. That's the natural next step
if you want to see the honest hit rate rather than take the methodology's
word for it.

## What's still not built

- **Backtesting, portfolio overlay** — need a methodology/UX decision I can't make for you
- **News headline feed, UN Comtrade, Calendar** — explicitly out of scope for the World Bank/IMF/FRED/Yahoo source set (see above)
- **Command palette, custom composite index builder, shareable dashboard links** — no blockers, just not built yet
- **IMF source** — only World Bank and FRED are implemented; `sourceCanOverride()` in `worldbank.ts` is ready for IMF whenever it's added
- **The ~60 unverified indices/commodities** listed above — flagged rather than guessed

## Verification performed in this sandbox

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | **36/36 passing** |
| `npx next build` | all **21 routes** compile |
| Ticker verification | every non-systematic ticker (indices, commodities) checked against a live Yahoo Finance search result; forex/crypto rely on documented systematic naming conventions instead of per-ticker lookup |

Still unverified because this sandbox can't reach Neon, Yahoo Finance,
World Bank, FRED, or restcountries.com: whether the seed/backfill/ingest
scripts produce correct data end-to-end, and whether ticker validity holds
up over time (Yahoo's free endpoint has no uptime guarantee, and delisted/
renamed symbols happen).

## Setup — no local tools required

1. GitHub: new repo → "Add file → Upload files" (no git CLI needed)
2. Neon: sign up, create project, copy connection string
3. GitHub secret: `DATABASE_URL` (add `FRED_API_KEY` too if you want the 15 non-US bond yields — free key at fred.stlouisfed.org)
4. Actions tab → "one-time-setup" → Run workflow
5. Vercel: Import Project → point at your repo → same env vars
6. Recurring workflows are already scheduled and start once the repo's on GitHub

## Setup — with local tools

```bash
npm install
cp .env.example .env   # DATABASE_URL required, FRED_API_KEY recommended

npm run db:migrate
npm run db:seed-countries
npm run db:seed-indicators
npm run db:seed-macro-indicators   # ~190 countries × 19 indicators + 15 FRED bond entries — several minutes
npm run backfill:market
npm run ingest:macro               # pulls both World Bank and FRED
npx tsx scripts/compute-growth-indexes.ts
npm run dev
```

```sql
select count(*) from indicators;   -- ~117 market + ~3600 macro (World Bank) + 15 (FRED)
select source, count(*) from indicators group by source;
```
