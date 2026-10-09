import ky, { type Options } from "ky"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { saveSession } from "../state/session"
import { ApiError, quoteUnsafeJsonIntegers, request, requestBlob } from "./client"

vi.mock("ky", () => ({ default: vi.fn() }))

afterEach(() => {
  saveSession(null)
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

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

describe("public request failures", () => {
  it("maps business rejection and retains structured diagnostics for JSON and downloads", async () => {
    browserStorage()
    const payload = {
      code: "LEVERAGE_UPDATE_BLOCKED",
      message: "INVALID_COMMAND: Aeron order command rejected",
    }
    vi.mocked(ky).mockImplementation((async () => json(payload, 409)) as unknown as typeof ky)
    for (const operation of [
      () => request("/private", z.unknown()),
      () => requestBlob("/download"),
    ]) {
      try {
        await operation()
        throw Error("Expected rejection")
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).message).toContain("Close positions")
        expect((error as ApiError).payload).toEqual(payload)
      }
    }
  })

  it("treats a lost mutation response as unknown and never retries it automatically", async () => {
    browserStorage()
    vi.mocked(ky).mockRejectedValue(new Error("Aeron internal timeout"))
    await expect(request("/private", z.unknown(), { method: "POST", body: {} })).rejects.toThrow(
      "result is not yet confirmed",
    )
    expect(vi.mocked(ky)).toHaveBeenCalledTimes(1)
  })

  it("preserves cancellation so retired requests do not show an error", async () => {
    browserStorage()
    const error = new Error("cancelled")
    error.name = "AbortError"
    vi.mocked(ky).mockRejectedValue(error)
    await expect(request("/private", z.unknown())).rejects.toBe(error)
  })
})

describe("session refresh", () => {
  it("loads public instruments without refreshing an expired session or sending credentials", async () => {
    browserStorage()
    saveSession(session("old", "2000-01-01T00:00:00Z"))
    vi.mocked(ky).mockImplementation((async (_url: unknown, options?: Options) => {
      expect(options?.method).toBe("GET")
      expect(new Headers(options?.headers as HeadersInit).has("Authorization")).toBe(false)
      expect(new Headers(options?.headers as HeadersInit).has("X-User-Id")).toBe(false)
      return json({ ok: true }) as never
    }) as unknown as typeof ky)
    await expect(
      request(
        "/api/v1/gateway/instrument/list?productLine=LINEAR_PERPETUAL",
        z.object({ ok: z.boolean() }),
      ),
    ).resolves.toEqual({ ok: true })
    expect(vi.mocked(ky)).toHaveBeenCalledTimes(1)
  })

  it("refreshes an expired session before making a private request", async () => {
    browserStorage()
    saveSession(session("old", "2000-01-01T00:00:00Z"))
    vi.mocked(ky).mockImplementation((async (_url: unknown, options?: Options) => {
      if (options?.method === "POST") return json(session("new", "2999-01-01T00:00:00Z")) as never
      expect(new Headers(options?.headers as HeadersInit).get("Authorization")).toBe("Bearer new")
      return json({ ok: true }) as never
    }) as unknown as typeof ky)

    await expect(request("/private", z.object({ ok: z.boolean() }))).resolves.toEqual({ ok: true })
    expect(vi.mocked(ky)).toHaveBeenCalledTimes(2)
  })

  it("shares one rotating refresh token across concurrent 401 responses", async () => {
    browserStorage()
    saveSession(session("old", "2999-01-01T00:00:00Z"))
    vi.mocked(ky).mockImplementation((async (_url: unknown, options?: Options) => {
      if (options?.method === "POST") return json(session("new", "2999-01-01T00:00:00Z")) as never
      const token = new Headers(options?.headers as HeadersInit).get("Authorization")
      return json({ ok: token === "Bearer new" }, token === "Bearer old" ? 401 : 200) as never
    }) as unknown as typeof ky)

    await expect(
      Promise.all([
        request("/private/one", z.object({ ok: z.boolean() })),
        request("/private/two", z.object({ ok: z.boolean() })),
      ]),
    ).resolves.toEqual([{ ok: true }, { ok: true }])
    expect(
      vi.mocked(ky).mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1)
  })
})

function session(accessToken: string, accessTokenExpiresAt: string) {
  return {
    accessToken,
    refreshToken: "refresh",
    accessTokenExpiresAt,
    refreshTokenExpiresAt: "2999-01-01T00:00:00Z",
    user: { userId: 1 },
  }
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status })
}

function browserStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    dispatchEvent: () => true,
  })
}
