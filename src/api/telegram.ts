import { z } from "zod"
import { request } from "./client"
import { AuthSessionSchema, LoginChallengeSchema } from "./types"

const TokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const FlowSchema = z.object({
  flowId: TokenSchema,
  verifier: TokenSchema,
  authorizationUrl: z.url().refine((value) => {
    const url = new URL(value)
    return url.origin === "https://oauth.telegram.org" && url.pathname === "/auth"
  }),
  expiresAt: z.iso.datetime({ offset: true }),
})
const ResultSchema = z.union([
  AuthSessionSchema,
  LoginChallengeSchema,
  z.object({ pending: z.literal(true) }),
])

export const telegramApi = {
  config: (signal?: AbortSignal) =>
    request("/api/v1/auth/telegram/config", z.object({ enabled: z.boolean() }), {
      ...(signal ? { signal } : {}),
    }),
  start: (signal?: AbortSignal) =>
    request("/api/v1/auth/telegram/start", FlowSchema, {
      method: "POST",
      ...(signal ? { signal } : {}),
    }),
  complete: (flow: z.infer<typeof FlowSchema>, signal?: AbortSignal) =>
    request("/api/v1/auth/telegram/complete", ResultSchema, {
      method: "POST",
      body: { flowId: flow.flowId, verifier: flow.verifier },
      ...(signal ? { signal } : {}),
    }),
}

export async function waitForTelegramLogin(flow: z.infer<typeof FlowSchema>, signal: AbortSignal) {
  while (Date.now() < Date.parse(flow.expiresAt)) {
    signal.throwIfAborted()
    const result = await telegramApi.complete(flow, signal)
    if (!("pending" in result)) return result
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      }, 1500)
      signal.addEventListener("abort", onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
  }
  throw new Error("Telegram login expired. Please try again.")
}
