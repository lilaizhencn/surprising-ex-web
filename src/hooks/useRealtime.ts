import { useEffect, useMemo, useRef, useState } from "react";
import { config } from "../config";
import type { AuthSession, ConnectionState, ProductMode, WsEnvelope } from "../types";

export interface RealtimeSnapshot {
  state: ConnectionState;
  lastEventAt?: Date;
  events: WsEnvelope[];
}

export function useRealtime(session: AuthSession | null, symbol: string, productMode: ProductMode): RealtimeSnapshot {
  const [state, setState] = useState<ConnectionState>("offline");
  const [lastEventAt, setLastEventAt] = useState<Date | undefined>();
  const [events, setEvents] = useState<WsEnvelope[]>([]);
  const reconnectTimer = useRef<number | null>(null);

  const url = useMemo(() => {
    const base = new URL(config.wsBaseUrl);
    if (session) {
      base.searchParams.set("token", session.accessToken);
      base.searchParams.set("userId", String(session.user.userId));
    }
    return base.toString();
  }, [session]);

  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      const nextSocket = new WebSocket(url);
      socket = nextSocket;
      nextSocket.onopen = () => {
        attempt = 0;
        setState("live");
        subscribe(nextSocket, symbol, productMode, session);
      };
      nextSocket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as WsEnvelope;
          setLastEventAt(new Date());
          setEvents((current) => [event, ...current].slice(0, 80));
        } catch {
          setState("degraded");
        }
      };
      nextSocket.onerror = () => setState("degraded");
      nextSocket.onclose = () => {
        if (closed) return;
        setState("degraded");
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        reconnectTimer.current = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
      socket?.close();
    };
  }, [productMode, session, symbol, url]);

  return { state, lastEventAt, events };
}

function subscribe(socket: WebSocket, symbol: string, productMode: ProductMode, session: AuthSession | null) {
  const publicChannels: Array<{ id: string; channel: string; symbol: string; period?: string }> = [
    { id: "candles-1m", channel: "candles", symbol, period: "1m" },
    { id: "depth", channel: "depth", symbol },
    { id: "trades", channel: "trades", symbol }
  ];
  if (productMode !== "spot") {
    publicChannels.push(
      { id: "index", channel: "index", symbol },
      { id: "mark", channel: "mark", symbol },
      { id: "funding", channel: "funding", symbol }
    );
  }
  const privateChannels: Array<{ id: string; channel: string; symbol?: string }> = session ? [
    { id: "orders", channel: "orders", symbol },
    { id: "matches", channel: "matches", symbol }
  ] : [];
  if (session && productMode !== "spot") {
    privateChannels.push(
      { id: "positions", channel: "positions", symbol },
      { id: "positionRisk", channel: "positionRisk", symbol },
      { id: "accountRisk", channel: "accountRisk" }
    );
  }
  for (const item of [...publicChannels, ...privateChannels]) {
    socket.send(JSON.stringify({ op: "subscribe", ...item }));
  }
}
