import { describe, expect, it } from "vitest"
import {
  decimalProductExceedsUnits,
  decimalToStepUnits,
  decimalToUnits,
  isPositiveDecimal,
  signedUnitsToDecimal,
  unitsToDecimal,
} from "./units"

describe("asset unit conversion", () => {
  it("converts decimal quantities without floating point rounding", () => {
    expect(decimalToUnits("0.00000001", "100000000")).toBe("1")
    expect(decimalToUnits("0.1", "1000000000000000000")).toBe("100000000000000000")
    expect(unitsToDecimal("100000000000000000", "1000000000000000000")).toBe("0.1")
    expect(signedUnitsToDecimal("-125000000", "100000000")).toBe("-1.25")
  })

  it("rejects values beyond an asset precision", () => {
    expect(() => decimalToUnits("0.000000001", "100000000")).toThrow()
  })

  it("converts display values into backend tick and step counts", () => {
    expect(decimalToStepUnits("0.001", "100000", "100000000")).toBe("1")
    expect(decimalToStepUnits("64230.50", "1000000", "100000000")).toBe("6423050")
    expect(() => decimalToStepUnits("0.0005", "100000", "100000000")).toThrow()
  })

  it("rejects unsafe numeric unit values instead of rounding them", () => {
    expect(() => unitsToDecimal(1e18, "1000000000000000000")).toThrow()
  })

  it("checks quote and base balances using integer arithmetic", () => {
    expect(decimalProductExceedsUnits("1.5", "2", "300000000", "100000000")).toBe(false)
    expect(decimalProductExceedsUnits("1.50000001", "2", "300000000", "100000000")).toBe(true)
  })

  it("validates positive decimal input", () => {
    expect(isPositiveDecimal("0.0001")).toBe(true)
    expect(isPositiveDecimal("0")).toBe(false)
    expect(isPositiveDecimal("1e-8")).toBe(false)
  })
})
