"use client";

import { useEffect, useState } from "react";

type BriefingState = { status: "loading" } | { status: "ready"; text: string } | { status: "unavailable" };

export function BriefingPanel({ iso3 }: { iso3: string }) {
  const [state, setState] = useState<BriefingState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/countries/${iso3}/briefing`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setState({ status: "ready", text: data.briefing });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [iso3]);

  if (state.status === "unavailable") return null;

  return (
    <section
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        padding: "16px 20px",
        marginBottom: 32,
      }}
    >
      <div style={{ fontSize: 10, color: "var(--ink-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        AI Briefing
      </div>
      {state.status === "loading" ? (
        <div className="mono" style={{ fontSize: 13, color: "var(--ink-muted)" }}>
          generating…
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{state.text}</p>
      )}
    </section>
  );
}
