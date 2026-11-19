import { useSyncExternalStore } from "react"
import type { AuthSession, AuthSessionPayload, OperatingAccount } from "../api/types"
import { storageKeys } from "../lib/config"
import { readStoredValue, writeStoredValue } from "../lib/storage"

export const SESSION_CHANGED_EVENT = "surprising-ex.session-changed"

let cachedSession: AuthSession | null = null
let refreshIssue: string | null = null

export function sessionRefreshIssue(): string | null {
  return refreshIssue
}
export function setSessionRefreshIssue(issue: string | null): void {
  if (issue === refreshIssue) return
  refreshIssue = issue
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}
export function useSessionRefreshIssue(): string | null {
  return useSyncExternalStore(subscribeSession, sessionRefreshIssue, () => null)
}
function subscribeSession(onStoreChange: () => void): () => void {
  window.addEventListener(SESSION_CHANGED_EVENT, onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener(SESSION_CHANGED_EVENT, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

export function loadSession(): AuthSession | null {
  if (typeof window === "undefined") return null
  writeStoredValue(storageKeys.session, null)
  return cachedSession
}

function validStoredSession(
  session: AuthSessionPayload & { readonly sessionKey?: string | undefined },
): boolean {
  const id = session.user.userId
  const text = String(id)
  if (
    text.length > 19 ||
    (typeof id === "number" && !Number.isSafeInteger(id)) ||
    !/^[1-9]\d*$/.test(text)
  )
    return false
  if (BigInt(id) > 9223372036854775807n || session.sessionKey?.trim() === "") return false
  return (
    session.sessionExpiresAt === undefined ||
    session.sessionExpiresAt === null ||
    Number.isFinite(Date.parse(session.sessionExpiresAt))
  )
}

export function hasStoredSession(): boolean {
  if (typeof window === "undefined") return false
  return Boolean(readStoredValue(storageKeys.hasSession))
}

export function saveSession(
  session: (AuthSessionPayload & { readonly sessionKey?: string | undefined }) | null,
): void {
  if (typeof window === "undefined") return
  if (session && !validStoredSession(session))
    throw new Error("The service returned an invalid session. Please sign in again.")
  refreshIssue = null
  writeStoredValue(storageKeys.session, null)
  writeStoredValue(storageKeys.hasSession, session ? "true" : null)
  cachedSession = session
    ? { ...session, sessionKey: session.sessionKey ?? crypto.randomUUID() }
    : null
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

export function useSession(): AuthSession | null {
  return useSyncExternalStore(subscribeSession, loadSession, () => null)
}

/** 登录主体（主账号）用户 ID。安全、KYC、通知和会话校验用这个，不随切换改变。 */
export function loginUserId(
  session: AuthSession | null | undefined,
): AuthSession["user"]["userId"] | undefined {
  return session?.user.userId
}

/** 当前查看和交易的账户；未切换时等于主账号。 */
export function currentAccountUserId(session: AuthSession): AuthSession["user"]["userId"]
export function currentAccountUserId(
  session: AuthSession | null | undefined,
): AuthSession["user"]["userId"] | undefined
export function currentAccountUserId(
  session: AuthSession | null | undefined,
): AuthSession["user"]["userId"] | undefined {
  const operating = session?.operatingAccount
  if (operating?.userId != null && String(operating.userId) !== "") return operating.userId
  return loginUserId(session)
}

export function isParentOperatingAccount(session: AuthSession | null | undefined): boolean {
  const operating = session?.operatingAccount
  if (!operating) return true
  return operating.parent || String(operating.userId) === String(session?.user.userId)
}

export function currentOperatingAccount(
  session: AuthSession | null | undefined,
): OperatingAccount | null {
  return session?.operatingAccount ?? null
}
