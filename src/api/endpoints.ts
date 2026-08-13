import { z } from "zod"
import { loadSession } from "../state/session"
import type { ProductLine } from "../types/domain"
import { request, requestBlob } from "./client"
import type {
  ApiBalance,
  ApiCandle,
  ApiFundingPayment,
  ApiFundingRate,
  ApiMarket,
  ApiOptionQuote,
  ApiOrder,
  ApiProductTransferRecord,
  ApiProductTransferResponse,
  ApiTriggerOrder,
  ApiWithdrawalSubmission,
  AuthSession,
} from "./types"
import {
  AccountLedgerPageSchema,
  AssetScalesSchema,
  AuthSessionSchema,
  BalanceListSchema,
  CandleListSchema,
  DepositAddressSchema,
  EmailVerificationChallengeSchema,
  ExchangeRateConvertSchema,
  FundingPaymentPageSchema,
  FundingRatePageSchema,
  FundingRateSchema,
  GenericObjectSchema,
  HelpArticleListSchema,
  JwtPrincipalSchema,
  KycProfileSchema,
  LoginHistoryPageSchema,
  MarketListSchema,
  OptionQuoteSchema,
  OrderBookSchema,
  OrderListSchema,
  OrderSubmissionSchema,
  PositionListSchema,
  ProductTransferRecordPageSchema,
  ProductTransferResponseSchema,
  SecurityApiKeyListSchema,
  TriggerOrderQuerySchema,
  TriggerOrderSchema,
  UserSessionPageSchema,
  WalletRecordsSchema,
  WithdrawalSubmissionSchema,
} from "./types"

const ArraySchema = z.array(GenericObjectSchema)
const CLIENT_ORDER_ID_KEY = "clientOrderId"
export type AccountType =
  | "SPOT"
  | "USDT_PERPETUAL"
  | "COIN_PERPETUAL"
  | "USDT_DELIVERY"
  | "COIN_DELIVERY"
  | "OPTION"

const ACCOUNT_TYPE_BY_PRODUCT_LINE: Readonly<Record<ProductLine, AccountType>> = {
  SPOT: "SPOT",
  LINEAR_PERPETUAL: "USDT_PERPETUAL",
  INVERSE_PERPETUAL: "COIN_PERPETUAL",
  LINEAR_DELIVERY: "USDT_DELIVERY",
  INVERSE_DELIVERY: "COIN_DELIVERY",
  OPTION: "OPTION",
}

export function accountTypeForProductLine(productLine: ProductLine): AccountType {
  return ACCOUNT_TYPE_BY_PRODUCT_LINE[productLine]
}
const ObjectOrArraySchema = z.union([
  ArraySchema,
  z
    .object({
      items: ArraySchema.optional(),
      orders: ArraySchema.optional(),
      positions: ArraySchema.optional(),
      trades: ArraySchema.optional(),
      fills: ArraySchema.optional(),
    })
    .passthrough(),
])

export const authApi = {
  login: (identifier: string, password: string, totpCode?: string) =>
    request<AuthSession>("/api/v1/auth/login", AuthSessionSchema, {
      method: "POST",
      body: { identifier, password, ...(totpCode ? { totpCode } : {}) },
    }),
  logout: (refreshToken: string) =>
    request("/api/v1/auth/logout", z.unknown(), {
      method: "POST",
      body: { refreshToken },
    }),
  register: (identifier: string, password: string, contactMode: "email" | "phone" = "email") =>
    request<AuthSession>("/api/v1/auth/register", AuthSessionSchema, {
      method: "POST",
      body: { [contactMode]: identifier, password },
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
  verifyEmail: (email: string, code: string) =>
    request("/api/v1/auth/verify-email", z.boolean(), {
      method: "POST",
      body: { email, code },
    }),
  resendEmailVerification: () =>
    request("/api/v1/auth/resend-email-verification", EmailVerificationChallengeSchema, {
      method: "POST",
    }),
  me: () => request("/api/v1/auth/me", JwtPrincipalSchema),
}

export async function loadMarkets(productLine?: ProductLine): Promise<readonly ApiMarket[]> {
  const query = new URLSearchParams({ status: "TRADING" })
  if (productLine) query.set("productLine", productLine)
  const response = await request(
    `/api/v1/gateway/instrument/list?${query.toString()}`,
    MarketListSchema,
    productLine ? { productLine } : {},
  )
  return response.instruments ?? response.items ?? []
}

export function loadFundingRate(symbol: string, productLine: ProductLine): Promise<ApiFundingRate> {
  const query = new URLSearchParams({ symbol })
  return request(`/api/v1/gateway/funding/rates/latest?${query.toString()}`, FundingRateSchema, {
    productLine,
  })
}

export function loadMarkPrice(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol })
  return request(`/api/v1/gateway/price-mark/latest?${query.toString()}`, GenericObjectSchema, {
    productLine,
  })
}

