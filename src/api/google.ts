import { z } from "zod"
import { request } from "./client"
import { AuthSessionSchema, LoginChallengeSchema } from "./types"

export const googleApi = {
  config: (signal: AbortSignal) =>
    request(
      "/api/v1/auth/google/config",
      z.object({ enabled: z.boolean(), webClientId: z.string() }),
      { signal },
    ),
  challenge: (signal: AbortSignal) =>
    request(
      "/api/v1/auth/google/challenge",
      z.object({
        nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        expiresAt: z.string().datetime(),
      }),
      { method: "POST", body: {}, signal, retry: 0 },
    ),
  login: (credential: string, nonce: string, signal: AbortSignal, inviteCode = "") =>
    request("/api/v1/auth/google/login", z.union([LoginChallengeSchema, AuthSessionSchema]), {
      method: "POST",
      body: { credential, nonce, platform: "WEB", inviteCode: inviteCode.trim() || null },
      signal,
      retry: 0,
    }),
}
