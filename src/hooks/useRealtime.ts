import { useEffect, useRef, useState } from "react"
import { loadRuntimeProducts } from "../api/endpoints"
import type { AuthSession } from "../api/types"
import { config } from "../lib/config"
import {
  newerPublicEvent,
  PRIVATE_CHANNELS,
  PrivateView,
  privateSubscriptions,
  type Subscription,
  subscriptionKey,
  unwrapEvent,
  type WsEnvelope,
} from "../realtime"
import { applyDepthEvent } from "../realtimeDepth"
import {
  acquireRealtimeConnections,
  type RealtimeConnectionHandle,
} from "../sharedRealtimeConnections"
import type { ProductLine } from "../types/domain"

export type RealtimeState = "offline" | "connecting" | "live" | "degraded"
export type RealtimeEvent = WsEnvelope
const EMPTY_VIEWS: Readonly<Partial<Record<ProductLine, PrivateView>>> = {}
const EMPTY_EVENTS: readonly WsEnvelope[] = []
export function isAuthenticatedMessage(event: RealtimeEvent): boolean {
  return event.op === "authenticated" || event["type"] === "authenticated"
}
export function useRealtime(
  session: AuthSession | null,
  instrumentId: string,
  productLine: ProductLine,
  period: string,
  additionalSubscriptions: readonly Subscription[] = [],
) {
  const plan: Subscription[] = instrumentId
    ? [
        "trades",
        "depth",
        "candles",
        ...(productLine === "SPOT" ? [] : ["index", "mark", "openInterest"]),
        ...(["LINEAR_PERPETUAL", "INVERSE_PERPETUAL"].includes(productLine) ? ["funding"] : []),
      ].map((channel) => ({
        channel,
        instrumentId,
        productLine,
        ...(channel === "candles" ? { period } : {}),
      }))
    : []
  return useRealtimeFeed(
    session,
    [...plan, ...additionalSubscriptions.filter((subscription) => subscription.instrumentId)],
    0,
    true,
    productLine,
    instrumentId,
  )
}

