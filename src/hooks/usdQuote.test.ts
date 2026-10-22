import { describe, expect, it } from "vitest"
import { currentUsdRate, eventPrice, valuationPrice } from "./useRealtimeAssets"

describe("USD quote freshness", () => {
  it("accepts current rates and rejects old provider timestamps, stalled polls and invalid rates", () => {
    const quote = { rate: 0.999, rateTime: 100_000, receivedAt: 100_000 }
    expect(currentUsdRate(quote, 130_000)).toBe(0.999)
    expect(currentUsdRate(quote, 160_000)).toBeNull()
    expect(currentUsdRate({ ...quote, rateTime: 200_000 }, 130_000)).toBeNull()
    expect(currentUsdRate({ ...quote, rate: Number.NaN }, 130_000)).toBeNull()
    expect(currentUsdRate({ ...quote, rateTime: Number.NaN }, 130_000)).toBeNull()
    expect(currentUsdRate(null, 130_000)).toBeNull()
  })
})

describe("asset valuation price freshness", () => {
  const now = Date.parse("2026-10-22T06:00:00Z")
  const market = { priceTickUnits: "1", quoteAsset: "USDT" }
  const scales = { USDT: "100" }
  it("withdraws a stale price while preserving last-trade display semantics, then recovers", () => {
    const event = {
      channel: "trades",
      eventTime: new Date(now).toISOString(),
      data: { priceTicks: "1234" },
    }
    expect(valuationPrice(event, market, scales, now)).toBe(12.34)
    expect(valuationPrice(event, market, scales, now + 60_000)).toBeNull()
    expect(eventPrice(event, market, scales)).toBe(12.34)
    expect(
      valuationPrice(
        { ...event, eventTime: new Date(now + 60_000).toISOString() },
        market,
        scales,
        now + 60_000,
      ),
    ).toBe(12.34)
  })
  it("rejects unknown initial timestamps, stale provider time hidden by a new envelope, and unusable marks", () => {
    expect(
      valuationPrice({ channel: "trades", data: { priceTicks: "1234" } }, market, scales, now),
    ).toBeNull()
    const event = {
      channel: "mark",
      eventTime: new Date(now).toISOString(),
      data: {
        status: "HEALTHY",
        markPriceUnits: "1234",
        eventTime: new Date(now - 60_000).toISOString(),
      },
    }
    expect(valuationPrice(event, market, scales, now)).toBeNull()
    for (const status of ["STALE", "INSUFFICIENT_SOURCES", "UNKNOWN"])
      expect(
        valuationPrice(
          { ...event, data: { ...event.data, eventTime: event.eventTime, status } },
          market,
          scales,
          now,
        ),
      ).toBeNull()
    expect(
      valuationPrice(
        { ...event, data: { ...event.data, eventTime: event.eventTime } },
        market,
        scales,
        now,
      ),
    ).toBe(12.34)
  })
  it("does not halve a one-sided book against an invalid zero price", () => {
    expect(
      eventPrice(
        { channel: "bookTicker", data: { bid: { priceTicks: 0 }, ask: { priceTicks: 1234 } } },
        market,
        scales,
      ),
    ).toBe(12.34)
  })
})
