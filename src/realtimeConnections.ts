import {
  PRIVATE_CHANNELS,
  parseRealtimeJson,
  type Subscription,
  subscriptionKey,
  type WsEnvelope,
} from "./realtime"
import type { ProductLine } from "./types/domain"

/** One application transport; product/channel isolation lives in subscription metadata. */
export class RealtimeConnections {
  private connection: Connection | null = null
  private token: string | null
  private readonly resume = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return
    this.connection?.checkLiveness()
  }
  constructor(
    private readonly endpoint: (product: ProductLine) => string,
    token: string | null,
    private readonly message: (event: WsEnvelope) => void,
    private readonly connectionState: (products: readonly ProductLine[], live: boolean) => void,
  ) {
    this.token = token
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.resume)
    if (typeof window !== "undefined") window.addEventListener("pageshow", this.resume)
  }
  updateToken(token: string | null) {
    if (this.token === token) return
    this.token = token
    this.connection?.updateToken(token)
  }
  update(subscriptions: readonly Subscription[]) {
    const unique = [...new Map(subscriptions.map((s) => [subscriptionKey(s), s])).values()]
    if (unique.length > 200)
      throw new Error("Too many realtime subscriptions. Narrow the selected markets.")
    if (!this.connection) {
      const product = unique[0]?.productLine ?? "LINEAR_PERPETUAL"
      this.connection = new Connection(
        this.endpoint(product),
        this.token,
        this.message,
        this.connectionState,
      )
    }
    this.connection.update(unique)
  }
  refresh() {
    this.connection?.refresh()
  }
  resubscribe(subscription: Subscription) {
    this.connection?.resubscribe(subscription)
  }
  close() {
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.resume)
    if (typeof window !== "undefined") window.removeEventListener("pageshow", this.resume)
    this.connection?.close()
    this.connection = null
  }
}

class Connection {
  private socket: WebSocket | null = null
  private desired = new Map<string, Subscription>()
  private installed = new Map<string, Subscription>()
  private authenticated = false
  private awaitingAuthentication = false
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
    private token: string | null,
    private readonly message: (event: WsEnvelope) => void,
    private readonly state: (products: readonly ProductLine[], live: boolean) => void,
  ) {}
  private products() {
    return [...new Set([...this.desired.values()].map((s) => s.productLine))]
  }
  update(subscriptions: readonly Subscription[]) {
    const previousProducts = new Set(this.products())
    this.desired = new Map(subscriptions.map((s) => [subscriptionKey(s), s]))
    if (!this.socket && !this.reconnect) this.connect()
    const addedProducts = this.products().filter((product) => !previousProducts.has(product))
    if (addedProducts.length && this.socket?.readyState === WebSocket.OPEN)
      this.state(addedProducts, !this.token || this.authenticated)
    this.reconcile()
  }
  updateToken(token: string | null) {
    if (this.token === token) return
    const previous = this.token
    this.token = token
    this.authenticated = false
    this.awaitingAuthentication = false
    if (previous) {
      // Retire the authenticated identity before logout, account change or token replacement.
      if (this.socket) this.disconnect(this.socket)
    } else if (this.socket?.readyState === WebSocket.OPEN && token) {
      this.authenticate(this.socket)
    }
  }
  private authenticate(socket: WebSocket) {
    if (!this.token || this.awaitingAuthentication || this.authenticated) return
    this.awaitingAuthentication = true
    socket.send(JSON.stringify({ op: "authenticate", id: "auth", token: this.token }))
  }
  private connect() {
    if (this.closed) return
    const socket = new WebSocket(this.url)
    this.socket = socket
    this.lastReceivedAt = Date.now()
    this.lastPingAt = Date.now()
    this.depthProgress.clear()
    this.heartbeat = setInterval(() => this.checkLiveness(), 1000)
    this.authenticated = false
    this.awaitingAuthentication = false
    this.installed.clear()
    this.state(this.products(), false)
    socket.onopen = () => {
      if (this.closed || this.socket !== socket) return
      this.attempt = 0
      this.lastReceivedAt = Date.now()
      if (this.token) this.authenticate(socket)
      else this.state(this.products(), true)
      this.reconcile()
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
        if (event.op === "authenticated" && this.awaitingAuthentication) {
          this.awaitingAuthentication = false
          this.authenticated = true
          this.state(this.products(), true)
          this.reconcile()
        }
        if (event.op === "error") {
          if (this.awaitingAuthentication) {
            this.awaitingAuthentication = false
            this.authenticated = false
          }
          this.state(this.products(), false)
        }
        if (
          (event.userId != null || PRIVATE_CHANNELS.has(event.channel ?? "")) &&
          event.op !== "authenticated" &&
          !this.authenticated
        )
          return
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
    if (!this.token || this.authenticated) {
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
    if (socket?.readyState !== WebSocket.OPEN) return
    const allowed = new Map(
      [...this.desired].filter(
        ([, s]) => !PRIVATE_CHANNELS.has(s.channel) || (this.token && this.authenticated),
      ),
    )
    for (const [id, s] of this.installed)
      if (!allowed.has(id)) {
        socket.send(JSON.stringify({ op: "unsubscribe", id, ...s }))
        this.depthProgress.delete(id)
      }
    for (const [id, s] of allowed)
      if (!this.installed.has(id)) {
        socket.send(JSON.stringify({ op: "subscribe", id, ...s }))
        if (s.channel === "depth")
          this.depthProgress.set(id, { at: Date.now(), awaitingSnapshot: true })
      }
    this.installed = allowed
  }
  resubscribe(subscription: Subscription) {
    const id = subscriptionKey(subscription)
    const socket = this.socket
    if (
      !this.desired.has(id) ||
      !this.installed.has(id) ||
      socket?.readyState !== WebSocket.OPEN ||
      (PRIVATE_CHANNELS.has(subscription.channel) && !this.authenticated)
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
