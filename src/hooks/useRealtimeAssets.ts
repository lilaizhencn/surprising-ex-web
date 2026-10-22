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
      const price = Number(stepUnitsToDecimal(integer(value).toString(), tick, scale))
      return Number.isFinite(price) && price > 0 ? price : null
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
  now: number,
): string | null {
  if (!event || !freshValuationEvent(event, now)) return null
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

const VALUATION_PRICE_MAX_AGE_MS = 60_000
export function freshValuationEvent(event: WsEnvelope | undefined, now: number): boolean {
  if (!event) return false
  const data = record(event.data)
  const timestamps = [
    event.eventTime,
    ...(data["eventTime"] === undefined ? [] : [data["eventTime"]]),
  ]
  if (
    timestamps.some((value) => {
      const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN
      return (
        !Number.isFinite(timestamp) ||
        timestamp > now + 5_000 ||
        now - timestamp >= VALUATION_PRICE_MAX_AGE_MS
      )
    })
  )
    return false
  return (
    event.channel !== "mark" || ["HEALTHY", "DEGRADED", "CLAMPED"].includes(String(data["status"]))
  )
}

/** Displaying a last trade is independent from accepting it for current USD valuation. */
export function valuationPrice(
  event: WsEnvelope | undefined,
  market: { priceTickUnits?: string | undefined; quoteAsset: string },
  scales: Readonly<Record<string, string>>,
  now: number,
): number | null {
  return freshValuationEvent(event, now) ? eventPrice(event, market, scales) : null
}

export type UsdQuote = { rate: number; rateTime: number; receivedAt: number }
const FX_MAX_AGE_MS = 60_000
export function currentUsdRate(quote: UsdQuote | null, now: number): number | null {
  if (
    !quote ||
    !Number.isFinite(quote.rate) ||
    quote.rate <= 0 ||
    !Number.isFinite(quote.rateTime) ||
    quote.rateTime > now + 5_000 ||
    now - quote.rateTime >= FX_MAX_AGE_MS ||
    now - quote.receivedAt >= FX_MAX_AGE_MS
  )
    return null
  return quote.rate
}

export function useRealtimeAssets(
  session: AuthSession | null,
  scales: Readonly<Record<string, string>>,
) {
  const [markets, setMarkets] = useState<readonly ApiMarket[]>([])
  const [fx, setFx] = useState<UsdQuote | null>(null)
  const [marketError, setMarketError] = useState<string | null>(null)
  const [fxError, setFxError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [held, setHeld] = useState<readonly Subscription[]>([])
  useEffect(() => {
    let closed = false
    const controller = new AbortController()
    void loadMarkets(undefined, controller.signal)
      .then((rows) => {
        if (!closed) {
          setMarkets(rows)
          setMarketError(null)
        }
      })
      .catch(() => {
        if (!closed) setMarketError(t("Instruments unavailable"))
      })
    const refreshUsdtUsd = () =>
      void loadUsdValuation("1", "USDT", controller.signal)
        .then((value) => {
          const quote = {
            rate: Number(value.convertedAmount),
            rateTime: Date.parse(value.rateTime),
            receivedAt: Date.now(),
          }
          if (!closed) {
            setFx(quote)
            setFxError(currentUsdRate(quote, Date.now()) === null ? t("FX unavailable") : null)
          }
        })
        .catch(() => {
          if (!closed) {
            setFx(null)
            setFxError(t("FX unavailable"))
          }
        })
    refreshUsdtUsd()
    const refreshTimer = window.setInterval(refreshUsdtUsd, 30_000)
    const expiryTimer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      closed = true
      controller.abort()
      window.clearInterval(refreshTimer)
      window.clearInterval(expiryTimer)
    }
  }, [refreshVersion])
  const usdRate = currentUsdRate(fx, now)
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
      } else if (
        m.productLine !== "SPOT" &&
        m.productLine !== "UNKNOWN" &&
        m.quoteAsset === "USDT" &&
        assets.has(m.baseAsset)
      ) {
        next.push({ channel: "mark", productLine: m.productLine, instrumentId: m.instrumentId })
      }
    setHeld(next)
  }, [realtime.views, realtime.products, mappedMarkets])
  const result = useMemo(() => {
    // Cash balances are usable once account snapshots arrive, even without a USD quote.
    let ready = Boolean(session && realtime.products.length)
    const balances: Balance[] = []
    let valuationUnavailable = false
    const prices = new Map<string, number>([
      ["USDT", 1],
      ["USD", 1],
    ])
    for (const m of mappedMarkets.filter((market) => market.quoteAsset === "USDT")) {
      const candidates = realtime.events.filter(
        (event) =>
          event.productLine === m.productLine &&
          event.instrumentId === m.instrumentId &&
          ["mark", "bookTicker", "trades"].includes(event.channel ?? ""),
      )
      let price: number | null = null
      for (const event of candidates) {
        price = valuationPrice(event, m, scales, now)
        if (price !== null && price > 0) break
      }
      // Instrument summaries have no quote timestamp and cannot establish current USD value.
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
            now,
          ),
        }))
      const equity = accountEquity(view, productMarkets, product)
      const positionMarksCurrent = view.rows("position").every((position) => {
        if (integer(position["signedQuantitySteps"]) === 0n) return true
        const mark = realtime.events.find(
          (event) =>
            event.productLine === product &&
            event.instrumentId === position["instrumentId"] &&
            event.channel === "mark",
        )
        if (!freshValuationEvent(mark, now)) return false
        const market = productMarkets.find(
          (row) => row["instrumentId"] === position["instrumentId"],
        )
        if (market && String(market["changeId"]) === String(position["instrumentChangeId"]))
          return true
        // A Core risk fallback needs a price fence at least as recent as the fresh mark.
        const risk = view
          .rows("risk")
          .find(
            (row) =>
              row["instrumentId"] === position["instrumentId"] &&
              row["positionSide"] === position["positionSide"],
          )
        try {
          return integer(risk?.["priceSequence"]) >= integer(record(mark?.data)["sequence"])
        } catch {
          return false
        }
      })
      if (!equity.complete || !positionMarksCurrent) valuationUnavailable = true
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
          price = prices.get(balance.asset),
          assetUsdRate = balance.asset === "USD" ? 1 : usdRate
        let usd: number | null = null
        try {
          if (
            equity.complete &&
            positionMarksCurrent &&
            scale &&
            price !== undefined &&
            assetUsdRate !== null
          )
            usd =
              Number(signedUnitsToDecimal(integer(row["equityUnits"]).toString(), scale)) *
              price *
              assetUsdRate
        } catch {
          usd = null
        }
        if (usd === null || !Number.isFinite(usd)) {
          usd = null
          valuationUnavailable = true
        }
        balances.push({ ...balance, estimatedUsd: usd })
      }
    }
    return { balances, ready, valuationUnavailable }
  }, [
    session,
    now,
    usdRate,
    markets,
    mappedMarkets,
    realtime.views,
    realtime.events,
    realtime.products,
    scales,
  ])
  return {
    ...result,
    ready:
      result.ready && realtime.products.every((product) => realtime.views[product]?.ready(now)),
    products: realtime.products,
    readyProducts: realtime.products.filter((product) => realtime.views[product]?.ready(now)),
    error:
      marketError ??
      fxError ??
      (fx && usdRate === null ? t("FX quote has expired") : null) ??
      realtime.error ??
      (result.valuationUnavailable ? t("Valuation prices are unavailable or expired.") : null),
    refresh: () => {
      setRefreshVersion((version) => version + 1)
      realtime.refresh()
    },
  }
}
