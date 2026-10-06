import { describe, expect, it } from "vitest"
import type { WsEnvelope } from "../realtime"
import type { Market } from "../types/domain"
import { marketWithLiveQuote } from "./useRealtimeAssets"

const market: Market = {
  instrumentId: "604",
  symbol: "BTC-USDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  productLine: "LINEAR_PERPETUAL",
  price: null,
  change24h: null,
  volume24h: null,
  high24h: null,
  low24h: null,
  pricePrecision: 1,
  quantityPrecision: 3,
  priceTickUnits: "10000000",
  maxLeverage: 100,
}
const scales = { USDT: "100000000" }
const mark: WsEnvelope = {
  channel: "mark",
  productLine: "LINEAR_PERPETUAL",
  instrumentId: "604",
  data: { markPriceUnits: "8628950000000", status: "DEGRADED" },
}
const trade: WsEnvelope = {
  channel: "trades",
  productLine: "LINEAR_PERPETUAL",
  instrumentId: "604",
  data: { priceTicks: "862900" },
}

describe("public market price without a recent execution", () => {
  it("shows a labelled mark without inventing trade statistics", () => {
    expect(marketWithLiveQuote(market, [mark], scales)).toEqual({
      ...market,
      price: 86289.5,
      priceSource: "mark",
    })
  })
  it("prefers a real execution over the mark", () => {
    const result = marketWithLiveQuote(market, [mark, trade], scales)
    expect(result.price).toBe(86290)
    expect(result.priceSource).toBe("trade")
  })
  it("preserves an existing last trade when no new execution arrives", () => {
    const existing = { ...market, price: 86000, change24h: 2 }
    expect(marketWithLiveQuote(existing, [mark], scales)).toEqual(existing)
  })
  it("does not mix products, instruments, or stale prices", () => {
    for (const event of [
      { ...mark, productLine: "INVERSE_PERPETUAL" },
      { ...mark, instrumentId: "653" },
      { ...mark, data: { markPriceUnits: "8628950000000", status: "STALE" } },
    ] as WsEnvelope[])
      expect(marketWithLiveQuote(market, [event], scales)).toEqual(market)
    expect(marketWithLiveQuote(market, [mark], {})).toEqual(market)
  })
})
