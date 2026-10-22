import { afterEach, describe, expect, it, vi } from "vitest"
import { storageKeys } from "../lib/config"
import { loadSession, saveSession } from "./session"

afterEach(() => {
  saveSession(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function storage() {
  const values = new Map<string, string>()
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    dispatchEvent: vi.fn(),
  })
  return values
}

describe("session storage boundary", () => {
  it("retains in-memory login and logout if storage is denied", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          throw new DOMException("denied", "SecurityError")
        },
        setItem() {
          throw new DOMException("denied", "SecurityError")
        },
        removeItem() {
          throw new DOMException("denied", "SecurityError")
        },
      },
      dispatchEvent: vi.fn(),
    })
    expect(loadSession()).toBeNull()
    saveSession({ accessToken: "current", user: { userId: "1" } })
    expect(loadSession()?.accessToken).toBe("current")
    saveSession(null)
    expect(loadSession()).toBeNull()
  })
  it.each([
    {},
    { accessToken: "x", user: { userId: "1" }, expiresAt: "invalid" },
    { accessToken: "x", user: { userId: 9007199254740992 } },
  ])("rejects malformed stored identity %j", (value) => {
    const values = storage()
    values.set(storageKeys.session, JSON.stringify(value))
    expect(loadSession()).toBeNull()
    expect(values.has(storageKeys.session)).toBe(false)
  })
  it("rejects an oversized session identity before BigInt conversion", () => {
    storage()
    const convert = vi.spyOn(globalThis, "BigInt")
    expect(() =>
      saveSession({ accessToken: "x", user: { userId: "9".repeat(1024 * 1024) } }),
    ).toThrow("invalid session")
    expect(convert).not.toHaveBeenCalled()
    convert.mockRestore()
  })
  it("rechecks cached refresh expiry as time advances", () => {
    storage()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    saveSession({
      accessToken: "current",
      refreshToken: "rotate",
      user: { userId: "1" },
      refreshTokenExpiresAt: "2026-01-01T00:00:01Z",
    })
    expect(loadSession()).not.toBeNull()
    vi.advanceTimersByTime(1001)
    expect(loadSession()).toBeNull()
  })
})
