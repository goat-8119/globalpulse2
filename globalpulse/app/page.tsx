import Link from "next/link";
import { getSql } from "@/lib/db";
import { listCountries } from "@/lib/queries";

export const dynamic = "force-dynamic";

function scoreColor(score: number | null): string {
  if (score === null) return "var(--ink-muted)";
  if (score >= 55) return "var(--signal-up)";
  if (score <= 45) return "var(--signal-down)";
  return "var(--ink-muted)";
}

export default async function LandingPage() {
  const sql = getSql();
  const countries = await listCountries(sql);
  const withData = countries.filter((c) => c.momentumScore !== null || c.macroHealthScore !== null);
  const ranked = [...withData].sort((a, b) => (b.momentumScore ?? -1) - (a.momentumScore ?? -1));

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 96px" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 28 }}>GlobalPulse</h1>
        <nav style={{ display: "flex", gap: 20, fontSize: 13 }}>
          <Link href="/compare" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>Compare</Link>
          <Link href="/correlation" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>Correlation</Link>
          <Link href="/watchlist" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>Watchlists</Link>
          <Link href="/anomalies" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>Anomalies</Link>
          <Link href="/api-docs" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>API</Link>
        </nav>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="pulse-dot" aria-hidden />
          LIVE — reads only, never fetches on request
        </span>
      </header>
      <p style={{ color: "var(--ink-muted)", marginTop: 0, marginBottom: 40, maxWidth: 640 }}>
        Market momentum and macro health, by country. Every figure below comes from Postgres —
        this page never calls Yahoo Finance or World Bank directly.
      </p>

      {ranked.length === 0 ? (
        <div style={{ border: "1px solid var(--rule)", borderRadius: 8, padding: 32, color: "var(--ink-muted)" }}>
          No growth-index data yet. Run <code className="mono">npm run db:seed-indicators</code>,{" "}
          <code className="mono">npm run backfill:market</code>, and{" "}
          <code className="mono">npx tsx scripts/compute-growth-indexes.ts</code> to populate this view.
        </div>
      ) : (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {ranked.map((c) => (
            <Link
              key={c.iso3}
              href={`/country/${c.iso3}`}
              style={{
                display: "block",
                textDecoration: "none",
                background: "var(--bg-panel)",
                border: "1px solid var(--rule)",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{c.flagEmoji}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                  {c.iso3}
                </span>
              </div>
              <div style={{ fontSize: 15, marginBottom: 12, fontWeight: 500 }}>{c.name}</div>
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--ink-muted)", marginBottom: 2 }}>MOMENTUM</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: scoreColor(c.momentumScore) }}>
                    {c.momentumScore === null ? "—" : c.momentumScore.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--ink-muted)", marginBottom: 2 }}>MACRO HEALTH</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: scoreColor(c.macroHealthScore) }}>
                    {c.macroHealthScore === null ? "—" : c.macroHealthScore.toFixed(0)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
