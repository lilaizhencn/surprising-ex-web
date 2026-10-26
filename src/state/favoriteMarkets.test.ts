import { describe, expect, it } from "vitest"
import { parseFavoriteMarkets } from "./favoriteMarkets"

describe("saved market favorites", () => {
  it("preserves product scope and large integer identities, removing duplicates", () => {
    expect(
      parseFavoriteMarkets(
        JSON.stringify([
          "SPOT:9007199254740993",
          "OPTION:9223372036854775807",
          "SPOT:9007199254740993",
        ]),
      ),
    ).toEqual(["SPOT:9007199254740993", "OPTION:9223372036854775807"])
  })
  it("ignores invalid entries without dropping other valid favorites", () => {
    expect(
      parseFavoriteMarkets(
        JSON.stringify([
          "SPOT:0",
          "SPOT:1.5",
          "SPOT:9223372036854775808",
          "UNKNOWN:1",
          3,
          null,
          "LINEAR_PERPETUAL:1",
        ]),
      ),
    ).toEqual(["LINEAR_PERPETUAL:1"])
  })
  it("recovers from malformed, non-list and oversized preferences", () => {
    for (const input of [null, "{", "{}", "null", "x".repeat(512_001)])
      expect(parseFavoriteMarkets(input)).toEqual([])
  })
})
