import Link from "next/link";

export const metadata = { title: "GlobalPulse — API Docs" };

const ENDPOINTS = [
  { method: "GET", path: "/api/public/v1/countries", desc: "List all countries with latest momentum/macro-health scores." },
  { method: "GET", path: "/api/public/v1/countries/:iso3", desc: "Full dashboard payload for one country — every indicator, latest value, and growth indexes." },
  { method: "GET", path: "/api/public/v1/heatmap?metric=momentum", desc: "Choropleth-ready iso3+score pairs. metric: momentum, macro_health, or gdp_growth." },
];

export default function ApiDocsPage() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 96px" }}>
      <Link href="/" className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", textDecoration: "none" }}>
        ← ALL COUNTRIES
      </Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 8px" }}>Public API</h1>
      <p style={{ color: "var(--ink-muted)", marginTop: 0, marginBottom: 32 }}>
        Read-only, rate-limited, API-key-gated. Every route below is a pure database read — same guarantee as the
        rest of the app, this never calls Yahoo Finance or World Bank on your request.
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)", marginBottom: 12 }}>
          Authentication
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          Pass your key as <code className="mono">Authorization: Bearer &lt;key&gt;</code> or{" "}
          <code className="mono">x-api-key: &lt;key&gt;</code>. Keys are provisioned server-side (there's no
          self-serve signup yet in this preview) — see <code className="mono">api_keys</code> in the schema.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)", marginBottom: 12 }}>
          Rate limits
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          Each key has a per-minute limit (default 60). Exceeding it returns <code className="mono">429</code> with
          a <code className="mono">Retry-After</code> header.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)", marginBottom: 12 }}>
          Endpoints
        </h2>
        <div style={{ borderTop: "1px solid var(--rule)" }}>
          {ENDPOINTS.map((e) => (
            <div key={e.path} style={{ padding: "14px 0", borderBottom: "1px solid var(--rule)" }}>
              <div className="mono" style={{ fontSize: 13, marginBottom: 4 }}>
                <span className="up" style={{ marginRight: 8 }}>
                  {e.method}
                </span>
                {e.path}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>{e.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
