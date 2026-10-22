import ky, { type Options } from "ky"
import type { z } from "zod"
import { t } from "../i18n"
import { config } from "../lib/config"
import {
  loadSession,
  saveSession,
  sessionAccessExpired,
  sessionRefreshIssue,
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
  return /^\/api\/v1\/auth\/(?:login(?:\/verify)?|logout|register|forgot-password|reset-password|verify-email|refresh|telegram\/(?:config|start|complete))(?:\?|$)/.test(
    path,
  )
}

const DEVICE_ID_KEY = "surprising-ex.device-id"
let refreshInFlight: { token: string; userId: string; operation: Promise<AuthSession> } | null =
  null

export function refreshStoredSession(): Promise<AuthSession> {
  const session = loadSession()
  if (!session?.refreshToken) return Promise.reject(new ApiError(t("Sign in required."), 401))
  const refreshToken = session.refreshToken
  const userId = String(session.user.userId)
  const stillCurrent = () =>
    loadSession()?.refreshToken === refreshToken && String(loadSession()?.user.userId) === userId
  if (refreshInFlight?.token === refreshToken && refreshInFlight.userId === userId)
    return refreshInFlight.operation
  const operation = request<AuthSession>(
    "/api/v1/auth/refresh",
    AuthSessionSchema,
    { method: "POST", body: { refreshToken } },
    false,
  )
    .then((refreshed) => {
      if (String(refreshed.user.userId) !== userId)
        throw new ApiError(
          t("The service returned an unexpected response. Please refresh and try again."),
          502,
        )
      if (stillCurrent()) saveSession(refreshed)
      return refreshed
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
      if (refreshInFlight?.operation === operation) refreshInFlight = null
    })
  refreshInFlight = { token: refreshToken, userId, operation }
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
  deadline = Date.now() +
    (typeof FormData !== "undefined" && options.body instanceof FormData ? 180_000 : 10_000),
): Promise<T> {
  checkBeforeSend(options.signal, deadline)
  const method = options.method ?? "GET"
  const startingUserId = loadSession()?.user.userId
  // Public market discovery must not wait for an unrelated session refresh.
  const publicMarket =
    method === "GET" &&
    /^\/api\/v1\/gateway\/instrument\/(list|latest|asset-scales)(?:\?|$)/.test(path)
  if (
    !publicMarket &&
    allowRefresh &&
    !credentialRequest(path) &&
    (sessionAccessExpired(loadSession()) || sessionRefreshIssue() !== null)
  )
    await waitForSessionRefresh(options.signal, deadline)
  const session = publicMarket ? null : loadSession()
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
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`)
  if (session?.user.userId) headers.set("X-User-Id", String(session.user.userId))
  if (options.productLine) headers.set("X-Product-Line", options.productLine)
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)
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
  const { response, bytes } = await send(path, requestOptions)
  checkResponseOwner(path, session, options.expectedUserId)
  const raw = new TextDecoder().decode(bytes)
  const payload = parseResponse(raw)

  if (
    response.status === 401 &&
    allowRefresh &&
    session?.refreshToken &&
    !credentialRequest(path)
  ) {
    if (loadSession()?.accessToken === session.accessToken)
      await waitForSessionRefresh(options.signal, deadline)
    return request(
      path,
      schema,
      { ...options, expectedUserId: options.expectedUserId ?? String(session.user.userId) },
      false,
      deadline,
    )
  }

  if (
    response.status === 401 &&
    session &&
    !credentialRequest(path) &&
    loadSession()?.accessToken === session.accessToken
  )
    saveSession(null)

  if (!response.ok)
    throw new ApiError(
      apiErrorMessage(payload, response.status, method !== "GET"),
      response.status,
      payload,
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
  allowRefresh = true,
  deadline = Date.now() + 10_000,
): Promise<Blob> {
  checkBeforeSend(options.signal, deadline)
  const method = options.method ?? "GET"
  const startingUserId = loadSession()?.user.userId
  if (
    allowRefresh &&
    !credentialRequest(path) &&
    (sessionAccessExpired(loadSession()) || sessionRefreshIssue() !== null)
  )
    await waitForSessionRefresh(options.signal, deadline)
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
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`)
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
  const { response, bytes } = await send(path, requestOptions, true)
  checkResponseOwner(path, session, options.expectedUserId)
  if (
    response.status === 401 &&
    allowRefresh &&
    session?.refreshToken &&
    !credentialRequest(path)
  ) {
    if (loadSession()?.accessToken === session.accessToken)
      await waitForSessionRefresh(options.signal, deadline)
    return requestBlob(
      path,
      { ...options, expectedUserId: options.expectedUserId ?? String(session.user.userId) },
      false,
      deadline,
    )
  }
  if (
    response.status === 401 &&
    session &&
    !credentialRequest(path) &&
    loadSession()?.accessToken === session.accessToken
  )
    saveSession(null)
  if (!response.ok) {
    const raw = new TextDecoder().decode(bytes)
    const payload = parseResponse(raw)
    throw new ApiError(
      apiErrorMessage(payload, response.status, method !== "GET"),
      response.status,
      payload,
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

/** Cancelling a caller must not cancel the rotating refresh shared by other requests. */
async function waitForSessionRefresh(
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<AuthSession> {
  checkBeforeSend(signal, deadline)
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new RequestCancelledBeforeSend())
      signal?.addEventListener("abort", onAbort, { once: true })
      timer = setTimeout(
        () =>
          reject(
            new ApiError(
              t("The request timed out before it was sent. Please retry."),
              0,
              null,
              false,
            ),
          ),
        Math.max(0, deadline - Date.now()),
      )
    })
    return await Promise.race([refreshStoredSession(), interrupted])
  } catch (error) {
    if (error instanceof RequestCancelledBeforeSend) throw error
    if (error instanceof ApiError)
      throw new ApiError(error.message, error.status, error.payload, false)
    throw new ApiError(
      error instanceof Error
        ? error.message
        : t("Unable to connect. Check your network and try again."),
      0,
      null,
      false,
    )
  } finally {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener("abort", onAbort)
  }
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
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () =>
        reject(controller.signal.reason ?? new DOMException("Cancelled", "AbortError"))
      if (controller.signal.aborted) rejectAbort()
      else controller.signal.addEventListener("abort", rejectAbort, { once: true })
    })
    const operation = async () => {
      controller.signal.throwIfAborted()
      const response = await ky(`${config.apiBaseUrl}${path}`, {
        ...options,
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
    throw new ApiError(
      options.method === "GET"
        ? t("Unable to load the response. Check your connection and try again.")
        : t(
            "The result is not yet confirmed. Check your orders or settings before submitting again.",
          ),
      0,
    )
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener("abort", abortFromCaller)
    if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort)
    if (controller.signal.aborted) void reader?.cancel().catch(() => {})
    else reader?.releaseLock()
  }
}
