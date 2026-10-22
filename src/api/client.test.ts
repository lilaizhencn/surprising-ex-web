import ky, { type Options } from "ky"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { loadSession, saveSession, sessionRefreshIssue } from "../state/session"
import {
  ApiError,
  quoteUnsafeJsonIntegers,
  refreshStoredSession,
  request,
  requestBlob,
} from "./client"
import { authApi } from "./endpoints"
import { AuthSessionSchema, BalanceSchema } from "./types"

vi.mock("ky", () => ({ default: vi.fn() }))

afterEach(() => {
  saveSession(null)
  vi.useRealTimers()
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
  it("preserves escapes, numeric keys and adjacent nested tokens when quoting only unsafe integers", () => {
    const label = 'quoted " slash \\ 9007199254740993'
    const raw = `{"9007199254740993":${JSON.stringify(label)},"values":[-9007199254740993,-2,1.25,1e3,{"id":9007199254740993}],"tail":"7"}`
    expect(JSON.parse(quoteUnsafeJsonIntegers(raw))).toEqual({
      "9007199254740993": label,
      values: ["-9007199254740993", -2, 1.25, 1000, { id: "9007199254740993" }],
      tail: "7",
    })
    for (const malformed of [
      '{"id":9007199254740993,}',
      "[1e,9007199254740993]",
      '{"label":"unfinished',
      "[09007199254740993]",
      "[-09007199254740993]",
      "{9007199254740993 : 1}",
    ]) {
      expect(() => JSON.parse(quoteUnsafeJsonIntegers(malformed))).toThrow(SyntaxError)
    }
  })
})

describe("public request failures", () => {
  it("never fetches a private attachment under a different signed-in owner", async () => {
    browserStorage()
    saveSession(session("current", "2999-01-01T00:00:00Z"))
    await expect(
      requestBlob("/api/v1/c2c/attachments/private/content", { expectedUserId: "2" }),
    ).rejects.toThrow("Session changed")
    expect(ky).not.toHaveBeenCalled()
  })
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
  it.each(["verify", "bind", "resend", "confirm"] as const)(
    "never retries a security %s under a different signed-in owner after refresh",
    async (operation) => {
      browserStorage()
      saveSession(session("old", "2000-01-01T00:00:00Z"))
      let complete!: (response: Response) => void
      vi.mocked(ky).mockImplementation(
        (() =>
          new Promise<Response>((resolve) => {
            complete = resolve
          })) as unknown as typeof ky,
      )
      const sent =
        operation === "verify"
          ? authApi.verifyLoginMethodPassword("EMAIL", "")
          : operation === "bind"
            ? authApi.bindLoginMethod("EMAIL", "", "new@example.test", true)
            : operation === "resend"
              ? authApi.resendLoginMethodCode("TOTP", "challenge")
              : authApi.confirmLoginMethod(
                  "EMAIL",
                  { challengeToken: "challenge", emailCode: "123456" },
                  "",
                )
      saveSession({
        ...session("other", "2999-01-01T00:00:00Z"),
        refreshToken: "other-refresh",
        user: { userId: 2 },
      })
      complete(json(session("refreshed", "2999-01-01T00:00:00Z")))
      await expect(sent).rejects.toThrow("Session changed")
      expect(vi.mocked(ky)).toHaveBeenCalledTimes(1)
    },
  )

  it("does not assume passwordless eligibility from incomplete primary metadata", async () => {
    browserStorage()
    saveSession(session("current", "2999-01-01T00:00:00Z"))
    for (const payload of [{}, { passwordRequired: false, reauthenticationRequired: false }]) {
      vi.mocked(ky).mockImplementation((async () => json(payload)) as unknown as typeof ky)
      await expect(authApi.primaryAuthentication()).rejects.toBeInstanceOf(ApiError)
    }
    const valid = {
      passwordRequired: false,
      reauthenticationRequired: false,
      authenticatedUntil: "2999-01-01T00:00:00Z",
    }
    vi.mocked(ky).mockImplementation((async () => json(valid)) as unknown as typeof ky)
    await expect(authApi.primaryAuthentication()).resolves.toEqual(valid)
  })

  it("never sends an order under a different user after an asynchronous refresh", async () => {
    browserStorage()
    saveSession(session("old", "2000-01-01T00:00:00Z"))
    let complete!: (response: Response) => void
    vi.mocked(ky).mockImplementation(
      (() =>
        new Promise<Response>((resolve) => {
          complete = resolve
        })) as unknown as typeof ky,
    )
    const sent = request("/api/v1/gateway/trading", z.unknown(), {
      method: "POST",
      body: { userId: 1 },
      expectedUserId: "1",
    })
    saveSession({
      ...session("other", "2999-01-01T00:00:00Z"),
      refreshToken: "other-refresh",
      user: { userId: 2 },
    })
    complete(json(session("refreshed", "2999-01-01T00:00:00Z")))
    await expect(sent).rejects.toThrow("Session changed")
    expect(vi.mocked(ky)).toHaveBeenCalledTimes(1)
  })
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

describe("complete response lifecycle", () => {
  it.each(["GET", "POST"] as const)(
    "aborts a stalled %s body at its deadline without retrying",
    async (method) => {
      browserStorage()
      vi.useFakeTimers()
      const cancelled = vi.fn()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"ok":'))
        },
        cancel: cancelled,
      })
      let signal: AbortSignal | undefined
      vi.mocked(ky).mockImplementation((async (_url: unknown, options?: Options) => {
        signal = options?.signal ?? undefined
        return new Response(body)
      }) as unknown as typeof ky)
      const operation = request("/private", z.unknown(), { method, idempotencyKey: "same-command" })
      const rejected = expect(operation).rejects.toThrow(
        method === "POST" ? "result is not yet confirmed" : "Unable to load",
      )
      await vi.advanceTimersByTimeAsync(10_001)
      await rejected
      expect(signal?.aborted).toBe(true)
      expect(cancelled).toHaveBeenCalledOnce()
      expect(ky).toHaveBeenCalledOnce()
    },
  )
  it("caps streamed JSON bodies even without content-length", async () => {
    browserStorage()
    const cancelled = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1))
      },
      cancel: cancelled,
    })
    vi.mocked(ky).mockResolvedValue(new Response(body) as never)
    await expect(request("/large", z.unknown())).rejects.toBeInstanceOf(ApiError)
    expect(cancelled).toHaveBeenCalledOnce()
  })
  it("aborts a download body when the page cancels it", async () => {
    browserStorage()
    const cancelled = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled })
    vi.mocked(ky).mockResolvedValue(new Response(body) as never)
    const controller = new AbortController()
    const operation = requestBlob("/download", { signal: controller.signal })
    const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" })
    await Promise.resolve()
    controller.abort()
    await rejected
    expect(cancelled).toHaveBeenCalledOnce()
  })
})

