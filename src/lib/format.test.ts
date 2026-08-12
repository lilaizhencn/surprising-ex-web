import { describe, expect, it } from "vitest"
import { formatNumber, formatPercent, formatPrice } from "./format"

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
