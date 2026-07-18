import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { getCountryDashboard, getJobFreshness } from "@/lib/queries";
import { BriefingPanel } from "./briefing-panel";
import { Sparkline } from "./sparkline";

export const dynamic = "force-dynamic";

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function pctClass(v: number | null): string {
  if (v === null) return "";
  return v > 0 ? "up" : v < 0 ? "down" : "";
}

const INDEX_LABELS: Record<string, string> = {
  market_momentum: "Market Momentum",
  macro_health: "Macro Health",
  trend_projection: "Trend Projection",
  composite_signal: "Composite Signal Score",
};

export default async function CountryPage({ params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params;
  const sql = getSql();
  const dashboard = await getCountryDashboard(sql, iso3);
  if (!dashboard) notFound();
  const freshness = await getJobFreshness(sql, "ingest-market");

  const { country, indicators, growthIndexes } = dashboard;
  const grouped = indicators.reduce<Record<string, typeof indicators>>((acc, ind) => {
    (acc[ind.category] ??= []).push(ind);
    return acc;
  }, {});

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px 96px" }}>
      <Link href="/" className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", textDecoration: "none" }}>
        ← ALL COUNTRIES
      </Link>

      <header style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 32px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 36 }}>{country.flagEmoji}</span>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 26 }}>{country.name}</h1>
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-muted)" }}>
            {country.iso3} {country.region ? `· ${country.region}` : ""}
          </span>
        </div>
        {freshness && (
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: freshness.minutesSince <= 45 ? "var(--signal-up)" : freshness.minutesSince <= 24 * 60 ? "var(--signal-amber)" : "var(--signal-down)",
              }}
            />
            data refreshed {freshness.minutesSince < 60 ? `${freshness.minutesSince}m` : `${Math.round(freshness.minutesSince / 60)}h`} ago
          </span>
        )}
        <a href={`/api/countries/${country.iso3}/export`} className="mono" style={{ fontSize: 11, color: "var(--accent-pulse)", textDecoration: "none" }}>
          ↓ CSV
        </a>
      </header>

      {Object.keys(growthIndexes).length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(growthIndexes).map(([type, idx]) => (
              <div key={type} style={{ background: "var(--bg-panel)", border: "1px solid var(--rule)", borderRadius: 8, padding: "16px 20px", minWidth: 160 }}>
                <div style={{ fontSize: 10, color: "var(--ink-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {INDEX_LABELS[type] ?? type}
                </div>
                <div className="mono" style={{ fontSize: 24, fontWeight: 600 }}>
                  {idx.score.toFixed(1)}
                </div>
                {idx.confidence !== null && (
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-muted)", marginTop: 4 }}>
                    {type === "composite_signal" ? "signal agreement" : "confidence"} {(idx.confidence * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            ))}
          </div>
          {growthIndexes.composite_signal && (
            <p className="mono" style={{ fontSize: 10, color: "var(--ink-muted)", marginTop: 8, maxWidth: 500, lineHeight: 1.5 }}>
              Composite Signal Score averages three standard quant signals (momentum, mean-reversion,
              volatility-adjusted momentum). It is not a prediction — low signal agreement means the underlying
              signals actually disagree with each other, not just that the average looks uncertain.
            </p>
          )}
        </section>
      )}

      <BriefingPanel iso3={country.iso3} />

      {indicators.length === 0 ? (
        <p style={{ color: "var(--ink-muted)" }}>No indicators seeded for this country yet.</p>
      ) : (
        Object.entries(grouped).map(([category, rows]) => (
          <section key={category} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)", marginBottom: 12 }}>
              {category}
            </h2>
            <div style={{ borderTop: "1px solid var(--rule)" }}>
              {rows.map((ind) => (
                <div
                  key={ind.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto auto",
                    gap: 16,
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <span>
                    {ind.displayName}
                    {ind.isOutlier && (
                      <span className="amber mono" style={{ fontSize: 10, marginLeft: 8 }}>
                        ● ANOMALY
                      </span>
                    )}
                  </span>
                  <Sparkline values={ind.sparkline} />
                  <span className="mono" style={{ textAlign: "right", minWidth: 90 }}>
                    {ind.value === null ? "—" : ind.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    {ind.unit && ind.unit !== "%" ? ` ${ind.unit}` : ""}
                  </span>
                  <span className={`mono ${pctClass(ind.pctChange1d)}`} style={{ textAlign: "right", minWidth: 70 }}>
                    {fmtPct(ind.pctChange1d)}
                  </span>
                  <span className={`mono ${pctClass(ind.pctChange1y)}`} style={{ textAlign: "right", minWidth: 70 }}>
                    {fmtPct(ind.pctChange1y)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
