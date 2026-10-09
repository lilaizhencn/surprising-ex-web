import { describe, expect, it } from "vitest"
import type { Candle } from "../../types/domain"
import { prepareChartCandles, zoomPriceRange } from "./PriceChart"

describe("zoomPriceRange", () => {
  it("zooms a BTC price viewport around its center without changing candle data", () => {
    expect(zoomPriceRange({ from: 80_000, to: 82_000 }, 0.5, 0.1)).toEqual({
      from: 80_500,
      to: 81_500,
    })
    expect(zoomPriceRange({ from: 80_000, to: 82_000 }, 2, 0.1)).toEqual({
      from: 79_000,
      to: 83_000,
    })
  })

  it("keeps at least two instrument ticks visible for small prices", () => {
    const range = zoomPriceRange({ from: 0.00003, to: 0.000031 }, 0.001, 0.00000001)
    expect(range).not.toBeNull()
    expect((range?.to ?? 0) - (range?.from ?? 0)).toBeCloseTo(0.00000002, 12)
  })

  it("keeps zooming out near zero in a positive finite range", () => {
    expect(zoomPriceRange({ from: 1, to: 3 }, 4, 0.1)).toEqual({ from: 0, to: 8 })
    expect(zoomPriceRange({ from: 1, to: 3 }, Number.MAX_VALUE, 0.1)).toBeNull()
  })

  it("ignores invalid or unavailable price ranges", () => {
    expect(zoomPriceRange({ from: 2, to: 1 }, 0.5, 0.1)).toBeNull()
    expect(zoomPriceRange({ from: 1, to: Number.NaN }, 0.5, 0.1)).toBeNull()
    expect(zoomPriceRange({ from: 1, to: 2 }, 0, 0.1)).toBeNull()
    expect(zoomPriceRange({ from: 1, to: 2 }, 0.5, 0)).toBeNull()
  })
})

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
