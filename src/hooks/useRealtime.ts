import { useEffect, useRef, useState } from "react"
import type { AuthSession } from "../api/types"
import { config } from "../lib/config"
import {
  newerPublicEvent,
  PRIVATE_CHANNELS,
  PRODUCTS,
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
) {
  const plan: Subscription[] = symbol
    ? [
        "trades",
        "depth",
        "candles",
        ...(productLine === "SPOT" ? [] : ["index", "mark"]),
        ...(["LINEAR_PERPETUAL", "INVERSE_PERPETUAL"].includes(productLine) ? ["funding"] : []),
      ].map((channel) => ({
        channel,
        symbol,
        productLine,
        ...(channel === "candles" ? { period } : {}),
      }))
    : []
  return useRealtimeFeed(session, plan)
}

export function useRealtimeFeed(
  session: AuthSession | null,
  subscriptions: readonly Subscription[],
) {
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
    const current: Partial<Record<ProductLine, PrivateView>> = {}
    let tape: WsEnvelope[] = []
    let executions: WsEnvelope[] = []
    const publicLive = new Map<ProductLine, boolean>()
    latest.current.clear()
    const publish = () => {
      if (closed || flush) return
      flush = setTimeout(() => {
        flush = undefined
        setViews({ ...current })
        setOwner(identity)
        setEvents([...executions, ...latest.current.values(), ...tape])
        setRevision((n) => n + 1)
      }, 50)
    }
    const publicManager = new RealtimeConnections(
      config.wsBaseUrlForProductLine,
      null,
      (raw) => {
        if (closed || raw.op !== "event" || !raw.productLine || !raw.channel) return
        const event = unwrapEvent(raw)
        const key = [raw.productLine, raw.channel, raw.symbol ?? "*", raw.period ?? ""].join(":")
        if (!newerPublicEvent(event, latest.current.get(key))) return
        latest.current.set(key, event)
        if (event.channel === "trades") tape = [event, ...tape].slice(0, 80)
        setLastEventAt(new Date().toISOString())
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
                if (current[event.productLine]?.apply(event)) publish()
              }
              if (event.op === "event" && event.channel === "executionReports") {
                const next = unwrapEvent(event)
                executions = [next, ...executions.filter((e) => e.id !== next.id)].slice(0, 80)
                publish()
              }
            },
            (products, live) => {
              if (closed) return
              for (const p of products) {
                if (live) current[p] = new PrivateView()
                else if (current[p]) current[p].status = "STALE"
              }
              publish()
            },
          )
        : null
    privateConnections.current = privateManager
    privateManager?.update(privateSubscriptions(PRODUCTS))
    publish()
    const freshness = setInterval(publish, 1000)
    return () => {
      closed = true
      clearTimeout(flush)
      clearInterval(freshness)
      publicManager.close()
      privateManager?.close()
    }
  }, [accessToken, userId, identity])
  return {
    state,
    lastEventAt,
    events: owner === identity ? events : EMPTY_EVENTS,
    views: owner === identity ? views : EMPTY_VIEWS,
    revision,
    refresh: () => privateConnections.current?.refresh(),
  }
}
