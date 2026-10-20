import { afterEach, describe, expect, it, vi } from "vitest"
import { saveSession } from "../state/session"
import { request } from "./client"
import { telegramApi, waitForTelegramLogin } from "./telegram"
import { AuthSessionSchema } from "./types"

vi.mock("./client", () => ({ request: vi.fn() }))

const flow = {
  flowId: "s".repeat(43),
  verifier: "v".repeat(43),
  authorizationUrl: "https://oauth.telegram.org/auth",
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
}
const session = {
  user: { userId: "7", username: null, email: null, displayName: "小李 🚀" },
  accessToken: "access",
  refreshToken: "refresh",
}

afterEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
  saveSession(null)
})

describe("Telegram passwordless login", () => {
  it("accepts a Telegram nickname without a password, email or username", () => {
    expect(AuthSessionSchema.parse(session).user.displayName).toBe("小李 🚀")
  })

  it("keeps redemption credentials out of the URL", async () => {
    vi.mocked(request).mockResolvedValue({ pending: true })
    await telegramApi.complete(flow)
    expect(request).toHaveBeenCalledWith("/api/v1/auth/telegram/complete", expect.anything(), {
      method: "POST",
      body: { flowId: flow.flowId, verifier: flow.verifier },
    })
  })

  it("waits for authorization then returns the validated session", async () => {
    vi.useFakeTimers()
    vi.mocked(request).mockResolvedValueOnce({ pending: true }).mockResolvedValueOnce(session)
    const result = waitForTelegramLogin(flow, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(1500)
    await expect(result).resolves.toEqual(session)
  })

  it("preserves a required secondary verification challenge", async () => {
    const challenge = { requiresVerification: true, challengeToken: "totp-required" }
    vi.mocked(request).mockResolvedValue(challenge)
    await expect(waitForTelegramLogin(flow, new AbortController().signal)).resolves.toEqual(
      challenge,
    )
  })

  it("cannot redeem an expired or cancelled flow", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(waitForTelegramLogin(flow, controller.signal)).rejects.toBeDefined()
    await expect(
      waitForTelegramLogin(
        { ...flow, expiresAt: "2000-01-01T00:00:00Z" },
        new AbortController().signal,
      ),
    ).rejects.toThrow("expired")
    expect(request).not.toHaveBeenCalled()
  })
})
