import { useEffect, useMemo, useState } from "react"
import { loadMarkets, loadUsdValuation } from "../api/endpoints"
import { mapBalance, mapMarket } from "../api/mappers"
import { type ApiMarket, type AuthSession, BalanceSchema } from "../api/types"
import { t } from "../i18n"
import { decimalToStepUnits, signedUnitsToDecimal, stepUnitsToDecimal } from "../lib/units"
import {
  accountEquity,
  integer,
  type Row,
  record,
  type Subscription,
  type WsEnvelope,
} from "../realtime"
import type { Balance, Market, ProductLine } from "../types/domain"
import { useRealtimeFeed } from "./useRealtime"

const accountTypes: Record<ProductLine, string> = {
  SPOT: "SPOT",
  LINEAR_PERPETUAL: "USDT_PERPETUAL",
  INVERSE_PERPETUAL: "COIN_PERPETUAL",
  LINEAR_DELIVERY: "USDT_DELIVERY",
  INVERSE_DELIVERY: "COIN_DELIVERY",
  OPTION: "OPTION",
}

export function eventPrice(
  event: WsEnvelope | undefined,
  market: { priceTickUnits?: string | undefined; quoteAsset: string },
  scales: Readonly<Record<string, string>>,
): number | null {
  if (!event) return null
  const data = record(event.data)
  const scale = scales[market.quoteAsset]
  const tick = market.priceTickUnits
  const fromTicks = (value: unknown) => {
    if (!tick || !scale) return null
    try {
      return Number(stepUnitsToDecimal(integer(value).toString(), tick, scale))
    } catch {
      return null
    }
  }
  if (event.channel === "bookTicker") {
    const bid = fromTicks(record(data["bid"])["priceTicks"]),
      ask = fromTicks(record(data["ask"])["priceTicks"])
    return bid !== null && ask !== null ? (bid + ask) / 2 : (bid ?? ask)
  }
  if (event.channel === "mark" && data["markPriceUnits"] !== undefined && scale) {
    const price = Number(data["markPriceUnits"]) / Number(scale)
    return Number.isFinite(price) && price > 0 ? price : null
  }
  if (data["priceTicks"] !== undefined) return fromTicks(data["priceTicks"])
  const price = Number(data["price"])
  return Number.isFinite(price) && price > 0 ? price : null
}

/** A missing last trade may use a labelled mark quote, without inventing trade statistics. */
export function marketWithLiveQuote(
  market: Market,
  events: readonly WsEnvelope[],
  scales: Readonly<Record<string, string>>,
): Market {
  const matches = (event: WsEnvelope) =>
    event.productLine === market.productLine && event.instrumentId === market.instrumentId
  const trade = events.find((event) => matches(event) && event.channel === "trades")
  if (eventPrice(trade, market, scales) !== null)
    return { ...marketWithLivePrice(market, trade, scales), priceSource: "trade" }
  if (market.price !== null && market.price > 0) return market
  if (market.productLine === "SPOT") return market
  const mark = events.find((event) => matches(event) && event.channel === "mark")
  const status = record(mark?.data)["status"]
  if (status && !["HEALTHY", "DEGRADED", "CLAMPED"].includes(String(status))) return market
  const price = eventPrice(mark, market, scales)
  return price === null ? market : { ...market, price, priceSource: "mark" }
}

export function marketWithLivePrice(
  market: Market,
  event: WsEnvelope | undefined,
  scales: Readonly<Record<string, string>>,
): Market {
  const price = eventPrice(event, market, scales)
  if (price === null) return market
  const openingPrice =
    market.price !== null && market.change24h !== null && market.change24h > -100
      ? market.price / (1 + market.change24h / 100)
      : null
  return {
    ...market,
    price,
    change24h: openingPrice ? ((price - openingPrice) / openingPrice) * 100 : market.change24h,
    high24h: Math.max(market.high24h ?? price, price),
    low24h: Math.min(market.low24h ?? price, price),
  }
}

function markTicks(
  event: WsEnvelope | undefined,
  market: ApiMarket,
  scales: Readonly<Record<string, string>>,
): string | null {
  if (!event) return null
  const data = record(event.data)
  try {
    if (data["markPriceTicks"] !== undefined) return integer(data["markPriceTicks"]).toString()
    if (!market.priceTickUnits) return null
    if (data["markPriceUnits"] !== undefined)
      return (integer(data["markPriceUnits"]) / integer(market.priceTickUnits)).toString()
    const scale = scales[market.quoteAsset ?? ""]
    if (!scale || data["markPrice"] === undefined) return null
    return decimalToStepUnits(String(data["markPrice"]), market.priceTickUnits, scale)
  } catch {
    return null
  }
}

