import { z } from "zod"
import { t } from "../i18n"
import { loadSession } from "../state/session"
import { request } from "./client"
import type { AuthSessionPayload } from "./types"
import {
  AuthSessionSchema,
  CreatedApiKeySchema,
  DeviceStatusSchema,
  EmailVerificationChallengeSchema,
  GenericObjectSchema,
  IpStatusSchema,
  JwtPrincipalSchema,
  KycDocumentSchema,
  KycProfileSchema,
  KycProviderSchema,
  LoginChallengeSchema,
  MfaStatusSchema,
  SecurityApiKeyListSchema,
  SecuritySceneListSchema,
  SecuritySceneSchema,
} from "./types"

export const authApi = {
  login: (identifier: string, password: string) =>
    request("/api/v1/auth/login", z.union([LoginChallengeSchema, AuthSessionSchema]), {
      method: "POST",
      body: { identifier, password },
    }),
  verifyLogin: (codes: import("./types").LoginVerificationCodes) =>
    request("/api/v1/auth/login/verify", AuthSessionSchema, { method: "POST", body: codes }),
  loginMethods: () =>
    request(
      "/api/v1/security/login-verification",
      z.array(
        z.object({
          type: z.enum(["EMAIL", "PHONE", "TOTP"]),
          bound: z.boolean(),
          enabled: z.boolean(),
          destination: z.string().nullable(),
        }),
      ),
    ),
  primaryAuthentication: () =>
    request(
      "/api/v1/security/login-verification/authentication",
      z
        .object({
          passwordRequired: z.boolean(),
          reauthenticationRequired: z.boolean(),
          authenticatedUntil: z.string().datetime().nullable().optional(),
        })
        .refine(
          (value) =>
            value.passwordRequired ||
            value.reauthenticationRequired ||
            typeof value.authenticatedUntil === "string",
        ),
      {
        expectedUserId: String(loadSession()?.user.userId ?? ""),
      },
    ),
  verifyLoginMethodPassword: (method: "EMAIL" | "PHONE" | "TOTP", currentPassword: string) =>
    request(`/api/v1/security/login-verification/${method}/verify-password`, z.unknown(), {
      method: "POST",
      body: { currentPassword },
      expectedUserId: String(loadSession()?.user.userId ?? ""),
    }),
  bindLoginMethod: (
    method: "EMAIL" | "PHONE" | "TOTP",
    currentPassword: string,
    destination: string,
    enabled: boolean,
  ) =>
    request(
      `/api/v1/security/login-verification/${method}/bind`,
      z.object({
        challenge: LoginChallengeSchema,
        secret: z.string().nullable(),
        provisioningUri: z.string().nullable(),
      }),
      {
        method: "POST",
        body: { currentPassword, destination, enabled },
        expectedUserId: String(loadSession()?.user.userId ?? ""),
      },
    ),
  resendLoginMethodCode: (method: "EMAIL" | "PHONE" | "TOTP", challengeToken: string) =>
    request(`/api/v1/security/login-verification/${method}/resend`, LoginChallengeSchema, {
      method: "POST",
      body: { challengeToken },
      expectedUserId: String(loadSession()?.user.userId ?? ""),
    }),
  confirmLoginMethod: (
    method: "EMAIL" | "PHONE" | "TOTP",
    codes: import("./types").LoginVerificationCodes,
    currentPassword: string,
  ) =>
    request(`/api/v1/security/login-verification/${method}/confirm`, z.unknown(), {
      method: "POST",
      body: { codes, currentPassword },
      expectedUserId: String(loadSession()?.user.userId ?? ""),
    }),
  logout: () =>
    request("/api/v1/auth/logout", z.unknown(), {
      method: "POST",
      body: {},
    }),
  register: (
    identifier: string,
    password: string,
    contactMode: "email" | "phone" = "email",
    inviteCode?: string,
  ) =>
    request<AuthSessionPayload>("/api/v1/auth/register", AuthSessionSchema, {
      method: "POST",
      body: { [contactMode]: identifier, password, inviteCode: inviteCode?.trim() || undefined },
    }),
  forgotPassword: (identifier: string) =>
    request("/api/v1/auth/forgot-password", GenericObjectSchema, {
      method: "POST",
      body: { identifier },
    }),
  resetPassword: (identifier: string, code: string, newPassword: string) =>
    request("/api/v1/auth/reset-password", GenericObjectSchema, {
      method: "POST",
      body: { identifier, code, newPassword },
    }),
  verifyEmail: (email: string, code: string) =>
    request("/api/v1/auth/verify-email", z.boolean(), {
      method: "POST",
      body: { email, code },
    }),
  resendEmailVerification: () =>
    request("/api/v1/auth/resend-email-verification", EmailVerificationChallengeSchema, {
      method: "POST",
    }),
  me: () => request("/api/v1/auth/me", JwtPrincipalSchema),
}

