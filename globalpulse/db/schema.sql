-- GlobalPulse unified schema (spec v4, Section 5)
-- 'countries' includes two pseudo-rows so country_id is NEVER null elsewhere in the
-- schema: 'Global' (commodities, crypto, DXY) and 'Euro Area' (EU50, Euro-area yields,
-- Eurozone GDP/inflation). Postgres treats NULL as distinct from itself in UNIQUE
-- constraints, so a nullable country_id would quietly let duplicate global rows through.

CREATE TABLE IF NOT EXISTS countries (
  id SERIAL PRIMARY KEY,
  iso2 CHAR(2) UNIQUE,
  iso3 CHAR(3) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  flag_emoji TEXT,
  is_aggregate BOOLEAN DEFAULT FALSE
);

-- ONE table for every indicator, market or macro.
CREATE TABLE IF NOT EXISTS indicators (
  id SERIAL PRIMARY KEY,
  country_id INTEGER NOT NULL REFERENCES countries(id),
  category TEXT NOT NULL,       -- 'Markets','GDP','Labour','Prices','Money','Trade',
                                 -- 'Housing','Business','Energy','Taxes','Consumer',
                                 -- 'Climate','Health','Government'
  subcategory TEXT,             -- under 'Markets': 'Stock Market','Commodity','Currency',
                                 -- 'Crypto','Government Bond 10Y'
  canonical_key TEXT NOT NULL,  -- source-agnostic concept id — the duplicate guard
  display_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('yahoo','worldbank','imf','fred')),
  external_ref TEXT NOT NULL,   -- Yahoo symbol, or World Bank/IMF/FRED series code
  update_frequency TEXT NOT NULL CHECK (update_frequency IN ('realtime','daily','monthly','quarterly','annual')),
  unit TEXT,
  display_groups TEXT[],        -- e.g. {'Major','Europe'} or {'Main'}
  UNIQUE (country_id, canonical_key)
);

CREATE TABLE IF NOT EXISTS observations (
  id BIGSERIAL PRIMARY KEY,
  indicator_id INTEGER NOT NULL REFERENCES indicators(id),
  value NUMERIC NOT NULL,
  change NUMERIC,
  pct_change_1d NUMERIC,
  pct_change_1w NUMERIC,
  pct_change_1m NUMERIC,
  pct_change_ytd NUMERIC,
  pct_change_1y NUMERIC,
  is_outlier BOOLEAN DEFAULT FALSE,
  period_label TEXT,            -- e.g. '2025-Q2' for macro rows
  captured_at TIMESTAMPTZ NOT NULL,
  UNIQUE (indicator_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_observations_indicator_time ON observations (indicator_id, captured_at DESC);

CREATE OR REPLACE VIEW latest_observation AS
SELECT DISTINCT ON (indicator_id) *
FROM observations
ORDER BY indicator_id, captured_at DESC;

CREATE TABLE IF NOT EXISTS growth_indexes (
  id BIGSERIAL PRIMARY KEY,
  country_id INTEGER REFERENCES countries(id),
  index_type TEXT NOT NULL CHECK (index_type IN ('market_momentum','macro_health','trend_projection','composite_signal')),
  score NUMERIC NOT NULL,
  confidence NUMERIC,
  methodology_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS job_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','partial','failed')),
  records_written INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS watchlists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  indicator_ids INTEGER[]
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  indicator_id INTEGER REFERENCES indicators(id),
  direction TEXT CHECK (direction IN ('above','below')),
  threshold NUMERIC NOT NULL,
  triggered_at TIMESTAMPTZ,
  notified BOOLEAN DEFAULT FALSE
);

-- Section 8: public API auth. key_hash only — the raw key is never stored anywhere.
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  owner_label TEXT,
  rate_limit_per_min INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- Backs the fixed-window rate limiter. A DB-backed counter (rather than an
-- in-memory Map) is what makes rate limiting correct across the multiple,
-- independent serverless function instances Vercel may run concurrently.
CREATE TABLE IF NOT EXISTS api_request_log (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_request_log_key_time ON api_request_log (key_hash, requested_at DESC);

-- Section 10E: AI country briefings, cached daily so a country page load never
-- triggers a fresh model call — at most one generation per country per day.
CREATE TABLE IF NOT EXISTS country_briefings (
  id BIGSERIAL PRIMARY KEY,
  country_id INTEGER NOT NULL REFERENCES countries(id),
  briefing_date DATE NOT NULL,
  briefing_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_id, briefing_date)
);
