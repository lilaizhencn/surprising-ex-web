import { useCallback, useEffect, useRef, useState } from "react"
import { loadRealtimeState, loadRuntimeProducts } from "../api/endpoints"
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
import { RealtimeConnections } from "../realtimeConnections"
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
  symbol: string,
  productLine: ProductLine,
  period: string,
  additionalSubscriptions: readonly Subscription[] = [],
) {
  const plan: Subscription[] = symbol
    ? [
        "trades",
        "depth",
        "candles",
        ...(productLine === "SPOT" ? [] : ["index", "mark", "openInterest"]),
        ...(["LINEAR_PERPETUAL", "INVERSE_PERPETUAL"].includes(productLine) ? ["funding"] : []),
      ].map((channel) => ({
        channel,
        symbol,
        productLine,
        ...(channel === "candles" ? { period } : {}),
      }))
    : []
  return useRealtimeFeed(session, [...plan, ...additionalSubscriptions])
}

export function useRealtimeFeed(
  session: AuthSession | null,
  subscriptions: readonly Subscription[],
  publishInterval = 100,
  retainTrades = true,
) {
  const [products, setProducts] = useState<readonly ProductLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<RealtimeState>("connecting")
  const [lastEventAt, setLastEventAt] = useState<string | null>(null)
  const [events, setEvents] = useState<readonly WsEnvelope[]>([])
  const [views, setViews] = useState<Readonly<Partial<Record<ProductLine, PrivateView>>>>({})
  const [revision, setRevision] = useState(0)
  const publicConnections = useRef<RealtimeConnections | null>(null)
  const privateConnections = useRef<RealtimeConnections | null>(null)
  const desired = useRef(subscriptions)
  desired.current = subscriptions
  const key = subscriptions.map(subscriptionKey).sort().join("|")
  const latest = useRef(new Map<string, WsEnvelope>())
  const depthSnapshotSerial = useRef(0)
  const recoverDepth = useRef<(subscription: Subscription) => void>(() => {})
  const refreshDepth = useCallback((productLine: ProductLine, symbol: string) => {
    recoverDepth.current({ channel: "depth", productLine, symbol })
  }, [])
  const accessToken = session?.accessToken ?? null
  const userId = session ? String(session.user.userId) : null
  const identity = `${userId ?? ""}:${accessToken ?? ""}`
  const [owner, setOwner] = useState(identity)
  useEffect(() => {
    // The key tracks the structural plan, not the newly allocated array identity.
    void key
    publicConnections.current?.update(desired.current)
    const active = new Set(desired.current.map(subscriptionKey))
    for (const k of latest.current.keys()) if (!active.has(k)) latest.current.delete(k)
  }, [key])
  useEffect(() => {
    let closed = false
    let flush: ReturnType<typeof setTimeout> | undefined
    let receivedAt: string | null = null
    const current: Partial<Record<ProductLine, PrivateView>> = {}
    let tape: WsEnvelope[] = []
    let privateEvents: WsEnvelope[] = []
    let privateDirty = true
    const publicLive = new Map<ProductLine, boolean>()
    // Only the feed owns recovery-in-progress; it ends at the replacement WS snapshot.
    const awaitingDepthSnapshot = new Set<string>()
    latest.current.clear()
    const publish = () => {
      if (closed || flush) return
      flush = setTimeout(() => {
        flush = undefined
        if (privateDirty) {
          setViews({ ...current })
          setRevision((n) => n + 1)
          privateDirty = false
        }
        setOwner(identity)
        setLastEventAt(receivedAt)
        setEvents([...privateEvents, ...latest.current.values(), ...tape])
      }, publishInterval)
    }
    const publicManager = new RealtimeConnections(
      config.wsBaseUrlForProductLine,
      null,
      (raw) => {
        if (closed || raw.op !== "event" || !raw.productLine || !raw.channel) return
        let event = unwrapEvent(raw)
        const key = [raw.productLine, raw.channel, raw.symbol ?? "*", raw.period ?? ""].join(":")
        if (awaitingDepthSnapshot.has(key)) {
          if ((event.data as { updateType?: string } | undefined)?.updateType !== "SNAPSHOT") return
          awaitingDepthSnapshot.delete(key)
          latest.current.delete(key)
        }
        if (
          event.channel === "depth" &&
          (event.data as { updateType?: string })?.updateType === "SNAPSHOT"
        ) {
          // Discard the old connection's deltas; the fresh snapshot is authoritative.
          tape = tape.filter(
            (row) =>
              !(
                row.channel === "depth" &&
                row.productLine === event.productLine &&
                row.symbol === event.symbol
              ),
          )
          event = { ...event, id: `${event.id}:snapshot:${++depthSnapshotSerial.current}` }
        }
        if (!newerPublicEvent(event, latest.current.get(key))) return
        latest.current.set(key, event)
        if ((retainTrades && event.channel === "trades") || event.channel === "depth")
          tape = [event, ...tape].slice(0, 256)
        receivedAt = new Date().toISOString()
        publish()
      },
      (products, live) => {
        if (closed) return
        for (const p of products) {
          publicLive.set(p, live)
          if (!live)
            for (const k of latest.current.keys())
              if (k.startsWith(p + ":")) latest.current.delete(k)
        }
        setState([...publicLive.values()].every(Boolean) ? "live" : "degraded")
        publish()
      },
    )
    recoverDepth.current = (subscription) => {
      const key = subscriptionKey(subscription)
      awaitingDepthSnapshot.add(key)
      latest.current.delete(key)
      tape = tape.filter(
        (event) =>
          !(
            event.productLine === subscription.productLine &&
            event.channel === "depth" &&
            event.symbol === subscription.symbol
          ),
      )
      publicManager.resubscribe(subscription)
    }
    publicConnections.current = publicManager
    publicManager.update(desired.current)
    const privateManager =
      accessToken && userId
        ? new RealtimeConnections(
            config.wsBaseUrlForProductLine,
            accessToken,
            (event) => {
              if (closed || String(event.userId) !== userId || !event.productLine) return
              if (event.op === "snapshot" || PRIVATE_CHANNELS.has(event.channel ?? "")) {
                current[event.productLine] ??= new PrivateView()
                if (current[event.productLine]?.apply(event)) {
                  privateDirty = true
                  publish()
                }
              }
              if (
                event.op === "event" &&
                ["executionReports", "orders"].includes(event.channel ?? "")
              ) {
                const next = unwrapEvent(event)
                privateEvents = [next, ...privateEvents.filter((e) => e.id !== next.id)].slice(
                  0,
                  80,
                )
                publish()
              }
            },
            (products, live) => {
              if (closed) return
              privateDirty = true
              for (const p of products) {
                if (live) current[p] = new PrivateView()
                else if (current[p]) current[p].status = "STALE"
              }
              publish()
            },
          )
        : null
    privateConnections.current = privateManager
    void loadRuntimeProducts()
      .then((enabled) => {
        if (closed) return
        setProducts(enabled)
        setError(null)
        privateManager?.update(privateSubscriptions(enabled))
        if (privateManager)
          for (const productLine of enabled) {
            void loadRealtimeState(productLine)
              .then((snapshot) => {
                if (closed || snapshot["status"] !== "READY") return
                current[productLine] ??= new PrivateView()
                if (current[productLine]?.apply({ op: "snapshot", productLine, data: snapshot })) {
                  privateDirty = true
                  publish()
                }
              })
              .catch(() => {
                /* The subscribed WS snapshot remains responsible for recovery. */
              })
          }
      })
      .catch((reason: unknown) => {
        if (closed) return
        setError(reason instanceof Error ? reason.message : "Account availability unavailable")
        setState("degraded")
      })
    publish()
    const freshness = setInterval(publish, 1000)
    return () => {
      closed = true
      clearTimeout(flush)
      clearInterval(freshness)
      recoverDepth.current = () => {}
      publicManager.close()
      privateManager?.close()
    }
  }, [accessToken, userId, identity, publishInterval, retainTrades])
  return {
    products,
    error,
    state,
    lastEventAt,
    events: owner === identity ? events : EMPTY_EVENTS,
    views: owner === identity ? views : EMPTY_VIEWS,
    revision,
    refresh: () => privateConnections.current?.refresh(),
    refreshDepth,
  }
}
