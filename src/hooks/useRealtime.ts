import { useEffect, useState } from "react"
import type { AuthSession } from "../api/types"
import { config } from "../lib/config"
import type { ProductLine } from "../types/domain"

export type RealtimeState = "offline" | "connecting" | "live" | "degraded"

export type RealtimeEvent = Readonly<Record<string, unknown>>

export function useRealtime(
  session: AuthSession | null,
  symbol: string,
  productLine: ProductLine,
  period: string,
) {
  const [state, setState] = useState<RealtimeState>("offline")
  const [lastEventAt, setLastEventAt] = useState<string | null>(null)
  const [events, setEvents] = useState<readonly RealtimeEvent[]>([])
  const accessToken = session?.accessToken ?? null
  const sessionUserId = session?.user.userId === undefined ? null : String(session.user.userId)

  useEffect(() => {
    const baseUrl = config.wsBaseUrl
    if (!baseUrl || !symbol) {
      setState("offline")
      return
    }
    let closed = false
    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let attempt = 0

    const connect = () => {
      if (closed) return
      setState(attempt === 0 ? "connecting" : "degraded")
      socket = new WebSocket(baseUrl)
      socket.onopen = () => {
        attempt = 0
        setState("live")
        subscribe(socket, publicSubscriptions(symbol, productLine, period))
      }
      socket.onmessage = (message) => {
        const event = parseEvent(message.data)
        if (!event) {
          setState("degraded")
          return
        }
        setLastEventAt(new Date().toISOString())
        setEvents((current) => [event, ...current].slice(0, 80))
      }
      socket.onerror = () => setState("degraded")
      socket.onclose = () => {
        if (closed) return
        attempt += 1
        setState("degraded")
        reconnectTimer = window.setTimeout(connect, Math.min(1000 * 2 ** attempt, 15_000))
      }
    }

    connect()
    return () => {
      closed = true
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [period, productLine, symbol])

  useEffect(() => {
    if (!accessToken || !sessionUserId || !config.wsBaseUrl || !symbol) return
    let closed = false
    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let attempt = 0
    const connect = () => {
      if (closed) return
      socket = new WebSocket(config.wsBaseUrl)
      socket.onopen = () => {
        attempt = 0
        if (!socket || socket.readyState !== WebSocket.OPEN) return
        socket.send(
          JSON.stringify({
            op: "authenticate",
            id: `auth-${sessionUserId}`,
            token: accessToken,
          }),
        )
      }
      socket.onmessage = (message) => {
        const event = parseEvent(message.data)
        if (!event) return
        if (isAuthenticatedMessage(event)) {
          subscribe(socket, privateSubscriptions(symbol, productLine))
        }
        setLastEventAt(new Date().toISOString())
        setEvents((current) => [event, ...current].slice(0, 80))
      }
      socket.onclose = () => {
        if (closed) return
        attempt += 1
        reconnectTimer = window.setTimeout(connect, Math.min(1000 * 2 ** attempt, 15_000))
      }
    }

    connect()
    return () => {
      closed = true
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [accessToken, productLine, sessionUserId, symbol])

  return { state, lastEventAt, events }
}

export function isAuthenticatedMessage(event: RealtimeEvent): boolean {
  return (
    Reflect.get(event, "op") === "authenticated" || Reflect.get(event, "type") === "authenticated"
  )
}

type Subscription = Readonly<{
  id: string
  channel: string
  productLine: ProductLine
  symbol?: string
  period?: string
}>

function publicSubscriptions(
  symbol: string,
  productLine: ProductLine,
  period: string,
): readonly Subscription[] {
  const channels: Subscription[] = [
    { id: `candles-${period}`, channel: "candles", productLine, symbol, period },
    { id: "depth", channel: "depth", productLine, symbol },
    { id: "trades", channel: "trades", productLine, symbol },
  ]
  if (productLine !== "SPOT" && productLine !== "OPTION") {
    channels.push(
      { id: "index", channel: "index", productLine, symbol },
      { id: "mark", channel: "mark", productLine, symbol },
      { id: "funding", channel: "funding", productLine, symbol },
    )
  }
  return channels
}

function privateSubscriptions(symbol: string, productLine: ProductLine): readonly Subscription[] {
  const channels: Subscription[] = [
    { id: "orders", channel: "orders", productLine, symbol },
    { id: "matches", channel: "matches", productLine, symbol },
    { id: "executionReports", channel: "executionReports", productLine, symbol },
  ]
  if (productLine !== "SPOT") {
    channels.push(
      { id: "positions", channel: "positions", productLine, symbol },
      { id: "positionRisk", channel: "positionRisk", productLine, symbol },
      { id: "accountRisk", channel: "accountRisk", productLine },
    )
  }
  return channels
}

function subscribe(socket: WebSocket | null, channels: readonly Subscription[]) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  for (const channel of channels) socket.send(JSON.stringify({ op: "subscribe", ...channel }))
}

function parseEvent(value: unknown): RealtimeEvent | null {
  if (typeof value !== "string") return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is RealtimeEvent {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
