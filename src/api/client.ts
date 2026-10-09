import ky, { type Options } from "ky"
import type { z } from "zod"
import { t } from "../i18n"
import { config } from "../lib/config"
import { loadSession, saveSession, sessionAccessExpired } from "../state/session"
import type { ProductLine } from "../types/domain"
import { apiErrorMessage } from "./errors"
import type { AuthSession } from "./types"
import { AuthSessionSchema } from "./types"

export class ApiError extends Error {
  readonly name = "ApiError"

  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown = null,
  ) {
    super(message)
  }
}

export type RequestOptions = {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly productLine?: ProductLine
  readonly idempotencyKey?: string
  readonly signal?: AbortSignal
  readonly retry?: number
}

export type BinaryRequestOptions = Omit<RequestOptions, "body">

const DEVICE_ID_KEY = "surprising-ex.device-id"
let refreshInFlight: Promise<AuthSession> | null = null

export function refreshStoredSession(): Promise<AuthSession> {
  if (refreshInFlight) return refreshInFlight
  const session = loadSession()
  if (!session?.refreshToken) return Promise.reject(new ApiError(t("Sign in required."), 401))
  const refreshToken = session.refreshToken
  const operation = request<AuthSession>(
    "/api/v1/auth/refresh",
    AuthSessionSchema,
    { method: "POST", body: { refreshToken } },
    false,
  )
    .then((refreshed) => {
      if (loadSession()?.refreshToken === refreshToken) saveSession(refreshed)
      return refreshed
    })
    .catch((error: unknown) => {
      if (loadSession()?.refreshToken === refreshToken) saveSession(null)
      throw error
    })
    .finally(() => {
      refreshInFlight = null
    })
  refreshInFlight = operation
  return operation
}

function browserDeviceId(): string {
  try {
    const current = window.localStorage.getItem(DEVICE_ID_KEY)
    if (current && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(current))
      return current
    const generated = crypto.randomUUID()
    window.localStorage.setItem(DEVICE_ID_KEY, generated)
    return generated
  } catch {
    return crypto.randomUUID()
  }
}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
  allowRefresh = true,
): Promise<T> {
  const method = options.method ?? "GET"
  // Public market discovery must not wait for an unrelated session refresh.
  const publicMarket =
    method === "GET" &&
    /^\/api\/v1\/gateway\/instrument\/(list|latest|asset-scales)(?:\?|$)/.test(path)
  if (
    !publicMarket &&
    allowRefresh &&
    !path.includes("/auth/") &&
    sessionAccessExpired(loadSession())
  )
    await refreshStoredSession()
  const session = publicMarket ? null : loadSession()
  const headers = new Headers(options.headers)
  headers.set("X-Device-Id", browserDeviceId())
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`)
  if (session?.user.userId) headers.set("X-User-Id", String(session.user.userId))
  if (options.productLine) headers.set("X-Product-Line", options.productLine)
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData
  if (options.body !== undefined && !isFormData) headers.set("Content-Type", "application/json")

  const requestOptions: Options = {
    method,
    headers,
    timeout: isFormData ? 180_000 : 10_000,
    retry: method === "GET" ? { limit: options.retry ?? 1, methods: ["get"] } : { limit: 0 },
    throwHttpErrors: false,
  }
  if (options.body !== undefined) {
    requestOptions.body = isFormData ? options.body : JSON.stringify(options.body)
  }
  if (options.signal !== undefined) requestOptions.signal = options.signal
  const response = await send(path, requestOptions)
  const raw = await response.text()
  const payload = parseResponse(raw)

  if (
    response.status === 401 &&
    allowRefresh &&
    session?.refreshToken &&
    !path.includes("/auth/")
  ) {
    if (loadSession()?.accessToken === session.accessToken) await refreshStoredSession()
    return request(path, schema, options, false)
  }

  if (
    response.status === 401 &&
    session &&
    !path.includes("/auth/") &&
    loadSession()?.accessToken === session.accessToken
  )
    saveSession(null)

  if (!response.ok)
    throw new ApiError(
      apiErrorMessage(payload, response.status, method !== "GET"),
      response.status,
      payload,
    )
  if (response.status === 204) return schema.parse(null)

  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new ApiError(
      t("The service returned an unexpected response. Please refresh and try again."),
      response.status,
      result.error.flatten(),
    )
  }
  return result.data
}

export async function requestBlob(
  path: string,
  options: BinaryRequestOptions = {},
  allowRefresh = true,
): Promise<Blob> {
  const method = options.method ?? "GET"
  if (allowRefresh && !path.includes("/auth/") && sessionAccessExpired(loadSession()))
    await refreshStoredSession()
  const session = loadSession()
  const headers = new Headers(options.headers)
  headers.set("X-Device-Id", browserDeviceId())
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`)
  if (session?.user.userId) headers.set("X-User-Id", String(session.user.userId))
  if (options.productLine) headers.set("X-Product-Line", options.productLine)
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)
  const requestOptions: Options = {
    method,
    headers,
    timeout: 10_000,
    retry: { limit: 0 },
    throwHttpErrors: false,
  }
  if (options.signal !== undefined) requestOptions.signal = options.signal
  const response = await send(path, requestOptions)
  if (
    response.status === 401 &&
    allowRefresh &&
    session?.refreshToken &&
    !path.includes("/auth/")
  ) {
    if (loadSession()?.accessToken === session.accessToken) await refreshStoredSession()
    return requestBlob(path, options, false)
  }
  if (
    response.status === 401 &&
    session &&
    !path.includes("/auth/") &&
    loadSession()?.accessToken === session.accessToken
  )
    saveSession(null)
  if (!response.ok) {
    const raw = await response.text()
    const payload = parseResponse(raw)
    throw new ApiError(
      apiErrorMessage(payload, response.status, method !== "GET"),
      response.status,
      payload,
    )
  }
  return response.blob()
}

