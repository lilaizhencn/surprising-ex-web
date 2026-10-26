import { expect, it } from "vitest"
import { mapBalance } from "../../api/mappers"
import { aggregateAssets, allocationSegments, assetAmount, assetUsd } from "./assetPortfolio"

it("retains integer precision and signed balances through account aggregation", () => {
  const first = mapBalance(
    { asset: "USDT", availableUnits: "9007199254740993", lockedUnits: "1" },
    { USDT: "100000000" },
  )
  const second = mapBalance(
    { asset: "USDT", availableUnits: "-2", lockedUnits: "0" },
    { USDT: "100000000" },
  )
  expect(assetAmount(first, "available")).toBe("90,071,992.54740993")
  expect(assetAmount(first, "total")).toBe("90,071,992.54740994")
  const [combined] = aggregateAssets([first, second])
  expect(combined?.availableUnits).toBe("9007199254740991")
  expect(combined && assetAmount(combined, "total")).toBe("90,071,992.54740992")
  expect(assetAmount(second, "available")).toBe("-0.00000002")
})

it("keeps unknown equity and tiny nonzero estimates visible without a misleading allocation", () => {
  const balance = { asset: "USDT", available: 1, locked: 0, estimatedUsd: null }
  expect(aggregateAssets([balance, { ...balance, estimatedUsd: 1 }])[0]?.estimatedUsd).toBeNull()
  expect(allocationSegments([balance])).toEqual([])
  expect(allocationSegments([{ ...balance, estimatedUsd: -1 }])).toEqual([])
  expect(assetUsd(0.000001)).not.toBe("$0.00")
  expect(assetUsd(null)).toBe("—")
})

it("groups overflow assets without losing any allocation", () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({
    asset: String(index),
    available: 1,
    locked: 0,
    estimatedUsd: 1,
  }))
  const segments = allocationSegments(rows)
  expect(segments).toHaveLength(6)
  expect(segments.at(-1)?.asset).toBe("Other")
  expect(segments.reduce((sum, segment) => sum + segment.percent, 0)).toBeCloseTo(100)
})
