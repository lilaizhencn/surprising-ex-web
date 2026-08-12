export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL ?? "",
  demoDataEnabled: import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_DATA === "true",
} as const

export const storageKeys = {
  session: "surprising-ex.session",
  theme: "surprising-ex.theme",
  favorites: "surprising-ex.favorites",
} as const
