import { config, storageKeys } from "../config";
import type { AuthSession } from "../types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown
  ) {
    super(message);
  }
}

export function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(storageKeys.auth);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(storageKeys.auth);
    return null;
  }
}

export function saveSession(session: AuthSession | null): void {
  if (!session) {
    localStorage.removeItem(storageKeys.auth);
    return;
  }
  localStorage.setItem(storageKeys.auth, JSON.stringify(session));
}

export async function request<T>(path: string, options: RequestInit = {}, session?: AuthSession | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  if (session?.user.userId) {
    headers.set("X-User-Id", String(session.user.userId));
  }
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...options, headers });
  if (!response.ok) {
    let payload: unknown;
    let raw = "";
    try {
      raw = await response.text();
      payload = raw ? JSON.parse(raw) : "";
    } catch {
      payload = raw;
    }
    const message = typeof payload === "object" && payload && "detail" in payload
      ? String((payload as { detail?: string }).detail)
      : typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: string }).message)
        : typeof payload === "string" && payload.trim()
          ? payload
      : `HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function gatewayPath(service: string, path = ""): string {
  return `${config.gatewayPrefix}/${service}${path}`;
}
