import { describe, expect, it } from "vitest"
import { t } from "./index"
import messages from "./zh.json"

describe("language catalogue", () => {
  it("defaults to English without browser preferences", () => {
    expect(t("Order book")).toBe("Order book")
    expect(t("Open")).toBe("Open")
    expect(t("Take-profit & stop-loss")).toBe("Take-profit & stop-loss")
  })
  it("keeps English source text free of Chinese and provides nonempty translations", () => {
    for (const [english, chinese] of Object.entries(messages)) {
      expect(english).not.toMatch(/[\u3400-\u9fff]/)
      expect(chinese.trim()).not.toBe("")
    }
  })
})
