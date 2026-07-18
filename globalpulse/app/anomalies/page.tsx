import Link from "next/link";
import { getSql } from "@/lib/db";
import { listAnomalies } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AnomaliesPage() {
  const anomalies = await listAnomalies(getSql(), 100);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 96px" }}>
      <Link href="/" className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", textDecoration: "none" }}>
        ← ALL COUNTRIES
      </Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 8px" }}>Anomaly Feed</h1>
      <p style={{ color: "var(--ink-muted)", marginTop: 0, marginBottom: 32 }}>
        Indicators whose most recent daily move sat more than 3 standard deviations outside their trailing 60-day
        history (Section 10D).
      </p>

      {anomalies.length === 0 ? (
        <p style={{ color: "var(--ink-muted)" }}>
          No anomalies flagged yet. This fills in once <code className="mono">compute-growth-indexes</code> has
          enough trailing history (60+ days) to judge against.
        </p>
      ) : (
        <div style={{ borderTop: "1px solid var(--rule)" }}>
          {anomalies.map((a, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: 16,
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <span style={{ fontSize: 18 }}>{a.flagEmoji}</span>
              <div>
                <div>{a.indicatorDisplayName}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                  {a.countryName} · {a.category}
                </div>
              </div>
              <span className={`mono ${a.pctChange1d && a.pctChange1d > 0 ? "up" : "down"}`}>
                {a.pctChange1d === null ? "—" : `${a.pctChange1d > 0 ? "+" : ""}${a.pctChange1d.toFixed(2)}%`}
              </span>
              <span className="mono amber" style={{ fontSize: 11 }}>
                {new Date(a.capturedAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