function parseResponse(raw: string): unknown {
  if (!raw.trim()) return null
  try {
    return JSON.parse(quoteUnsafeJsonIntegers(raw))
  } catch (error) {
    if (error instanceof SyntaxError) return raw
    throw error
  }
}

// Core order IDs and balance units are signed 64-bit integers. Preserve their exact
// decimal text before JSON.parse converts them to imprecise JavaScript numbers.
export function quoteUnsafeJsonIntegers(raw: string): string {
  let output = ""
  let quoted = false
  let escaped = false
  for (let index = 0; index < raw.length; ) {
    const char = raw.charAt(index)
    if (quoted) {
      output += char
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') quoted = false
      index++
      continue
    }
    if (char === '"') {
      quoted = true
      output += char
      index++
      continue
    }
    if (char !== "-" && (char < "0" || char > "9")) {
      output += char
      index++
      continue
    }
    const start = index
    if (raw.charAt(index) === "-") index++
    while (index < raw.length && raw.charAt(index) >= "0" && raw.charAt(index) <= "9") index++
    if (raw.charAt(index) === ".") {
      index++
      while (index < raw.length && raw.charAt(index) >= "0" && raw.charAt(index) <= "9") index++
    }
    if (raw.charAt(index) === "e" || raw.charAt(index) === "E") {
      index++
      if (raw.charAt(index) === "+" || raw.charAt(index) === "-") index++
      while (index < raw.length && raw.charAt(index) >= "0" && raw.charAt(index) <= "9") index++
    }
    const token = raw.slice(start, index)
    const integer = /^-?\d+$/.test(token)
    output +=
      integer &&
      (BigInt(token) > BigInt(Number.MAX_SAFE_INTEGER) ||
        BigInt(token) < BigInt(Number.MIN_SAFE_INTEGER))
        ? `"${token}"`
        : token
  }
  return output
}

async function send(path: string, options: Options): Promise<Response> {
  try {
    return await ky(`${config.apiBaseUrl}${path}`, options)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error
    throw new ApiError(
      options.method === "GET"
        ? t("Unable to connect. Check your network and try again.")
        : t(
            "The result is not yet confirmed. Check your orders or settings before submitting again.",
          ),
      0,
    )
  }
}
