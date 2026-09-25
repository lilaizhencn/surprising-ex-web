import { describe, expect, it } from "vitest"
import { quoteUnsafeJsonIntegers } from "./client"

describe("gateway JSON integer decoding", () => {
  it("preserves 64-bit order IDs and balance units while keeping safe numbers", () => {
    const raw =
      '{"orderId":1286349972006421045,"balance":-10000000000000000,"count":2,"price":8.5,"label":"id 1286349972006421045"}'
    expect(JSON.parse(quoteUnsafeJsonIntegers(raw))).toEqual({
      orderId: "1286349972006421045",
      balance: "-10000000000000000",
      count: 2,
      price: 8.5,
      label: "id 1286349972006421045",
    })
  })
})
