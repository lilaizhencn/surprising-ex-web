import type { ProductLine } from "../types/domain"

const WS_SLUG_BY_PRODUCT_LINE: Record<ProductLine, string> = {
  SPOT: "spot",
  LINEAR_PERPETUAL: "linear-perpetual",
  INVERSE_PERPETUAL: "inverse-perpetual",
  LINEAR_DELIVERY: "linear-delivery",
  INVERSE_DELIVERY: "inverse-delivery",
  OPTION: "option",
}

function defaultWebSocketBaseUrl(productLine: ProductLine = "LINEAR_PERPETUAL"): string {
  if (typeof window === "undefined") return ""
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/ws/${WS_SLUG_BY_PRODUCT_LINE[productLine]}/v1`
}

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL || defaultWebSocketBaseUrl(),
  wsBaseUrlForProductLine: (productLine: ProductLine) =>
    import.meta.env.VITE_WS_BASE_URL || defaultWebSocketBaseUrl(productLine),
  demoDataEnabled: import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_DATA === "true",
} as const

export const storageKeys = {
  session: "surprising-ex.session",
  theme: "surprising-ex.theme",
  favorites: "surprising-ex.favorites",
} as const
