export function Sparkline({ values, width = 60, height = 20 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span style={{ display: "inline-block", width, height }} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(" ");
  const trendUp = values[values.length - 1]! >= values[0]!;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polyline points={points} fill="none" stroke={trendUp ? "var(--signal-up)" : "var(--signal-down)"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
