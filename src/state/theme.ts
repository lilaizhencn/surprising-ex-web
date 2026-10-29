import { useSyncExternalStore } from "react"
import { readStoredValue, writeStoredValue } from "../lib/storage"

export const themes = [
  { id: "dark", name: "Graphite", description: "A focused dark workspace" },
  { id: "light", name: "Daylight", description: "Clean and bright" },
  { id: "ocean", name: "Deep ocean", description: "Midnight blue and cool cyan" },
  { id: "forest", name: "Forest", description: "Evergreen and soft mint" },
  { id: "dusk", name: "Twilight", description: "Plum and lavender" },
  { id: "sand", name: "Warm sand", description: "Warm paper and amber" },
] as const
export type ThemeId = (typeof themes)[number]["id"]
const key = "surprising-ex.theme"
const event = "surprising-theme-changed"
export function resolveTheme(value: string | null, systemDark = false): ThemeId {
  return themes.find((theme) => theme.id === value)?.id ?? (systemDark ? "dark" : "light")
}
export function initializeTheme() {
  document.documentElement.dataset["theme"] = resolveTheme(
    readStoredValue(key),
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  )
}
export function setTheme(theme: ThemeId) {
  document.documentElement.dataset["theme"] = theme
  writeStoredValue(key, theme)
  window.dispatchEvent(new Event(event))
}
function subscribe(listener: () => void) {
  const storage = (change: StorageEvent) => {
    if (change.key !== key && change.key !== null) return
    initializeTheme()
    listener()
  }
  window.addEventListener(event, listener)
  window.addEventListener("storage", storage)
  return () => {
    window.removeEventListener(event, listener)
    window.removeEventListener("storage", storage)
  }
}
export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, () =>
    resolveTheme(document.documentElement.dataset["theme"] ?? null),
  )
}
