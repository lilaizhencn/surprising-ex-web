import { describe, expect, it } from "vitest"
import {
  closeSideForPosition,
  positionPercentageSteps,
  positionQuantityPercentage,
  selectTriggerPosition,
} from "./triggerOrder"

describe("TP/SL percentage quantity", () => {
  it("rounds long and short positions down to whole contracts", () => {
    expect(positionPercentageSteps(7n, 50)).toBe(3n)
    expect(positionPercentageSteps(-7n, 50)).toBe(3n)
    expect(positionPercentageSteps(100n, 29)).toBe(29n)
  })

  it("never rounds a sub-contract selection up or loses precision for large positions", () => {
    expect(positionPercentageSteps(1n, 99)).toBe(0n)
    expect(positionPercentageSteps(7n, 0)).toBe(0n)
    expect(positionPercentageSteps(-7n, 100)).toBe(7n)
    expect(positionPercentageSteps(9007199254740993n, 100)).toBe(9007199254740993n)
    expect(positionPercentageSteps(9007199254740993n, 50)).toBe(4503599627370496n)
  })

  it("rejects percentages outside the slider range", () => {
    for (const percentage of [-1, 101, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(positionPercentageSteps(100n, percentage)).toBe(0n)
    }
  })
})

describe("trigger position targeting", () => {
  it("keeps hedge side, margin mode, and close direction bound to one position", () => {
    const positions = [
      {
        instrumentId: "ETH-USDT",
        marginMode: "CROSS",
        positionSide: "LONG",
        signedQuantitySteps: "9",
      },
      {
        instrumentId: "BTC-USDT",
        marginMode: "CROSS",
        positionSide: "LONG",
        signedQuantitySteps: "12",
      },
      {
        instrumentId: "BTC-USDT",
        marginMode: "CROSS",
        positionSide: "SHORT",
        signedQuantitySteps: "-7",
      },
    ] satisfies readonly Record<string, unknown>[]

    const short = selectTriggerPosition(positions, "BTC-USDT", "CROSS", "HEDGE", "SHORT")
    expect(short).not.toBeNull()
    expect(short && closeSideForPosition(short)).toBe("BUY")
    expect(short ? Reflect.get(short, "signedQuantitySteps") : undefined).toBe("-7")

    const long = selectTriggerPosition(positions, "BTC-USDT", "CROSS", "HEDGE", "LONG")
    expect(long && closeSideForPosition(long)).toBe("SELL")
    expect(long ? Reflect.get(long, "signedQuantitySteps") : undefined).toBe("12")
  })
})

describe("manual close quantity percentage", () => {
  it("tracks both directions and clamps invalid or oversized quantities", () => {
    expect(positionQuantityPercentage(180n, 45n)).toBe(25)
    expect(positionQuantityPercentage(-180n, 90n)).toBe(50)
    expect(positionQuantityPercentage(7n, 3n)).toBe(42.85)
    expect(positionQuantityPercentage(7n, 9n)).toBe(100)
    expect(positionQuantityPercentage(7n, -1n)).toBe(0)
    expect(positionQuantityPercentage(0n, 1n)).toBe(0)
    expect(positionQuantityPercentage(900719925474099300n, 450359962737049650n)).toBe(50)
  })
})
