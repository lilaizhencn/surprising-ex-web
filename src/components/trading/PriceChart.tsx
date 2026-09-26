import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  TickMarkType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import { useEffect, useRef, useState } from "react"
import { t } from "../../i18n"
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

const periodMs: Record<string, number> = {
  "1m": 60_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

export function prepareChartCandles(
  candles: readonly Candle[],
  period?: string,
  now = Date.now(),
): Candle[] {
  const bySecond = new Map<number, Candle>()
  for (const candle of [...candles].sort(
    (left, right) => Date.parse(left.time) - Date.parse(right.time),
  )) {
    const timestamp = Date.parse(candle.time)
    if (
      !Number.isFinite(timestamp) ||
      ![candle.open, candle.high, candle.low, candle.close].every(
        (price) => Number.isFinite(price) && price > 0,
      ) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > Math.min(candle.open, candle.close)
    )
      continue
    bySecond.set(Math.floor(timestamp / 1000), candle)
  }
  const source = [...bySecond.values()]
  const interval = period ? periodMs[period] : undefined
  if (!interval || source.length === 0) return source.slice(-120)
  const result: Candle[] = []
  for (const candle of source) {
    const previous = result.at(-1)
    if (previous) {
      const previousTime = Date.parse(previous.time)
      const nextTime = Date.parse(candle.time)
      for (
        let time = Math.max(previousTime + interval, nextTime - 120 * interval);
        time < nextTime;
        time += interval
      ) {
        result.push({
          time: new Date(time).toISOString(),
          open: previous.close,
          high: previous.close,
          low: previous.close,
          close: previous.close,
          volume: 0,
        })
      }
    }
    result.push(candle)
  }
  const latest = result.at(-1)
  if (latest) {
    const nextBucket = Math.floor(now / interval) * interval
    for (
      let time = Math.max(Date.parse(latest.time) + interval, nextBucket - 119 * interval);
      time <= nextBucket;
      time += interval
    ) {
      result.push({
        time: new Date(time).toISOString(),
        open: latest.close,
        high: latest.close,
        low: latest.close,
        close: latest.close,
        volume: 0,
      })
    }
  }
  return result.slice(-120)
}

export function PriceChart({
  candles,
  period,
  dollar,
  volumeUnit,
  demo,
  unavailable,
}: {
  readonly candles: readonly Candle[]
  readonly period: string
  readonly dollar: boolean
  readonly volumeUnit: string
  readonly demo: boolean
  readonly unavailable: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const lastPeriod = useRef<string | null>(null)
  const lastBar = useRef<{ first: number; last: number; count: number } | null>(null)
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  const valid = prepareChartCandles(candles, period, now)
  const latest = valid.at(-1)
  const hovered = valid.find((bar) => Math.floor(Date.parse(bar.time) / 1000) === hoveredTime)
  const displayed = hovered ?? latest
  const formatPrice = (price: number) => (dollar ? dollarPrice : otherPrice).format(price)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const colors = () => {
      const style = getComputedStyle(element)
      const read = (name: string) => style.getPropertyValue(name).trim()
      return {
        surface: read("--color-surface"),
        ink: read("--color-ink-muted"),
        grid: read("--color-border-soft"),
        border: read("--color-border"),
        up: read("--color-positive"),
        down: read("--color-negative"),
      }
    }
    const initial = colors()
    const chart = createChart(element, {
      width: element.clientWidth,
      height: element.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: initial.surface },
        textColor: initial.ink,
        attributionLogo: true,
        panes: {
          enableResize: false,
          separatorColor: initial.border,
          separatorHoverColor: initial.border,
        },
      },
      grid: { vertLines: { color: initial.grid }, horzLines: { color: initial.grid } },
      rightPriceScale: { borderColor: initial.border },
      localization: {
        timeFormatter: (time: Time) =>
          typeof time === "number" ? candleTime.format(time * 1000) : String(time),
      },
      timeScale: {
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          if (typeof time !== "number") return null
          const date = new Date(time * 1000)
          if (type === TickMarkType.Year) return String(date.getFullYear())
          if (type === TickMarkType.Month)
            return date.toLocaleDateString(undefined, { month: "short" })
          if (type === TickMarkType.DayOfMonth)
            return date.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })
          return date.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        },
        borderColor: initial.border,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        shiftVisibleRangeOnNewBar: true,
      },
      crosshair: { vertLine: { color: initial.ink }, horzLine: { color: initial.ink } },
    })
    const price = chart.addSeries(CandlestickSeries, {
      upColor: initial.up,
      downColor: initial.down,
      borderVisible: false,
      wickUpColor: initial.up,
      wickDownColor: initial.down,
    })
    chart.addPane()
    const volume = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceScaleId: "right" },
      1,
    )
    chart.panes()[0]?.setStretchFactor(0.76)
    chart.panes()[1]?.setStretchFactor(0.24)
    price.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.08 } })
    volume.priceScale().applyOptions({
      visible: true,
      borderVisible: true,
      scaleMargins: { top: 0.22, bottom: 0.02 },
    })
    chart.subscribeCrosshairMove((event) => {
      setHoveredTime(typeof event.time === "number" ? event.time : null)
    })
    chartRef.current = chart
    candleRef.current = price
    volumeRef.current = volume
    const applyTheme = () => {
      const next = colors()
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: next.surface },
          textColor: next.ink,
          panes: { separatorColor: next.border, separatorHoverColor: next.border },
        },
        grid: { vertLines: { color: next.grid }, horzLines: { color: next.grid } },
        rightPriceScale: { borderColor: next.border },
        timeScale: { borderColor: next.border },
        crosshair: { vertLine: { color: next.ink }, horzLine: { color: next.ink } },
      })
      price.applyOptions({
        upColor: next.up,
        downColor: next.down,
        wickUpColor: next.up,
        wickDownColor: next.down,
      })
    }
    const themeObserver = new MutationObserver(applyTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })
    const resize = new ResizeObserver(() =>
      chart.applyOptions({ width: element.clientWidth, height: element.clientHeight }),
    )
    resize.observe(element)
    return () => {
      themeObserver.disconnect()
      resize.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
      lastPeriod.current = null
      lastBar.current = null
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
    const volumePrecision = Math.max(
      2,
      ...valid
        .filter((candle) => candle.volume > 0)
        .map((candle) => candle.volume.toFixed(8).replace(/0+$/, "").split(".")[1]?.length ?? 0),
    )
    volume.applyOptions({
      priceFormat: {
        type: "price",
        precision: volumePrecision,
        minMove: 10 ** -volumePrecision,
      },
    })
    const bars = valid.map((candle) => ({
      time: Math.floor(Date.parse(candle.time) / 1000) as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }))
    const volumes = valid.map((candle) => ({
      time: Math.floor(Date.parse(candle.time) / 1000) as UTCTimestamp,
      value: Math.max(candle.volume, 0),
      color: candle.close >= candle.open ? "#4bd5a080" : "#ed667680",
    }))
    const first = Number(bars[0]?.time)
    const last = Number(bars.at(-1)?.time)
    const previous = lastBar.current
    const reset =
      lastPeriod.current !== period ||
      !previous ||
      bars.length === 0 ||
      first !== previous.first ||
      last < previous.last ||
      bars.length < previous.count ||
      bars.length > previous.count + 1
    if (reset) {
      price.setData(bars)
      volume.setData(volumes)
    } else {
      const latestBar = bars.at(-1)
      const latestVolume = volumes.at(-1)
      if (latestBar && latestVolume) {
        price.update(latestBar)
        volume.update(latestVolume)
      }
    }
    if (bars.length > 0 && (lastPeriod.current !== period || !previous)) {
      chart.timeScale().applyOptions({ barSpacing: 8, rightOffset: 2 })
      chart.timeScale().scrollToPosition(2, false)
      lastPeriod.current = period
    }
    lastBar.current = bars.length > 0 ? { first, last, count: bars.length } : null
  }, [valid, dollar, period])

  return (
    <div className="price-chart">
      <div className="chart-info">
        <div className="chart-info-time">
          <strong>
            {period} {t("Candles")}
          </strong>
          <span>
            {displayed
              ? `${hovered ? t("Selected") : t("Latest")} ${candleTime.format(Date.parse(displayed.time))}`
              : t("Waiting for trades")}
          </span>
        </div>
        {displayed ? (
          <div className="chart-ohlc">
            <span>
              {" "}
              {t("Open")} <b>{formatPrice(displayed.open)}</b>
            </span>
            <span>
              {" "}
              {t("High")} <b>{formatPrice(displayed.high)}</b>
            </span>
            <span>
              {" "}
              {t("Low")} <b>{formatPrice(displayed.low)}</b>
            </span>
            <span>
              {" "}
              {t("Close")} <b>{formatPrice(displayed.close)}</b>
            </span>
            <span>
              {" "}
              {t("Volume")} <b>{otherPrice.format(displayed.volume)}</b>
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
      <div className="chart-volume-info" aria-live="polite">
        {" "}
        {t("Volume (")}
        {volumeUnit}
        {t(")")} <b>{displayed ? otherPrice.format(displayed.volume) : "—"}</b>
      </div>
      {(unavailable || (!demo && valid.length === 0)) && (
        <div className="chart-empty">{t("Waiting for live candles and volume")}</div>
      )}
      {demo ? <span className="chart-demo-label">{t("Demo chart")}</span> : null}
    </div>
  )
}
