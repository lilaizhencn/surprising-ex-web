import { describe, expect, it } from "vitest"
import { mapBalance, mapMarket } from "./mappers"

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
