import { describe, expect, it } from "vitest"
import {
  formatNumber,
  formatPercent,
  formatPrice,
  formatUsd,
  priceDecimalsForStep,
} from "../../lib/format"
import { displayPrice, formatTradeQuantity, priceDisplayPrecision } from "./tradeFormatting"

describe("Financial formatting byte-for-byte lock (Phase 0)", () => {
  it("locks displayPrice across edge cases, tiny ticks, and large notionals", () => {
    const cases = [
      displayPrice("", true),
      displayPrice("0", true),
      displayPrice("91234.5", true, 1),
      displayPrice("91234.5678", true, 2),
      displayPrice("0.00001234", false),
      displayPrice("0.00001234", true, 6),
      displayPrice("1234567890.123456", true, 4),
      displayPrice("NaN", true),
    ]
    expect(cases).toEqual([
      "—",
      "0",
      "91,234.5",
      "91,234.57",
      "0.0000123",
      "0.000012",
      "1,234,567,890.1235",
      "—",
    ])
  })

  it("locks formatTradeQuantity, formatPrice, formatUsd, formatPercent, and priceDecimalsForStep", () => {
    expect([
      formatTradeQuantity(""),
      formatTradeQuantity("-1"),
      formatTradeQuantity("0"),
      formatTradeQuantity("12.345678901"),
      formatTradeQuantity("1000000000000"),
    ]).toEqual(["—", "—", "0", "12.3456789", "1,000,000,000,000"])

    expect([
      formatPrice(null),
      formatPrice(0.000025, 6),
      formatPrice(1e-8, 2),
      formatUsd(12345.678),
      formatNumber(987654.321, 3),
      formatPercent(0),
      formatPercent(-3.456),
      priceDecimalsForStep(0.000025, 2),
      priceDisplayPrecision(null, {}),
    ]).toEqual([
      "—",
      "0.000025",
      "0.0000000100",
      "$12,345.68",
      "987,654.321",
      "+0.00%",
      "-3.46%",
      6,
      2,
    ])
  })
})
