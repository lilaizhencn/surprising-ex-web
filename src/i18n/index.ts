import { useSyncExternalStore } from "react"
import { readStoredValue, writeStoredValue } from "../lib/storage"
import english from "./catalogs/en.json"
import chinese from "./catalogs/zh.json"
import { contentLocale, LOCALES, type Locale, normalizeLocale } from "./locales"
import source from "./source.json"

export type { Locale } from "./locales"

const storageKey = "surprising-ex.language"
const listeners = new Set<() => void>()
const catalogs = new Map<Locale, Readonly<Record<string, string>>>([
  ["en", english],
  ["zh", chinese],
])
const catalogUrls = import.meta.glob<string>("./catalogs/*.json", {
  eager: true,
  query: "?url",
  import: "default",
})
const remembered = normalizeLocale(
  typeof window === "undefined" ? "en" : readStoredValue(storageKey),
)
let locale: Locale = catalogs.has(remembered) ? remembered : "en"
let selection = 0
let activeLoad: AbortController | null = null
type LanguageLoad = Readonly<{ target: Locale; status: "loading" | "error" }> | null
let languageLoad: LanguageLoad = null
function emit() {
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function applyLocale(next: Locale) {
  locale = next
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = contentLocale(next)
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr"
  }
  emit()
}
applyLocale(locale)
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey)
      void changeLocale(normalizeLocale(event.newValue), false).catch(() => {})
  })

async function loadCatalog(
  next: Locale,
  controller: AbortController,
): Promise<Readonly<Record<string, string>>> {
  const url = catalogUrls["./catalogs/" + next + ".json"]
  if (!url) throw new Error("Language unavailable: " + next)
  const timer = window.setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: "omit" })
    if (!response.ok || !response.body) throw new Error("Language request failed")
    const reader = response.body.getReader(),
      decoder = new TextDecoder()
    let bytes = 0,
      text = ""
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > 2 * 1024 * 1024) {
          controller.abort()
          throw new Error("Language file exceeds the size limit")
        }
        text += decoder.decode(part.value, { stream: true })
      }
      text += decoder.decode()
    } finally {
      reader.releaseLock()
    }
    const value: unknown = JSON.parse(text)
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== source.length ||
      !source.every(
        (key) =>
          Object.hasOwn(value, key) &&
          typeof (value as Record<string, unknown>)[key] === "string" &&
          String((value as Record<string, unknown>)[key]).length > 0,
      )
    )
      throw new Error("Incomplete language file")
    return Object.freeze(value as Record<string, string>)
  } finally {
    window.clearTimeout(timer)
  }
}
async function changeLocale(next: Locale, persist: boolean): Promise<void> {
  const version = ++selection
  activeLoad?.abort()
  activeLoad = null
  languageLoad = { target: next, status: "loading" }
  emit()
  try {
    let catalog = catalogs.get(next)
    if (!catalog) {
      const controller = new AbortController()
      activeLoad = controller
      catalog = await loadCatalog(next, controller)
    }
    if (version !== selection) return
    catalogs.set(next, catalog)
    activeLoad = null
    languageLoad = null
    if (persist) writeStoredValue(storageKey, next)
    applyLocale(next)
  } catch (failure) {
    if (version !== selection) return
    activeLoad = null
    languageLoad = { target: next, status: "error" }
    emit()
    throw failure
  }
}
export function initializeLocale(): Promise<void> {
  return changeLocale(remembered, false)
}
export function setLocale(next: Locale): Promise<void> {
  return changeLocale(next, true)
}
export function currentLocale(): Locale {
  return locale
}
export function useLocale(): Locale {
  return useSyncExternalStore(
    subscribe,
    () => locale,
    () => "en",
  )
}
export function useLanguageLoad(): LanguageLoad {
  return useSyncExternalStore(
    subscribe,
    () => languageLoad,
    () => null,
  )
}
export function languageMeta(code: Locale) {
  const metadata = LOCALES.find((item) => item.code === code)
  if (!metadata) throw new Error("Unknown language: " + code)
  return metadata
}
export function t(text: string): string {
  const catalog = catalogs.get(locale)
  if (!catalog) throw new Error("Language has not been loaded: " + locale)
  const value = Object.hasOwn(catalog, text) ? catalog[text] : undefined
  return value ?? text
}
export function tf(text: string, values: Readonly<Record<string, unknown>>): string {
  return t(text).replace(/\{(p\d+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  )
}
