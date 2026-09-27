import { expect, it } from "vitest"
import type { Market } from "../../types/domain"
import { fillProgress, orderStatus, price } from "./TradingAccountTables"

it("distinguishes working, partially filled and terminal orders", () => {
  expect(orderStatus({ status: "OPEN", executedQuantitySteps: "0" })).toBe("ACCEPTED")
  expect(orderStatus({ status: "OPEN", executedQuantitySteps: "1" })).toBe("PARTIALLY_FILLED")
  expect(orderStatus({ status: "FILLED", executedQuantitySteps: "10" })).toBe("FILLED")
  expect(
    fillProgress({
      quantitySteps: "90071992547409930",
      executedQuantitySteps: "45035996273704965",
    }),
  ).toBe("50%")
  expect(fillProgress({ quantitySteps: "0", executedQuantitySteps: "0" })).toBe("—")
})

it("formats a fractional execution average at the instrument price precision", () => {
  const market = { quoteAsset: "USDT", priceTickUnits: "10000000", pricePrecision: 2 } as Market
  expect(price("103.333333333333333333", market, { USDT: "100000000" })).toBe("10.33")
  expect(price(null, market, { USDT: "100000000" })).toBe("—")
})
