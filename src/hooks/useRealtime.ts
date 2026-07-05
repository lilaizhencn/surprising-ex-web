import { useEffect, useMemo, useRef, useState } from "react";
import { config } from "../config";
import type { AuthSession, ConnectionState, ProductMode, WsEnvelope } from "../types";

export interface RealtimeSnapshot {
  state: ConnectionState;
  lastEventAt?: Date;
  events: WsEnvelope[];
}

export function useRealtime(
  session: AuthSession | null,
  symbol: string,
  productMode: ProductMode,
  candlePeriod: string
): RealtimeSnapshot {
  const [state, setState] = useState<ConnectionState>("offline");
  const [lastEventAt, setLastEventAt] = useState<Date | undefined>();
  const [events, setEvents] = useState<WsEnvelope[]>([]);
  const publicReconnectTimer = useRef<number | null>(null);
  const privateReconnectTimer = useRef<number | null>(null);

  const publicUrl = useMemo(() => config.wsBaseUrl, []);
  const privateUrl = useMemo(() => {
    if (!session) return "";
    const base = new URL(config.wsBaseUrl);
    base.searchParams.set("token", session.accessToken);
    base.searchParams.set("userId", String(session.user.userId));
    return base.toString();
  }, [session]);

  const pushEvent = (message: MessageEvent<string>) => {
    try {
      const event = JSON.parse(message.data) as WsEnvelope;
      setLastEventAt(new Date());
      setEvents((current) => [event, ...current].slice(0, 80));
    } catch {
      setState("degraded");
    }
  };

  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      const nextSocket = new WebSocket(publicUrl);
      socket = nextSocket;
      nextSocket.onopen = () => {
        attempt = 0;
        setState("live");
        subscribe(nextSocket, publicSubscriptions(symbol, productMode, candlePeriod));
      };
      nextSocket.onmessage = pushEvent;
      nextSocket.onerror = () => setState("degraded");
      nextSocket.onclose = () => {
        if (closed) return;
        setState("degraded");
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        publicReconnectTimer.current = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      if (publicReconnectTimer.current !== null) window.clearTimeout(publicReconnectTimer.current);
      socket?.close();
    };
  }, [candlePeriod, productMode, publicUrl, symbol]);

  useEffect(() => {
    if (!session || !privateUrl) return;
    let closed = false;
    let socket: WebSocket | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      const nextSocket = new WebSocket(privateUrl);
      socket = nextSocket;
      nextSocket.onopen = () => {
        attempt = 0;
        subscribe(nextSocket, privateSubscriptions(symbol, productMode));
      };
      nextSocket.onmessage = pushEvent;
      nextSocket.onerror = () => undefined;
      nextSocket.onclose = () => {
        if (closed) return;
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        privateReconnectTimer.current = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      if (privateReconnectTimer.current !== null) window.clearTimeout(privateReconnectTimer.current);
      socket?.close();
    };
  }, [privateUrl, productMode, session, symbol]);

  return { state, lastEventAt, events };
}

type Subscription = { id: string; channel: string; symbol?: string; period?: string };

function publicSubscriptions(symbol: string, productMode: ProductMode, candlePeriod: string): Subscription[] {
  const channels: Subscription[] = [
    { id: `candles-${candlePeriod}`, channel: "candles", symbol, period: candlePeriod },
    { id: "depth", channel: "depth", symbol },
    { id: "trades", channel: "trades", symbol }
  ];
  if (productMode !== "spot") {
    channels.push(
      { id: "index", channel: "index", symbol },
      { id: "mark", channel: "mark", symbol },
      { id: "funding", channel: "funding", symbol }
    );
  }
  return channels;
}

function privateSubscriptions(symbol: string, productMode: ProductMode): Subscription[] {
  const channels: Subscription[] = [
    { id: "orders", channel: "orders", symbol },
    { id: "matches", channel: "matches", symbol },
    { id: "executionReports", channel: "executionReports", symbol }
  ];
  if (productMode !== "spot") {
    channels.push(
      { id: "positions", channel: "positions", symbol },
      { id: "positionRisk", channel: "positionRisk", symbol },
      { id: "accountRisk", channel: "accountRisk" }
    );
  }
  return channels;
}

function subscribe(socket: WebSocket, channels: Subscription[]) {
  for (const item of channels) {
    socket.send(JSON.stringify({ op: "subscribe", ...item }));
  }
}
