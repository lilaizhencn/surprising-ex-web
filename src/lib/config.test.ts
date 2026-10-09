import { describe, expect, it } from "vitest"
import { applicationWebSocketUrl, config } from "./config"

describe("application WebSocket routing", () => {
  it("uses one gateway endpoint for all product-scoped subscriptions", () => {
    expect(config.wsBaseUrlForProductLine("SPOT")).toBe(
      config.wsBaseUrlForProductLine("LINEAR_PERPETUAL"),
    )
    expect(applicationWebSocketUrl("wss://ex-api.tokdou.com/ws/v1?productLine=SPOT")).toBe(
      "wss://ex-api.tokdou.com/ws/v1",
    )
  })
  it("preserves configured paths and other parameters", () => {
    expect(applicationWebSocketUrl("ws://localhost:9194/ws/v1?x=1&productLine=OPTION")).toBe(
      "ws://localhost:9194/ws/v1?x=1",
    )
    expect(applicationWebSocketUrl("")).toBe("")
  })
})
