import { describe, expect, it } from "vitest"
import { decimalToStepUnits, stepUnitsToDecimal } from "../../lib/units"
import { type Market, PRODUCT_LINES } from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"

const market: Market = {
  symbol: "BTC-USDT-SWAP",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  productLine: PRODUCT_LINES.usdMPerpetual,
  price: null,
  change24h: null,
  volume24h: null,
  high24h: null,
  low24h: null,
  pricePrecision: 1,
  quantityPrecision: 2,
  quantityStepUnits: "1",
  contractMultiplierPpm: 1000000,
  maxLeverage: null,
}

describe("market quantity", () => {
  it("uses the contract multiplier for U perpetual orders and displayed fills", () => {
    const spec = marketQuantitySpec(market, { BTC: "100000000" })
    expect(decimalToStepUnits("1", spec.unitSize, spec.scale)).toBe("1")
    expect(stepUnitsToDecimal("2", spec.unitSize, spec.scale)).toBe("2")
    expect(() => decimalToStepUnits("0.00000001", spec.unitSize, spec.scale)).toThrow()
  })

  it("keeps spot quantity in base asset units", () => {
    const spec = marketQuantitySpec(
      { ...market, productLine: PRODUCT_LINES.spot },
      { BTC: "100000000" },
    )
    expect(stepUnitsToDecimal("1", spec.unitSize, spec.scale)).toBe("0.00000001")
  })
})

it("keeps a 0.01 BTC contract quantity independent of a 0.1 USDT price step", () => {
  const spec = marketQuantitySpec(
    { ...market, contractMultiplierPpm: 10000, priceTickUnits: "10000000" },
    { BTC: "100000000", USDT: "100000000" },
  )
  expect(stepUnitsToDecimal("2", spec.unitSize, spec.scale)).toBe("0.02")
  expect(decimalToStepUnits("0.03", spec.unitSize, spec.scale)).toBe("3")
  expect(() => decimalToStepUnits("0.001", spec.unitSize, spec.scale)).toThrow()
})
