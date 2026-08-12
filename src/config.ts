function defaultWebSocketBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/v1`;
}

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL || defaultWebSocketBaseUrl(),
  gatewayPrefix: "/api/v1/gateway",
  authPrefix: "/api/v1/auth",
  enableMockFallback: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_FALLBACK === "true",
  testAccount: import.meta.env.DEV && import.meta.env.VITE_ENABLE_TEST_ACCOUNT_PREFILL === "true"
    && import.meta.env.VITE_TEST_ACCOUNT_EMAIL && import.meta.env.VITE_TEST_ACCOUNT_PASSWORD
    ? { email: import.meta.env.VITE_TEST_ACCOUNT_EMAIL, password: import.meta.env.VITE_TEST_ACCOUNT_PASSWORD }
    : null
};

export const storageKeys = {
  auth: "surprising-ex.auth"
};

export function displayPrice(ticks: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(ticks);
}

export function displayUnits(units: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals
  }).format(units / 100_000_000);
}

export function displayPpm(ppm: number, decimals = 2): string {
  return `${(ppm / 10_000).toFixed(decimals)}%`;
}

export function compact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}
