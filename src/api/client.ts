import ky, { type Options } from "ky"
import type { z } from "zod"
import { config } from "../lib/config"
import { loadSession, saveSession } from "../state/session"
import type { ProductLine } from "../types/domain"
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
}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
  allowRefresh = true,
): Promise<T> {
  const method = options.method ?? "GET"
  const session = loadSession()
  const headers = new Headers(options.headers)
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`)
  if (session?.user.userId) headers.set("X-User-Id", String(session.user.userId))
  if (options.productLine) headers.set("X-Product-Line", options.productLine)
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData
  if (options.body !== undefined && !isFormData) headers.set("Content-Type", "application/json")

  const requestOptions: Options = {
    method,
    headers,
    timeout: 10_000,
    retry: method === "GET" ? { limit: 1, methods: ["get"] } : { limit: 0 },
    throwHttpErrors: false,
  }
  if (options.body !== undefined) {
    requestOptions.body = isFormData ? options.body : JSON.stringify(options.body)
  }
  if (options.signal !== undefined) requestOptions.signal = options.signal
  const response = await ky(`${config.apiBaseUrl}${path}`, requestOptions)
  const raw = await response.text()
  const payload = parseResponse(raw)

  if (
    response.status === 401 &&
    allowRefresh &&
    session?.refreshToken &&
    !path.includes("/auth/refresh")
  ) {
    try {
      const refreshed = await request<AuthSession>(
        "/api/v1/auth/refresh",
        AuthSessionSchema,
        { method: "POST", body: { refreshToken: session.refreshToken } },
        false,
      )
      saveSession(refreshed)
      return request(path, schema, options, false)
    } catch (error) {
      if (error instanceof ApiError) saveSession(null)
      throw error
    }
  }

  if (!response.ok)
    throw new ApiError(readableMessage(payload, response.status), response.status, payload)
  if (response.status === 204) return schema.parse(null)

  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new ApiError(
      "接口响应格式与当前前端契约不一致。",
      response.status,
      result.error.flatten(),
    )
  }
  return result.data
}

function parseResponse(raw: string): unknown {
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) return raw
    throw error
  }
}

function readableMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trimStart().startsWith("<")) {
    return "接口返回了 HTML，请检查 API 地址、SPA 代理或 Gateway 路由。"
  }
  if (isRecord(payload)) {
    for (const key of ["detail", "message", "error", "errorMessage"]) {
      const value = payload[key]
      if (typeof value === "string" && value.trim()) return value
    }
  }
  return `请求失败（HTTP ${status}）。`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
