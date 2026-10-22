import { describe, expect, it } from "vitest"
import type { Market } from "../../types/domain"
import { PRODUCT_LINES } from "../../types/domain"
import { marketPriceFromRecord, normalizeOrderBook, normalizeTrade } from "./marketData"

const market = {
  instrumentId: "12",
  productLine: "SPOT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  priceTickUnits: "10000",
  quantityStepUnits: "1000000",
} as Market
const scales = { BTC: "100000000", USDT: "100000000" }

describe("market unit conversion", () => {
  it.each(Object.values(PRODUCT_LINES))(
    "converts %s book quantities using the correct base or contract unit",
    (productLine) => {
      const book = normalizeOrderBook(
        {
          sequence: "9007199254740993",
          bids: [{ priceTicks: "1234567", quantitySteps: "2" }],
          asks: [],
        },
        { ...market, productLine },
        scales,
      )
      expect(book.sequence).toBe("9007199254740993")
      expect(book.bids?.[0]).toMatchObject({
        priceTicks: "123.4567",
        quantitySteps: productLine === "SPOT" ? "0.02" : "2",
      })
      expect(book.asks).toEqual([])
    },
  )
  it("keeps large integer trade identities and decimal quantities exact", () => {
    const trade = normalizeTrade(
      { tradeId: "9007199254740993", priceTicks: "1234567", quantitySteps: "9007199254740993" },
      market,
      scales,
    )
    expect(trade).toMatchObject({
      tradeId: "9007199254740993",
      price: "123.4567",
      quantity: "90071992547409.93",
    })
  })
  it("leaves already decimal book snapshots unchanged", () => {
    const levels: readonly [string, string][] = [["100.001", "0.023"]]
    expect(normalizeOrderBook({ bids: levels, asks: [] }, market, scales).bids).toEqual(levels)
  })
  it("does not fabricate a quote without precision or from malformed numbers", () => {
    expect(marketPriceFromRecord({ priceTicks: "1234567" }, market, {})).toBeNull()
    expect(marketPriceFromRecord({ price: "NaN" }, market, scales)).toBeNull()
    expect(marketPriceFromRecord({ price: "Infinity" }, market, scales)).toBeNull()
    expect(() =>
      normalizeOrderBook({ bids: [{ priceTicks: "oops", quantitySteps: "2" }] }, market, scales),
    ).toThrow()
  })
  it("uses the same reference from explicit prices and scaled ticks", () => {
    expect(marketPriceFromRecord({ price: "123.4567" }, market, scales)).toBe(123.4567)
    expect(marketPriceFromRecord({ priceTicks: "1234567" }, market, scales)).toBe(123.4567)
  })
})
