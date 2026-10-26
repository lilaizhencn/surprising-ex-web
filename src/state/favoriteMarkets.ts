import { useSyncExternalStore } from "react"
import { storageKeys } from "../lib/config"
import { readStoredValue, writeStoredValue } from "../lib/storage"

const changeEvent = "surprising-ex.favorites-changed"
const keyPattern =
  /^(SPOT|LINEAR_PERPETUAL|INVERSE_PERPETUAL|LINEAR_DELIVERY|INVERSE_DELIVERY|OPTION):[1-9]\d{0,18}$/
const emptyFavorites: readonly string[] = []
let cachedRaw: string | null | undefined
let cachedFavorites = emptyFavorites

export function parseFavoriteMarkets(raw: string | null): readonly string[] {
  if (!raw || raw.length > 512_000) return emptyFavorites
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return emptyFavorites
    return [
      ...new Set(
        parsed.filter(
          (value): value is string =>
            typeof value === "string" &&
            keyPattern.test(value) &&
            BigInt(value.slice(value.indexOf(":") + 1)) <= 9223372036854775807n,
        ),
      ),
    ]
  } catch {
    return emptyFavorites
  }
}

function readFavorites(): readonly string[] {
  const raw = readStoredValue(storageKeys.favorites, cachedRaw ?? null)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedFavorites = parseFavoriteMarkets(raw)
  }
  return cachedFavorites
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKeys.favorites || event.key === null) listener()
  }
  window.addEventListener(changeEvent, listener)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(changeEvent, listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function useFavoriteMarkets() {
  return useSyncExternalStore(subscribe, readFavorites, () => emptyFavorites)
}

export function toggleFavoriteMarket(key: string) {
  if (!keyPattern.test(key)) return
  const current = readFavorites()
  cachedFavorites = current.includes(key)
    ? current.filter((item) => item !== key)
    : [...current, key]
  cachedRaw = JSON.stringify(cachedFavorites)
  writeStoredValue(storageKeys.favorites, cachedRaw)
  window.dispatchEvent(new Event(changeEvent))
}
