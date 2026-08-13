import { useSyncExternalStore } from "react"
import type { AuthSession } from "../api/types"
import { AuthSessionSchema } from "../api/types"
import { storageKeys } from "../lib/config"

export const SESSION_CHANGED_EVENT = "surprising-ex.session-changed"

let cachedRaw: string | null | undefined
let cachedSession: AuthSession | null = null

export function loadSession(): AuthSession | null {
  if (typeof window === "undefined") return null
  const value = window.localStorage.getItem(storageKeys.session)
  if (value === cachedRaw) return cachedSession
  cachedRaw = value
  if (!value) {
    cachedSession = null
    return cachedSession
  }
  const parsed: unknown = parseJson(value)
  const result = AuthSessionSchema.safeParse(parsed)
  if (!result.success) {
    window.localStorage.removeItem(storageKeys.session)
    cachedRaw = null
    cachedSession = null
    return cachedSession
  }
  cachedSession = result.data
  return cachedSession
}

export function saveSession(session: AuthSession | null): void {
  if (typeof window === "undefined") return
  if (!session) {
    window.localStorage.removeItem(storageKeys.session)
    cachedRaw = null
    cachedSession = null
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    return
  }
  const raw = JSON.stringify(session)
  window.localStorage.setItem(storageKeys.session, raw)
  cachedRaw = raw
  cachedSession = session
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

export function useSession(): AuthSession | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(SESSION_CHANGED_EVENT, onStoreChange)
      window.addEventListener("storage", onStoreChange)
      return () => {
        window.removeEventListener(SESSION_CHANGED_EVENT, onStoreChange)
        window.removeEventListener("storage", onStoreChange)
      }
    },
    loadSession,
    () => null,
  )
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}
