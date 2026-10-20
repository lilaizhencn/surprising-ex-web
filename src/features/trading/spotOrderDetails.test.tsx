import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import type { Market } from "../../types/domain"
import { price, TradingAccountTables } from "./TradingAccountTables"

const market = {
  instrumentId: "42",
  symbol: "BTC-USDT",
  productLine: "SPOT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  settleAsset: "USDT",
  priceTickUnits: "5",
  quantityStepUnits: "200000",
  notionalMultiplierUnits: "1",
  pricePrecision: 3,
} as Market
const row = {
  orderId: "9007199254740993",
  instrumentId: "42",
  status: "OPEN",
  side: "BUY",
  orderType: "LIMIT",
  timeInForce: "GTC",
  priceTicks: "12345",
  averagePriceTicks: "12344.5",
  executedValueTicks: "123445",
  quantitySteps: "25",
  executedQuantitySteps: "10",
  remainingQuantitySteps: "15",
  cumulativeFeeUnits: "-1",
}
const scales = { BTC: "1000000", USDT: "1000" }
const render = (order: typeof row = row, m: Market = market) =>
  renderToStaticMarkup(
    <TradingAccountTables
      market={m}
      markets={[m]}
      productLine="SPOT"
      assetScales={scales}
      positions={[]}
      orders={[order]}
      triggers={[]}
      account={undefined}
      events={[]}
      loggedIn
      userId="1"
      onNotice={() => {}}
      commandPending
    />,
  )
it("keeps spot integer prices and fractional average ticks exact", () => {
  expect(price("12344.5", market, scales)).toBe("61.7225")
  expect(price("9007199254740993.5", market, scales)).toBe("45035996273704.9675")
})
it("shows committed spot filled value, limit value and quote-asset semantics", () => {
  const html = render()
  expect(html).not.toContain("Side / Margin")
  expect(html).not.toContain("Reduce only / Post only")
  for (const value of [
    "123.445 USDT",
    "308.625 USDT",
    "61.7225",
    "-0.001 USDT",
    "Quote asset",
    "9007199254740993",
  ])
    expect(html).toContain(value)
})
it("market orders show committed executed value without inventing a limit value", () => {
  const html = render({ ...row, orderType: "MARKET", priceTicks: "0" })
  expect(html).toContain("123.445 USDT")
  expect(html).not.toContain("308.625 USDT")
})
it("does not calculate an executed value from a rounded average or absent contract multiplier", () => {
  const html = render({ ...row, executedValueTicks: "" })
  expect(html).not.toContain("123.445 USDT")
  const missing = render(row, { ...market, notionalMultiplierUnits: undefined } as Market)
  expect(missing).not.toContain("123.445 USDT")
  expect(missing).not.toContain("308.625 USDT")
})
