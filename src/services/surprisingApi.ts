export const API_PATHS = {
  instruments: "/api/v1/instruments",
  orders: "/api/v1/trading/orders",
  market: "/api/v1/trading/market",
  candlestick: "/api/v1/candlestick",
  accounts: "/api/v1/accounts"
} as const;

export const WS_CHANNELS = {
  candles: "candles",
  trades: "trades",
  depth: "depth",
  index: "index",
  mark: "mark",
  funding: "funding",
  orders: "orders",
  matches: "matches",
  positions: "positions"
} as const;

export const runtimeConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL || ""
};
