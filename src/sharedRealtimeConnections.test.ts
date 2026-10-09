import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Subscription } from "./realtime"
import { acquireRealtimeConnections } from "./sharedRealtimeConnections"

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

const trade: Subscription = {
  productLine: "LINEAR_PERPETUAL",
  channel: "trades",
  instrumentId: "604",
}
const depth: Subscription = { ...trade, channel: "depth" }
const index: Subscription = { ...trade, channel: "index" }
const account: Subscription = { productLine: "LINEAR_PERPETUAL", channel: "accountState" }
const endpoint = () => "ws://fixture"
function socket(index = 0): Socket {
  const value = Socket.instances[index]
  if (!value) throw new Error("Missing socket")
  return value
}
const handles: ReturnType<typeof acquireRealtimeConnections>[] = []
function acquire(token: string | null, message = vi.fn(), state = vi.fn(), route = endpoint) {
  const handle = acquireRealtimeConnections(route, token, message, state)
  handles.push(handle)
  return handle
}
describe("shared page realtime transports", () => {
  beforeEach(() => {
    Socket.instances = []
    vi.useFakeTimers()
    vi.stubGlobal("WebSocket", Socket)
  })
  afterEach(() => {
    for (const handle of handles.splice(0)) handle.close()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  it("shares a socket, filters events and keeps overlapping subscriptions until their last owner leaves", () => {
    const first = vi.fn(),
      second = vi.fn()
    const a = acquire(null, first),
      b = acquire(null, second)
    a.update([trade, depth])
    b.update([trade, index])
    const ws = socket()
    ws.open()
    expect(Socket.instances).toHaveLength(1)
    expect(ws.sent.filter((c) => c["op"] === "subscribe")).toHaveLength(3)
    const event = {
      op: "event",
      productLine: "LINEAR_PERPETUAL",
      channel: "trades",
      instrumentId: "604",
    }
    ws.receive(event)
    expect(first).toHaveBeenCalledWith(event)
    expect(second).toHaveBeenCalledWith(event)
    ws.receive({ ...event, channel: "index" })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    ws.receive({ ...event, instrumentId: "653" })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    a.close()
    expect(ws.readyState).toBe(1)
    expect(ws.sent.filter((c) => c["op"] === "unsubscribe").map((c) => c["channel"])).toEqual([
      "depth",
    ])
    b.close()
    expect(ws.readyState).toBe(3)
  })
  it("authenticates once and gives a late subscriber fresh depth and account baselines without resetting existing views", () => {
    const first = vi.fn(),
      second = vi.fn(),
      firstState = vi.fn(),
      secondState = vi.fn()
    const a = acquire("token", first, firstState)
    a.update([account, depth])
    const ws = socket()
    ws.open()
    ws.receive({ op: "authenticated" })
    const b = acquire("token", second, secondState)
    b.update([account, depth])
    expect(Socket.instances).toHaveLength(1)
    expect(ws.sent.filter((c) => c["op"] === "authenticate")).toEqual([
      { op: "authenticate", id: "auth", token: "token" },
    ])
    expect(ws.sent.filter((c) => c["op"] === "unsubscribe").map((c) => c["channel"])).toEqual([
      "accountState",
      "depth",
    ])
    expect(firstState.mock.calls.filter((c) => c[1])).toHaveLength(1)
    expect(secondState).toHaveBeenCalledWith(["LINEAR_PERPETUAL"], true)
    const baseline = { op: "snapshot", productLine: "LINEAR_PERPETUAL", userId: "1", data: {} }
    ws.receive(baseline)
    expect(first).toHaveBeenCalledWith(baseline)
    expect(second).toHaveBeenCalledWith(baseline)
  })
  it("keeps user tokens and endpoint resolvers isolated and releases the pool after the last owner", () => {
    const a = acquire("first")
    a.update([trade])
    socket().open()
    const b = acquire("second")
    b.update([trade])
    socket(1).open()
    const c = acquire("first", vi.fn(), vi.fn(), () => "ws://other")
    c.update([trade])
    socket(2).open()
    expect(Socket.instances).toHaveLength(3)
    a.close()
    const next = acquire("first")
    next.update([trade])
    expect(Socket.instances).toHaveLength(4)
  })
  it("retains the shared baseline and auth flow through reconnect", () => {
    const aState = vi.fn(),
      bState = vi.fn()
    const a = acquire("token", vi.fn(), aState),
      b = acquire("token", vi.fn(), bState)
    a.update([trade])
    b.update([account])
    socket().open()
    socket().receive({ op: "authenticated" })
    socket().close()
    vi.advanceTimersByTime(1000)
    expect(Socket.instances).toHaveLength(2)
    socket(1).open()
    socket(1).receive({ op: "authenticated" })
    expect(
      socket(1)
        .sent.filter((c) => c["op"] === "subscribe")
        .map((c) => c["channel"])
        .sort(),
    ).toEqual(["accountState", "trades"])
    expect(aState).toHaveBeenLastCalledWith(["LINEAR_PERPETUAL"], true)
    expect(bState).toHaveBeenLastCalledWith(["LINEAR_PERPETUAL"], true)
  })
  it("applies the server subscription cap to the union of all page consumers", () => {
    const a = acquire(null),
      b = acquire(null)
    a.update(Array.from({ length: 120 }, (_, i) => ({ ...trade, instrumentId: String(i) })))
    b.update(Array.from({ length: 120 }, (_, i) => ({ ...trade, instrumentId: String(i + 120) })))
    expect(Socket.instances).toHaveLength(2)
    socket().open()
    socket(1).open()
    expect(socket().sent.filter((c) => c["op"] === "subscribe")).toHaveLength(180)
    expect(socket(1).sent.filter((c) => c["op"] === "subscribe")).toHaveLength(60)
  })
})
