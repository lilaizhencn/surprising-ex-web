/** Preferences and sessions remain usable in memory when browser storage is blocked. */
export function readStoredValue(key: string, fallback: string | null = null): string | null {
  try {
    return typeof window === "undefined" ? fallback : window.localStorage.getItem(key)
  } catch {
    return fallback
  }
}

export function writeStoredValue(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // A denied/quota-limited browser store must not interrupt the current page.
  }
}
