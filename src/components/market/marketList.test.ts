import { describe, expect, it } from "vitest"
import type { Market } from "../../types/domain"
import { filterMarkets, marketTradeUrl, sortMarkets } from "./marketList"

export const sampleMarket: Market = {
  productLine: "LINEAR_PERPETUAL",
  instrumentId: "9007199254740993",
  symbol: "BTC/USDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  price: 1,
  change24h: 0,
  volume24h: 2,
  quoteVolume24h: 3,
  high24h: 1,
  low24h: 1,
  pricePrecision: 8,
  quantityPrecision: 6,
  maxLeverage: null,
}

describe("market list sorting and filtering", () => {
  const rows = [
    {
      ...sampleMarket,
      symbol: "AAA/USDT",
      price: 10,
      volume24h: 10000,
      quoteVolume24h: 1,
      change24h: -7,
    },
    {
      ...sampleMarket,
      symbol: "BBB/USDT",
      price: 1,
      volume24h: 2,
      quoteVolume24h: 100,
      change24h: null,
    },
    {
      ...sampleMarket,
      symbol: "CCC/USDT",
      price: null,
      volume24h: 5,
      quoteVolume24h: null,
      change24h: 10,
    },
  ]
  it("sorts the displayed quote turnover instead of base quantity", () => {
    expect(
      sortMarkets(rows, { field: "quoteVolume24h", direction: "desc" }).map((row) => row.symbol),
    ).toEqual(["BBB/USDT", "AAA/USDT", "CCC/USDT"])
    expect(rows[0]?.symbol).toBe("AAA/USDT")
  })
  it("sorts both ways while keeping missing prices last", () => {
    expect(
      sortMarkets(rows, { field: "price", direction: "asc" }).map((row) => row.symbol),
    ).toEqual(["BBB/USDT", "AAA/USDT", "CCC/USDT"])
    expect(
      sortMarkets(rows, { field: "price", direction: "desc" }).map((row) => row.symbol),
    ).toEqual(["AAA/USDT", "BBB/USDT", "CCC/USDT"])
  })
  it("trims search, searches asset metadata and excludes unknown change from a threshold", () => {
    expect(filterMarkets(rows, "  bTc  ", 0)).toHaveLength(3)
    expect(filterMarkets(rows, "  aaa  ", 0)).toHaveLength(1)
    expect(filterMarkets(rows, "", 5).map((row) => row.symbol)).toEqual(["AAA/USDT", "CCC/USDT"])
    expect(filterMarkets(rows, "", 0)).toHaveLength(3)
  })
  it("routes each product explicitly and never guesses a route for an unknown product", () => {
    expect(marketTradeUrl({ ...sampleMarket, productLine: "INVERSE_DELIVERY" })).toBe(
      "/trade/coin-m-delivery?instrumentId=9007199254740993",
    )
    expect(marketTradeUrl({ ...sampleMarket, productLine: "UNKNOWN" })).toBeNull()
  })
})
