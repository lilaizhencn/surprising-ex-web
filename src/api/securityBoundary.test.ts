import { describe, expect, it } from "vitest"
import {
  CreatedApiKeySchema,
  DeviceStatusSchema,
  MfaStatusSchema,
  SecurityApiKeyListSchema,
  SecuritySceneListSchema,
} from "./types"

const key = {
  apiKey: "sx_" + "a".repeat(32),
  label: "Synthetic read key",
  permissions: "READ",
  status: "ACTIVE",
  ipAllowlist: ["192.0.2.1/32"],
  createdAt: "2026-10-26T10:00:00Z",
  lastUsedAt: null,
  revokedAt: null,
}
describe("security management response boundaries", () => {
  it("requires a complete one-time key creation receipt", () => {
    expect(
      CreatedApiKeySchema.parse({ apiKey: key, secret: "synthetic-secret" }).apiKey.apiKey,
    ).toBe(key.apiKey)
    for (const value of [
      {},
      { apiKey: key },
      { apiKey: key, secret: "" },
      { apiKey: key.apiKey, secret: "secret" },
    ])
      expect(CreatedApiKeySchema.safeParse(value).success).toBe(false)
  })
  it("rejects invalid or duplicate key permissions and identities", () => {
    for (const value of [
      [key, key],
      [{ ...key, permissions: "READ,ADMIN" }],
      [{ ...key, permissions: "TRADE" }],
      [{ ...key, status: "UNKNOWN" }],
    ])
      expect(SecurityApiKeyListSchema.safeParse(value).success).toBe(false)
  })
  it("does not guess missing MFA requirements or permit contradictory mandatory scenes", () => {
    expect(MfaStatusSchema.safeParse({}).success).toBe(false)
    expect(MfaStatusSchema.parse({ enabled: false }).enabled).toBe(false)
    for (const value of [
      [{ sceneCode: "WITHDRAWAL", label: "Withdraw", enabled: false }],
      [{ sceneCode: "UNKNOWN", label: "Unknown", enabled: true }],
    ])
      expect(SecuritySceneListSchema.safeParse(value).success).toBe(false)
  })
  it("retains exact session IDs for device management", () => {
    const device = {
      sessionId: "9007199254740993",
      deviceId: null,
      userAgent: null,
      ipAddress: null,
      lastSeen: "2026-10-26T10:00:00Z",
      active: true,
      current: false,
      blocked: false,
    }
    expect(DeviceStatusSchema.parse(device).sessionId).toBe("9007199254740993")
    expect(DeviceStatusSchema.safeParse({ ...device, sessionId: 9007199254740992 }).success).toBe(
      false,
    )
  })
})
