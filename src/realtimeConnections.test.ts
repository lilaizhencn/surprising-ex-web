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
  it("isolates endpoints and splits large public plans below the server limit", () => {
    const manager = new RealtimeConnections((p) => `ws://fixture/${p}`, null, vi.fn(), vi.fn())
    const plan: Subscription[] = Array.from({ length: 401 }, (_, n) => ({
      channel: "trades",
      productLine: "SPOT",
      symbol: `ASSET-${n}`,
    }))
    manager.update([...plan, { channel: "mark", productLine: "OPTION", symbol: "BTC" }])
    for (const ws of Socket.instances) ws.open()
    expect(Socket.instances).toHaveLength(4)
    expect(Socket.instances.map((ws) => ws.sent.length)).toEqual([180, 180, 41, 1])
    for (const ws of Socket.instances)
      expect(new Set(ws.sent.map((c) => c["productLine"])).size).toBe(1)
    manager.update([])
    expect(Socket.instances.every((ws) => ws.readyState === 3)).toBe(true)
    vi.advanceTimersByTime(60000)
    expect(Socket.instances).toHaveLength(4)
  })
})
