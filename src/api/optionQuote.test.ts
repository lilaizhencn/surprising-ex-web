import { afterEach, expect, it, vi } from "vitest"
import type { Market } from "../types/domain"
import { request } from "./client"
import { freshOptionReference, loadOptionReference, OptionReferenceSchema } from "./optionQuote"

vi.mock("./client", () => ({ request: vi.fn() }))
afterEach(() => vi.restoreAllMocks())
const time = Date.parse("2030-01-01T00:00:00Z")
const market = {
  productLine: "OPTION",
  status: "TRADING",
  instrumentId: "74",
  underlyingInstrumentId: "604",
  underlyingProductLine: "LINEAR_PERPETUAL",
  optionType: "CALL",
  strikePriceUnits: "10000000000",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  expiryTime: "2031-01-01T00:00:00Z",
} as Market
const data = {
  ...market,
  strikePrice: "100",
  premiumPrice: "7.965567455405796",
  underlyingIndexPrice: 100,
  sameExpiryForwardPrice: 100,
  intrinsicValue: 0,
  asOf: "2030-01-01T00:00:00Z",
  validUntil: "2030-01-01T00:00:05Z",
  sourcePriceSequence: "9007199254740993",
  model: "BLACK_76_ZERO_RATE_ACT_365",
  discountFactor: 1,
  unit: "PER_UNDERLYING_UNIT",
  greeks: {
    impliedVolatility: 0.2,
    forwardDelta: 0.539827837277029,
    forwardGamma: 0.0198476273738506,
    vegaPerVolPoint: 0.396952547477012,
    thetaPerDay: -0.0108754122596442,
  },
}
it("validates a finite explicit reference model without changing money units", () => {
  const quote = OptionReferenceSchema.parse(data)
  expect(quote.sourcePriceSequence).toBe("9007199254740993")
  expect(freshOptionReference(quote, market, time)).toBe(true)
  expect(freshOptionReference(quote, { ...market, status: "HALT" }, time)).toBe(true)
  expect(freshOptionReference(quote, market, time + 5000)).toBe(false)
  expect(freshOptionReference(quote, { ...market, instrumentId: "75" }, time)).toBe(false)
  expect(freshOptionReference(quote, { ...market, underlyingProductLine: "SPOT" }, time)).toBe(
    false,
  )
  expect(freshOptionReference(quote, { ...market, status: "CLOSED" }, time)).toBe(false)
  expect(freshOptionReference(quote, { ...market, strikePriceUnits: "10000000001" }, time)).toBe(
    false,
  )
})
it("does not keep wrong epochs, future or overlong validity, or a different contract expiry", () => {
  const quote = OptionReferenceSchema.parse(data)
  expect(freshOptionReference({ ...quote, asOf: "2030-01-01T00:00:01Z" }, market, time)).toBe(false)
  expect(freshOptionReference({ ...quote, validUntil: "2030-01-01T00:00:06Z" }, market, time)).toBe(
    false,
  )
  expect(freshOptionReference({ ...quote, expiryTime: "2031-01-02T00:00:00Z" }, market, time)).toBe(
    false,
  )
})
it("accepts unavailable Greeks while rejecting invented defaults and malformed values", () => {
  expect(OptionReferenceSchema.parse({ ...data, greeks: null }).greeks).toBeNull()
  for (const premiumPrice of [null, true, false, "", "NaN", Infinity])
    expect(OptionReferenceSchema.safeParse({ ...data, premiumPrice }).success).toBe(false)
  expect(OptionReferenceSchema.safeParse({ ...data, model: "UNKNOWN" }).success).toBe(false)
  expect(
    OptionReferenceSchema.safeParse({ ...data, greeks: { ...data.greeks, forwardDelta: 2 } })
      .success,
  ).toBe(false)
})
it("requests only the original OPTION realtime market route with abort and no retry", async () => {
  vi.spyOn(Date, "now").mockReturnValue(time)
  vi.mocked(request).mockResolvedValue(OptionReferenceSchema.parse(data))
  const abort = new AbortController()
  await loadOptionReference(market, abort.signal)
  expect(request).toHaveBeenLastCalledWith(
    "/api/v1/gateway/candlestick/options/quote?instrumentId=74",
    OptionReferenceSchema,
    { productLine: "OPTION", retry: 0, signal: abort.signal },
  )
  vi.mocked(request).mockResolvedValue({ ...OptionReferenceSchema.parse(data), instrumentId: "75" })
  await expect(loadOptionReference(market)).rejects.toThrow("does not match")
})
