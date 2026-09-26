import { useSyncExternalStore } from "react"
import messages from "./zh.json"

export type Locale = "en" | "zh"
const storageKey = "surprising-ex.language"
const listeners = new Set<() => void>()
let locale: Locale = "en"
if (typeof window !== "undefined") {
  locale = window.localStorage.getItem(storageKey) === "zh" ? "zh" : "en"
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) applyLocale(event.newValue === "zh" ? "zh" : "en")
  })
}
function applyLocale(next: Locale) {
  locale = next
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en"
  for (const listener of listeners) listener()
}
export function setLocale(next: Locale) {
  window.localStorage.setItem(storageKey, next)
  applyLocale(next)
}
export function useLocale(): Locale {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => locale,
    () => "en",
  )
}
export function t(text: string): string {
  return locale === "zh" ? ((messages as Record<string, string>)[text] ?? text) : text
}
