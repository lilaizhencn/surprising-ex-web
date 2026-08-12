import { describe, expect, it } from "vitest"
import { mapMarket } from "./mappers"

describe("market mapper", () => {
  it("normalizes integer prices using backend scale metadata", () => {
    const market = mapMarket({
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      productLine: "SPOT",
      lastPriceTicks: 6424550,
      change24hPpm: 12500,
      volume24hUnits: 12000000000000,
    })

    expect(market.price).toBe(64245.5)
    expect(market.change24h).toBe(1.25)
    expect(market.volume24h).toBe(120000)
  })
})