export function useRealtimeFeed(
  session: AuthSession | null,
  subscriptions: readonly Subscription[],
  publishInterval = 100,
  retainTrades = true,
  privateProductLine?: ProductLine,
  retainTradeInstrumentId?: string,
) {
  const [products, setProducts] = useState<readonly ProductLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<RealtimeState>("connecting")
  const [lastEventAt, setLastEventAt] = useState<string | null>(null)
  const [events, setEvents] = useState<readonly WsEnvelope[]>([])
  const [views, setViews] = useState<Readonly<Partial<Record<ProductLine, PrivateView>>>>({})
  const [revision, setRevision] = useState(0)
  const connections = useRef<RealtimeConnectionHandle | null>(null)
  const desired = useRef(subscriptions)
  desired.current = subscriptions
  const privateDesired = useRef<readonly Subscription[]>([])
  const retainedInstrument = useRef(retainTradeInstrumentId)
  retainedInstrument.current = retainTradeInstrumentId
  const key = subscriptions.map(subscriptionKey).sort().join("|")
  const latest = useRef(new Map<string, WsEnvelope>())
  const depthViewSerial = useRef(0)
  const accessToken = session?.accessToken ?? null
  const userId = session ? String(session.user.userId) : null
  const identity = `${userId ?? ""}:${accessToken ?? ""}`
  const [owner, setOwner] = useState(identity)
  useEffect(() => {
    // The key tracks the structural plan, not the newly allocated array identity.
    void key
    try {
      connections.current?.update([...desired.current, ...privateDesired.current])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Realtime subscription unavailable")
      setState("degraded")
    }
    const active = new Set(desired.current.map(subscriptionKey))
    for (const k of latest.current.keys()) if (!active.has(k)) latest.current.delete(k)
  }, [key])
  useEffect(() => {
    let closed = false
    let cancelPublish: (() => void) | undefined
    let receivedAt: string | null = null
    const current: Partial<Record<ProductLine, PrivateView>> = {}
    let tape: WsEnvelope[] = []
    let privateEvents: WsEnvelope[] = []
    let privateDirty = true
    const publicLive = new Map<ProductLine, boolean>()
    privateDesired.current = []
    // Only the feed owns recovery-in-progress; it ends at the replacement WS snapshot.
    const awaitingDepthSnapshot = new Set<string>()
    latest.current.clear()
    const publish = () => {
      if (closed || cancelPublish) return
      const render = () => {
        cancelPublish = undefined
        if (privateDirty) {
          setViews({ ...current })
          setRevision((n) => n + 1)
          privateDirty = false
        }
        setOwner(identity)
        setLastEventAt(receivedAt)
        setEvents([...privateEvents, ...latest.current.values(), ...tape])
      }
      if (publishInterval > 0) {
        const timer = setTimeout(render, publishInterval)
        cancelPublish = () => clearTimeout(timer)
      } else {
        // Materialize every depth delta; publish the latest complete book at the next paint.
        const frame = requestAnimationFrame(render)
        cancelPublish = () => cancelAnimationFrame(frame)
      }
    }
    const stateHandler = (connectedProducts: readonly ProductLine[], live: boolean) => {
      if (closed) return
      for (const p of connectedProducts) {
        publicLive.set(p, live)
        if (!live)
          for (const k of latest.current.keys()) {
            if (k.startsWith(`${p}:`)) latest.current.delete(k)
          }
        if (accessToken && userId) {
          privateDirty = true
          if (live) current[p] = new PrivateView()
          else if (current[p]) current[p].status = "STALE"
        }
      }
      setState([...publicLive.values()].every(Boolean) ? "live" : "degraded")
      publish()
    }
    const manager = acquireRealtimeConnections(
      config.wsBaseUrlForProductLine,
      accessToken,
      (raw) => {
        if (closed || raw.op === "authenticated") return
        if (
          accessToken &&
          userId &&
          String(raw.userId) === userId &&
          (raw.op === "snapshot" || PRIVATE_CHANNELS.has(raw.channel ?? "")) &&
          raw.productLine
        ) {
          current[raw.productLine] ??= new PrivateView()
          if (current[raw.productLine]?.apply(raw)) {
            privateDirty = true
            publish()
          }
        }
        if (
          accessToken &&
          userId &&
          String(raw.userId) === userId &&
          raw.op === "event" &&
          ["executionReports", "orders"].includes(raw.channel ?? "")
        ) {
          const next = unwrapEvent(raw)
          privateEvents = [next, ...privateEvents.filter((e) => e.id !== next.id)].slice(0, 80)
          publish()
        }
        if (raw.op !== "event" || !raw.productLine || !raw.channel) return
        if (PRIVATE_CHANNELS.has(raw.channel)) return
        let event = unwrapEvent(raw)
        const key = [raw.productLine, raw.channel, raw.instrumentId ?? "*", raw.period ?? ""].join(
          ":",
        )
        if (awaitingDepthSnapshot.has(key)) {
          if ((event.data as { updateType?: string } | undefined)?.updateType !== "SNAPSHOT") return
          awaitingDepthSnapshot.delete(key)
          latest.current.delete(key)
        }
        if (event.channel === "depth") {
          if (!raw.instrumentId) return
          const previous = latest.current.get(key)
          const book = applyDepthEvent(event, previous)
          if (!book) {
            recoverDepth({
              productLine: raw.productLine,
              channel: "depth",
              instrumentId: raw.instrumentId,
            })
            return
          }
          if (book === previous) return
          // Snapshot IDs must remain distinct even if Core restarts at a lower sequence.
          event = { ...book, id: `${book.id}:book:${++depthViewSerial.current}` }
        } else if (!newerPublicEvent(event, latest.current.get(key))) return
        latest.current.set(key, event)
        if (
          retainTrades &&
          event.channel === "trades" &&
          (!retainedInstrument.current || event.instrumentId === retainedInstrument.current)
        )
          tape = [event, ...tape].slice(0, 256)
        receivedAt = new Date().toISOString()
        publish()
      },
      stateHandler,
    )
    const recoverDepth = (subscription: Subscription) => {
      const key = subscriptionKey(subscription)
      awaitingDepthSnapshot.add(key)
      latest.current.delete(key)
      manager.resubscribe(subscription)
    }
    connections.current = manager
    manager.update([...desired.current, ...privateDesired.current])
    if (accessToken && userId)
      void loadRuntimeProducts()
        .then((enabled) => {
          if (closed) return
          setProducts(enabled)
          setError(null)
          privateDesired.current = privateSubscriptions(
            privateProductLine
              ? enabled.filter((productLine) => productLine === privateProductLine)
              : enabled,
          )
          manager.update([...desired.current, ...privateDesired.current])
        })
        .catch((reason: unknown) => {
          if (closed) return
          setError(reason instanceof Error ? reason.message : "Account availability unavailable")
          setState("degraded")
        })
    publish()
    return () => {
      closed = true
      cancelPublish?.()
      manager.close()
    }
  }, [accessToken, userId, identity, publishInterval, retainTrades, privateProductLine])
  return {
    products,
    error,
    state,
    lastEventAt,
    events: owner === identity ? events : EMPTY_EVENTS,
    views: owner === identity ? views : EMPTY_VIEWS,
    revision,
    refresh: () => connections.current?.refresh(),
  }
}
