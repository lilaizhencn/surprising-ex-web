import ky, { type Options } from "ky"
import type { z } from "zod"
import { t } from "../i18n"
import { config } from "../lib/config"
import { clearLegalReview, legalAcceptanceHeader } from "../state/legalAcceptance"
import {
  hasStoredSession,
  loadSession,
  saveSession,
  setSessionRefreshIssue,
} from "../state/session"
import type { ProductLine } from "../types/domain"
import { apiErrorMessage } from "./errors"
import type { AuthSession } from "./types"
import { AuthSessionSchema } from "./types"

export class ApiError extends Error {
  readonly name: string = "ApiError"

  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown = null,
    readonly requestSent: boolean = true,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message)
  }
}

class RequestCancelledBeforeSend extends ApiError {
  readonly name = "AbortError"
  constructor() {
    super("Request cancelled before it was sent.", 0, null, false)
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
  readonly expectedUserId?: string
}

export type BinaryRequestOptions = Omit<RequestOptions, "body">

function credentialRequest(path: string): boolean {
  return /^\/api\/v1\/auth\/(?:login(?:\/verify)?|logout|register|forgot-password|reset-password|verify-email|google\/(?:config|challenge|login)|telegram\/(?:config|start|complete))(?:\?|$)/.test(
    path,
  )
}

/** 登录凭证只在 HttpOnly Cookie 里；写请求带 CSRF Cookie 的值作为 X-CSRF-Token。 */
const AUTH_CLIENT = "web"
const CSRF_COOKIE = "surprising-web-csrf"

const DEVICE_ID_KEY = "surprising-ex.device-id"
let verifyInFlight: { sessionKey: string; operation: Promise<AuthSession> } | null = null

/**
 * 向网关确认当前 Cookie 登录是否还有效，并取回最新的用户资料。
 * 401/403 表示登录已失效（过期、被踢下线、被冻结），回到未登录状态；其他失败只标记"暂时不可用"。
 */
export function verifyStoredSession(): Promise<AuthSession> {
  const session = loadSession()
  if (!session) return Promise.reject(new ApiError(t("Sign in required."), 401))
  const { sessionKey } = session
  const userId = String(session.user.userId)
  const stillCurrent = () => loadSession()?.sessionKey === sessionKey
  if (verifyInFlight?.sessionKey === sessionKey) return verifyInFlight.operation
  const operation = request(SESSION_PATH, AuthSessionSchema)
    .then((current) => {
      if (String(current.user.userId) !== userId)
        throw new ApiError(
          t("The service returned an unexpected response. Please refresh and try again."),
          502,
        )
      if (stillCurrent()) saveSession({ ...current, browserSession: true, sessionKey })
      return loadSession() ?? { ...current, sessionKey }
    })
    .catch((error: unknown) => {
      if (stillCurrent()) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403))
          saveSession(null)
        else
          setSessionRefreshIssue(
            t("Session temporarily unavailable. Private operations are paused. Please retry."),
          )
      }
      throw error
    })
    .finally(() => {
      if (verifyInFlight?.operation === operation) verifyInFlight = null
    })
  verifyInFlight = { sessionKey, operation }
  return operation
}

const SESSION_PATH = "/api/v1/auth/session"

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  for (const part of document.cookie.split(";")) {
    const [key, ...value] = part.trim().split("=")
    if (key === name) return decodeURIComponent(value.join("="))
  }
  return null
}

