import { parseRealtimeJson, type Subscription, subscriptionKey, type WsEnvelope } from "./realtime"
import type { ProductLine } from "./types/domain"

/** Connections are grouped by endpoint and kept below the server's 200-subscription limit. */
export class RealtimeConnections {
  private readonly connections = new Map<string, Connection>()
  constructor(
    private readonly endpoint: (product: ProductLine) => string,
    private readonly token: string | null,
    private readonly message: (event: WsEnvelope) => void,
    private readonly connectionState: (products: readonly ProductLine[], live: boolean) => void,
  ) {}
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
  close() {
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
    this.authenticated = !this.token
    this.installed.clear()
    this.state(this.products(), false)
    socket.onopen = () => {
      if (this.closed || this.socket !== socket) return
      this.attempt = 0
      if (this.token)
        socket.send(JSON.stringify({ op: "authenticate", id: "auth", token: this.token }))
      else {
        this.state(this.products(), true)
        this.reconcile()
      }
      this.heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ op: "ping", id: "heartbeat" }))
      }, 20000)
    }
    socket.onmessage = (message) => {
      if (this.closed || this.socket !== socket) return
      try {
        const event = parseRealtimeJson(String(message.data))
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
    socket.onerror = () => socket.close()
    socket.onclose = () => {
      clearInterval(this.heartbeat)
      if (this.closed || this.socket !== socket) return
      this.socket = null
      this.state(this.products(), false)
      this.reconnect = setTimeout(
        () => {
          this.reconnect = undefined
          this.connect()
        },
        Math.min(1000 * 2 ** this.attempt++, 15000),
      )
    }
  }
  private reconcile() {
    const socket = this.socket
    if (socket?.readyState !== WebSocket.OPEN || !this.authenticated) return
    for (const [id, s] of this.installed)
      if (!this.desired.has(id)) socket.send(JSON.stringify({ op: "unsubscribe", id, ...s }))
    for (const [id, s] of this.desired)
      if (!this.installed.has(id)) socket.send(JSON.stringify({ op: "subscribe", id, ...s }))
    this.installed = new Map(this.desired)
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
