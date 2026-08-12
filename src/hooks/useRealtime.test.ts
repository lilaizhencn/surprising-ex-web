import { describe, expect, it } from "vitest"
import { isAuthenticatedMessage } from "./useRealtime"

describe("realtime authentication acknowledgements", () => {
  it("accepts the backend op field and the legacy type field", () => {
    expect(isAuthenticatedMessage({ op: "authenticated" })).toBe(true)
    expect(isAuthenticatedMessage({ type: "authenticated" })).toBe(true)
    expect(isAuthenticatedMessage({ op: "subscribed" })).toBe(false)
  })
})
