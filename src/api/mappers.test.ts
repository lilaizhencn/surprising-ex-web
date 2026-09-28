import { describe, expect, it } from "vitest"
import { mapBalance, mapCandle, mapMarket } from "./mappers"
import { MarketSchema } from "./types"

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
  it("keeps identity and accounting assets when the display name changes", () => {
    const raw = {
      instrumentId: "604",
      symbol: "BTC-USDT",
      productLine: "LINEAR_PERPETUAL",
      baseAsset: "BTC",
      quoteAsset: "USDT",
    }
    const before = mapMarket(raw)
    const after = mapMarket({ ...raw, symbol: "Bitcoin perpetual" })
    expect(after.instrumentId).toBe(before.instrumentId)
    expect(after.productLine).toBe(before.productLine)
    expect(after.baseAsset).toBe("BTC")
    expect(after.quoteAsset).toBe("USDT")
    expect(after.symbol).toBe("Bitcoin perpetual")
    expect(() => mapMarket({ instrumentId: "604", symbol: "BTC-USDT" })).toThrow("asset metadata")
  })

  it("converts the instrument's maximum leverage from wire ppm into multiples", () => {
    for (const maxLeveragePpm of [50000000, "50000000", "125000000"]) {
      const raw = MarketSchema.parse({
        symbol: "BTC-USDT",
        instrumentId: "1",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        maxLeveragePpm,
      })
      expect(mapMarket(raw).maxLeverage).toBe(Number(maxLeveragePpm) / 1_000_000)
    }
    expect(
      mapMarket({ symbol: "BTC-USDT", instrumentId: "1", baseAsset: "BTC", quoteAsset: "USDT" })
        .maxLeverage,
    ).toBeNull()
    expect(
      mapMarket({
        symbol: "BTC-USDT",
        instrumentId: "1",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        maxLeveragePpm: "0",
      }).maxLeverage,
    ).toBeNull()
  })

  it("normalizes integer prices using backend scale metadata", () => {
    const market = mapMarket({
      symbol: "BTCUSDT",
      instrumentId: "100",
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
      instrumentId: "100",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      priceTickUnits: "5",
      quantityStepUnits: "25",
    })

    expect(market.priceTickUnits).toBe("5")
    expect(market.quantityStepUnits).toBe("25")
  })

  it("does not present a zero quote as live price data", () => {
    const market = mapMarket({
      symbol: "BTCUSDT",
      instrumentId: "100",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      lastPrice: 0,
      high24h: 0,
      low24h: 0,
    })

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