export function loadSecurityScenes(signal?: AbortSignal) {
  return request("/api/v1/security/scenes", SecuritySceneListSchema, signal ? { signal } : {})
}

export function loadMfaStatus(signal?: AbortSignal) {
  return request("/api/v1/security/mfa", MfaStatusSchema, signal ? { signal } : {})
}

export function loadMfaRecovery() {
  return request("/api/v1/security/mfa/recovery", GenericObjectSchema.nullable())
}

export function issueMfaRecoveryChallenge(currentPassword: string) {
  return request("/api/v1/security/mfa/recovery/challenge", GenericObjectSchema, {
    method: "POST",
    body: { currentPassword },
  })
}

export function submitMfaRecovery(
  challengeId: number,
  currentPassword: string,
  code: string,
  reason: string,
) {
  return request("/api/v1/security/mfa/recovery", GenericObjectSchema, {
    method: "POST",
    body: { challengeId, currentPassword, code, reason },
  })
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
  emailCode: string,
  totpCode: string,
  signal?: AbortSignal,
) {
  return request("/api/v1/security/password", z.unknown(), {
    method: "POST",
    ...(signal ? { signal } : {}),
    body: { currentPassword, newPassword, emailCode, totpCode },
  })
}

export function issueSecurityChallenge(sceneCode: string, signal?: AbortSignal) {
  return request("/api/v1/security/verification/challenge", GenericObjectSchema, {
    method: "POST",
    body: { sceneCode },
    ...(signal ? { signal } : {}),
  })
}

export function updateSecurityScene(
  sceneCode: string,
  enabled: boolean,
  emailCode: string,
  totpCode: string,
  signal?: AbortSignal,
) {
  return request(`/api/v1/security/scenes/${encodeURIComponent(sceneCode)}`, SecuritySceneSchema, {
    method: "PUT",
    ...(signal ? { signal } : {}),
    body: { enabled, emailCode, totpCode },
  }).then((result) => {
    if (result.sceneCode !== sceneCode || result.enabled !== enabled)
      throw new Error(
        t("The service returned an unexpected response. Please refresh and try again."),
      )
    return result
  })
}

export function loadApiKeys(signal?: AbortSignal) {
  return request("/api/v1/security/api-keys", SecurityApiKeyListSchema, signal ? { signal } : {})
}

export function loadDevices(signal?: AbortSignal) {
  return request(
    "/api/v1/security/devices",
    z
      .array(DeviceStatusSchema)
      .max(100)
      .refine((rows) => new Set(rows.map((row) => row.sessionId)).size === rows.length),
    signal ? { signal } : {},
  )
}

export function revokeDevice(deviceId: string, signal?: AbortSignal) {
  return request(`/api/v1/security/devices/${encodeURIComponent(deviceId)}/revoke`, z.unknown(), {
    method: "POST",
    ...(signal ? { signal } : {}),
  })
}

export function changeDeviceBlock(
  deviceId: string,
  blocked: boolean,
  emailCode: string,
  totpCode: string,
  signal?: AbortSignal,
) {
  return request(
    `/api/v1/security/devices/${encodeURIComponent(deviceId)}/${blocked ? "block" : "unblock"}`,
    z.unknown(),
    {
      method: "POST",
      ...(signal ? { signal } : {}),
      body: { emailCode, totpCode },
    },
  )
}

export function loadLoginIps(signal?: AbortSignal) {
  return request(
    "/api/v1/security/ips",
    z
      .array(IpStatusSchema)
      .max(100)
      .refine((rows) => new Set(rows.map((row) => row.ipAddress)).size === rows.length),
    signal ? { signal } : {},
  )
}

