import type { AuthSession } from "../api/types"
import { AuthSessionSchema } from "../api/types"
import { storageKeys } from "../lib/config"

export function loadSession(): AuthSession | null {
  if (typeof window === "undefined") return null
  const value = window.localStorage.getItem(storageKeys.session)
  if (!value) return null
  const parsed: unknown = parseJson(value)
  const result = AuthSessionSchema.safeParse(parsed)
  if (!result.success) {
    window.localStorage.removeItem(storageKeys.session)
    return null
  }
  return result.data
}

export function saveSession(session: AuthSession | null): void {
  if (typeof window === "undefined") return
  if (!session) {
    window.localStorage.removeItem(storageKeys.session)
    return
  }
  window.localStorage.setItem(storageKeys.session, JSON.stringify(session))
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}
