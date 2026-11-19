import { t } from "../i18n"
import { loadSession, saveSession } from "../state/session"
import type { SubAccountRecord } from "./accountApi"
import { request } from "./client"
import {
  type ApiBalance,
  type AuthSessionPayload,
  AuthSessionSchema,
  BalanceListSchema,
  GenericObjectSchema,
} from "./types"

export async function switchOperatingAccount(
  userId: string | number | null,
): Promise<AuthSessionPayload> {
  const current = loadSession()
  if (!current) throw new Error(t("Please sign in before switching accounts."))
  const payload = await request("/api/v1/sub-account/operating-account", AuthSessionSchema, {
    method: "POST",
    body: { userId },
  })
  saveSession({
    ...payload,
    browserSession: current.browserSession ?? payload.browserSession,
    sessionKey: current.sessionKey,
  })
  return payload
}

export async function loadSubAccountAssets(
  subUserId: string | number,
  accountType = "SPOT",
  signal?: AbortSignal,
): Promise<readonly ApiBalance[]> {
  const query = new URLSearchParams({ accountType })
  const response = await request(
    `/api/v1/sub-account/${subUserId}/assets?${query.toString()}`,
    BalanceListSchema,
    signal ? { signal } : {},
  )
  return response.balances ?? response.items ?? []
}

export async function updateSubAccountStatus(
  subUserId: string | number,
  status: "ACTIVE" | "FROZEN",
): Promise<SubAccountRecord> {
  const res = await request(`/api/v1/sub-account/${subUserId}/status`, GenericObjectSchema, {
    method: "POST",
    body: { status },
  })
  return res as unknown as SubAccountRecord
}