describe("recoverable refresh failures", () => {
  it("retains the session on 503 and never sends the waiting private write", async () => {
    browserStorage()
    saveSession(session("old", "2000-01-01T00:00:00Z"))
    vi.mocked(ky).mockResolvedValue(json({}, 503) as never)
    await expect(
      request("/private", z.unknown(), { method: "POST", expectedUserId: "1" }),
    ).rejects.toMatchObject({ status: 503 })
    expect(loadSession()?.accessToken).toBe("old")
    expect(sessionRefreshIssue()).toContain("paused")
    expect(ky).toHaveBeenCalledOnce()
    vi.mocked(ky).mockResolvedValue(json(session("new", "2999-01-01T00:00:00Z")) as never)
    await refreshStoredSession()
    expect(loadSession()?.accessToken).toBe("new")
    expect(sessionRefreshIssue()).toBeNull()
  })
  it.each([401, 403])(
    "clears credentials after a definitive %s refresh rejection",
    async (status) => {
      browserStorage()
      saveSession(session("old", "2000-01-01T00:00:00Z"))
      vi.mocked(ky).mockResolvedValue(json({}, status) as never)
      await expect(refreshStoredSession()).rejects.toMatchObject({ status })
      expect(loadSession()).toBeNull()
    },
  )
})

