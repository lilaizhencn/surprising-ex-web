import { describe, expect, it } from "vitest"
import { accountTypeForProductLine, candleRange } from "./endpoints"

describe("candle request windows", () => {
  it("creates the backend-required ISO range for a 1h chart", () => {
    const end = new Date("2026-08-13T12:00:00.000Z")
    expect(candleRange("1h", end, 120)).toEqual({
      startTime: "2026-08-08T12:00:00.000Z",
      endTime: "2026-08-13T12:00:00.000Z",
    })
  })
})

describe("account type request mapping", () => {
  it("uses the account service enum for every product line", () => {
    expect(accountTypeForProductLine("SPOT")).toBe("SPOT")
    expect(accountTypeForProductLine("LINEAR_PERPETUAL")).toBe("USDT_PERPETUAL")
    expect(accountTypeForProductLine("INVERSE_PERPETUAL")).toBe("COIN_PERPETUAL")
    expect(accountTypeForProductLine("LINEAR_DELIVERY")).toBe("USDT_DELIVERY")
    expect(accountTypeForProductLine("INVERSE_DELIVERY")).toBe("COIN_DELIVERY")
    expect(accountTypeForProductLine("OPTION")).toBe("OPTION")
  })
})