export function loadIndexPrice(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol })
  return request(`/api/v1/gateway/price-index/latest?${query.toString()}`, GenericObjectSchema, {
    productLine,
  })
}

export function loadUsdValuation(amount: string, asset: string) {
  const query = new URLSearchParams({
    amount,
    fromCurrency: asset,
    toCurrency: "USD",
  })
  return request(`/api/v1/gateway/price-fx/convert?${query.toString()}`, ExchangeRateConvertSchema)
}

export async function loadFundingRateHistory(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol, limit: "100" })
  const response = await request(
    `/api/v1/gateway/funding/rates/history?${query.toString()}`,
    FundingRatePageSchema,
    { productLine },
  )
  return response.rates
}

export async function loadFundingPayments(
  userId: string | number,
  symbol: string,
  productLine: ProductLine,
): Promise<readonly ApiFundingPayment[]> {
  const query = new URLSearchParams({ userId: String(userId), symbol, limit: "100" })
  const response = await request(
    `/api/v1/gateway/funding/payments?${query.toString()}`,
    FundingPaymentPageSchema,
    { productLine },
  )
  return response.payments
}

export async function loadCandles(
  symbol: string,
  period: string,
  productLine?: ProductLine,
): Promise<readonly ApiCandle[]> {
  const query = new URLSearchParams({ symbol, period, limit: "120" })
  const range = candleRange(period, new Date(), 120)
  query.set("startTime", range.startTime)
  query.set("endTime", range.endTime)
  const response = await request(
    `/api/v1/gateway/candlestick/candles?${query.toString()}`,
    CandleListSchema,
    productLine ? { productLine } : {},
  )
  return response.candles ?? response.items ?? []
}

export function candleRange(
  period: string,
  end: Date,
  limit: number,
): Readonly<{ startTime: string; endTime: string }> {
  const periodMilliseconds = periodMillisecondsFor(period)
  const endTime = end.getTime()
  return {
    startTime: new Date(endTime - periodMilliseconds * limit).toISOString(),
    endTime: end.toISOString(),
  }
}

export async function loadBalances(
  productLine?: ProductLine,
  accountType?: string,
): Promise<readonly ApiBalance[]> {
  const session = typeof window === "undefined" ? null : loadSession()
  const requestedAccountType =
    accountType ?? (productLine ? accountTypeForProductLine(productLine) : undefined)
  const query = new URLSearchParams()
  if (session?.user.userId) query.set("userId", String(session.user.userId))
  if (requestedAccountType && requestedAccountType !== "FUNDING")
    query.set("accountType", requestedAccountType)
  const path = requestedAccountType === "FUNDING" ? "balances" : "product-balances"
  const response = await request(
    `/api/v1/gateway/account/${path}?${query.toString()}`,
    BalanceListSchema,
    productLine ? { productLine } : {},
  )
  return response.balances ?? response.items ?? []
}

export function loadAssetScales() {
  return request("/api/v1/gateway/instrument/asset-scales", AssetScalesSchema)
}

export function loadSecurityScenes() {
  return request("/api/v1/security/scenes", z.array(GenericObjectSchema))
}

export function loadMfaStatus() {
  return request("/api/v1/security/mfa", GenericObjectSchema)
}

export function enrollMfa() {
  return request("/api/v1/security/mfa/enroll", GenericObjectSchema, { method: "POST" })
}

export function confirmMfa(totpCode: string) {
  return request("/api/v1/security/mfa/confirm", GenericObjectSchema, {
    method: "POST",
    body: { totpCode },
  })
}

export function disableMfa(totpCode: string) {
  return request("/api/v1/security/mfa/disable", GenericObjectSchema, {
    method: "POST",
    body: { totpCode },
  })
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
  emailCode: string,
  totpCode: string,
) {
  return request("/api/v1/security/password", z.unknown(), {
    method: "POST",
    body: { currentPassword, newPassword, emailCode, totpCode },
  })
}

