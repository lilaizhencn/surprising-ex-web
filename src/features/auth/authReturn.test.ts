import { describe, expect, it } from "vitest"
import { authDestination, authReturnPath } from "./authReturn"

describe("authentication return from C2C", () => {
  it("returns to the market or inbox and preserves the destination through email verification", () => {
    expect(authReturnPath("?redirect=%2Fc2c")).toBe("/c2c")
    expect(authDestination(false, "?redirect=%2Fc2c%2Fmessages")).toBe("/c2c/messages")
    expect(authDestination(true, "?redirect=%2Fc2c%2Fmessages")).toBe(
      "/auth/verify-email?redirect=%2Fc2c%2Fmessages",
    )
    expect(authDestination(true, "")).toBe("/auth/verify-email")
  })
  it("keeps unknown, protocol-relative, external and authentication targets at the normal destination", () => {
    for (const target of [
      "https://example.com/c2c",
      "//example.com/c2c",
      "/auth/login",
      "/api/v1/c2c",
      "/c2c#external",
      "/c2c/../auth/login",
      "/c2c?next=outside",
      "\\\\example.com",
    ])
      expect(authReturnPath("?redirect=" + encodeURIComponent(target))).toBe("/assets")
  })
})
