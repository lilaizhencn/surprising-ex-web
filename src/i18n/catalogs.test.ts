import { describe, expect, it } from "vitest"
import { LOCALES, normalizeLocale } from "./locales"
import source from "./source.json"

const catalogs = import.meta.glob<Record<string, string>>("./catalogs/*.json", {
  eager: true,
  import: "default",
})
const placeholders = (text: string) =>
  [...text.matchAll(/\{[A-Za-z_][A-Za-z0-9_]*\}/g)].map((item) => item[0]).sort()
describe("complete UI language coverage", () => {
  it.each(LOCALES)("contains every label and preserves values in $label", ({ code }) => {
    const messages = catalogs[`./catalogs/${code}.json`]
    expect(messages).toBeDefined()
    expect(Object.keys(messages ?? {}).sort()).toEqual([...source].sort())
    for (const key of source) {
      const value = messages?.[key] ?? ""
      expect(value.trim(), key).not.toBe("")
      expect(placeholders(value), key).toEqual(placeholders(key))
    }
  })
  it("normalizes region and script preferences without confusing Chinese variants", () => {
    expect(normalizeLocale("zh-Hant-HK")).toBe("zh-TW")
    expect(normalizeLocale("zh-Hans-CN")).toBe("zh")
    expect(normalizeLocale("pt-BR")).toBe("pt")
    expect(normalizeLocale("ar-SA")).toBe("ar")
    expect(normalizeLocale("unknown")).toBe("en")
  })
})
