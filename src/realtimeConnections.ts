import { parseRealtimeJson, type Subscription, subscriptionKey, type WsEnvelope } from "./realtime"
import type { ProductLine } from "./types/domain"

/** Connections are grouped by endpoint and kept below the server's 200-subscription limit. */
export class RealtimeConnections {
  private readonly connections = new Map<string, Connection>()
  private readonly resume = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return
    for (const connection of this.connections.values()) connection.checkLiveness()
  }
  constructor(
    private readonly endpoint: (product: ProductLine) => string,
    private readonly token: string | null,
    private readonly message: (event: WsEnvelope) => void,
    private readonly connectionState: (products: readonly ProductLine[], live: boolean) => void,
  ) {
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.resume)
    if (typeof window !== "undefined") window.addEventListener("pageshow", this.resume)
  }
  update(subscriptions: readonly Subscription[]) {
    const groups = new Map<string, Subscription[]>()
    for (const s of subscriptions) {
      const url = this.endpoint(s.productLine)
      const group = groups.get(url) ?? []
      group.push(s)
      groups.set(url, group)
    }
    const batches = new Map<string, { url: string; subscriptions: Subscription[] }>()
    for (const [url, group] of groups) {
      const unique = [...new Map(group.map((s) => [subscriptionKey(s), s])).values()].sort((a, b) =>
        subscriptionKey(a).localeCompare(subscriptionKey(b)),
      )
      for (let i = 0; i < unique.length; i += 180)
        batches.set(`${url}#${i / 180}`, { url, subscriptions: unique.slice(i, i + 180) })
    }
    for (const [key, connection] of this.connections) {
      if (!batches.has(key)) {
        connection.close()
        this.connections.delete(key)
      }
    }
    for (const [key, batch] of batches) {
      let connection = this.connections.get(key)
      if (!connection) {
        connection = new Connection(batch.url, this.token, this.message, this.connectionState)
        this.connections.set(key, connection)
      }
      connection.update(batch.subscriptions)
    }
  }
  refresh() {
    for (const c of this.connections.values()) c.refresh()
  }
  resubscribe(subscription: Subscription) {
    for (const c of this.connections.values()) c.resubscribe(subscription)
  }
  close() {
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.resume)
    if (typeof window !== "undefined") window.removeEventListener("pageshow", this.resume)
    for (const c of this.connections.values()) c.close()
    this.connections.clear()
  }
}

