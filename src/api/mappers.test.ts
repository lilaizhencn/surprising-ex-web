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
      contractType: "LINEAR_PERPETUAL",
      instrumentType: "PERPETUAL",
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

  it("keeps raw ticks and units unavailable without the accounting asset scales", () => {
    const market = mapMarket({
      symbol: "BTCUSDT",
      instrumentId: "100",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      contractType: "SPOT",
      priceTickUnits: "25",
      lastPriceTicks: "6424550",
      change24hPpm: "12500",
      volume24hUnits: "12000000000000",
    })

    expect(market.price).toBeNull()
    expect(market.change24h).toBe(1.25)
    expect(market.volume24h).toBeNull()
    expect(
      mapMarket({
        symbol: "BTCUSDT",
        instrumentId: "100",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        lastPrice: "64245.5",
        volume24h: "120000",
      }),
    ).toMatchObject({
      price: 64245.5,
      volume24h: 120000,
    })
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

describe("strict instrument product identity", () => {
  const identity = { instrumentId: "604", symbol: "BTC-USDT", baseAsset: "BTC", quoteAsset: "USDT" }
  const contracts = [
    { contractType: "SPOT", productLine: "SPOT", instrumentType: "SPOT" },
    {
      contractType: "LINEAR_PERPETUAL",
      productLine: "LINEAR_PERPETUAL",
      instrumentType: "PERPETUAL",
    },
    {
      contractType: "INVERSE_PERPETUAL",
      productLine: "INVERSE_PERPETUAL",
      instrumentType: "PERPETUAL",
    },
    { contractType: "LINEAR_DELIVERY", productLine: "LINEAR_DELIVERY", instrumentType: "DELIVERY" },
    {
      contractType: "INVERSE_DELIVERY",
      productLine: "INVERSE_DELIVERY",
      instrumentType: "DELIVERY",
    },
    { contractType: "VANILLA_OPTION", productLine: "OPTION", instrumentType: "OPTION" },
  ] as const
  it.each(contracts)("maps exact backend $contractType and validates its category", (metadata) => {
    expect(mapMarket({ ...identity, ...metadata }).productLine).toBe(metadata.productLine)
    expect(mapMarket({ ...identity, contractType: metadata.contractType }).productLine).toBe(
      metadata.productLine,
    )
  })
  it("rejects a missing contract identity rather than guessing from the line or category", () => {
    for (const productLine of contracts.map((row) => row.productLine)) {
      expect(mapMarket({ ...identity, productLine }).productLine).toBe("UNKNOWN")
    }
    for (const instrumentType of ["SPOT", "PERPETUAL", "DELIVERY", "OPTION"]) {
      expect(mapMarket({ ...identity, instrumentType }).productLine).toBe("UNKNOWN")
    }
  })
  it.each([
    "FUTURE_LINEAR_DELIVERY",
    "UNKNOWN_SPOT",
    "NOT_AN_OPTION",
    "linear_perpetual",
    " LINEAR_DELIVERY",
    "OPTION",
    "",
    "constructor",
  ])("rejects unknown or aliased contract enum %s", (contractType) => {
    expect(mapMarket({ ...identity, contractType }).productLine).toBe("UNKNOWN")
  })
  it("rejects every disagreement between product line and the known contract", () => {
    for (const metadata of contracts)
      for (const other of contracts) {
        if (metadata.productLine === other.productLine) continue
        expect(
          mapMarket({ ...identity, ...metadata, productLine: other.productLine }).productLine,
        ).toBe("UNKNOWN")
      }
  })
  it("rejects unknown and conflicting instrument categories", () => {
    for (const metadata of contracts)
      for (const instrumentType of [
        "SPOT",
        "PERPETUAL",
        "DELIVERY",
        "OPTION",
        "LINEAR_PERPETUAL",
        "FUTURE_DELIVERY",
        "",
        "perpetual",
      ]) {
        if (metadata.instrumentType === instrumentType) continue
        expect(mapMarket({ ...identity, ...metadata, instrumentType }).productLine).toBe("UNKNOWN")
      }
  })
})
