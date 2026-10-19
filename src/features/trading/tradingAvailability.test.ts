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
  expect(canSubmitTradingOrder(market("SETTLING", "INVERSE_DELIVERY"), true)).toBe(true)
  expect(canSubmitTradingOrder(market("SETTLING", "INVERSE_DELIVERY"), false)).toBe(false)
  expect(canSubmitTradingOrder(null, true)).toBe(false)
})
it("does not enable another product through the delivery status policy", () => {
  for (const line of ["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "OPTION"])
    expect(canSubmitTradingOrder(market("SETTLING", line), true)).toBe(false)
})

it("requires an unexpired TRADING option and never enables reductions during exercise", () => {
  const now = Date.parse("2030-01-01T00:00:00Z")
  const option = { ...market("TRADING", "OPTION"), expiryTime: "2030-01-01T01:00:00Z" }
  expect(canSubmitTradingOrder(option, false, now)).toBe(true)
  expect(canSubmitTradingOrder(option, true, now)).toBe(true)
  expect(canSubmitTradingOrder(option, true, now + 3600000)).toBe(false)
  expect(canSubmitTradingOrder({ ...option, expiryTime: undefined }, false, now)).toBe(false)
  expect(canSubmitTradingOrder({ ...option, expiryTime: "invalid" }, false, now)).toBe(false)
  for (const status of ["PRE_TRADING", "HALT", "SETTLING", "CLOSED"])
    expect(canSubmitTradingOrder({ ...option, status }, true, now)).toBe(false)
})