class Connection {
  private socket: WebSocket | null = null
  private desired = new Map<string, Subscription>()
  private installed = new Map<string, Subscription>()
  private authenticated = false
  private closed = false
  private reconnect: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private attempt = 0
  private lastReceivedAt = 0
  private lastPingAt = 0
  // Per active depth subscription only: a recovery deadline, not a book or event history.
  private readonly depthProgress = new Map<string, { at: number; awaitingSnapshot: boolean }>()
  constructor(
    private readonly url: string,
    private readonly token: string | null,
    private readonly message: (event: WsEnvelope) => void,
    private readonly state: (products: readonly ProductLine[], live: boolean) => void,
  ) {}
  private products() {
    return [...new Set([...this.desired.values()].map((s) => s.productLine))]
  }
  update(subscriptions: readonly Subscription[]) {
    this.desired = new Map(subscriptions.map((s) => [subscriptionKey(s), s]))
    if (!this.socket && !this.reconnect) this.connect()
    this.reconcile()
  }
  private connect() {
    if (this.closed) return
    const socket = new WebSocket(this.url)
    this.socket = socket
    this.lastReceivedAt = Date.now()
    this.lastPingAt = Date.now()
    this.depthProgress.clear()
    this.heartbeat = setInterval(() => this.checkLiveness(), 1000)
    this.authenticated = !this.token
    this.installed.clear()
    this.state(this.products(), false)
    socket.onopen = () => {
      if (this.closed || this.socket !== socket) return
      this.attempt = 0
      this.lastReceivedAt = Date.now()
      if (this.token)
        socket.send(JSON.stringify({ op: "authenticate", id: "auth", token: this.token }))
      else {
        this.state(this.products(), true)
        this.reconcile()
      }
    }
    socket.onmessage = (message) => {
      if (this.closed || this.socket !== socket) return
      try {
        const event = parseRealtimeJson(String(message.data))
        this.lastReceivedAt = Date.now()
        if (event.op === "event" && event.channel === "depth" && event.productLine) {
          const key = subscriptionKey({
            channel: "depth",
            productLine: event.productLine,
            ...(event.instrumentId ? { instrumentId: event.instrumentId } : {}),
          })
          const progress = this.depthProgress.get(key)
          const outer = event.data as { value?: unknown; updateType?: string } | undefined
          const data = (outer?.value ?? outer) as { updateType?: string } | undefined
          if (progress && (!progress.awaitingSnapshot || data?.updateType === "SNAPSHOT")) {
            progress.at = Date.now()
            progress.awaitingSnapshot = false
          }
        }
        if (event.op === "authenticated") {
          this.authenticated = true
          this.state(this.products(), true)
          this.reconcile()
        }
        if (event.op === "error") this.state(this.products(), false)
        this.message(event)
      } catch {
        this.state(this.products(), false)
      }
    }
    socket.onerror = () => this.disconnect(socket)
    socket.onclose = () => this.disconnect(socket)
  }
  checkLiveness() {
    const socket = this.socket
    if (this.closed || !socket) return
    // Wall-clock time catches a suspended tab as soon as timers/visibility resume.
    if (Date.now() - this.lastReceivedAt >= 45000) {
      this.disconnect(socket)
      return
    }
    if (socket.readyState !== WebSocket.OPEN) return
    const now = Date.now()
    if (this.authenticated) {
      for (const [key, progress] of this.depthProgress) {
        const deadline = progress.awaitingSnapshot ? 3000 : 10000
        const subscription = this.desired.get(key)
        if (subscription && now - progress.at >= deadline) this.resubscribe(subscription)
      }
    }
    if (now - this.lastPingAt >= 20000) {
      socket.send(JSON.stringify({ op: "ping", id: "heartbeat" }))
      this.lastPingAt = now
    }
  }
  private disconnect(socket: WebSocket) {
    if (this.closed || this.socket !== socket) return
    clearInterval(this.heartbeat)
    this.socket = null
    this.state(this.products(), false)
    // A half-open socket may never deliver close; retire it before scheduling reconnect.
    socket.close()
    this.reconnect = setTimeout(
      () => {
        this.reconnect = undefined
        this.connect()
      },
      Math.min(1000 * 2 ** this.attempt++, 15000),
    )
  }
  private reconcile() {
    const socket = this.socket
    if (socket?.readyState !== WebSocket.OPEN || !this.authenticated) return
    for (const [id, s] of this.installed)
      if (!this.desired.has(id)) {
        socket.send(JSON.stringify({ op: "unsubscribe", id, ...s }))
        this.depthProgress.delete(id)
      }
    for (const [id, s] of this.desired)
      if (!this.installed.has(id)) {
        socket.send(JSON.stringify({ op: "subscribe", id, ...s }))
        if (s.channel === "depth")
          this.depthProgress.set(id, { at: Date.now(), awaitingSnapshot: true })
      }
    this.installed = new Map(this.desired)
  }
  resubscribe(subscription: Subscription) {
    const id = subscriptionKey(subscription)
    const socket = this.socket
    if (
      !this.desired.has(id) ||
      !this.installed.has(id) ||
      socket?.readyState !== WebSocket.OPEN ||
      !this.authenticated
    )
      return
    socket.send(JSON.stringify({ op: "unsubscribe", id, ...subscription }))
    socket.send(JSON.stringify({ op: "subscribe", id, ...subscription }))
    if (subscription.channel === "depth")
      this.depthProgress.set(id, { at: Date.now(), awaitingSnapshot: true })
  }
  refresh() {
    const socket = this.socket
    if (socket?.readyState !== WebSocket.OPEN || !this.authenticated) return
    for (const [id, s] of this.desired)
      if (s.channel === "accountState") {
        socket.send(JSON.stringify({ op: "unsubscribe", id, ...s }))
        socket.send(JSON.stringify({ op: "subscribe", id, ...s }))
      }
  }
  close() {
    this.closed = true
    clearTimeout(this.reconnect)
    clearInterval(this.heartbeat)
    this.socket?.close()
  }
}
