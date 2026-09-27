import { useEffect, useMemo, useRef, useState } from "react"
import { loadDayWindow } from "../../api/endpoints"
import { type ApiCandle, CandleSchema } from "../../api/types"
import type { RealtimeState } from "../../hooks/useRealtime"
import type { WsEnvelope } from "../../realtime"
import type { ProductLine } from "../../types/domain"

const DAY = 86_400_000

// The minute window is a display projection of server aggregates, never of chart bars.
// Absolute bucket replacements avoid double-counting volume on repeated WS updates.
export function mergeDayWindow(
  previous: readonly ApiCandle[],
  incoming: readonly ApiCandle[],
  now: number,
): readonly ApiCandle[] {
  const cutoff = Math.floor(now / 60_000) * 60_000 - DAY
  const buckets = new Map(previous.map((row) => [Date.parse(row.openTime), row]))
  for (const row of incoming) {
    const time = Date.parse(row.openTime)
    const old = buckets.get(time)
    const sequence = String(row["lastSequence"] ?? "")
    const oldSequence = String(old?.["lastSequence"] ?? "")
    if (
      old &&
      /^\d+$/.test(sequence) &&
      /^\d+$/.test(oldSequence) &&
      BigInt(sequence) < BigInt(oldSequence)
    )
      continue
    buckets.set(time, row)
  }
  return [...buckets.entries()]
    .filter(([time]) => time >= cutoff && time <= now)
    .sort(([left], [right]) => left - right)
    .map(([, row]) => row)
}

export function summarizeDayWindow(rows: readonly ApiCandle[], now: number) {
  const window = mergeDayWindow(rows, [], now)
  const first = window[0],
    last = window.at(-1)
  if (!first || !last) return null
  const open = Number(first.openPrice),
    close = Number(last.closePrice)
  return {
    open,
    close,
    high: Math.max(...window.map((row) => Number(row.highPrice))),
    low: Math.min(...window.map((row) => Number(row.lowPrice))),
    volume: window.reduce((sum, row) => sum + Number(row.baseVolume ?? 0), 0),
    quoteVolume: window.every((row) => row.quoteVolume !== undefined)
      ? window.reduce((sum, row) => sum + Number(row.quoteVolume), 0)
      : null,
    change: open > 0 ? ((close - open) / open) * 100 : null,
  }
}

export function useDayStats(
  symbol: string | undefined,
  productLine: ProductLine,
  events: readonly WsEnvelope[],
  connection: RealtimeState,
) {
  const key = `${productLine}:${symbol ?? ""}`
  const [window, setWindow] = useState<{ key: string; ready: boolean; rows: readonly ApiCandle[] }>(
    { key: "", ready: false, rows: [] },
  )
  const [now, setNow] = useState(Date.now)
  const [recovery, setRecovery] = useState(0)
  const latestMinute = useRef<WsEnvelope | undefined>(undefined)
  const wasLive = useRef(false)
  const needsRecovery = useRef(false)
  useEffect(() => {
    if (connection === "live") {
      if (needsRecovery.current) setRecovery((value) => value + 1)
      needsRecovery.current = false
      wasLive.current = true
    } else if (wasLive.current) needsRecovery.current = true
  }, [connection])
  useEffect(() => {
    let cancelled = false
    setWindow({ key, ready: false, rows: [] })
    if (symbol)
      void loadDayWindow(symbol, productLine)
        .then((history) => {
          if (cancelled) return
          setWindow((live) => ({
            key,
            ready: true,
            rows: mergeDayWindow(history, live.key === key ? live.rows : [], Date.now()),
          }))
        })
        .catch(() => {
          // Do not label a few live minutes as a complete day when initialization fails.
        })
    return () => {
      cancelled = true
    }
  }, [symbol, productLine, key, recovery])
  useEffect(() => {
    const updates = events.flatMap((event) => {
      if (
        event.op !== "event" ||
        event.productLine !== productLine ||
        event.symbol !== symbol ||
        event.channel !== "candles" ||
        event.period !== "1m"
      )
        return []
      if (latestMinute.current === event) return []
      latestMinute.current = event
      const parsed = CandleSchema.safeParse(event.data)
      return parsed.success ? [parsed.data] : []
    })
    if (updates.length === 0) return
    setWindow((previous) => ({
      key,
      ready: previous.key === key && previous.ready,
      rows: mergeDayWindow(previous.key === key ? previous.rows : [], updates, Date.now()),
    }))
  }, [events, symbol, productLine, key])
  useEffect(() => {
    // Expire old extremes even if the market has no new trades; no network polling.
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return useMemo(
    () => (window.key === key && window.ready ? summarizeDayWindow(window.rows, now) : null),
    [window, key, now],
  )
}
