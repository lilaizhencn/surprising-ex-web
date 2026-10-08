import type { ProductLine } from "../types/domain"

function defaultWebSocketBaseUrl(_productLine: ProductLine = "LINEAR_PERPETUAL"): string {
  if (typeof window === "undefined") return ""
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/ws/v1`
}

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL || defaultWebSocketBaseUrl(),
  wsBaseUrlForProductLine: (productLine: ProductLine) =>
    productWebSocketUrl(import.meta.env.VITE_WS_BASE_URL || defaultWebSocketBaseUrl(), productLine),
  demoDataEnabled: import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_DATA === "true",
} as const

/** The edge uses this selector before the WebSocket upgrade; frames cannot change its backend. */
export function productWebSocketUrl(baseUrl: string, productLine: ProductLine): string {
  if (!baseUrl) return ""
  const url = new URL(baseUrl)
  url.searchParams.set("productLine", productLine)
  return url.toString()
}

export const storageKeys = {
  session: "surprising-ex.session",
  theme: "surprising-ex.theme",
  favorites: "surprising-ex.favorites",
} as const
