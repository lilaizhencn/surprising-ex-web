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
})
