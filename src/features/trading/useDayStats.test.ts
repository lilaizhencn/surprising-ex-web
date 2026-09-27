import { expect, it } from "vitest"
import type { ApiCandle } from "../../api/types"
import { mergeDayWindow, summarizeDayWindow } from "./useDayStats"

const now = Date.parse("2026-09-27T12:30:45Z")
function candle(
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1,
  sequence = 1,
): ApiCandle {
  return {
    openTime: time,
    openPrice: open,
    highPrice: high,
    lowPrice: low,
    closePrice: close,
    baseVolume: volume,
    quoteVolume: volume * 100,
    lastSequence: String(sequence),
  }
}

it("calculates the day independently of chart periods and retains the current minute", () => {
  const rows = [
    candle("2026-09-26T12:30:00Z", 100, 110, 90, 105),
    candle("2026-09-27T12:30:00Z", 105, 115, 101, 112, 3, 20),
  ]
  expect(summarizeDayWindow(rows, now)).toEqual({
    open: 100,
    high: 115,
    low: 90,
    close: 112,
    volume: 4,
    quoteVolume: 400,
    change: 12,
  })
})
it("expires old extrema and volume when the minute rolls even without a trade", () => {
  const rows = [
    candle("2026-09-26T12:30:00Z", 100, 900, 1, 100, 8),
    candle("2026-09-27T12:30:00Z", 100, 110, 95, 105, 2, 20),
  ]
  expect(summarizeDayWindow(rows, now + 60_000)).toEqual({
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 2,
    quoteVolume: 200,
    change: 5,
  })
  expect(summarizeDayWindow(rows, now + 86_460_000)).toBeNull()
})
it("replaces absolute minute volume and ignores stale history after newer live data", () => {
  const old = candle("2026-09-27T12:30:00Z", 100, 101, 100, 101, 2, 10)
  const live = candle("2026-09-27T12:30:00.000Z", 100, 103, 99, 103, 5, 12)
  const merged = mergeDayWindow([live], [old, live, live], now)
  expect(merged).toHaveLength(1)
  expect(summarizeDayWindow(merged, now)).toMatchObject({
    high: 103,
    low: 99,
    close: 103,
    volume: 5,
    quoteVolume: 500,
  })
})
it("excludes expired and future buckets and sorts unordered snapshots", () => {
  const old = candle("2026-09-26T12:29:00Z", 1, 1000, 1, 1)
  const future = candle("2026-09-27T12:31:00Z", 1, 1000, 1, 1)
  const first = candle("2026-09-27T11:00:00Z", 10, 12, 9, 11)
  const last = candle("2026-09-27T12:30:00Z", 11, 13, 10, 12)
  expect(mergeDayWindow([], [last, old, first, future], now)).toEqual([first, last])
  expect(summarizeDayWindow([], now)).toBeNull()
})

it("bounds day statistics after a long session instead of retaining every historical bucket", () => {
  const end = Math.floor(now / 60_000) * 60_000
  const history = Array.from({ length: 10_000 }, (_, i) =>
    candle(new Date(end - i * 60_000).toISOString(), 100, 101, 99, 100),
  )
  const retained = mergeDayWindow([], history, now)
  expect(retained).toHaveLength(1441)
  expect(mergeDayWindow(retained, [retained.at(-1)!], now)).toHaveLength(1441)
  expect(mergeDayWindow(retained, [], now + 2 * 86_400_000)).toHaveLength(0)
})
