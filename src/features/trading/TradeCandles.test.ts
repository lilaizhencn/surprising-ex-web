import { expect, it } from "vitest"
import { mapCandle } from "../../api/mappers"
import { prepareChartCandles } from "../../components/trading/PriceChart"
import { applyTradeToCandles } from "./TradePage"

it("updates the same candle when history omits fractional seconds", () => {
  const history = [
    { time: "2026-09-26T13:30:00Z", open: 100, high: 102, low: 99, close: 101, volume: 3 },
  ]
  const next = applyTradeToCandles(history, Date.parse("2026-09-26T13:37:00Z"), 900000, 103, 0.25)
  expect(next).toEqual([
    { time: "2026-09-26T13:30:00.000Z", open: 100, high: 103, low: 99, close: 103, volume: 3.25 },
  ])
  expect(prepareChartCandles(next).at(-1)?.close).toBe(103)
})

it("creates the next candle with the new trade and preserves the closed candle", () => {
  const history = [
    { time: "2026-09-26T13:30:00.000Z", open: 100, high: 103, low: 99, close: 103, volume: 3.25 },
  ]
  const next = applyTradeToCandles(history, Date.parse("2026-09-26T13:45:00Z"), 900000, 104, 0.5)
  expect(next).toHaveLength(2)
  expect(next[0]).toEqual(history[0])
  expect(next[1]).toEqual({
    time: "2026-09-26T13:45:00.000Z",
    open: 104,
    high: 104,
    low: 104,
    close: 104,
    volume: 0.5,
  })
})

it("normalizes historical timestamps at the API boundary", () => {
  expect(
    mapCandle({
      openTime: "2026-09-26T13:30:00Z",
      openPrice: 100,
      highPrice: 100,
      lowPrice: 100,
      closePrice: 100,
      baseVolume: 1,
    }).time,
  ).toBe("2026-09-26T13:30:00.000Z")
})
