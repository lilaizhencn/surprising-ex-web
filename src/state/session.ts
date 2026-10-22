import { useSyncExternalStore } from "react"
import type { AuthSession } from "../api/types"
import { AuthSessionSchema } from "../api/types"
import { storageKeys } from "../lib/config"
import { readStoredValue, writeStoredValue } from "../lib/storage"

export const SESSION_CHANGED_EVENT = "surprising-ex.session-changed"

let cachedRaw: string | null | undefined
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
  const value = readStoredValue(storageKeys.session, cachedRaw ?? null)
  if (value === cachedRaw) {
    if (cachedSession && sessionRefreshExpired(cachedSession)) {
      writeStoredValue(storageKeys.session, null)
      cachedRaw = null
      cachedSession = null
    }
    return cachedSession
  }
  refreshIssue = null
  cachedRaw = value
  if (!value) {
    cachedSession = null
    return cachedSession
  }
  const parsed: unknown = parseJson(value)
  const result = AuthSessionSchema.safeParse(parsed)
  if (!result.success || !validStoredSession(result.data)) {
    writeStoredValue(storageKeys.session, null)
    cachedRaw = null
    cachedSession = null
    return cachedSession
  }
  cachedSession = result.data
  if (sessionRefreshExpired(cachedSession)) {
    writeStoredValue(storageKeys.session, null)
    cachedRaw = null
    cachedSession = null
  }
  return cachedSession
}

function validStoredSession(session: AuthSession): boolean {
  const id = session.user.userId
  const text = String(id)
  if (
    text.length > 19 ||
    (typeof id === "number" && !Number.isSafeInteger(id)) ||
    !/^[1-9]\d*$/.test(text)
  )
    return false
  if (
    BigInt(id) > 9223372036854775807n ||
    !session.accessToken.trim() ||
    session.refreshToken === ""
  )
    return false
  return [session.expiresAt, session.accessTokenExpiresAt, session.refreshTokenExpiresAt].every(
    (value) => value === undefined || Number.isFinite(Date.parse(value)),
  )
}

export function sessionAccessExpired(session: AuthSession | null): boolean {
  const expiresAt = session?.accessTokenExpiresAt ?? session?.expiresAt
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now())
}

function sessionRefreshExpired(session: AuthSession): boolean {
  return Boolean(
    (session.refreshTokenExpiresAt && Date.parse(session.refreshTokenExpiresAt) <= Date.now()) ||
      (!session.refreshToken && sessionAccessExpired(session)),
  )
}

export function saveSession(session: AuthSession | null): void {
  if (typeof window === "undefined") return
  if (session && !validStoredSession(session))
    throw new Error("The service returned an invalid session. Please sign in again.")
  refreshIssue = null
  if (!session) {
    writeStoredValue(storageKeys.session, null)
    cachedRaw = null
    cachedSession = null
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    return
  }
  const raw = JSON.stringify(session)
  writeStoredValue(storageKeys.session, raw)
  cachedRaw = raw
  cachedSession = session
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

export function useSession(): AuthSession | null {
  return useSyncExternalStore(subscribeSession, loadSession, () => null)
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}