export function issueSecurityChallenge(sceneCode: string) {
  return request("/api/v1/security/verification/challenge", GenericObjectSchema, {
    method: "POST",
    body: { sceneCode },
  })
}

export function verifySecurityChallenge(sceneCode: string, emailCode: string, totpCode: string) {
  return request("/api/v1/security/verification/verify", z.boolean(), {
    method: "POST",
    body: { sceneCode, emailCode, totpCode },
  })
}

export function updateSecurityScene(
  sceneCode: string,
  enabled: boolean,
  emailCode: string,
  totpCode: string,
) {
  return request(`/api/v1/security/scenes/${encodeURIComponent(sceneCode)}`, GenericObjectSchema, {
    method: "PUT",
    body: { enabled, emailCode, totpCode },
  })
}

export function loadApiKeys() {
  return request("/api/v1/security/api-keys", SecurityApiKeyListSchema)
}

export function loadUserSessions(active = true) {
  const query = new URLSearchParams({ active: String(active), limit: "100" })
  return request(`/api/v1/security/sessions?${query.toString()}`, UserSessionPageSchema)
}

export function revokeUserSession(sessionId: string | number) {
  return request(
    `/api/v1/security/sessions/${encodeURIComponent(String(sessionId))}/revoke`,
    z.unknown(),
    {
      method: "POST",
    },
  )
}

export function revokeAllUserSessions(refreshToken: string) {
  return request("/api/v1/security/sessions/revoke-all", GenericObjectSchema, {
    method: "POST",
    body: { refreshToken },
  })
}

export function loadLoginHistory(result?: string) {
  const query = new URLSearchParams({ limit: "100" })
  if (result) query.set("result", result)
  return request(`/api/v1/security/login-history?${query.toString()}`, LoginHistoryPageSchema)
}

export function createApiKey(
  label: string,
  permissions: readonly string[],
  ipAllowlist: readonly string[],
  emailCode: string,
  totpCode: string,
) {
  return request("/api/v1/security/api-keys", GenericObjectSchema, {
    method: "POST",
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: { label, permissions, ipAllowlist },
  })
}

export function updateApiKeyIpAllowlist(
  apiKey: string,
  ipAllowlist: readonly string[],
  emailCode: string,
  totpCode: string,
) {
  return request("/api/v1/security/api-keys", z.unknown(), {
    method: "PATCH",
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: { apiKey, ipAllowlist },
  })
}

export function revokeApiKey(apiKey: string, emailCode: string, totpCode: string) {
  return request("/api/v1/security/api-keys", z.unknown(), {
    method: "DELETE",
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: { apiKey },
  })
}

export function loadKyc() {
  return request("/api/v1/compliance/kyc", KycProfileSchema)
}

export function uploadKycDocument(documentType: string, file: File) {
  const body = new FormData()
  body.append("documentType", documentType)
  body.append("file", file)
  return request("/api/v1/compliance/kyc/documents", GenericObjectSchema, {
    method: "POST",
    body,
  })
}

export function loadKycDocuments() {
  return request("/api/v1/compliance/kyc/documents", z.array(GenericObjectSchema))
}

export function downloadKycDocument(documentId: string | number) {
  return requestBlob(`/api/v1/compliance/kyc/documents/${encodeURIComponent(String(documentId))}`)
}

export function submitKyc(body: Readonly<Record<string, unknown>>) {
  return request("/api/v1/compliance/kyc", GenericObjectSchema, {
    method: "POST",
    body,
  })
}

export function createTransfer(
  sourceAccountType: string,
  targetAccountType: string,
  asset: string,
  amountUnits: string,
  idempotencyKey: string,
  emailCode = "",
  totpCode = "",
): Promise<ApiProductTransferResponse> {
  const session = loadSession()
  if (!session) return Promise.reject(new Error("请先登录后再进行资金划转。"))
  return request("/api/v1/gateway/account/transfers", ProductTransferResponseSchema, {
    method: "POST",
    idempotencyKey,
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: {
      userId: session.user.userId,
      sourceAccountType,
      targetAccountType,
      asset,
      amountUnits,
      referenceId: idempotencyKey,
      reason: "web product transfer",
    },
  })
}

export function loadPositionMode(userId: string | number, productLine: ProductLine) {
  return request(
    `/api/v1/gateway/account/position-mode?userId=${encodeURIComponent(String(userId))}&productLine=${encodeURIComponent(productLine)}`,
    GenericObjectSchema,
    { productLine },
  )
}

