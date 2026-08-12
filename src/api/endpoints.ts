import { z } from "zod"
import type { ProductLine } from "../types/domain"
import { request } from "./client"
import type { ApiBalance, ApiCandle, ApiMarket, AuthSession } from "./types"
import {
  AuthSessionSchema,
  BalanceListSchema,
  CandleListSchema,
  GenericObjectSchema,
  MarketListSchema,
} from "./types"

const ArraySchema = z.array(GenericObjectSchema)
const ObjectOrArraySchema = z.union([ArraySchema, z.object({ items: ArraySchema }).passthrough()])

export const authApi = {
  login: (identifier: string, password: string, totpCode?: string) =>
    request<AuthSession>("/api/v1/auth/login", AuthSessionSchema, {
      method: "POST",
      body: { identifier, password, ...(totpCode ? { totpCode } : {}) },
    }),
  register: (email: string, password: string) =>
    request<AuthSession>("/api/v1/auth/register", AuthSessionSchema, {
      method: "POST",
      body: { email, password },
    }),
  forgotPassword: (identifier: string) =>
    request("/api/v1/auth/forgot-password", GenericObjectSchema, {
      method: "POST",
      body: { identifier },
    }),
  resetPassword: (identifier: string, code: string, newPassword: string) =>
    request("/api/v1/auth/reset-password", GenericObjectSchema, {
      method: "POST",
      body: { identifier, code, newPassword },
    }),
}

export async function loadMarkets(productLine?: ProductLine): Promise<readonly ApiMarket[]> {
  const options = productLine ? { productLine } : {}
  const response = await request(
    "/api/v1/gateway/instrument/list?status=TRADING",
    MarketListSchema,
    options,
  )
  return response.instruments ?? response.items ?? []
}

export async function loadCandles(
  symbol: string,
  period: string,
  productLine?: ProductLine,
): Promise<readonly ApiCandle[]> {
  const query = new URLSearchParams({ symbol, period, limit: "120" })
  const response = await request(
    `/api/v1/gateway/candlestick/candles?${query.toString()}`,
    CandleListSchema,
    productLine ? { productLine } : {},
  )
  return response.candles ?? response.items ?? []
}

export async function loadBalances(productLine?: ProductLine): Promise<readonly ApiBalance[]> {
  const query = productLine ? `?accountType=${encodeURIComponent(productLine)}` : ""
  const response = await request(
    `/api/v1/gateway/account/product-balances${query}`,
    BalanceListSchema,
    productLine ? { productLine } : {},
  )
  return response.balances ?? response.items ?? []
}

export function loadSecurityScenes() {
  return request("/api/v1/security/scenes", z.array(GenericObjectSchema))
}

export function loadMfaStatus() {
  return request("/api/v1/security/mfa", GenericObjectSchema)
}

export function loadKyc() {
  return request("/api/v1/compliance/kyc", GenericObjectSchema.nullable())
}

export function createTransfer(
  sourceAccountType: string,
  targetAccountType: string,
  asset: string,
  amountUnits: number,
  idempotencyKey: string,
) {
  return request("/api/v1/gateway/account/transfers", GenericObjectSchema, {
    method: "POST",
    idempotencyKey,
    body: {
      sourceAccountType,
      targetAccountType,
      asset,
      amountUnits,
      referenceId: idempotencyKey,
      reason: "web product transfer",
    },
  })
}

export function placeOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/gateway/trading/orders", GenericObjectSchema, {
    method: "POST",
    productLine,
    idempotencyKey: String(body["clientOrderId"] ?? ""),
    body,
  })
}

export function loadOpenOrders(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol, productLine })
  return request(`/api/v1/gateway/trading/orders/open?${query.toString()}`, ObjectOrArraySchema, {
    productLine,
  })
}
