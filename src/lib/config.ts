import type { ProductLine } from "../types/domain"

function defaultWebSocketBaseUrl(_productLine: ProductLine = "LINEAR_PERPETUAL"): string {
  if (typeof window === "undefined") return ""
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/ws/v1`
}

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL || defaultWebSocketBaseUrl(),
  wsBaseUrlForProductLine: (_productLine: ProductLine) =>
    applicationWebSocketUrl(import.meta.env.VITE_WS_BASE_URL || defaultWebSocketBaseUrl()),
  demoDataEnabled: import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_DATA === "true",
} as const

/** Gateway routes product-scoped subscriptions on one WebSocket. Credentials travel in authenticate. */
export function applicationWebSocketUrl(baseUrl: string): string {
  if (!baseUrl) return ""
  const url = new URL(baseUrl)
  url.searchParams.delete("productLine")
  return url.toString()
}

export const storageKeys = {
  session: "surprising-ex.session",
  theme: "surprising-ex.theme",
  favorites: "surprising-ex.favorites",
} as const