export function changeIpBlock(
  ipAddress: string,
  blocked: boolean,
  emailCode: string,
  totpCode: string,
  signal?: AbortSignal,
) {
  return request(`/api/v1/security/ips/${blocked ? "block" : "unblock"}`, z.unknown(), {
    method: "POST",
    ...(signal ? { signal } : {}),
    body: { ipAddress, emailCode, totpCode },
  })
}

export function revokeUserSession(sessionId: string | number, signal?: AbortSignal) {
  return request(
    `/api/v1/security/sessions/${encodeURIComponent(String(sessionId))}/revoke`,
    z.unknown(),
    {
      method: "POST",
      ...(signal ? { signal } : {}),
    },
  )
}

export function createApiKey(
  label: string,
  permissions: readonly string[],
  ipAllowlist: readonly string[],
  emailCode: string,
  totpCode: string,
  signal?: AbortSignal,
) {
  return request("/api/v1/security/api-keys", CreatedApiKeySchema, {
    method: "POST",
    ...(signal ? { signal } : {}),
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: { label, permissions, ipAllowlist },
  })
}

export function updateApiKey(
  apiKey: string,
  label: string,
  permissions: readonly string[],
  ipAllowlist: readonly string[],
  emailCode: string,
  totpCode: string,
  signal?: AbortSignal,
) {
  return request("/api/v1/security/api-keys", z.unknown(), {
    method: "PATCH",
    ...(signal ? { signal } : {}),
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: { apiKey, label, permissions, ipAllowlist },
  })
}

export function revokeApiKey(
  apiKey: string,
  emailCode: string,
  totpCode: string,
  signal?: AbortSignal,
) {
  return request("/api/v1/security/api-keys", z.unknown(), {
    method: "DELETE",
    ...(signal ? { signal } : {}),
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: { apiKey },
  })
}

function checkKycOwner<T extends { userId: string } | null>(profile: T, userId: string): T {
  if (profile && profile.userId !== userId)
    throw new Error(t("The service returned an unexpected response. Please refresh and try again."))
  return profile
}

export async function loadKyc(signal?: AbortSignal) {
  const userId = String(loadSession()?.user.userId ?? "")
  return checkKycOwner(
    await request("/api/v1/compliance/kyc", KycProfileSchema, {
      ...(signal ? { signal } : {}),
      expectedUserId: userId,
    }),
    userId,
  )
}

export async function uploadKycDocument(documentType: string, file: File, signal?: AbortSignal) {
  const userId = String(loadSession()?.user.userId ?? "")
  const body = new FormData()
  body.append("documentType", documentType)
  body.append("file", file)
  return checkKycOwner(
    await request("/api/v1/compliance/kyc/documents", KycDocumentSchema, {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
      expectedUserId: userId,
    }),
    userId,
  )
}

export async function submitKyc(body: Readonly<Record<string, unknown>>, signal?: AbortSignal) {
  const userId = String(loadSession()?.user.userId ?? "")
  const response = await request(
    "/api/v1/compliance/kyc",
    z.object({
      profile: KycProfileSchema.unwrap(),
      verificationSession: GenericObjectSchema,
    }),
    {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
      expectedUserId: userId,
    },
  )
  checkKycOwner(response.profile, userId)
  return response
}

export function loadKycProvider(signal?: AbortSignal) {
  return request("/api/v1/compliance/kyc/provider", KycProviderSchema, signal ? { signal } : {})
}

export async function completeKycSimulation(
  decision: "APPROVED" | "REJECTED" | "MANUAL_REVIEW",
  signal?: AbortSignal,
) {
  const userId = String(loadSession()?.user.userId ?? "")
  return checkKycOwner(
    await request("/api/v1/compliance/kyc/simulation/complete", KycProfileSchema.unwrap(), {
      method: "POST",
      body: { decision },
      ...(signal ? { signal } : {}),
      expectedUserId: userId,
    }),
    userId,
  )
}

export function refreshKycSession(signal?: AbortSignal) {
  return request("/api/v1/compliance/kyc/session/refresh", GenericObjectSchema, {
    method: "POST",
    ...(signal ? { signal } : {}),
  })
}
