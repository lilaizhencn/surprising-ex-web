import { describe, expect, it } from "vitest"
import type { ApiOrderBook } from "./api/types"
import type { WsEnvelope } from "./realtime"
import { applyDepthEvent } from "./realtimeDepth"

const level = (price: number | string, quantity: number | string) => ({
  priceTicks: String(price),
  quantitySteps: String(quantity),
})
function event(data: ApiOrderBook): WsEnvelope {
  return {
    op: "event",
    productLine: "LINEAR_PERPETUAL",
    instrumentId: "BTC-USDT",
    channel: "depth",
    data,
  }
}
const snapshot = (sequence = "10") =>
  event({
    updateType: "SNAPSHOT",
    sequence,
    bids: [level(100, 5)],
    asks: [level(101, 6)],
  })
const book = (value: WsEnvelope | null) => value?.data as ApiOrderBook

describe("depth materialization before rendering", () => {
  it("keeps the latest complete book through a burst without depending on render delivery", () => {
    const initial = applyDepthEvent(snapshot())
    let current = initial
    // A suspended renderer can skip every intermediate publication, including the snapshot.
    for (let i = 11; i <= 10010; i++) {
      current = applyDepthEvent(
        event({
          updateType: "DELTA",
          sequence: String(i),
          previousSequence: String(i - 1),
          bids: [level(100, i)],
          asks: [],
        }),
        current ?? undefined,
      )
    }
    expect(book(current)).toMatchObject({
      updateType: "SNAPSHOT",
      sequence: "10010",
      bids: [level(100, 10010)],
      asks: [level(101, 6)],
    })
    expect(book(initial).bids).toEqual([level(100, 5)])
  })
  it("requires recovery on a gap and accepts a replacement snapshot with a lower sequence", () => {
    const old = applyDepthEvent(snapshot())
    expect(
      applyDepthEvent(
        event({ updateType: "DELTA", sequence: "12", previousSequence: "11" }),
        old ?? undefined,
      ),
    ).toBeNull()
    const recovered = applyDepthEvent(snapshot("2"), old ?? undefined)
    expect(
      book(
        applyDepthEvent(
          event({
            updateType: "DELTA",
            sequence: "3",
            previousSequence: "2",
            asks: [level(101, 9)],
          }),
          recovered ?? undefined,
        ),
      ).asks,
    ).toEqual([level(101, 9)])
  })
  it("compares exact sequences and prices above the JavaScript integer range", () => {
    const first = applyDepthEvent(
      event({
        updateType: "SNAPSHOT",
        sequence: "90071992547409930",
        bids: [level("90071992547409931", 2)],
      }),
    )
    const next = applyDepthEvent(
      event({
        updateType: "DELTA",
        sequence: "90071992547409931",
        previousSequence: "90071992547409930",
        bids: [level("90071992547409931", 0), level("90071992547409932", 3)],
      }),
      first ?? undefined,
    )
    expect(book(next).bids).toEqual([level("90071992547409932", 3)])
    expect(applyDepthEvent(snapshot(), first ?? undefined)).not.toBeNull()
  })
  it("ignores repeated deltas, replaces empty books and rejects cross-market or malformed data", () => {
    const first = applyDepthEvent(snapshot())
    expect(
      applyDepthEvent(
        event({ updateType: "DELTA", sequence: "10", previousSequence: "9" }),
        first ?? undefined,
      ),
    ).toBe(first)
    expect(
      book(
        applyDepthEvent(
          event({ updateType: "SNAPSHOT", sequence: "11", bids: [], asks: [] }),
          first ?? undefined,
        ),
      ).bids,
    ).toEqual([])
    expect(
      applyDepthEvent(
        {
          ...event({ updateType: "DELTA", sequence: "11", previousSequence: "10" }),
          productLine: "SPOT",
        },
        first ?? undefined,
      ),
    ).toBeNull()
    expect(
      applyDepthEvent(event({ updateType: "SNAPSHOT", sequence: "12", bids: [level(100, -1)] })),
    ).toBeNull()
    expect(
      applyDepthEvent(event({ updateType: "DELTA", sequence: "12", previousSequence: "11" })),
    ).toBeNull()
  })
  it("bounds each side to the subscribed 50 levels and applies deletions before checking size", () => {
    const first = applyDepthEvent(
      event({
        updateType: "SNAPSHOT",
        sequence: "1",
        bids: Array.from({ length: 50 }, (_, i) => level(100 + i, 1)),
      }),
    )
    const replace = event({
      updateType: "DELTA",
      sequence: "2",
      previousSequence: "1",
      bids: [level(200, 2), level(100, 0)],
    })
    expect(book(applyDepthEvent(replace, first ?? undefined)).bids).toHaveLength(50)
    expect(
      applyDepthEvent(
        event({ updateType: "DELTA", sequence: "2", previousSequence: "1", bids: [level(200, 2)] }),
        first ?? undefined,
      ),
    ).toBeNull()
  })
})