/** CSRF Cookie 缺失（浏览器重启后）时，先请求网关重新下发再读取。 */
async function csrfToken(signal: AbortSignal): Promise<string> {
  const existing = readCookie(CSRF_COOKIE)
  if (existing) return existing
  const response = await ky.get(`${config.apiBaseUrl}/api/v1/auth/csrf`, {
    credentials: "include",
    headers: { "X-Auth-Client": AUTH_CLIENT },
    signal,
    retry: 0,
    timeout: false,
    throwHttpErrors: false,
  })
  if (!response.ok)
    throw new ApiError(
      responseErrorMessage(null, response, false),
      response.status,
      null,
      false,
      retryAfterSeconds(response),
    )
  const text = await response.text()
  if (text.length > 2048) throw new Error("Invalid CSRF response")
  const body = JSON.parse(text) as { token?: unknown }
  if (typeof body.token !== "string" || body.token.length > 512)
    throw new Error("Invalid CSRF response")
  return readCookie(CSRF_COOKIE) ?? body.token
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
  deadline = Date.now() +
    (typeof FormData !== "undefined" && options.body instanceof FormData ? 180_000 : 10_000),
): Promise<T> {
  checkBeforeSend(options.signal, deadline)
  const method = options.method ?? "GET"
  const startingUserId = loadSession()?.user.userId
  // Public market discovery never carries the login cookie.
  const publicMarket =
    method === "GET" &&
    /^\/api\/v1\/(?:gateway\/)?instruments?\/(list|latest|asset-scales)(?:\?|$)/.test(path)
  const session = publicMarket || path.startsWith("/api/v1/auth/google/") ? null : loadSession()
  if (
    !publicMarket &&
    !credentialRequest(path) &&
    startingUserId !== undefined &&
    String(session?.user.userId) !== String(startingUserId)
  )
    throw new ApiError(t("Session changed. No order was sent."), 401, null, false)
  if (
    options.expectedUserId !== undefined &&
    String(session?.user.userId ?? "") !== options.expectedUserId
  )
    throw new ApiError(t("Session changed. No order was sent."), 401, null, false)
  const headers = new Headers(options.headers)
  headers.set("X-Device-Id", browserDeviceId())
  if (session?.user.userId) headers.set("X-User-Id", String(session.user.userId))
  if (options.productLine) headers.set("X-Product-Line", options.productLine)
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)
  const cookieAuth = (session !== null && !publicMarket) || path.startsWith("/api/v1/auth/")
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData
  if (options.body !== undefined && !isFormData) headers.set("Content-Type", "application/json")

  const requestOptions: Options = {
    method,
    headers,
    timeout: deadline - Date.now(),
    retry: method === "GET" ? { limit: options.retry ?? 1, methods: ["get"] } : { limit: 0 },
    throwHttpErrors: false,
  }
  if (options.body !== undefined) {
    requestOptions.body = isFormData ? options.body : JSON.stringify(options.body)
  }
  if (options.signal !== undefined) requestOptions.signal = options.signal
  checkBeforeSend(options.signal, deadline)
  const { response, bytes } = await send(path, requestOptions, false, cookieAuth)
  checkResponseOwner(path, session, options.expectedUserId)
  const raw = new TextDecoder().decode(bytes)
  const payload = parseResponse(raw)

  if (
    response.status === 401 &&
    session &&
    !credentialRequest(path) &&
    loadSession()?.sessionKey === session.sessionKey
  )
    saveSession(null)

  if (!response.ok)
    throw new ApiError(
      responseErrorMessage(payload, response, method !== "GET"),
      response.status,
      payload,
      true,
      retryAfterSeconds(response),
    )
  if (response.status === 204) {
    const empty = schema.parse(null)
    checkResponseDeadline(deadline)
    return empty
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new ApiError(
      t("The service returned an unexpected response. Please refresh and try again."),
      response.status,
      result.error.flatten(),
    )
  }
  checkResponseDeadline(deadline)
  return result.data
}

