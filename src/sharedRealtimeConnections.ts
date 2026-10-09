import type { Subscription, WsEnvelope } from "./realtime"
import { PRIVATE_CHANNELS, subscriptionKey } from "./realtime"
import { RealtimeConnections } from "./realtimeConnections"
import type { ProductLine } from "./types/domain"

type Endpoint = (product: ProductLine) => string
type Consumer = {
  subscriptions: readonly Subscription[]
  token: string | null
  message: (event: WsEnvelope) => void
  state: (products: readonly ProductLine[], live: boolean) => void
}
export type RealtimeConnectionHandle = Pick<
  RealtimeConnections,
  "update" | "refresh" | "resubscribe" | "close"
>

// Application session owns authentication; pages only retain subscription lifetimes.
const sessions = new WeakMap<Endpoint, SharedRealtimeSession>()

export function retainRealtimeSession(endpoint: Endpoint, token: string | null) {
  if (sessions.has(endpoint)) throw new Error("Realtime application session already exists")
  const session = new SharedRealtimeSession(endpoint, token, () => sessions.delete(endpoint))
  sessions.set(endpoint, session)
  let owner = session.attach(
    token,
    () => {},
    () => {},
  )
  return {
    updateToken: (next: string | null) => {
      owner.update([])
      session.updateToken(next)
      const nextOwner = session.attach(
        next,
        () => {},
        () => {},
      )
      owner.close()
      owner = nextOwner
    },
    update: (subscriptions: readonly Subscription[]) => owner.update(subscriptions),
    close: () => session.close(),
  }
}

export function acquireRealtimeConnections(
  endpoint: Endpoint,
  token: string | null,
  message: Consumer["message"],
  state: Consumer["state"],
): RealtimeConnectionHandle {
  const session = sessions.get(endpoint)
  if (!session) throw new Error("Realtime application session is not mounted")
  return session.attach(token, message, state)
}

class SharedRealtimeSession {
  private readonly consumers = new Set<Consumer>()
  private readonly live = new Map<ProductLine, boolean>()
  private readonly transport: RealtimeConnections
  private closed = false

  constructor(
    endpoint: Endpoint,
    private token: string | null,
    private readonly dispose: () => void,
  ) {
    this.transport = new RealtimeConnections(
      endpoint,
      token,
      (event) => {
        if (this.closed) return
        for (const consumer of this.consumers) {
          if (
            (event.userId == null || (consumer.token === this.token && this.token !== null)) &&
            accepts(consumer.subscriptions, event)
          )
            consumer.message(event)
        }
      },
      (products, connected) => {
        for (const product of products) this.live.set(product, connected)
        for (const consumer of this.consumers) {
          const owned = products.filter((product) =>
            consumer.subscriptions.some((subscription) => subscription.productLine === product),
          )
          if (owned.length) consumer.state(owned, connected)
        }
      },
    )
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.transport.close()
    this.consumers.clear()
    this.dispose()
  }

  updateToken(token: string | null) {
    if (this.token === token) return
    this.token = token
    this.transport.updateToken(token)
    this.reconcile()
  }

  attach(
    token: string | null,
    message: Consumer["message"],
    state: Consumer["state"],
  ): RealtimeConnectionHandle {
    const consumer: Consumer = { subscriptions: [], token, message, state }
    this.consumers.add(consumer)
    let closed = false
    return {
      update: (subscriptions) => {
        if (closed || this.closed) return
        const previous = new Set(consumer.subscriptions.map(subscriptionKey))
        const previousProducts = new Set(consumer.subscriptions.map((s) => s.productLine))
        const shared = new Set(
          [...this.consumers]
            .filter((other) => other !== consumer)
            .flatMap((other) => other.subscriptions.map(subscriptionKey)),
        )
        const previousSubscriptions = consumer.subscriptions
        consumer.subscriptions = subscriptions
        try {
          this.reconcile()
        } catch (error) {
          consumer.subscriptions = previousSubscriptions
          throw error
        }
        // Joining an already live transport needs its state and a fresh private/
        // depth baseline. Do not reset existing views on ordinary plan updates.
        for (const product of new Set(subscriptions.map((s) => s.productLine))) {
          if (!previousProducts.has(product) && this.live.has(product))
            consumer.state([product], this.live.get(product) === true)
        }
        for (const subscription of subscriptions) {
          const key = subscriptionKey(subscription)
          if (
            !previous.has(key) &&
            shared.has(key) &&
            ["depth", "accountState"].includes(subscription.channel)
          )
            this.transport.resubscribe(subscription)
        }
      },
      refresh: () => {
        if (closed || this.closed) return
        for (const subscription of consumer.subscriptions)
          if (subscription.channel === "accountState") this.transport.resubscribe(subscription)
      },
      resubscribe: (subscription) => {
        if (
          !closed &&
          consumer.subscriptions.some((s) => subscriptionKey(s) === subscriptionKey(subscription))
        )
          this.transport.resubscribe(subscription)
      },
      close: () => {
        if (closed || this.closed) return
        closed = true
        this.consumers.delete(consumer)
        if (this.consumers.size) this.reconcile()
        else this.close()
      },
    }
  }

  private reconcile() {
    this.transport.update(
      [...this.consumers].flatMap((consumer) =>
        consumer.subscriptions.filter(
          (subscription) =>
            !PRIVATE_CHANNELS.has(subscription.channel) ||
            (consumer.token === this.token && this.token !== null),
        ),
      ),
    )
  }
}

function accepts(subscriptions: readonly Subscription[], event: WsEnvelope): boolean {
  if (!event.productLine) return true
  return subscriptions.some(
    (subscription) =>
      subscription.productLine === event.productLine &&
      (event.op === "snapshot" && !event.channel
        ? subscription.channel === "accountState"
        : subscription.channel === event.channel &&
          (!subscription.instrumentId || subscription.instrumentId === event.instrumentId) &&
          (!subscription.period || subscription.period === event.period)),
  )
}
