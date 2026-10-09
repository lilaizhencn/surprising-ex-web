import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Subscription } from "./realtime"
import { acquireRealtimeConnections, retainRealtimeSession } from "./sharedRealtimeConnections"

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
const owners = new Map<typeof endpoint, ReturnType<typeof retainRealtimeSession>>()
function acquire(token: string | null, message = vi.fn(), state = vi.fn(), route = endpoint) {
  if (!owners.has(route)) owners.set(route, retainRealtimeSession(route, token))
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
    for (const owner of owners.values()) owner.close()
    owners.clear()
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
    expect(ws.readyState).toBe(1)
    owners.get(endpoint)?.close()
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
  it("keeps pair quotes, current market and private channels on one authenticated trading transport", () => {
    const feed = acquire("trade-session")
    const eth = { ...trade, instrumentId: "653" }
    const sol = { ...trade, instrumentId: "866" }
    feed.update([trade, depth, index, trade, eth, sol])
    const ws = socket()
    ws.open()
    ws.receive({ op: "authenticated" })
    feed.update([trade, depth, index, trade, eth, sol, account])
    expect(Socket.instances).toHaveLength(1)
    expect(ws.sent.filter((c) => c["op"] === "authenticate")).toHaveLength(1)
    expect(
      ws.sent.filter((c) => c["op"] === "subscribe" && c["channel"] === "trades"),
    ).toHaveLength(3)
    feed.update([trade, eth, sol, { ...eth, channel: "depth" }, account])
    expect(Socket.instances).toHaveLength(1)
    expect(
      ws.sent.filter((c) => c["op"] === "unsubscribe" && c["channel"] === "accountState"),
    ).toHaveLength(0)
    ws.onclose?.()
    vi.advanceTimersByTime(1000)
    const replacement = socket(1)
    replacement.open()
    replacement.receive({ op: "authenticated" })
    expect(Socket.instances.filter((connection) => connection.readyState === 1)).toHaveLength(1)
    expect(
      replacement.sent.filter((c) => c["op"] === "subscribe" && c["channel"] === "trades"),
    ).toHaveLength(3)
    expect(replacement.sent).toContainEqual(
      expect.objectContaining({
        op: "subscribe",
        channel: "accountState",
        productLine: "LINEAR_PERPETUAL",
      }),
    )
  })
  it("shares public consumers with the application identity and drops stale private consumers on account change", () => {
    const first = vi.fn(),
      second = vi.fn(),
      publicMessages = vi.fn()
    const a = acquire("first", first)
    const b = acquire(null, publicMessages)
    a.update([trade, account])
    b.update([trade])
    const ws = socket()
    ws.open()
    ws.receive({ op: "authenticated", userId: "1" })
    expect(Socket.instances).toHaveLength(1)
    expect(ws.sent.filter((c) => c["op"] === "authenticate")).toHaveLength(1)
    const root = owners.get(endpoint)
    if (!root) throw new Error("Expected application owner")
    root.updateToken("second")
    const c = acquire("second", second)
    c.update([account])
    expect(ws.readyState).toBe(3)
    vi.advanceTimersByTime(1000)
    const next = socket(1)
    next.open()
    next.receive({ op: "authenticated", userId: "2" })
    const privateEvent = { op: "snapshot", userId: "2", productLine: "LINEAR_PERPETUAL", data: {} }
    first.mockClear()
    publicMessages.mockClear()
    second.mockClear()
    next.receive(privateEvent)
    expect(first).not.toHaveBeenCalled()
    expect(publicMessages).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(privateEvent)
    expect(Socket.instances.filter((s) => s.readyState === 1)).toHaveLength(1)
  })
  it("upgrades an anonymous socket once on login and removes private subscriptions on logout", () => {
    const page = acquire(null)
    page.update([trade])
    const ws = socket()
    ws.open()
    const root = owners.get(endpoint)
    if (!root) throw new Error("Expected application owner")
    root.updateToken("login-token")
    root.update([account])
    expect(Socket.instances).toHaveLength(1)
    expect(ws.sent.filter((c) => c["op"] === "authenticate")).toHaveLength(1)
    expect(ws.sent.filter((c) => c["channel"] === "accountState")).toHaveLength(0)
    ws.receive({ op: "authenticated", userId: "1" })
    expect(ws.sent.at(-1)).toMatchObject({ op: "subscribe", channel: "accountState" })
    root.updateToken(null)
    expect(ws.readyState).toBe(3)
    vi.advanceTimersByTime(1000)
    socket(1).open()
    expect(socket(1).sent).toEqual([
      expect.objectContaining({ op: "subscribe", channel: "trades" }),
    ])
    expect(Socket.instances.filter((s) => s.readyState === 1)).toHaveLength(1)
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
    expect(() =>
      b.update(
        Array.from({ length: 120 }, (_, i) => ({ ...trade, instrumentId: String(i + 120) })),
      ),
    ).toThrow("Too many realtime subscriptions")
    expect(Socket.instances).toHaveLength(1)
    socket().open()
    expect(socket().sent.filter((c) => c["op"] === "subscribe")).toHaveLength(120)
  })
})