export async function requestBlob(
  path: string,
  options: BinaryRequestOptions = {},
  deadline = Date.now() + 10_000,
): Promise<Blob> {
  checkBeforeSend(options.signal, deadline)
  const method = options.method ?? "GET"
  const startingUserId = loadSession()?.user.userId
  const session = loadSession()
  if (
    !credentialRequest(path) &&
    startingUserId !== undefined &&
    String(session?.user.userId) !== String(startingUserId)
  )
    throw new ApiError(t("Session changed. No request was sent."), 401, null, false)
  if (
    options.expectedUserId !== undefined &&
    String(session?.user.userId ?? "") !== options.expectedUserId
  )
    throw new ApiError(t("Session changed. No request was sent."), 401, null, false)
  const headers = new Headers(options.headers)
  headers.set("X-Device-Id", browserDeviceId())
  if (session?.user.userId) headers.set("X-User-Id", String(session.user.userId))
  if (options.productLine) headers.set("X-Product-Line", options.productLine)
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)
  const requestOptions: Options = {
    method,
    headers,
    timeout: deadline - Date.now(),
    retry: { limit: 0 },
    throwHttpErrors: false,
  }
  if (options.signal !== undefined) requestOptions.signal = options.signal
  checkBeforeSend(options.signal, deadline)
  const { response, bytes } = await send(path, requestOptions, true, session !== null)
  checkResponseOwner(path, session, options.expectedUserId)
  if (
    response.status === 401 &&
    session &&
    !credentialRequest(path) &&
    loadSession()?.sessionKey === session.sessionKey
  )
    saveSession(null)
  if (!response.ok) {
    const raw = new TextDecoder().decode(bytes)
    const payload = parseResponse(raw)
    throw new ApiError(
      responseErrorMessage(payload, response, method !== "GET"),
      response.status,
      payload,
      true,
      retryAfterSeconds(response),
    )
  }
  const blob = new Blob([bytes], {
    type: response.headers.get("content-type") ?? "application/octet-stream",
  })
  checkResponseDeadline(deadline)
  return blob
}

function checkResponseDeadline(deadline: number): void {
  if (Date.now() >= deadline)
    throw new ApiError(
      t("The response could not be processed in time. Check the result before retrying."),
      0,
    )
}

function retryAfterSeconds(response: Response): number | null {
  const value = response.headers.get("Retry-After")?.trim()
  if (!value) return null
  const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000
  return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : null
}

function responseErrorMessage(payload: unknown, response: Response, mutating: boolean): string {
  const seconds = retryAfterSeconds(response)
  if (response.status === 429 && seconds !== null)
    return t("Too many requests. Retry after {seconds} seconds.").replace(
      "{seconds}",
      String(seconds),
    )
  return apiErrorMessage(payload, response.status, mutating)
}

function checkBeforeSend(signal: AbortSignal | undefined, deadline: number): void {
  if (signal?.aborted) throw new RequestCancelledBeforeSend()
  if (Date.now() >= deadline)
    throw new ApiError(t("The request timed out before it was sent. Please retry."), 0, null, false)
}
function checkResponseOwner(
  path: string,
  session: AuthSession | null,
  expectedUserId: string | undefined,
): void {
  const currentUserId = String(loadSession()?.user.userId ?? "")
  if (
    (expectedUserId !== undefined && currentUserId !== expectedUserId) ||
    (session && !credentialRequest(path) && currentUserId !== String(session.user.userId))
  )
    throw new ApiError(
      t(
        "Session changed. The previous response was discarded. Check the original account before submitting again.",
      ),
      0,
    )
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
  let copiedUntil = 0
  let quoted = false
  let escaped = false
  for (let index = 0; index < raw.length; ) {
    const char = raw.charAt(index)
    if (quoted) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') quoted = false
      index++
      continue
    }
    if (char === '"') {
      quoted = true
      index++
      continue
    }
    if (char !== "-" && (char < "0" || char > "9")) {
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
    const integer = /^-?(?:0|[1-9]\d*)$/.test(token)
    const digits = token.startsWith("-") ? token.length - 1 : token.length
    const unsafe =
      integer && (digits > 16 || (digits === 16 && !Number.isSafeInteger(Number(token))))
    if (unsafe) {
      let next = index
      while (next < raw.length && /[ \t\r\n]/.test(raw.charAt(next))) next++
      // Leave invalid numeric object keys for JSON.parse to reject.
      if (raw.charAt(next) === ":") continue
      output += `${raw.slice(copiedUntil, start)}"${token}"`
      copiedUntil = index
    }
  }
  return output + raw.slice(copiedUntil)
}

