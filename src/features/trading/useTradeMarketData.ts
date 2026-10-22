import { useCallback, useEffect, useRef, useState } from "react"
import { loadCandles, loadFundingRate, loadRecentTrades } from "../../api/endpoints"
import { mapCandle } from "../../api/mappers"
import {
  type ApiFundingRate,
  type ApiOrderBook,
  CandleSchema,
  FundingRateSchema,
  OrderBookSchema,
} from "../../api/types"
import { t } from "../../i18n"
import type { WsEnvelope } from "../../realtime"
import { type Candle, type Market, PRODUCT_LINES, type ProductLine } from "../../types/domain"
import {
  marketPriceFromRecord,
  mergeCandleSnapshot,
  normalizeOrderBook,
  normalizeTrade,
} from "./marketData"
import { mergeRecentTrades } from "./recentTrades"

/** One instrument's market history and realtime aggregates, with bounded retained data. */
export function useTradeMarketData(
  current: Market | null,
  markets: readonly Market[],
  productLine: ProductLine,
  period: string,
  assetScales: Readonly<Record<string, string>>,
  events: readonly WsEnvelope[],
  onError: (message: string) => void,
) {
  const [candles, setCandles] = useState<readonly Candle[]>([])
  const [recentTrades, setRecentTrades] = useState<readonly Record<string, unknown>[]>([])
  const [book, setBook] = useState<ApiOrderBook | null>(null)
  const [marketQuotes, setMarketQuotes] = useState<Readonly<Record<string, number>>>({})
  const [funding, setFunding] = useState<ApiFundingRate | null>(null)
  const [markPrice, setMarkPrice] = useState<Record<string, unknown> | null>(null)
  const [indexPrice, setIndexPrice] = useState<Record<string, unknown> | null>(null)
  const [feedErrors, setFeedErrors] = useState<Readonly<Record<string, string>>>({})
  const latestTradeInstrumentRef = useRef<string | null>(null)
  const marketGeneration = useRef(0)
  const fundingEventVersion = useRef(0)
  const processedEvents = useRef(new Set<string>())
  const fundingProduct =
    productLine === PRODUCT_LINES.usdMPerpetual || productLine === PRODUCT_LINES.coinMPerpetual
  useEffect(() => {
    setBook(null)
    processedEvents.current.clear()
  }, [current?.instrumentId, productLine])
  useEffect(() => {
    setMarketQuotes({})
    setFeedErrors({})
  }, [productLine])
  useEffect(() => {
    const catalog = new Set(markets.map((market) => market.instrumentId))
    const feeds = markets.map((market) => `${productLine}:${market.instrumentId}:`)
    setFeedErrors((previous) => {
      const retained = Object.entries(previous).filter(([key]) =>
        feeds.some((prefix) => key.startsWith(prefix)),
      )
      return retained.length === Object.keys(previous).length
        ? previous
        : Object.fromEntries(retained)
    })
    setMarketQuotes((previous) => {
      const retained = Object.entries(previous).filter(([instrumentId]) =>
        catalog.has(instrumentId),
      )
      return retained.length === Object.keys(previous).length
        ? previous
        : Object.fromEntries(retained)
    })
  }, [markets, productLine])
  const updateMarketQuote = useCallback((instrumentId: string, price: number | null) => {
    if (price === null || !Number.isFinite(price) || price <= 0) return
    setMarketQuotes((previous) =>
      previous[instrumentId] === price ? previous : { ...previous, [instrumentId]: price },
    )
  }, [])
  useEffect(() => {
    setCandles([])
    if (!current) return
    const generation = ++marketGeneration.current
    const controller = new AbortController()
    void loadCandles(current.instrumentId, period, productLine, controller.signal)
      .then((rows) => {
        if (generation !== marketGeneration.current) return
        const history = rows.map(mapCandle)
        const latestCandle = history.at(-1)
        if (latestCandle && latestTradeInstrumentRef.current !== current.instrumentId)
          updateMarketQuote(current.instrumentId, latestCandle.close)
        setCandles((live) => {
          const byTime = new Map(history.map((candle) => [candle.time, candle]))
          for (const candle of live) {
            const snapshot = byTime.get(candle.time)
            byTime.set(candle.time, snapshot ? mergeCandleSnapshot(snapshot, candle) : candle)
          }
          return [...byTime.values()]
            .sort((left, right) => left.time.localeCompare(right.time))
            .slice(-120)
        })
      })
      .catch(() => {
        if (generation === marketGeneration.current) onError(t("Candlestick history unavailable"))
      })
    return () => {
      controller.abort()
      marketGeneration.current++
    }
  }, [current?.instrumentId, period, updateMarketQuote, productLine])

  useEffect(() => {
    setRecentTrades([])
    latestTradeInstrumentRef.current = null
    if (!current?.instrumentId || !assetScales[current.quoteAsset]) return
    const controller = new AbortController()
    void loadRecentTrades(current.instrumentId, productLine, 50, controller.signal)
      .then((history) => {
        if (controller.signal.aborted) return
        if (latestTradeInstrumentRef.current !== current.instrumentId) {
          updateMarketQuote(
            current.instrumentId,
            marketPriceFromRecord(history[0] ?? {}, current, assetScales),
          )
        }
        setRecentTrades((live) => mergeRecentTrades(history, live))
      })
      .catch(() => {
        if (!controller.signal.aborted) onError(t("Market data unavailable"))
      })
    return () => {
      controller.abort()
    }
  }, [current?.instrumentId, assetScales, updateMarketQuote, productLine])

  useEffect(() => {
    if (!current || !fundingProduct) {
      setFunding(null)
      return
    }
    const controller = new AbortController()
    const fundingVersion = fundingEventVersion.current
    setFunding(null)
    void loadFundingRate(current.instrumentId, productLine, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && fundingEventVersion.current === fundingVersion)
          setFunding(value)
      })
      .catch(() => {
        if (!controller.signal.aborted && fundingEventVersion.current === fundingVersion)
          setFunding(null)
      })
    return () => {
      controller.abort()
    }
  }, [current?.instrumentId, productLine, fundingProduct])

  useEffect(() => {
    setMarkPrice(null)
    setIndexPrice(null)
  }, [current?.instrumentId, productLine])

  useEffect(() => {
    if (!current || !assetScales[current.quoteAsset]) return
    const applyEvent = (event: WsEnvelope) => {
      const channel = text(event, "channel")
      const data = record(event.data)
      if (
        event.op !== "event" ||
        event.productLine !== productLine ||
        !event.id ||
        processedEvents.current.has(event.id)
      )
        return
      processedEvents.current.add(event.id)
      const eventSymbol = text(event, "instrumentId")
      if (!data) return
      if (eventSymbol && eventSymbol !== current.instrumentId) {
        if (channel === "trades") {
          const market = markets.find((candidate) => candidate.instrumentId === eventSymbol)
          if (market) {
            const quote = marketPriceFromRecord(data, market, assetScales)
            if (quote === null) throw new Error("Invalid trade price")
            updateMarketQuote(eventSymbol, quote)
            return true
          }
        }
        return
      }
      if (channel === "candles") {
        const candle = CandleSchema.safeParse(data)
        if (!candle.success) return
        const candlePeriod = text(data, "period") || text(event, "period")
        if (candlePeriod && candlePeriod !== period) return
        const next = mapCandle(candle.data)
        if (latestTradeInstrumentRef.current !== current.instrumentId)
          updateMarketQuote(current.instrumentId, next.close)
        setCandles((rows) => {
          const live = rows.find((row) => row.time === next.time)
          const resolved = mergeCandleSnapshot(next, live)
          return [...rows.filter((row) => row.time !== next.time), resolved]
            .sort((left, right) => left.time.localeCompare(right.time))
            .slice(-120)
        })
        return true
      }
      if (channel === "depth") {
        const orderBook = OrderBookSchema.safeParse(data)
        if (orderBook.success) {
          setBook(normalizeOrderBook(orderBook.data, current, assetScales))
          return true
        }
        return
      }
      if (channel === "trades") {
        const nextTrade = normalizeTrade(data, current, assetScales)
        const quote = marketPriceFromRecord(nextTrade, current, assetScales)
        if (quote === null) throw new Error("Invalid trade price")
        setRecentTrades((previous) =>
          mergeRecentTrades(previous, [
            { ...nextTrade, eventTime: event.eventTime ?? new Date().toISOString() },
          ]),
        )
        updateMarketQuote(current.instrumentId, quote)
        latestTradeInstrumentRef.current = current.instrumentId
        return true
      }
      if (channel === "funding") {
        const rate = FundingRateSchema.safeParse(data)
        if (rate.success) {
          fundingEventVersion.current++
          setFunding(rate.data)
          return true
        }
        return
      }
      if (channel === "mark") {
        setMarkPrice(data)
        return true
      }
      if (channel === "index") {
        setIndexPrice(data)
        return true
      }
    }
    for (const event of [...events].reverse()) {
      const key = `${productLine}:${event.instrumentId ?? current.instrumentId}:${event.channel}`
      try {
        if (applyEvent(event))
          setFeedErrors((previous) => {
            if (!(key in previous)) return previous
            const next = { ...previous }
            delete next[key]
            return next
          })
      } catch {
        // Only a valid update of this same product/instrument/channel clears its fault.
        setFeedErrors((previous) =>
          previous[key] ? previous : { ...previous, [key]: t("Market data unavailable") },
        )
      }
    }
    // Retain only IDs still present in the bounded feed, not the session history.
    processedEvents.current = new Set(events.flatMap((event) => (event.id ? [event.id] : [])))
  }, [assetScales, current, markets, period, events, updateMarketQuote, productLine])

  const feedPrefix = `${productLine}:${current?.instrumentId}:`
  const marketDataError = Object.entries(feedErrors).find(([key]) =>
    key.startsWith(feedPrefix),
  )?.[1]
  return {
    candles,
    recentTrades,
    book,
    marketQuotes,
    funding,
    markPrice,
    indexPrice,
    marketDataError,
  }
}
function text(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
