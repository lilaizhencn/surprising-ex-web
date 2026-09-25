import { describe, expect, it } from "vitest"
import { mapBalance, mapCandle, mapMarket } from "./mappers"

describe("candle mapper", () => {
  it("keeps OHLC and actual base volume for the chart", () => {
    expect(
      mapCandle({
        openTime: "2026-09-25T16:04:00Z",
        openPrice: "83925.3",
        highPrice: "83949.9",
        lowPrice: "83925.3",
        closePrice: "83949.9",
        baseVolume: "0.00000002",
      }),
    ).toMatchObject({ open: 83925.3, close: 83949.9, volume: 0.00000002 })
  })
})

describe("market mapper", () => {
  it("normalizes integer prices using backend scale metadata", () => {
    const market = mapMarket({
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      productLine: "SPOT",
      lastPriceTicks: "6424550",
      change24hPpm: "12500",
      volume24hUnits: "12000000000000",
    })

    expect(market.price).toBe(64245.5)
    expect(market.change24h).toBe(1.25)
    expect(market.volume24h).toBe(120000)
  })

  it("preserves backend price and quantity unit scales", () => {
    const market = mapMarket({
      symbol: "BTCUSDT",
      priceTickUnits: "5",
      quantityStepUnits: "25",
    })

    expect(market.priceTickUnits).toBe("5")
    expect(market.quantityStepUnits).toBe("25")
  })

  it("does not present a zero quote as live price data", () => {
    const market = mapMarket({ symbol: "BTCUSDT", lastPrice: 0, high24h: 0, low24h: 0 })

    expect(market.price).toBeNull()
    expect(market.high24h).toBeNull()
    expect(market.low24h).toBeNull()
  })
})

describe("balance mapper", () => {
  it("uses asset scale metadata for long-based balances", () => {
    const balance = mapBalance(
      { asset: "ETH", availableUnits: "1000000000000000000", lockedUnits: "500000000000000000" },
      { ETH: "1000000000000000000" },
    )

    expect(balance.available).toBe(1)
    expect(balance.locked).toBe(0.5)
  })
})
