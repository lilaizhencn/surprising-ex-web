import { describe, expect, it } from "vitest"
import { percentPpm } from "./affiliate"

describe("commission share input", () => {
  it("preserves percentage precision at the ppm boundary", () => {
    expect(percentPpm("0")).toBe(0)
    expect(percentPpm("20")).toBe(200000)
    expect(percentPpm("60.0001")).toBe(600001)
    expect(percentPpm("99.9999")).toBe(999999)
    expect(percentPpm("100.0000")).toBe(1000000)
  })
  it("rejects invalid, excessive and ambiguous financial input", () => {
    for (const text of ["-1", "100.0001", "1000", "1e2", "NaN", "20.00001", "", "20%"])
      expect(() => percentPpm(text)).toThrow()
  })
})