export function useRealtimeAssets(
  session: AuthSession | null,
  scales: Readonly<Record<string, string>>,
) {
  const [markets, setMarkets] = useState<readonly ApiMarket[]>([])
  const [fx, setFx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [held, setHeld] = useState<readonly Subscription[]>([])
  useEffect(() => {
    let closed = false
    void loadMarkets()
      .then((rows) => {
        if (!closed) setMarkets(rows)
      })
      .catch(() => {
        if (!closed) setError(t("Instruments unavailable"))
      })
    void loadUsdValuation("1", "USDT")
      .then((value) => {
        const rate = Number(value.convertedAmount)
        if (!closed) setFx(Number.isFinite(rate) && rate > 0 ? rate : null)
      })
      .catch(() => {
        if (!closed) setError(t("FX unavailable"))
      })
    return () => {
      closed = true
    }
  }, [])
  const mappedMarkets = useMemo(() => markets.map(mapMarket), [markets])
  const realtime = useRealtimeFeed(session, held)
  useEffect(() => {
    const next: Subscription[] = []
    const assets = new Set<string>()
    for (const product of realtime.products) {
      for (const b of realtime.views[product]?.rows("balance") ?? []) assets.add(String(b["asset"]))
      for (const p of realtime.views[product]?.rows("position") ?? []) {
        if (Number(p["signedQuantitySteps"]) !== 0) {
          assets.add(String(p["marginAsset"]))
          next.push({
            channel: "mark",
            productLine: product,
            instrumentId: String(p["instrumentId"]),
          })
        }
      }
    }
    for (const m of mappedMarkets)
      if (m.productLine === "SPOT" && m.quoteAsset === "USDT" && assets.has(m.baseAsset)) {
        next.push({ channel: "trades", productLine: "SPOT", instrumentId: m.instrumentId })
        next.push({ channel: "bookTicker", productLine: "SPOT", instrumentId: m.instrumentId })
      }
    setHeld(next)
  }, [realtime.views, realtime.products, mappedMarkets])
  const result = useMemo(() => {
    // Cash balances are usable once account snapshots arrive, even without a USD quote.
    let ready = Boolean(session && realtime.products.length)
    const balances: Balance[] = []
    const prices = new Map<string, number>([["USDT", 1]])
    for (const m of mappedMarkets.filter(
      (m) => m.productLine === "SPOT" && m.quoteAsset === "USDT",
    )) {
      const event =
        realtime.events.find(
          (e) =>
            e.productLine === "SPOT" &&
            e.instrumentId === m.instrumentId &&
            e.channel === "bookTicker",
        ) ??
        realtime.events.find(
          (e) =>
            e.productLine === "SPOT" && e.instrumentId === m.instrumentId && e.channel === "trades",
        )
      const raw = markets.find(
        (raw) => raw.instrumentId === m.instrumentId && mapMarket(raw).productLine === "SPOT",
      )
      const initialPrice =
        raw?.lastPriceTicks !== undefined
          ? eventPrice({ channel: "trades", data: { priceTicks: raw.lastPriceTicks } }, m, scales)
          : raw?.lastPrice !== undefined
            ? Number(raw.lastPrice)
            : null
      const price = eventPrice(event, m, scales) ?? initialPrice
      if (price !== null && price > 0) prices.set(m.baseAsset, price)
    }
    for (const product of realtime.products) {
      const view = realtime.views[product]
      if (!view) {
        ready = false
        continue
      }
      const productMarkets: Row[] = markets
        .filter((m) => mapMarket(m).productLine === product)
        .map((m) => ({
          ...m,
          markPriceTicks: markTicks(
            realtime.events.find(
              (e) =>
                e.productLine === product &&
                e.instrumentId === m.instrumentId &&
                e.channel === "mark",
            ),
            m,
            scales,
          ),
        }))
      const equity = accountEquity(view, productMarkets, product)
      ready = ready && view.ready()
      for (const row of equity.balances) {
        const parsed = BalanceSchema.safeParse({ ...row, accountType: accountTypes[product] })
        if (!parsed.success) {
          ready = false
          continue
        }
        const balance = mapBalance(parsed.data, scales)
        if (balance.available === null || balance.locked === null) ready = false
        const scale = scales[balance.asset],
          price = prices.get(balance.asset)
        let usd: number | null = null
        try {
          if (equity.complete && scale && price !== undefined && fx !== null)
            usd =
              Number(signedUnitsToDecimal(integer(row["equityUnits"]).toString(), scale)) *
              price *
              fx
        } catch {
          usd = null
        }
        if (usd === null || !Number.isFinite(usd)) {
          usd = null
        }
        balances.push({ ...balance, estimatedUsd: usd })
      }
    }
    return { balances, ready }
  }, [
    session,
    fx,
    markets,
    mappedMarkets,
    realtime.views,
    realtime.events,
    realtime.products,
    scales,
  ])
  return {
    ...result,
    products: realtime.products,
    error: error ?? realtime.error,
    refresh: realtime.refresh,
  }
}
