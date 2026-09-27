import { describe, expect, it } from "vitest"
import { formatNumber, formatPercent, formatPrice, priceDecimalsForStep } from "./format"

describe("instrument price precision", () => {
  it("keeps fixed and adaptive precision independent when reusing formatters", () => {
    expect(formatPrice(12.3, 2)).toBe("12.30")
    expect(formatPrice(12.3)).toBe("12.3")
    expect(formatPrice(0.0000123, 8)).toBe("0.00001230")
    expect(formatPrice(12.3, 2)).toBe("12.30")
  })

  it("keeps familiar high prices and preserves cheap coin ticks", () => {
    expect(formatPrice(84312.3, priceDecimalsForStep(0.1))).toBe("84,312.30")
    expect(formatPrice(0.00000427, priceDecimalsForStep(0.00000001))).toBe("0.00000427")
    expect(formatPrice(0.000000000123, priceDecimalsForStep(1e-12))).toBe("0.000000000123")
    expect(priceDecimalsForStep(0.000025)).toBe(6)
    expect(priceDecimalsForStep(2.5e-8)).toBe(9)
  })
  it("never rounds nonzero tiny prices to zero when metadata is absent or too coarse", () => {
    expect(formatPrice(0.000000000123)).toBe("0.000000000123")
    expect(formatPrice(0.00000427, 2)).toBe("0.00000427")
    expect(formatPrice(1e-25)).toBe("1.000e-25")
    expect(formatPrice(null)).toBe("—")
    expect(formatPrice(Number.NaN)).toBe("—")
    expect(formatPrice(Number.POSITIVE_INFINITY)).toBe("—")
    expect(formatPrice(0, 2)).toBe("0.00")
  })
})

describe("financial formatters", () => {
  it("formats missing values without inventing a number", () => {
    expect(formatPrice(null)).toBe("—")
    expect(formatNumber(null)).toBe("—")
    expect(formatPercent(null)).toBe("—")
  })

  it("keeps positive and negative signs visible", () => {
    expect(formatPercent(1.25)).toBe("+1.25%")
    expect(formatPercent(-1.25)).toBe("-1.25%")
  })
})