describe("request identity and budget across asynchronous phases", () => {
  it.each(["json", "blob"] as const)(
    "discards a private %s body completed after account change",
    async (kind) => {
      browserStorage()
      saveSession(session("old", "2999-01-01T00:00:00Z"))
      let body!: ReadableStreamDefaultController<Uint8Array>
      vi.mocked(ky).mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              body = controller
            },
          }),
        ) as never,
      )
      const operation =
        kind === "json"
          ? request("/private", z.unknown(), { expectedUserId: "1" })
          : requestBlob("/private-file", { expectedUserId: "1" })
      const rejected = expect(operation).rejects.toMatchObject({ status: 0, requestSent: true })
      saveSession({ ...session("other", "2999-01-01T00:00:00Z"), user: { userId: "2" } })
      body.enqueue(new TextEncoder().encode('{"private":"owner-1"}'))
      body.close()
      await rejected
      expect(loadSession()?.user.userId).toBe("2")
    },
  )
  it("cancels one caller waiting for refresh while another caller can finish", async () => {
    browserStorage()
    saveSession(session("old", "2000-01-01T00:00:00Z"))
    let complete!: (response: Response) => void
    vi.mocked(ky).mockImplementation((async (url: unknown) => {
      if (String(url).endsWith("/auth/refresh"))
        return await new Promise<Response>((resolve) => {
          complete = resolve
        })
      return json({ ok: true })
    }) as unknown as typeof ky)
    const controller = new AbortController()
    const cancelled = request("/private/cancelled", z.unknown(), {
      method: "POST",
      signal: controller.signal,
    })
    const rejected = expect(cancelled).rejects.toMatchObject({
      name: "AbortError",
      requestSent: false,
    })
    const other = request("/private/other", z.object({ ok: z.boolean() }))
    controller.abort()
    await rejected
    expect(ky).toHaveBeenCalledOnce()
    complete(json(session("new", "2999-01-01T00:00:00Z")))
    await expect(other).resolves.toEqual({ ok: true })
    expect(ky).toHaveBeenCalledTimes(2)
    expect(
      vi.mocked(ky).mock.calls.some(([url]) => String(url).endsWith("/private/cancelled")),
    ).toBe(false)
  })
  it("uses the original ten-second deadline after a slow shared refresh", async () => {
    browserStorage()
    vi.useFakeTimers()
    saveSession(session("old", "2000-01-01T00:00:00Z"))
    let businessSignal: AbortSignal | undefined
    vi.mocked(ky).mockImplementation((async (url: unknown, options?: Options) => {
      if (String(url).endsWith("/auth/refresh")) {
        await new Promise((resolve) => setTimeout(resolve, 8000))
        return json(session("new", "2999-01-01T00:00:00Z"))
      }
      businessSignal = options?.signal ?? undefined
      return new Response(new ReadableStream<Uint8Array>())
    }) as unknown as typeof ky)
    const operation = request("/private", z.unknown())
    const rejected = expect(operation).rejects.toMatchObject({ status: 0, requestSent: true })
    await vi.advanceTimersByTimeAsync(10_001)
    await rejected
    expect(businessSignal?.aborted).toBe(true)
  })
})

it("quotes oversized wire numbers without BigInt conversion and rejects them at the int64 schema", () => {
  const digits = "9".repeat(4 * 1024 * 1024)
  const bigint = vi.spyOn(globalThis, "BigInt")
  try {
    const parsed: unknown = JSON.parse(
      quoteUnsafeJsonIntegers(`{"asset":"USDT","availableUnits":${digits},"lockedUnits":0}`),
    )
    expect(BalanceSchema.safeParse(parsed).success).toBe(false)
    expect(bigint).not.toHaveBeenCalled()
  } finally {
    bigint.mockRestore()
  }
})
it("does not return a decoded success after the original deadline", async () => {
  browserStorage()
  vi.useFakeTimers()
  vi.mocked(ky).mockResolvedValue(json({ ok: true }) as never)
  const schema = z.object({ ok: z.boolean() }).transform((value) => {
    vi.setSystemTime(Date.now() + 10_001)
    return value
  })
  await expect(request("/private", schema)).rejects.toMatchObject({ status: 0, requestSent: true })
})

it("rejects oversized HTTP login and principal identities before UI admission and can recover", async () => {
  browserStorage()
  const userId = "9".repeat(4 * 1024 * 1024)
  const principal = { userId, status: "ACTIVE", roles: [], expiresAt: "2999-01-01T00:00:00Z" }
  const convert = vi.spyOn(globalThis, "BigInt")
  try {
    vi.mocked(ky).mockImplementation((async () =>
      json({ accessToken: "token", user: { userId } })) as unknown as typeof ky)
    await expect(
      request("/api/v1/auth/login", AuthSessionSchema, { method: "POST", body: {} }),
    ).rejects.toBeInstanceOf(ApiError)
    vi.mocked(ky).mockImplementation((async () => json(principal)) as unknown as typeof ky)
    await expect(authApi.me()).rejects.toBeInstanceOf(ApiError)
    expect(loadSession()).toBeNull()
    expect(convert).not.toHaveBeenCalled()
    vi.mocked(ky).mockImplementation((async () =>
      json({ ...principal, userId: "9007199254740993" })) as unknown as typeof ky)
    expect((await authApi.me()).userId).toBe("9007199254740993")
  } finally {
    convert.mockRestore()
  }
})
