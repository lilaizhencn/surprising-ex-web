import type { Subscription, WsEnvelope } from "./realtime"
import { subscriptionKey } from "./realtime"
import { RealtimeConnections } from "./realtimeConnections"
import type { ProductLine } from "./types/domain"

type Endpoint = (product: ProductLine) => string
type Consumer = {
  subscriptions: readonly Subscription[]
  message: (event: WsEnvelope) => void
  state: (products: readonly ProductLine[], live: boolean) => void
}
export type RealtimeConnectionHandle = Pick<
  RealtimeConnections,
  "update" | "refresh" | "resubscribe" | "close"
>

// One transport owner per endpoint resolver and login token. Components retain
// their own books/account views; this registry only owns subscription lifetimes.
const sessions = new WeakMap<Endpoint, Map<string | null, SharedRealtimeSession>>()

export function acquireRealtimeConnections(
  endpoint: Endpoint,
  token: string | null,
  message: Consumer["message"],
  state: Consumer["state"],
): RealtimeConnectionHandle {
  let identities = sessions.get(endpoint)
  if (!identities) {
    identities = new Map()
    sessions.set(endpoint, identities)
  }
  let session = identities.get(token)
  if (!session) {
    session = new SharedRealtimeSession(endpoint, token, () => identities.delete(token))
    identities.set(token, session)
  }
  return session.attach(message, state)
}

class SharedRealtimeSession {
  private readonly consumers = new Set<Consumer>()
  private readonly live = new Map<ProductLine, boolean>()
  private readonly transport: RealtimeConnections

  constructor(
    endpoint: Endpoint,
    token: string | null,
    private readonly dispose: () => void,
  ) {
    this.transport = new RealtimeConnections(
      endpoint,
      token,
      (event) => {
        for (const consumer of this.consumers) {
          if (accepts(consumer.subscriptions, event)) consumer.message(event)
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

  attach(message: Consumer["message"], state: Consumer["state"]): RealtimeConnectionHandle {
    const consumer: Consumer = { subscriptions: [], message, state }
    this.consumers.add(consumer)
    let closed = false
    return {
      update: (subscriptions) => {
        if (closed) return
        const previous = new Set(consumer.subscriptions.map(subscriptionKey))
        const previousProducts = new Set(consumer.subscriptions.map((s) => s.productLine))
        const shared = new Set(
          [...this.consumers]
            .filter((other) => other !== consumer)
            .flatMap((other) => other.subscriptions.map(subscriptionKey)),
        )
        consumer.subscriptions = subscriptions
        this.reconcile()
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
        if (closed) return
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
        if (closed) return
        closed = true
        this.consumers.delete(consumer)
        if (this.consumers.size) this.reconcile()
        else {
          this.transport.close()
          this.dispose()
        }
      },
    }
  }

  private reconcile() {
    this.transport.update([...this.consumers].flatMap((consumer) => consumer.subscriptions))
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