export function updatePositionMode(
  userId: string | number,
  productLine: ProductLine,
  positionMode: string,
  referenceId: string,
) {
  return request("/api/v1/gateway/account/position-mode", GenericObjectSchema, {
    method: "POST",
    productLine,
    idempotencyKey: referenceId,
    body: { userId, productLine, positionMode, referenceId },
  })
}

export function loadLeverageSetting(
  userId: string | number,
  symbol: string,
  productLine: ProductLine,
  marginMode?: string,
) {
  const query = new URLSearchParams({ userId: String(userId), symbol, productLine })
  if (marginMode) query.set("marginMode", marginMode)
  return request(
    `/api/v1/gateway/trading-leverage/settings?${query.toString()}`,
    GenericObjectSchema,
    { productLine },
  )
}

export function updateLeverageSetting(
  userId: string | number,
  symbol: string,
  productLine: ProductLine,
  marginMode: string,
  leveragePpm: number,
  reason: string,
) {
  return request("/api/v1/gateway/trading-leverage/settings", GenericObjectSchema, {
    method: "POST",
    productLine,
    body: { userId, productLine, symbol, marginMode, leveragePpm, reason },
  })
}

export function loadPositionMargin(
  userId: string | number,
  symbol: string,
  productLine: ProductLine,
  marginMode?: string,
) {
  const query = new URLSearchParams({ userId: String(userId), symbol })
  if (marginMode) query.set("marginMode", marginMode)
  return request(
    `/api/v1/gateway/account/position-margin?${query.toString()}`,
    GenericObjectSchema,
    { productLine },
  )
}

export function adjustPositionMargin(
  userId: string | number,
  symbol: string,
  productLine: ProductLine,
  marginMode: string,
  positionSide: string,
  amountUnits: string,
  referenceId: string,
  reason: string,
) {
  return request("/api/v1/gateway/account/position-margin-adjustments", GenericObjectSchema, {
    method: "POST",
    productLine,
    idempotencyKey: referenceId,
    body: { userId, symbol, marginMode, positionSide, amountUnits, referenceId, reason },
  })
}

export function loadAccountRisk(
  userId: string | number,
  productLine: ProductLine,
  settleAsset: string,
) {
  const query = new URLSearchParams({
    userId: String(userId),
    accountType: accountTypeForProductLine(productLine),
    settleAsset,
  })
  return request(`/api/v1/gateway/risk/account/latest?${query.toString()}`, GenericObjectSchema, {
    productLine,
  })
}

export function loadPositionRisk(userId: string | number, productLine: ProductLine) {
  const query = new URLSearchParams({ userId: String(userId) })
  return request(`/api/v1/gateway/risk/positions/latest?${query.toString()}`, PositionListSchema, {
    productLine,
  }).then((response) =>
    Array.isArray(response) ? response : (response.positions ?? response.items ?? []),
  )
}

export async function loadPositions(
  userId: string | number,
  productLine: ProductLine,
): Promise<readonly Record<string, unknown>[]> {
  const response = await request(
    `/api/v1/gateway/account/positions?userId=${encodeURIComponent(String(userId))}&productLine=${encodeURIComponent(productLine)}`,
    PositionListSchema,
    { productLine },
  )
  return Array.isArray(response) ? response : (response.items ?? response.positions ?? [])
}

export async function loadAccountLedger(asset?: string, referenceType?: string) {
  const query = new URLSearchParams({ limit: "100" })
  if (asset?.trim()) query.set("asset", asset.trim().toUpperCase())
  if (referenceType?.trim()) query.set("referenceType", referenceType.trim().toUpperCase())
  const response = await request(
    `/api/v1/gateway/account/ledger?${query.toString()}`,
    AccountLedgerPageSchema,
  )
  return response.entries
}

export async function loadProductLedger(accountType: ProductLine, asset?: string) {
  const query = new URLSearchParams({
    accountType: accountTypeForProductLine(accountType),
    limit: "100",
  })
  if (asset?.trim()) query.set("asset", asset.trim().toUpperCase())
  const response = await request(
    `/api/v1/gateway/account/product-ledger?${query.toString()}`,
    AccountLedgerPageSchema,
    { productLine: accountType },
  )
  return response.entries
}

