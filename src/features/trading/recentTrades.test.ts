import { describe, expect, it } from "vitest"
import { mergeRecentTrades } from "./recentTrades"

describe("realtime and REST trade tape", () => {
  it("deduplicates overlapping fills and orders exact core IDs across sequence domains", () => {
    const old = "SPOT:9007199254740993:1:100:0"
    const current = "SPOT:9007199254740994:1:101:0"
    const nextFill = "SPOT:9007199254740994:1:101:1"
    const rows = mergeRecentTrades(
      [
        { tradeId: old, sequence: 99999 },
        { tradeId: current, sequence: 100000, quantity: "0.2" },
      ],
      [
        { tradeId: nextFill, coreSequence: "1" },
        { tradeId: current, coreSequence: "1" },
      ],
    )
    expect(rows.map((r) => r["tradeId"])).toEqual([nextFill, current, old])
    expect(rows[1]?.["quantity"]).toBe("0.2")
    expect(mergeRecentTrades(rows, [{ tradeId: nextFill }])).toHaveLength(3)
  })

  it("bounds the tape to the latest 50 fills", () => {
    const rows = mergeRecentTrades(
      [],
      Array.from({ length: 70 }, (_, i) => ({ tradeId: `OPTION:100:1:1:${i}` })),
    )
    expect(rows).toHaveLength(50)
    expect(rows[0]?.["tradeId"]).toBe("OPTION:100:1:1:69")
    expect(rows[49]?.["tradeId"]).toBe("OPTION:100:1:1:20")
  })
})
