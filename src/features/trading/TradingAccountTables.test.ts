import { expect, it } from "vitest"
import { fillProgress, orderStatus } from "./TradingAccountTables"

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
