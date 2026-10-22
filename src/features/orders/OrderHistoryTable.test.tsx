import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import { mapMarket } from "../../api/mappers"
import { OrderHistoryPageSchema } from "../../api/types"
import { decimalStepUnitsToDecimal } from "../../lib/units"
import { OrderHistoryTable } from "./OrderHistoryTable"

const row = {
  orderId: "9007199254740993",
  userId: "1",
  instrumentId: "868",
  side: "BUY",
  orderType: "LIMIT",
  status: "CANCELED",
  priceTicks: "12345",
  quantitySteps: "25",
  executedQuantitySteps: "10",
  remainingQuantitySteps: "15",
  averagePriceTicks: "12344.5",
  cumulativeFeeUnits: "-1",
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:01:00Z",
}
const market = mapMarket({
  instrumentId: "868",
  symbol: "BTC-USDT",
  productLine: "SPOT",
  contractType: "SPOT",
  instrumentType: "SPOT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  priceTickUnits: "5",
  quantityStepUnits: "20",
})
it("presents original IDs, fractional average ticks, filled and remaining base quantity and signed fees", () => {
  const html = renderToStaticMarkup(
    <OrderHistoryTable
      rows={[row]}
      markets={{ "SPOT:868": market }}
      productLine="SPOT"
      scales={{ BTC: "1000000", USDT: "1000" }}
    />,
  )
  for (const value of [
    "9007199254740993",
    "61.725 USDT",
    "61.7225 USDT",
    "0.0002 BTC",
    "0.0003 BTC",
    "-0.001 USDT",
    "Canceled",
  ])
    expect(html).toContain(value)
})
it("does not guess price or quantity without immutable contract metadata", () => {
  const html = renderToStaticMarkup(
    <OrderHistoryTable rows={[row]} markets={{}} productLine="SPOT" scales={{}} />,
  )
  expect(html).not.toContain("61.725")
  expect(html).not.toContain("0.0002")
})
it("keeps full int64 and sub-tick average precision without floating-point rounding", () => {
  expect(decimalStepUnitsToDecimal("9007199254740993.5", "5", "1000")).toBe("45035996273704.9675")
  expect(() => decimalStepUnitsToDecimal("1e6", "5", "1000")).toThrow()
  expect(() => decimalStepUnitsToDecimal("1.5", "5", "3")).toThrow()
})
it.each(["count", "cursor", "quantity", "status"])("rejects malformed %s page", (invalid) => {
  const page = {
    count: 1,
    orders: [row],
    nextCursor: null,
    hasMore: false,
    sort: "updatedAt.desc",
    limit: 100,
  }
  const body =
    invalid === "count"
      ? { ...page, count: 2 }
      : invalid === "cursor"
        ? { ...page, hasMore: true }
        : invalid === "quantity"
          ? { ...page, orders: [{ ...row, executedQuantitySteps: "26" }] }
          : { ...page, orders: [{ ...row, status: "ACCEPTED" }] }
  expect(OrderHistoryPageSchema.safeParse(body).success).toBe(false)
})
