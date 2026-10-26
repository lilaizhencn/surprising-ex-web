import { describe, expect, it } from "vitest"
import { KycDocumentSchema, KycProfileSchema, KycProviderSchema } from "./types"

describe("identity verification response boundaries", () => {
  it("keeps exact document IDs and accepts the backend review lifecycle", () => {
    expect(
      KycDocumentSchema.parse({ documentId: "9007199254740993", userId: "1" }).documentId,
    ).toBe("9007199254740993")
    for (const status of ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"])
      expect(KycProfileSchema.parse({ userId: 1, status })?.status).toBe(status)
    expect(KycProfileSchema.parse(null)).toBeNull()
    expect(KycProviderSchema.parse({ provider: "SELF", simulationEnabled: false }).provider).toBe(
      "SELF",
    )
  })
  it("rejects malformed states, IDs, expiry dates and unknown provider modes", () => {
    for (const value of [
      {},
      { userId: 1 },
      { userId: 1, status: "UNKNOWN" },
      { userId: 1, status: "VERIFIED", expiresAt: "tomorrow" },
    ])
      expect(KycProfileSchema.safeParse(value).success).toBe(false)
    for (const documentId of [0, -1, 9007199254740992, "9223372036854775808"])
      expect(KycDocumentSchema.safeParse({ documentId, userId: "1" }).success).toBe(false)
    expect(
      KycProviderSchema.safeParse({ provider: "UNKNOWN", simulationEnabled: true }).success,
    ).toBe(false)
    expect(KycProviderSchema.safeParse({ provider: "SELF" }).success).toBe(false)
  })
})