export async function loadTransferHistory(
  accountType: ProductLine,
  asset?: string,
): Promise<readonly ApiProductTransferRecord[]> {
  const query = new URLSearchParams({ limit: "100" })
  query.set("accountType", accountTypeForProductLine(accountType))
  if (asset?.trim()) query.set("asset", asset.trim().toUpperCase())
  const response = await request(
    `/api/v1/gateway/account/transfers?${query.toString()}`,
    ProductTransferRecordPageSchema,
    { productLine: accountType },
  )
  return response.transfers
}

export function loadFundingSettlement(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol })
  return request(
    `/api/v1/gateway/funding/settlements/latest?${query.toString()}`,
    GenericObjectSchema,
    { productLine },
  )
}

export function placeOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/gateway/trading", OrderSubmissionSchema, {
    method: "POST",
    productLine,
    idempotencyKey: String(body[CLIENT_ORDER_ID_KEY] ?? ""),
    body,
  })
}

export function placeBatchOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/gateway/trading/batch", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function testOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/gateway/trading/test", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function amendOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/gateway/trading/amend", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function amendBatchOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/gateway/trading/batch-amend", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function closePosition(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/gateway/trading/close-position", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelOpenOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/gateway/trading/cancel-open", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelBatchOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/gateway/trading/batch-cancel", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelAllAfter(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/gateway/trading/cancel-all-after", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function placeAlgoOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/gateway/trading/algo", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelAlgoOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/gateway/trading/algo/cancel", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelOpenAlgoOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/gateway/trading/algo/cancel-open", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export async function loadOpenAlgoOrders(
  userId: string | number,
  symbol: string,
  productLine: ProductLine,
) {
  const query = new URLSearchParams({ userId: String(userId), symbol, limit: "100" })
  const response = await request(
    `/api/v1/gateway/trading/algo/open?${query.toString()}`,
    ObjectOrArraySchema,
    { productLine },
  )
  return Array.isArray(response) ? response : (response.items ?? response.orders ?? [])
}

export function placeTriggerOrder(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
): Promise<ApiTriggerOrder> {
  return request("/api/v1/gateway/trading-trigger", TriggerOrderSchema, {
    method: "POST",
    productLine,
    idempotencyKey: String(Reflect.get(body, "clientTriggerOrderId") ?? ""),
    body,
  })
}

export async function loadOpenTriggerOrders(
  userId: string | number,
  symbol: string,
  productLine: ProductLine,
): Promise<readonly ApiTriggerOrder[]> {
  const query = new URLSearchParams({ userId: String(userId), symbol, limit: "100" })
  const response = await request(
    `/api/v1/gateway/trading-trigger/open?${query.toString()}`,
    TriggerOrderQuerySchema,
    { productLine },
  )
  return response.orders
}

export function cancelTriggerOrder(
  userId: string | number,
  triggerOrderId: string | number,
  productLine: ProductLine,
): Promise<ApiTriggerOrder> {
  return request("/api/v1/gateway/trading-trigger/cancel", TriggerOrderSchema, {
    method: "POST",
    productLine,
    idempotencyKey: `cancel-trigger-${triggerOrderId}`,
    body: { userId, triggerOrderId },
  })
}

export function placeBatchTriggerOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/gateway/trading-trigger/batch", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelBatchTriggerOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/gateway/trading-trigger/batch-cancel", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelOpenTriggerOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/gateway/trading-trigger/cancel-open", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export async function loadOpenOrders(symbol: string, productLine: ProductLine) {
  const session = loadSession()
  if (!session) return [] as readonly ApiOrder[]
  const query = new URLSearchParams({
    userId: String(session.user.userId),
    limit: "50",
  })
  if (symbol.trim()) query.set("symbol", symbol.trim())
  const response = await request(
    `/api/v1/gateway/trading/open?${query.toString()}`,
    OrderListSchema,
    { productLine },
  )
  return orderRows(response)
}

export async function loadOrderHistory(
  symbol: string,
  productLine: ProductLine,
  startTime?: number,
  endTime?: number,
) {
  const session = loadSession()
  if (!session) return [] as readonly ApiOrder[]
  const query = new URLSearchParams({
    userId: String(session.user.userId),
    limit: "100",
  })
  if (symbol.trim()) query.set("symbol", symbol.trim())
  if (startTime !== undefined) query.set("startTime", String(startTime))
  if (endTime !== undefined) query.set("endTime", String(endTime))
  const response = await request(
    `/api/v1/gateway/trading/history?${query.toString()}`,
    OrderListSchema,
    { productLine },
  )
  return orderRows(response)
}

