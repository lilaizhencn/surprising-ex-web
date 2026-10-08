import { describe, expect, it } from "vitest"
import { productWebSocketUrl } from "./config"

describe("product WebSocket routing", () => {
  it("opens separate endpoints for spot and perpetual on the same API host", () => {
    const base = "wss://ex-api.tokdou.com/ws/v1"
    expect(productWebSocketUrl(base, "SPOT")).toBe(`${base}?productLine=SPOT`)
    expect(productWebSocketUrl(base, "LINEAR_PERPETUAL")).toBe(
      `${base}?productLine=LINEAR_PERPETUAL`,
    )
  })

  it("preserves configured paths and replaces an old selector", () => {
    expect(productWebSocketUrl("ws://localhost:9194/ws/v1?x=1&productLine=OPTION", "SPOT")).toBe(
      "ws://localhost:9194/ws/v1?x=1&productLine=SPOT",
    )
    expect(productWebSocketUrl("", "SPOT")).toBe("")
  })
})