const JSON_RESPONSE_LIMIT = 8 * 1024 * 1024
const DOWNLOAD_RESPONSE_LIMIT = 32 * 1024 * 1024

/** One deadline owns connection, retry delays, response headers and bounded body reads. */
async function send(
  path: string,
  options: Options,
  binary = false,
  cookieAuth = false,
): Promise<{ response: Response; bytes: Uint8Array<ArrayBuffer> }> {
  const controller = new AbortController()
  const externalSignal = options.signal
  let deadlineExpired = false
  const abortFromCaller = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromCaller()
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true })
  const timer = setTimeout(
    () => {
      deadlineExpired = true
      controller.abort(new DOMException("Response deadline exceeded", "TimeoutError"))
    },
    typeof options.timeout === "number" ? options.timeout : 10_000,
  )
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let rejectAbort: (() => void) | undefined
  let requestSent = false
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () =>
        reject(controller.signal.reason ?? new DOMException("Cancelled", "AbortError"))
      if (controller.signal.aborted) rejectAbort()
      else controller.signal.addEventListener("abort", rejectAbort, { once: true })
    })
    const loginRequest = path.startsWith("/api/v1/auth/") && options.method !== "GET"
    const operation = async () => {
      controller.signal.throwIfAborted()
      const headers = new Headers(options.headers as HeadersInit | undefined)
      if (cookieAuth) headers.set("X-Auth-Client", AUTH_CLIENT)
      if (loginRequest) {
        const acceptance = legalAcceptanceHeader()
        if (acceptance) headers.set("X-Legal-Acceptance", acceptance)
        headers.set("X-Auth-Transport", "cookie")
      }
      if (cookieAuth && options.method !== undefined && options.method !== "GET")
        headers.set("X-CSRF-Token", await csrfToken(controller.signal))
      requestSent = true
      const response = await ky(`${config.apiBaseUrl}${path}`, {
        ...options,
        headers,
        credentials: cookieAuth ? "include" : "omit",
        timeout: false,
        signal: controller.signal,
      })
      controller.signal.throwIfAborted()
      const limit = binary && response.ok ? DOWNLOAD_RESPONSE_LIMIT : JSON_RESPONSE_LIMIT
      const length = Number(response.headers.get("content-length"))
      if (Number.isFinite(length) && length > limit) throw new Error("Response exceeds size limit")
      reader = response.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      while (reader) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > limit) throw new Error("Response exceeds size limit")
        chunks.push(chunk.value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      return { response, bytes }
    }
    return await Promise.race([operation(), aborted])
  } catch (error) {
    controller.abort(error)
    if (
      externalSignal?.aborted ||
      (!deadlineExpired && error instanceof Error && error.name === "AbortError")
    )
      throw error
    if (error instanceof ApiError) throw error
    throw new ApiError(
      options.method === "GET"
        ? t("Unable to load the response. Check your connection and try again.")
        : t(
            "The result is not yet confirmed. Check your orders or settings before submitting again.",
          ),
      0,
      null,
      requestSent,
    )
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener("abort", abortFromCaller)
    if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort)
    if (controller.signal.aborted) void reader?.cancel().catch(() => {})
    else reader?.releaseLock()
  }
}

/** Called before mounting protected routes, so a reload restores identity from the HttpOnly cookie. */
export async function restoreBrowserSession(): Promise<void> {
  if (!hasStoredSession()) return
  try {
    const restored = await request(SESSION_PATH, AuthSessionSchema)
    saveSession({ ...restored, browserSession: true })
    clearLegalReview()
  } catch {
    saveSession(null)
  }
}
