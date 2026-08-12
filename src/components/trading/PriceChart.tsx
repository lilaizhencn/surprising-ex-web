import type { Candle } from "../../types/domain"

export function PriceChart({
  candles,
  demo,
  unavailable,
}: {
  readonly candles: readonly Candle[]
  readonly demo: boolean
  readonly unavailable: boolean
}) {
  if (unavailable)
    return (
      <div className="price-chart chart-unavailable" role="status" aria-live="polite">
        <span className="eyebrow">Chart unavailable</span>
        <strong>Waiting for backend candle data</strong>
        <span className="subtle">No valid candle response was returned for this market.</span>
      </div>
    )
  const values =
    candles.length > 1
      ? candles.map((candle) => candle.close)
      : [64230, 64410, 64100, 64800, 64650, 65200, 65010]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * 100},${100 - ((value - min) / range) * 78 - 9}`,
    )
    .join(" ")
  return (
    <div className="price-chart">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={demo ? "Demo price chart" : "Price chart"}
      >
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-primary)" stopOpacity=".25" />
            <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,100 ${points} 100,100`} fill="url(#chartFill)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {demo ? <span className="chart-demo-label">演示图表</span> : null}
    </div>
  )
}
