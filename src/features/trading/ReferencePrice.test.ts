import { describe, expect, it } from "vitest"
import { referencePriceFresh } from "./ReferencePrice"

describe("reference price display expiry", () => {
  const now = Date.parse("2026-10-09T02:00:00Z")
  it("expires each price channel even when other channels or heartbeats keep arriving", () => {
    const eventTime = "2026-10-09T02:00:00Z"
    expect(referencePriceFresh(eventTime, now + 4_999)).toBe(true)
    expect(referencePriceFresh(eventTime, now + 5_001)).toBe(false)
    expect(referencePriceFresh("2026-10-09T02:00:06Z", now + 6_000)).toBe(true)
  })
  it("does not present missing, malformed or future-dated inputs as live prices", () => {
    for (const eventTime of [null, undefined, "", "invalid", "2026-10-09T02:00:02Z"])
      expect(referencePriceFresh(eventTime, now)).toBe(false)
  })
})
