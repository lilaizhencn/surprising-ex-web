import { describe, expect, it } from "vitest"
import { mapCandle } from "../../api/mappers"
import { CandleSchema } from "../../api/types"
import { prepareChartCandles } from "../../components/trading/PriceChart"
import type { Candle } from "../../types/domain"
import { mergeCandleSnapshot } from "./TradePage"

const snapshot: Candle = {
  time: "2026-09-26T13:30:00.000Z",
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 10.25,
  updatedAt: "2026-09-26T13:30:10Z",
}

it("replaces an inflated local volume with the authoritative aggregate", () => {
  const live = { ...snapshot, close: 103, high: 103, volume: 110.25 }
  expect(mergeCandleSnapshot(snapshot, live)).toEqual(snapshot)
})

it("does not add a cumulative snapshot twice", () => {
  const first = mergeCandleSnapshot(snapshot, undefined)
  expect(mergeCandleSnapshot(snapshot, first)).toEqual(snapshot)
})

it("keeps a newer WebSocket aggregate when an older history request completes", () => {
  const newer = { ...snapshot, volume: 11, updatedAt: "2026-09-26T13:30:12Z" }
  expect(mergeCandleSnapshot(snapshot, newer)).toEqual(newer)
  expect(mergeCandleSnapshot(newer, snapshot)).toEqual(newer)
})

it("compares timestamps as instants rather than differently formatted strings", () => {
  const newer = { ...snapshot, volume: 11, updatedAt: "2026-09-26T13:30:10.001Z" }
  expect(mergeCandleSnapshot(snapshot, newer)).toEqual(newer)
})

const apiSnapshot = {
  openTime: snapshot.time,
  openPrice: 100,
  highPrice: 102,
  lowPrice: 99,
  closePrice: 101,
  baseVolume: 10.25,
}

describe.each(["1m", "5m", "15m", "1h", "4h", "1d"])("%s candle snapshots", (period) => {
  it("shows the same base volume from realtime updates and refreshed history", () => {
    const live = mapCandle(
      CandleSchema.parse({ ...apiSnapshot, period, eventTime: snapshot.updatedAt }),
    )
    const refreshed = mapCandle(
      CandleSchema.parse({ ...apiSnapshot, period, updatedAt: snapshot.updatedAt }),
    )
    expect(live).toEqual(refreshed)
    expect(mergeCandleSnapshot(refreshed, live).volume).toBe(10.25)
    expect(prepareChartCandles([live]).at(-1)?.volume).toBe(10.25)
  })
})

it("uses history updatedAt and realtime eventTime as the same aggregation watermark", () => {
  const live = mapCandle({ ...apiSnapshot, baseVolume: 11, eventTime: "2026-09-26T13:30:12Z" })
  const history = mapCandle({ ...apiSnapshot, updatedAt: "2026-09-26T13:30:10Z" })
  expect(mergeCandleSnapshot(history, live)).toEqual(live)
})

it("normalizes historical timestamps at the API boundary", () => {
  expect(mapCandle({ ...apiSnapshot, openTime: "2026-09-26T13:30:00Z" }).time).toBe(snapshot.time)
})
