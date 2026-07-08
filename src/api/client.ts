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

export interface ApiRequestInit extends RequestInit {
  productLine?: string;
}

export async function request<T>(path: string, options: ApiRequestInit = {}, session?: AuthSession | null): Promise<T> {
  const { productLine, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  if (!headers.has("Content-Type") && requestOptions.body) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  if (session?.user.userId) {
    headers.set("X-User-Id", String(session.user.userId));
  }
  if (productLine) {
    headers.set("X-Product-Line", productLine);
  }
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...requestOptions, headers });
  const raw = await response.text();
  if (!response.ok) {
    const payload = parseJsonPayload(raw) ?? raw;
    const message = responseErrorMessage(payload, raw, response.status);
    throw new ApiError(message, response.status, payload);
  }
  if (response.status === 204 || !raw.trim()) {
    return undefined as T;
  }
  const payload = parseJsonPayload(raw);
  if (payload === undefined) {
    throw new ApiError(nonJsonResponseMessage(raw), response.status, raw);
  }
  return payload as T;
}

export function gatewayPath(service: string, path = ""): string {
  return `${config.gatewayPrefix}/${service}${path}`;
}

function parseJsonPayload(raw: string): unknown | undefined {
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function responseErrorMessage(payload: unknown, raw: string, status: number): string {
  if (isHtmlResponse(raw)) {
    return "接口返回了 HTML 页面，请检查 API 地址或 Vite 网关代理配置。";
  }
  if (typeof payload === "object" && payload && "detail" in payload) {
    return String((payload as { detail?: string }).detail);
  }
  if (typeof payload === "object" && payload && "message" in payload) {
    return String((payload as { message?: string }).message);
  }
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  return `HTTP ${status}`;
}

function nonJsonResponseMessage(raw: string): string {
  if (isHtmlResponse(raw)) {
    return "接口返回了 HTML 页面，请检查 API 地址或 Vite 网关代理配置。";
  }
  return "接口返回了非 JSON 响应，请检查 API 地址或 Vite 网关代理配置。";
}

function isHtmlResponse(raw: string): boolean {
  const value = raw.trimStart().toLowerCase();
  return value.startsWith("<!doctype") || value.startsWith("<html");
}
