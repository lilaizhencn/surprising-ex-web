import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts"
import { useEffect, useRef } from "react"
import type { Candle } from "../../types/domain"

const dollarPrice = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const otherPrice = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 })
const candleTime = new Intl.DateTimeFormat(undefined, {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export function PriceChart({
  candles,
  period,
  dollar,
  demo,
  unavailable,
}: {
  readonly candles: readonly Candle[]
  readonly period: string
  readonly dollar: boolean
  readonly demo: boolean
  readonly unavailable: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const lastPeriod = useRef<string | null>(null)
  const valid = candles
    .filter(
      (candle) =>
        Number.isFinite(Date.parse(candle.time)) &&
        [candle.open, candle.high, candle.low, candle.close].every(
          (price) => Number.isFinite(price) && price > 0,
        ) &&
        candle.high >= Math.max(candle.open, candle.close) &&
        candle.low <= Math.min(candle.open, candle.close),
    )
    .sort((left, right) => left.time.localeCompare(right.time))
    .slice(-120)
  const latest = valid.at(-1)
  const formatPrice = (price: number) => (dollar ? dollarPrice : otherPrice).format(price)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const chart = createChart(element, {
      width: element.clientWidth,
      height: element.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#151719" },
        textColor: "#a8b0bf",
        attributionLogo: true,
      },
      grid: { vertLines: { color: "#252a32" }, horzLines: { color: "#252a32" } },
      rightPriceScale: { borderColor: "#343a44" },
      timeScale: { borderColor: "#343a44", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "#586174" }, horzLine: { color: "#586174" } },
    })
    const price = chart.addSeries(CandlestickSeries, {
      upColor: "#4bd5a0",
      downColor: "#ed6676",
      borderVisible: false,
      wickUpColor: "#4bd5a0",
      wickDownColor: "#ed6676",
    })
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.76, bottom: 0 } })
    price.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.29 } })
    chartRef.current = chart
    candleRef.current = price
    volumeRef.current = volume
    const resize = new ResizeObserver(() =>
      chart.applyOptions({ width: element.clientWidth, height: element.clientHeight }),
    )
    resize.observe(element)
    return () => {
      resize.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
      lastPeriod.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    const price = candleRef.current
    const volume = volumeRef.current
    if (!chart || !price || !volume) return
    price.applyOptions({
      priceFormat: {
        type: "price",
        precision: dollar ? 2 : 8,
        minMove: dollar ? 0.01 : 0.00000001,
      },
    })
    const bars = valid.map((candle) => ({
      time: Math.floor(Date.parse(candle.time) / 1000) as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }))
    price.setData(bars)
    volume.setData(
      valid.map((candle) => ({
        time: Math.floor(Date.parse(candle.time) / 1000) as UTCTimestamp,
        value: Math.max(candle.volume, 0),
        color: candle.close >= candle.open ? "#4bd5a080" : "#ed667680",
      })),
    )
    if (bars.length > 0 && lastPeriod.current !== period) {
      chart.timeScale().setVisibleLogicalRange({ from: bars.length - 120, to: bars.length + 2 })
      lastPeriod.current = period
    }
  }, [valid, dollar, period])

  return (
    <div className="price-chart">
      <div className="chart-info">
        <div className="chart-info-time">
          <strong>{period} K 线</strong>
          <span>{latest ? `最新 ${candleTime.format(Date.parse(latest.time))}` : "等待成交"}</span>
        </div>
        {latest ? (
          <div className="chart-ohlc">
            <span>
              开 <b>{formatPrice(latest.open)}</b>
            </span>
            <span>
              高 <b>{formatPrice(latest.high)}</b>
            </span>
            <span>
              低 <b>{formatPrice(latest.low)}</b>
            </span>
            <span>
              收 <b>{formatPrice(latest.close)}</b>
            </span>
            <span>
              量 <b>{otherPrice.format(latest.volume)}</b>
            </span>
          </div>
        ) : null}
      </div>
      <div
        ref={containerRef}
        className="chart-canvas"
        role="img"
        aria-label={`${period} candlestick and volume chart`}
      />
      {(unavailable || (!demo && valid.length === 0)) && (
        <div className="chart-empty">等待真实 K 线和成交量数据</div>
      )}
      {demo ? <span className="chart-demo-label">演示图表</span> : null}
    </div>
  )
}