export async function loadMyTrades(
  userId: string | number,
  symbol: string,
  productLine: ProductLine,
) {
  const query = new URLSearchParams({ userId: String(userId), symbol, limit: "100" })
  const response = await request(
    `/api/v1/gateway/trading-trades/trades?${query.toString()}`,
    ObjectOrArraySchema,
    { productLine },
  )
  return Array.isArray(response)
    ? response
    : (response.trades ?? response.fills ?? response.items ?? [])
}

export function cancelOrder(_symbol: string, orderId: string, productLine: ProductLine) {
  const session = loadSession()
  if (!session) return Promise.reject(new Error("请先登录后再撤销订单。"))
  return request(`/api/v1/gateway/trading/cancel`, GenericObjectSchema, {
    method: "POST",
    productLine,
    idempotencyKey: `cancel-${orderId}`,
    body: { userId: session.user.userId, orderId },
  })
}

export function loadOrderBook(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol, depth: "20" }).toString()
  return request(`/api/v1/gateway/trading-market/orderbook?${query}`, OrderBookSchema, {
    productLine,
  })
}

export async function loadLatestTrade(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol }).toString()
  return request(`/api/v1/gateway/trading-market/latest-trade?${query}`, GenericObjectSchema, {
    productLine,
  })
}

export function loadOptionQuote(symbol: string): Promise<ApiOptionQuote> {
  const query = new URLSearchParams({ symbol }).toString()
  return request(`/api/v1/options/quote?${query}`, OptionQuoteSchema)
}

export function loadTicker24h(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol })
  return request(
    `/api/v1/gateway/trading-market/ticker-24hr?${query.toString()}`,
    GenericObjectSchema,
    {
      productLine,
    },
  )
}

export function loadWalletChains() {
  return request("/api/v1/wallet/chains", WalletRecordsSchema)
}

export function createDepositAddress(chain: string) {
  return request("/api/v1/wallet/addresses", DepositAddressSchema, {
    method: "POST",
    body: { chain, addressVersion: 1 },
  })
}

export function loadDepositHistory(asset?: string, chain?: string) {
  const query = new URLSearchParams()
  if (asset) query.set("asset", asset)
  if (chain) query.set("chain", chain)
  query.set("limit", "50")
  return request(`/api/v1/wallet/deposits?${query.toString()}`, WalletRecordsSchema)
}

export function loadWithdrawalHistory(asset?: string, chain?: string) {
  const query = new URLSearchParams()
  if (asset) query.set("asset", asset)
  if (chain) query.set("chain", chain)
  query.set("limit", "50")
  return request(`/api/v1/wallet/withdrawals?${query.toString()}`, WalletRecordsSchema)
}

export function loadNotifications(unreadOnly = false) {
  const query = new URLSearchParams({ unreadOnly: String(unreadOnly), limit: "100" })
  return request(`/api/v1/notifications?${query.toString()}`, ArraySchema)
}

export function loadHelpArticles(query = "", category = "") {
  const params = new URLSearchParams()
  if (query.trim()) params.set("query", query.trim())
  if (category) params.set("category", category)
  return request(`/api/v1/help/articles?${params.toString()}`, HelpArticleListSchema)
}

export function markNotificationRead(notificationId: string) {
  return request(
    `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
    GenericObjectSchema,
    {
      method: "POST",
    },
  )
}

export function markAllNotificationsRead() {
  return request("/api/v1/notifications/read-all", z.number(), { method: "POST" })
}

export function createWithdrawal(
  chain: string,
  assetSymbol: string,
  toAddress: string,
  amount: string,
  externalReference: string,
  emailCode: string,
  totpCode: string,
): Promise<ApiWithdrawalSubmission> {
  return request("/api/v1/wallet/withdrawals", WithdrawalSubmissionSchema, {
    method: "POST",
    idempotencyKey: externalReference,
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: { chain, assetSymbol, toAddress, amount, externalReference },
  })
}

function orderRows(response: z.infer<typeof OrderListSchema>): readonly ApiOrder[] {
  return Array.isArray(response) ? response : (response.orders ?? response.items ?? [])
}

function periodMillisecondsFor(period: string): number {
  const match = /^(\d+)(m|h|d)$/.exec(period)
  if (!match) return 60 * 60 * 1000
  const amount = Number(match[1])
  const unit = match[2]
  const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000
  return amount * multiplier
}
