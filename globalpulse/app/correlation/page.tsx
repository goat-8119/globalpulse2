"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MatrixResponse = { labels: string[]; matrix: (number | null)[][]; days: number };

function cellColor(v: number | null): string {
  if (v === null) return "var(--bg-panel)";
  if (v >= 0) return `rgba(52, 211, 153, ${Math.abs(v) * 0.8})`; // signal-up
  return `rgba(251, 124, 108, ${Math.abs(v) * 0.8})`; // signal-down
}

export default function CorrelationPage() {
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/correlation-matrix")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(async (r) => setError((await r.json?.())?.error ?? "Failed to load"));
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 96px" }}>
      <Link href="/" className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", textDecoration: "none" }}>
        ← ALL COUNTRIES
      </Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 8px" }}>Correlation Matrix</h1>
      <p style={{ color: "var(--ink-muted)", marginTop: 0, marginBottom: 28, maxWidth: 600 }}>
        Pearson correlation of daily returns across each country&apos;s headline market index, trailing{" "}
        {data ? data.days : "…"} trading days. Teal = move together, coral = move opposite.
      </p>

      {error && <p style={{ color: "var(--signal-down, #fb7c6c)" }}>{error}</p>}
      {!data && !error && <p className="mono" style={{ color: "var(--ink-muted)", fontSize: 13 }}>loading…</p>}

      {data && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ width: 50 }}></th>
                {data.labels.map((l) => (
                  <th key={l} className="mono" style={{ fontSize: 11, padding: 6, color: "var(--ink-muted)" }}>
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.labels.map((rowLabel, i) => (
                <tr key={rowLabel}>
                  <td className="mono" style={{ fontSize: 11, padding: 6, color: "var(--ink-muted)" }}>{rowLabel}</td>
                  {data.matrix[i]!.map((v, j) => (
                    <td
                      key={j}
                      className="mono"
                      title={v === null ? "n/a" : v.toFixed(2)}
                      style={{ width: 56, height: 40, textAlign: "center", fontSize: 11, background: cellColor(v), border: "1px solid var(--bg-void)" }}
                    >
                      {v === null ? "—" : v.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
