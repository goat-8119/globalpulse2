"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CountryOption = { iso3: string; name: string; flagEmoji: string | null };
type IndicatorOption = { id: number; displayName: string; category: string };
type Watchlist = { id: number; name: string; indicator_ids: number[] };

export default function WatchlistPage() {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [activeIso3, setActiveIso3] = useState("USA");
  const [indicators, setIndicators] = useState<IndicatorOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/countries").then((r) => r.json()).then((d) => setCountries(d.countries));
    refreshWatchlists();
  }, []);

  useEffect(() => {
    fetch(`/api/countries/${activeIso3}`)
      .then((r) => r.json())
      .then((d) => setIndicators((d.indicators ?? []).map((i: { id: number; displayName: string; category: string }) => ({ id: i.id, displayName: i.displayName, category: i.category }))));
  }, [activeIso3]);

  function refreshWatchlists() {
    fetch("/api/watchlists").then((r) => r.json()).then((d) => setWatchlists(d.watchlists ?? []));
  }

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save() {
    if (!name.trim() || selectedIds.size === 0) return;
    setSaving(true);
    try {
      await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), indicatorIds: Array.from(selectedIds) }),
      });
      setName("");
      setSelectedIds(new Set());
      refreshWatchlists();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 96px" }}>
      <Link href="/" className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", textDecoration: "none" }}>
        ← ALL COUNTRIES
      </Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 24px" }}>Watchlists</h1>

      {watchlists.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <div className="label" style={{ fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase", marginBottom: 12 }}>
            Saved
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {watchlists.map((w) => (
              <div key={w.id} style={{ background: "var(--bg-panel)", border: "1px solid var(--rule)", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
                {w.name} <span className="mono" style={{ color: "var(--ink-muted)", fontSize: 12 }}>· {w.indicator_ids.length} indicators</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div style={{ fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase", marginBottom: 12 }}>Build a new watchlist</div>

        <select
          value={activeIso3}
          onChange={(e) => setActiveIso3(e.target.value)}
          style={{ background: "var(--bg-panel)", color: "var(--ink)", border: "1px solid var(--rule)", borderRadius: 6, padding: "8px 10px", fontSize: 13, marginBottom: 16 }}
        >
          {countries.map((c) => (
            <option key={c.iso3} value={c.iso3}>
              {c.flagEmoji} {c.name}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
          {indicators.map((ind) => (
            <label key={ind.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
              <input type="checkbox" checked={selectedIds.has(ind.id)} onChange={() => toggle(ind.id)} />
              {ind.displayName}
              <span className="mono" style={{ color: "var(--ink-muted)", fontSize: 11 }}>{ind.category}</span>
            </label>
          ))}
          {indicators.length === 0 && <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>No indicators for this country yet.</p>}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Watchlist name"
            style={{ background: "var(--bg-panel)", color: "var(--ink)", border: "1px solid var(--rule)", borderRadius: 6, padding: "8px 10px", fontSize: 13, flex: 1 }}
          />
          <button
            onClick={save}
            disabled={saving || !name.trim() || selectedIds.size === 0}
            style={{
              background: "var(--accent-pulse)", color: "var(--bg-void)", border: "none", borderRadius: 6,
              padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : `Save (${selectedIds.size})`}
          </button>
        </div>
      </section>
    </main>
  );
}
