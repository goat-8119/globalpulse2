"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CountryOption = { iso3: string; name: string; flagEmoji: string | null };
type CompareIndicator = { category: string; canonicalKey: string; displayName: string; unit: string | null; value: number | null; pctChange1d: number | null; pctChangeYtd: number | null; pctChange1y: number | null };
type CompareCountry = { iso3: string; name: string; flagEmoji: string | null; indicators: CompareIndicator[]; growthIndexes: Record<string, { score: number; confidence: number | null }> };

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function pctClass(v: number | null): string {
  if (v === null) return "";
  return v > 0 ? "up" : v < 0 ? "down" : "";
}

export default function ComparePage() {
  const [allCountries, setAllCountries] = useState<CountryOption[]>([]);
  const [selected, setSelected] = useState<string[]>(["USA", "DEU", "JPN"]);
  const [data, setData] = useState<CompareCountry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/countries")
      .then((r) => r.json())
      .then((d) => setAllCountries(d.countries));
  }, []);

  useEffect(() => {
    if (selected.length === 0) {
      setData([]);
      return;
    }
    setLoading(true);
    fetch(`/api/compare?countries=${selected.join(",")}`)
      .then((r) => r.json())
      .then((d) => setData(d.countries ?? []))
      .finally(() => setLoading(false));
  }, [selected]);

  function toggle(iso3: string) {
    setSelected((prev) => (prev.includes(iso3) ? prev.filter((c) => c !== iso3) : prev.length < 5 ? [...prev, iso3] : prev));
  }

  // Union of canonical_key rows present across the selected countries, so the
  // table has one row per indicator with each country's value in its column.
  const rowKeys = Array.from(new Set(data.flatMap((c) => c.indicators.map((i) => i.canonicalKey))));
  const rowMeta = new Map(data.flatMap((c) => c.indicators.map((i) => [i.canonicalKey, { displayName: i.displayName, category: i.category }] as const)));

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 96px" }}>
      <Link href="/" className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", textDecoration: "none" }}>
        ← ALL COUNTRIES
      </Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 8px" }}>Compare</h1>
      <p style={{ color: "var(--ink-muted)", marginTop: 0, marginBottom: 20 }}>Pick up to 5 countries to compare side by side.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}>
        {allCountries.map((c) => (
          <button
            key={c.iso3}
            onClick={() => toggle(c.iso3)}
            style={{
              fontSize: 12,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--rule)",
              background: selected.includes(c.iso3) ? "var(--bg-panel-raised, #181d26)" : "transparent",
              color: selected.includes(c.iso3) ? "var(--accent-pulse)" : "var(--ink-muted)",
              cursor: "pointer",
            }}
          >
            {c.flagEmoji} {c.iso3}
          </button>
        ))}
      </div>

      {loading && <p className="mono" style={{ color: "var(--ink-muted)", fontSize: 13 }}>loading…</p>}

      {!loading && data.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 500 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px 8px 0", borderBottom: "1px solid var(--rule)", fontSize: 11, color: "var(--ink-muted)", textTransform: "uppercase" }}>
                  Indicator
                </th>
                {data.map((c) => (
                  <th key={c.iso3} className="mono" style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid var(--rule)", fontSize: 12 }}>
                    {c.flagEmoji} {c.iso3}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "8px 12px 8px 0", borderBottom: "1px solid var(--rule)", color: "var(--ink-muted)", fontSize: 13 }}>Market Momentum</td>
                {data.map((c) => (
                  <td key={c.iso3} className="mono" style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid var(--rule)" }}>
                    {c.growthIndexes.market_momentum ? c.growthIndexes.market_momentum.score.toFixed(0) : "—"}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ padding: "8px 12px 8px 0", borderBottom: "1px solid var(--rule)", color: "var(--ink-muted)", fontSize: 13 }}>Macro Health</td>
                {data.map((c) => (
                  <td key={c.iso3} className="mono" style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid var(--rule)" }}>
                    {c.growthIndexes.macro_health ? c.growthIndexes.macro_health.score.toFixed(0) : "—"}
                  </td>
                ))}
              </tr>
              {rowKeys.map((key) => (
                <tr key={key}>
                  <td style={{ padding: "8px 12px 8px 0", borderBottom: "1px solid var(--rule)", fontSize: 13 }}>{rowMeta.get(key)?.displayName ?? key}</td>
                  {data.map((c) => {
                    const ind = c.indicators.find((i) => i.canonicalKey === key);
                    return (
                      <td key={c.iso3} className={`mono ${pctClass(ind?.pctChange1d ?? null)}`} style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid var(--rule)" }}>
                        {ind?.value != null ? ind.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                        {ind?.pctChange1d != null && <span style={{ marginLeft: 6, fontSize: 11 }}>{fmtPct(ind.pctChange1d)}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && selected.length > 0 && data.length === 0 && (
        <p style={{ color: "var(--ink-muted)" }}>No data for the selected countries yet.</p>
      )}
    </main>
  );
}
