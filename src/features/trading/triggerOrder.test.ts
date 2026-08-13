import { describe, expect, it } from "vitest"
import { closeSideForPosition, selectTriggerPosition } from "./triggerOrder"

describe("trigger position targeting", () => {
  it("keeps hedge side, margin mode, and close direction bound to one position", () => {
    const positions = [
      {
        symbol: "ETH-USDT",
        marginMode: "CROSS",
        positionSide: "LONG",
        signedQuantitySteps: "9",
      },
      {
        symbol: "BTC-USDT",
        marginMode: "CROSS",
        positionSide: "LONG",
        signedQuantitySteps: "12",
      },
      {
        symbol: "BTC-USDT",
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
