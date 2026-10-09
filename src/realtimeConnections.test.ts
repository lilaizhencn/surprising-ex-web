import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Subscription } from "./realtime"
import { RealtimeConnections } from "./realtimeConnections"

class Socket {
  static OPEN = 1
  static instances: Socket[] = []
  readyState = 0
  sent: Record<string, unknown>[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  constructor(readonly url: string) {
    Socket.instances.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
}
const account: Subscription = { productLine: "SPOT", channel: "accountState" }
const order: Subscription = { productLine: "SPOT", channel: "orders" }
const publicTrade: Subscription = {
  productLine: "SPOT",
  channel: "trades",
  instrumentId: "BTC-USDT",
}
function socket(index = 0): Socket {
  const value = Socket.instances[index]
  if (!value) throw new Error("Expected socket")
  return value
}
describe("realtime connection lifecycle", () => {
  beforeEach(() => {
    Socket.instances = []
    vi.useFakeTimers()
    vi.stubGlobal("WebSocket", Socket)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  it("waits for auth, reconciles subscriptions and explicitly refreshes only the baseline", () => {
    const manager = new RealtimeConnections(() => "ws://fixture", "secret", vi.fn(), vi.fn())
    manager.update([account, order])
    const ws = socket()
    ws.open()
    expect(ws.url).not.toContain("secret")
    expect(ws.sent.map((c) => c["op"])).toEqual(["authenticate"])
    ws.receive({ op: "authenticated" })
    expect(ws.sent.filter((c) => c["op"] === "subscribe")).toHaveLength(2)
    manager.update([account])
    expect(ws.sent.at(-1)).toMatchObject({ op: "unsubscribe", channel: "orders" })
    manager.refresh()
    expect(ws.sent.slice(-2).map((c) => c["op"])).toEqual(["unsubscribe", "subscribe"])
    expect(ws.sent.at(-1)).toMatchObject({ channel: "accountState" })
    manager.close()
  })
  it("uses the same authenticated socket for public market and private account channels", () => {
    const manager = new RealtimeConnections(() => "ws://fixture", "secret", vi.fn(), vi.fn())
    manager.update([publicTrade, account, order])
    const ws = socket()
    ws.open()
    expect(Socket.instances).toHaveLength(1)
    expect(ws.sent).toEqual([
      { op: "authenticate", id: "auth", token: "secret" },
      expect.objectContaining({ op: "subscribe", channel: "trades" }),
    ])
    ws.receive({ op: "authenticated" })
    expect(ws.sent.filter((command) => command["op"] === "subscribe")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "subscribe", channel: "trades", instrumentId: "BTC-USDT" }),
        expect.objectContaining({ op: "subscribe", channel: "accountState" }),
        expect.objectContaining({ op: "subscribe", channel: "orders" }),
      ]),
    )
    manager.close()
  })
  it("reconnects with a new auth baseline and ignores callbacks from the retired socket", () => {
    const message = vi.fn()
    const manager = new RealtimeConnections(() => "ws://fixture", "secret", message, vi.fn())
    manager.update([account])
    socket().open()
    socket().close()
    vi.advanceTimersByTime(1000)
    socket(1).open()
    expect(socket(1).sent.map((c) => c["op"])).toEqual(["authenticate"])
    socket().receive({ op: "snapshot", userId: 1 })
    expect(message).not.toHaveBeenCalled()
    socket(1).receive({ op: "authenticated" })
    expect(socket(1).sent.at(-1)).toMatchObject({ op: "subscribe", channel: "accountState" })
    manager.close()
    vi.advanceTimersByTime(60000)
    expect(Socket.instances).toHaveLength(2)
  })
  it("resubscribes only the requested depth without disturbing trades or another product", () => {
    const manager = new RealtimeConnections((p) => `ws://fixture/${p}`, null, vi.fn(), vi.fn())
    const depth: Subscription = {
      productLine: "LINEAR_PERPETUAL",
      channel: "depth",
      instrumentId: "BTC-USDT",
    }
    manager.update([
      depth,
      { ...depth, channel: "trades" },
      { ...depth, productLine: "INVERSE_PERPETUAL" },
    ])
    for (const ws of Socket.instances) ws.open()
    const target = Socket.instances.find((ws) => ws.url.endsWith("/LINEAR_PERPETUAL"))
    if (!target) throw new Error("Expected shared socket")
    expect(Socket.instances).toHaveLength(1)
    target.sent = []
    manager.resubscribe(depth)
    expect(target.sent).toEqual([
      expect.objectContaining({ ...depth, op: "unsubscribe" }),
      expect.objectContaining({ ...depth, op: "subscribe" }),
    ])
    expect(target.sent.some((command) => command["productLine"] === "INVERSE_PERPETUAL")).toBe(
      false,
    )
    manager.resubscribe({ ...depth, instrumentId: "ETH-USDT" })
    expect(target.sent).toHaveLength(2)
    target.close()
    manager.resubscribe(depth)
    vi.advanceTimersByTime(1000)
    const replacement = Socket.instances.at(-1)
    replacement?.open()
    expect(replacement?.sent.filter((c) => c["op"] === "subscribe")).toHaveLength(3)
    manager.close()
  })
  it("replaces a silent socket even when close never arrives and restores subscriptions", () => {
    const state = vi.fn()
    const manager = new RealtimeConnections(() => "ws://fixture", null, vi.fn(), state)
    const depth: Subscription = {
      productLine: "LINEAR_PERPETUAL",
      channel: "depth",
      instrumentId: "BTC-USDT",
    }
    manager.update([depth])
    const stale = socket()
    stale.open()
    stale.close = vi.fn() // TCP half-open: browser cannot complete the close handshake.
    vi.advanceTimersByTime(60000)
    expect(stale.close).toHaveBeenCalledOnce()
    expect(state).toHaveBeenLastCalledWith(["LINEAR_PERPETUAL"], false)
    vi.advanceTimersByTime(1000)
    socket(1).open()
    expect(socket(1).sent).toContainEqual(expect.objectContaining({ op: "subscribe", ...depth }))
    stale.onclose?.() // Late callback must not cancel the new socket heartbeat.
    vi.advanceTimersByTime(20000)
    expect(socket(1).sent).toContainEqual(expect.objectContaining({ op: "ping" }))
    manager.close()
  })
  it("recovers a missing depth snapshot even while trades and deltas keep the socket alive", () => {
    const manager = new RealtimeConnections(() => "ws://fixture", null, vi.fn(), vi.fn())
    const depth: Subscription = {
      productLine: "LINEAR_PERPETUAL",
      channel: "depth",
      instrumentId: "BTC-USDT",
    }
    manager.update([depth, { ...depth, channel: "trades" }])
    const ws = socket()
    ws.open()
    for (let i = 0; i < 6; i++) {
      ws.receive({ op: "event", ...depth, data: { value: { updateType: "DELTA" } } })
      ws.receive({ op: "event", ...depth, channel: "trades", data: {} })
      vi.advanceTimersByTime(1000)
    }
    expect(
      ws.sent.filter((event) => event["op"] === "subscribe" && event["channel"] === "depth"),
    ).toHaveLength(3)
    expect(
      ws.sent.filter((event) => event["op"] === "subscribe" && event["channel"] === "trades"),
    ).toHaveLength(1)
    ws.receive({ op: "event", ...depth, data: { value: { updateType: "SNAPSHOT" } } })
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(1000)
      ws.receive({ op: "event", ...depth, data: { value: { updateType: "DELTA" } } })
    }
    expect(
      ws.sent.filter((event) => event["op"] === "subscribe" && event["channel"] === "depth"),
    ).toHaveLength(3)
    manager.update([{ ...depth, channel: "trades" }])
    const sent = ws.sent.length
    vi.advanceTimersByTime(15000)
    expect(ws.sent.slice(sent).every((event) => event["op"] === "ping")).toBe(true)
    manager.close()
  })
  it("refreshes a stalled depth channel independently of pong and trade traffic", () => {
    const manager = new RealtimeConnections(() => "ws://fixture", null, vi.fn(), vi.fn())
    const depth: Subscription = {
      productLine: "LINEAR_PERPETUAL",
      channel: "depth",
      instrumentId: "BTC-USDT",
    }
    manager.update([depth])
    const ws = socket()
    ws.open()
    ws.receive({ op: "event", ...depth, data: { value: { updateType: "SNAPSHOT" } } })
    for (let i = 0; i < 10; i++) {
      ws.receive({ op: "pong" })
      vi.advanceTimersByTime(1000)
    }
    expect(ws.sent.slice(-2).map((event) => event["op"])).toEqual(["unsubscribe", "subscribe"])
    expect(Socket.instances).toHaveLength(1)
    manager.close()
  })
  it("keeps quiet markets connected while pong replies arrive", () => {
    const manager = new RealtimeConnections(() => "ws://fixture", null, vi.fn(), vi.fn())
    manager.update([order])
    socket().open()
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(20000)
      socket().receive({ op: "pong" })
    }
    expect(Socket.instances).toHaveLength(1)
    manager.close()
  })
  it("checks elapsed time on page wake and cleans up the visibility listener", () => {
    const page = new EventTarget()
    Object.defineProperty(page, "visibilityState", { value: "visible" })
    vi.stubGlobal("document", page)
    const manager = new RealtimeConnections(() => "ws://fixture", null, vi.fn(), vi.fn())
    manager.update([order])
    socket().open()
    vi.setSystemTime(Date.now() + 300000) // JS timers were suspended for five minutes.
    page.dispatchEvent(new Event("visibilitychange"))
    expect(socket().readyState).toBe(3)
    vi.advanceTimersByTime(1000)
    socket(1).open()
    manager.close()
    page.dispatchEvent(new Event("visibilitychange"))
    vi.advanceTimersByTime(60000)
    expect(Socket.instances).toHaveLength(2)
  })
  it("times out a connection that never opens", () => {
    const manager = new RealtimeConnections(() => "ws://fixture", null, vi.fn(), vi.fn())
    manager.update([order])
    vi.advanceTimersByTime(61000)
    expect(Socket.instances).toHaveLength(2)
    expect(socket().readyState).toBe(3)
    manager.close()
  })
  it("keeps one socket across product switches, refuses an oversized plan and retains the app connection with no page subscribers", () => {
    const manager = new RealtimeConnections(() => "ws://fixture", null, vi.fn(), vi.fn())
    const plan: Subscription[] = Array.from({ length: 200 }, (_, n) => ({
      channel: "trades",
      productLine: "SPOT",
      instrumentId: `ASSET-${n}`,
    }))
    manager.update(plan)
    socket().open()
    expect(Socket.instances).toHaveLength(1)
    expect(socket().sent).toHaveLength(200)
    expect(() =>
      manager.update([...plan, { channel: "mark", productLine: "OPTION", instrumentId: "BTC" }]),
    ).toThrow("Too many realtime subscriptions")
    expect(Socket.instances).toHaveLength(1)
    manager.update([{ channel: "mark", productLine: "OPTION", instrumentId: "BTC" }])
    expect(Socket.instances).toHaveLength(1)
    expect(socket().sent.at(-1)).toMatchObject({ op: "subscribe", productLine: "OPTION" })
    manager.update([])
    expect(socket().readyState).toBe(1)
    manager.close()
    expect(socket().readyState).toBe(3)
  })
  it("keeps public subscriptions after authentication rejection and never installs private ones", () => {
    const manager = new RealtimeConnections(() => "ws://fixture", "invalid", vi.fn(), vi.fn())
    manager.update([publicTrade, account])
    socket().open()
    socket().receive({ op: "error", error: "Sign in required" })
    manager.update([publicTrade, account, order])
    expect(socket().sent.filter((c) => c["op"] === "authenticate")).toHaveLength(1)
    expect(socket().sent.filter((c) => c["op"] === "subscribe")).toEqual([
      expect.objectContaining({ channel: "trades" }),
    ])
    manager.close()
  })
})
