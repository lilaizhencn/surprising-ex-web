import { expect, it } from "vitest"
import type { Market } from "../../types/domain"
import { canSubmitTradingOrder } from "./tradingAvailability"

const market = (status: string, productLine = "LINEAR_DELIVERY") =>
  ({ status, productLine }) as Market
it("permits only direct reductions while the linear delivery contract settles", () => {
  expect(canSubmitTradingOrder(market("TRADING"), false)).toBe(true)
  expect(canSubmitTradingOrder(market("SETTLING"), true)).toBe(true)
  expect(canSubmitTradingOrder(market("SETTLING"), false)).toBe(false)
  for (const status of ["DRAFT", "PRE_TRADING", "HALT", "SETTLED", "EXPIRED", "UNAVAILABLE"])
    expect(canSubmitTradingOrder(market(status), true)).toBe(false)
  expect(canSubmitTradingOrder(null, true)).toBe(false)
})
it("does not enable another product through the delivery status policy", () => {
  for (const line of [
    "SPOT",
    "LINEAR_PERPETUAL",
    "INVERSE_PERPETUAL",
    "INVERSE_DELIVERY",
    "OPTION",
  ])
    expect(canSubmitTradingOrder(market("SETTLING", line), true)).toBe(false)
})
