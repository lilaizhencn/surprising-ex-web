import { describe, expect, it } from "vitest"
import type { Candle } from "../../types/domain"
import { prepareChartCandles } from "./PriceChart"

describe("prepareChartCandles", () => {
  it("uses the latest update when a period has duplicate timestamps", () => {
    const candle = (time: string, close: number): Candle => ({
      time,
      open: 100,
      high: Math.max(100, close),
      low: Math.min(100, close),
      close,
      volume: 1,
    })

    expect(
      prepareChartCandles([
        candle("2026-09-26T03:05:00.100Z", 101),
        candle("2026-09-26T03:04:00Z", 99),
        candle("2026-09-26T03:05:00.900Z", 102),
      ]).map((row) => row.close),
    ).toEqual([99, 102])
  })

  it("keeps no-trade periods continuous with zero volume", () => {
    const rows = prepareChartCandles(
      [{ time: "2026-09-26T03:04:00Z", open: 100, high: 102, low: 99, close: 101, volume: 3 }],
      "1m",
      Date.parse("2026-09-26T03:06:30Z"),
    )
    expect(rows.map((row) => [row.time, row.close, row.volume])).toEqual([
      ["2026-09-26T03:04:00Z", 101, 3],
      ["2026-09-26T03:05:00.000Z", 101, 0],
      ["2026-09-26T03:06:00.000Z", 101, 0],
    ])
  })
  it("uses five-minute buckets without assigning volume to missing trades", () => {
    const rows = prepareChartCandles(
      [{ time: "2026-09-26T03:00:00Z", open: 100, high: 102, low: 99, close: 101, volume: 3 }],
      "5m",
      Date.parse("2026-09-26T03:11:30Z"),
    )
    expect(rows.map((bar) => [bar.time, bar.volume])).toEqual([
      ["2026-09-26T03:00:00Z", 3],
      ["2026-09-26T03:05:00.000Z", 0],
      ["2026-09-26T03:10:00.000Z", 0],
    ])
  })
})
