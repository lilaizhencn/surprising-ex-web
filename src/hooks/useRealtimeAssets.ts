import { useEffect, useMemo, useState } from "react"
import { loadMarkets, loadUsdValuation } from "../api/endpoints"
import { mapBalance, mapMarket } from "../api/mappers"
import { type ApiMarket, type AuthSession, BalanceSchema } from "../api/types"
import { decimalToStepUnits, signedUnitsToDecimal, stepUnitsToDecimal } from "../lib/units"
import {
  accountEquity,
  integer,
  PRODUCTS,
  type Row,
  record,
  type Subscription,
  type WsEnvelope,
} from "../realtime"
import type { Balance, ProductLine } from "../types/domain"
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
  if (data["priceTicks"] !== undefined) return fromTicks(data["priceTicks"])
  const price = Number(data["price"])
  return Number.isFinite(price) && price > 0 ? price : null
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
        if (!closed) setError("合约参数未同步 / Instruments unavailable")
      })
    void loadUsdValuation("1", "USDT")
      .then((value) => {
        const rate = Number(value.convertedAmount)
        if (!closed) setFx(Number.isFinite(rate) && rate > 0 ? rate : null)
      })
      .catch(() => {
        if (!closed) setError("USD 汇率未同步 / FX unavailable")
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
    for (const product of PRODUCTS) {
      for (const b of realtime.views[product]?.rows("balance") ?? []) assets.add(String(b["asset"]))
      for (const p of realtime.views[product]?.rows("position") ?? []) {
        if (Number(p["signedQuantitySteps"]) !== 0) {
          assets.add(String(p["marginAsset"]))
          next.push({ channel: "mark", productLine: product, symbol: String(p["symbol"]) })
        }
      }
    }
    for (const m of mappedMarkets)
      if (m.productLine === "SPOT" && m.quoteAsset === "USDT" && assets.has(m.baseAsset)) {
        next.push({ channel: "trades", productLine: "SPOT", symbol: m.symbol })
        next.push({ channel: "bookTicker", productLine: "SPOT", symbol: m.symbol })
      }
    setHeld(next)
  }, [realtime.views, mappedMarkets])
  const result = useMemo(() => {
    let ready = Boolean(session && fx && markets.length)
    const balances: Balance[] = []
    const prices = new Map<string, number>([["USDT", 1]])
    for (const m of mappedMarkets.filter(
      (m) => m.productLine === "SPOT" && m.quoteAsset === "USDT",
    )) {
      const event =
        realtime.events.find(
          (e) => e.productLine === "SPOT" && e.symbol === m.symbol && e.channel === "bookTicker",
        ) ??
        realtime.events.find(
          (e) => e.productLine === "SPOT" && e.symbol === m.symbol && e.channel === "trades",
        )
      const raw = markets.find(
        (raw) => raw.symbol === m.symbol && mapMarket(raw).productLine === "SPOT",
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
    for (const product of PRODUCTS) {
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
              (e) => e.productLine === product && e.symbol === m.symbol && e.channel === "mark",
            ),
            m,
            scales,
          ),
        }))
      const equity = accountEquity(view, productMarkets, product)
      ready = ready && equity.complete
      for (const row of equity.balances) {
        const parsed = BalanceSchema.safeParse({ ...row, accountType: accountTypes[product] })
        if (!parsed.success) {
          ready = false
          continue
        }
        const balance = mapBalance(parsed.data, scales)
        const scale = scales[balance.asset],
          price = prices.get(balance.asset)
        let usd: number | null = null
        try {
          if (scale && price !== undefined && fx !== null)
            usd =
              Number(signedUnitsToDecimal(integer(row["equityUnits"]).toString(), scale)) *
              price *
              fx
        } catch {
          ready = false
        }
        if (usd === null || !Number.isFinite(usd)) {
          ready = false
          usd = null
        }
        balances.push({ ...balance, estimatedUsd: usd })
      }
    }
    return { balances, ready }
  }, [session, fx, markets, mappedMarkets, realtime.views, realtime.events, scales])
  return { ...result, error, refresh: realtime.refresh }
}
