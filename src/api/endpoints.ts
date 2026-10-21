export { continueCancellationPlan } from "./cancellation"

import { cancelSpotBatchOrders, cancelSpotOpenOrders } from "./cancellation"
import { isDefinitiveOrderRejection, PendingTradingCommand } from "./tradingCommand"

export { isDefinitiveOrderRejection, PendingTradingCommand } from "./tradingCommand"

import { z } from "zod"
import { t } from "../i18n"
import {
  clearPendingCommand,
  type PendingOrderCommand,
  readPendingCommand,
  savePendingCommand,
  tracksSingleOrderIntent,
  tracksTriggerIntent,
} from "../state/pendingOrders"
import { loadSession } from "../state/session"
import type { ProductLine } from "../types/domain"
import { ApiError, request, requestBlob } from "./client"
import { apiErrorMessage } from "./errors"
import type {
  ApiBalance,
  ApiCandle,
  ApiFundingPayment,
  ApiFundingRate,
  ApiMarket,
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
  DeviceStatusSchema,
  EmailVerificationChallengeSchema,
  ExchangeRateConvertSchema,
  FundingPaymentPageSchema,
  FundingRatePageSchema,
  FundingRateSchema,
  GenericObjectSchema,
  HelpArticleListSchema,
  IpStatusSchema,
  JwtPrincipalSchema,
  KycProfileSchema,
  LoginChallengeSchema,
  LoginHistoryPageSchema,
  MarketListSchema,
  MarketSchema,
  OrderBookSchema,
  OrderHistoryPageSchema,
  OrderListSchema,
  OrderSubmissionSchema,
  PositionListSchema,
  PositionRiskListSchema,
  ProductTransferRecordPageSchema,
  ProductTransferResponseSchema,
  SecurityApiKeyListSchema,
  TradeFillPageSchema,
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
  login: (identifier: string, password: string) =>
    request("/api/v1/auth/login", z.union([LoginChallengeSchema, AuthSessionSchema]), {
      method: "POST",
      body: { identifier, password },
    }),
  verifyLogin: (codes: import("./types").LoginVerificationCodes) =>
    request("/api/v1/auth/login/verify", AuthSessionSchema, { method: "POST", body: codes }),
  loginMethods: () =>
    request(
      "/api/v1/security/login-verification",
      z.array(
        z.object({
          type: z.enum(["EMAIL", "PHONE", "TOTP"]),
          bound: z.boolean(),
          enabled: z.boolean(),
          destination: z.string().nullable(),
        }),
      ),
    ),
  primaryAuthentication: () =>
    request(
      "/api/v1/security/login-verification/authentication",
      z
        .object({
          passwordRequired: z.boolean(),
          reauthenticationRequired: z.boolean(),
          authenticatedUntil: z.string().datetime().nullable().optional(),
        })
        .refine(
          (value) =>
            value.passwordRequired ||
            value.reauthenticationRequired ||
            typeof value.authenticatedUntil === "string",
        ),
      {
        expectedUserId: String(loadSession()?.user.userId ?? ""),
      },
    ),
  verifyLoginMethodPassword: (method: "EMAIL" | "PHONE" | "TOTP", currentPassword: string) =>
    request(`/api/v1/security/login-verification/${method}/verify-password`, z.unknown(), {
      method: "POST",
      body: { currentPassword },
      expectedUserId: String(loadSession()?.user.userId ?? ""),
    }),
  bindLoginMethod: (
    method: "EMAIL" | "PHONE" | "TOTP",
    currentPassword: string,
    destination: string,
    enabled: boolean,
  ) =>
    request(
      `/api/v1/security/login-verification/${method}/bind`,
      z.object({
        challenge: LoginChallengeSchema,
        secret: z.string().nullable(),
        provisioningUri: z.string().nullable(),
      }),
      {
        method: "POST",
        body: { currentPassword, destination, enabled },
        expectedUserId: String(loadSession()?.user.userId ?? ""),
      },
    ),
  resendLoginMethodCode: (method: "EMAIL" | "PHONE" | "TOTP", challengeToken: string) =>
    request(`/api/v1/security/login-verification/${method}/resend`, LoginChallengeSchema, {
      method: "POST",
      body: { challengeToken },
      expectedUserId: String(loadSession()?.user.userId ?? ""),
    }),
  confirmLoginMethod: (
    method: "EMAIL" | "PHONE" | "TOTP",
    codes: import("./types").LoginVerificationCodes,
    currentPassword: string,
  ) =>
    request(`/api/v1/security/login-verification/${method}/confirm`, z.unknown(), {
      method: "POST",
      body: { codes, currentPassword },
      expectedUserId: String(loadSession()?.user.userId ?? ""),
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

export async function loadRuntimeProducts(): Promise<readonly ProductLine[]> {
  const result = await request(
    "/api/v1/runtime",
    z.object({
      productLines: z
        .array(
          z.enum([
            "SPOT",
            "LINEAR_PERPETUAL",
            "INVERSE_PERPETUAL",
            "LINEAR_DELIVERY",
            "INVERSE_DELIVERY",
            "OPTION",
          ]),
        )
        .min(1),
    }),
  )
  return result.productLines
}

/** Same UserReadView contract as the private WebSocket snapshot. */
export function loadRealtimeState(productLine: ProductLine) {
  return request(`/api/v1/realtime/${productLine}/state`, GenericObjectSchema, {
    productLine,
    retry: 0,
  })
}

export function loadDefaultMarket(productLine: ProductLine): Promise<ApiMarket> {
  return request("/api/v1/gateway/instrument/default", MarketSchema, { productLine })
}

export function loadMarket(instrumentId: string, productLine: ProductLine): Promise<ApiMarket> {
  const query = new URLSearchParams({ instrumentId, productLine })
  return request(`/api/v1/gateway/instrument/latest?${query}`, MarketSchema, { productLine })
}

export async function loadMarkets(
  productLine?: ProductLine,
  signal?: AbortSignal,
  includeMarketSummary = false,
  includeTrend = false,
): Promise<readonly ApiMarket[]> {
  const query = new URLSearchParams()
  if (productLine) query.set("productLine", productLine)
  if (includeMarketSummary) query.set("includeMarketSummary", "true")
  if (includeTrend) query.set("includeTrend", "true")
  const response = await request(
    `/api/v1/gateway/instrument/list?${query.toString()}`,
    MarketListSchema,
    { ...(productLine ? { productLine } : {}), ...(signal ? { signal } : {}) },
  )
  return response.instruments ?? response.items ?? []
}

export function loadFundingRate(
  instrumentId: string,
  productLine: ProductLine,
): Promise<ApiFundingRate> {
  const query = new URLSearchParams({ instrumentId })
  return request(`/api/v1/gateway/funding/rates/latest?${query.toString()}`, FundingRateSchema, {
    productLine,
  })
}

export function loadMarkPrice(instrumentId: string, productLine: ProductLine) {
  const query = new URLSearchParams({ instrumentId })
  return request(`/api/v1/gateway/price-mark/latest?${query.toString()}`, GenericObjectSchema, {
    productLine,
  })
}

export function loadIndexPrice(instrumentId: string, productLine: ProductLine) {
  const query = new URLSearchParams({ instrumentId })
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

export async function loadFundingRateHistory(instrumentId: string, productLine: ProductLine) {
  const query = new URLSearchParams({ instrumentId, limit: "100" })
  const response = await request(
    `/api/v1/gateway/funding/rates/history?${query.toString()}`,
    FundingRatePageSchema,
    { productLine },
  )
  return response.rates
}

export async function loadFundingPayments(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
): Promise<readonly ApiFundingPayment[]> {
  return (await loadFundingPaymentsPage(userId, instrumentId, productLine)).payments
}

export async function loadFundingPaymentsPage(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  cursor?: string,
) {
  const query = new URLSearchParams({ userId: String(userId), instrumentId, limit: "100" })
  if (cursor) query.set("cursor", cursor)
  return request(`/api/v1/gateway/funding/payments?${query.toString()}`, FundingPaymentPageSchema, {
    productLine,
  })
}

export async function loadCandles(
  instrumentId: string,
  period: string,
  productLine?: ProductLine,
): Promise<readonly ApiCandle[]> {
  const query = new URLSearchParams({ instrumentId, period, limit: "120" })
  const range = candleRange(period, new Date(), 120)
  query.set("startTime", range.startTime)
  query.set("endTime", range.endTime)
  const response = await request(
    `/api/v1/gateway/candlestick/candles?${query.toString()}`,
    CandleListSchema,
    { ...(productLine ? { productLine } : {}), retry: 0 },
  )
  return response.candles ?? response.items ?? []
}

/** Fixed minute-resolution rolling-day history, independent of the chart selection. */
export async function loadDayWindow(
  instrumentId: string,
  productLine: ProductLine,
  signal?: AbortSignal,
) {
  const now = Date.now()
  const start = Math.floor(now / 60_000) * 60_000 - 86_400_000
  const query = new URLSearchParams({
    instrumentId,
    period: "1m",
    limit: "1441",
    startTime: new Date(start).toISOString(),
    endTime: new Date(now).toISOString(),
  })
  const response = await request(
    `/api/v1/gateway/candlestick/candles?${query.toString()}`,
    CandleListSchema,
    { productLine, retry: 0, ...(signal ? { signal } : {}) },
  )
  return response.candles ?? response.items ?? []
}

export async function loadRecentTrades(instrumentId: string, productLine: ProductLine, limit = 50) {
  const query = new URLSearchParams({ instrumentId, limit: String(limit) })
  const response = await request(
    `/api/v1/gateway/candlestick/trades/recent?${query.toString()}`,
    z.object({ trades: z.array(GenericObjectSchema) }),
    { productLine },
  )
  return response.trades
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

export function loadMfaRecovery() {
  return request("/api/v1/security/mfa/recovery", GenericObjectSchema.nullable())
}

export function issueMfaRecoveryChallenge(currentPassword: string) {
  return request("/api/v1/security/mfa/recovery/challenge", GenericObjectSchema, {
    method: "POST",
    body: { currentPassword },
  })
}

export function submitMfaRecovery(
  challengeId: number,
  currentPassword: string,
  code: string,
  reason: string,
) {
  return request("/api/v1/security/mfa/recovery", GenericObjectSchema, {
    method: "POST",
    body: { challengeId, currentPassword, code, reason },
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

export function loadDevices() {
  return request("/api/v1/security/devices", z.array(DeviceStatusSchema))
}

export function revokeDevice(deviceId: string) {
  return request(`/api/v1/security/devices/${encodeURIComponent(deviceId)}/revoke`, z.unknown(), {
    method: "POST",
  })
}

export function changeDeviceBlock(
  deviceId: string,
  blocked: boolean,
  emailCode: string,
  totpCode: string,
) {
  return request(
    `/api/v1/security/devices/${encodeURIComponent(deviceId)}/${blocked ? "block" : "unblock"}`,
    z.unknown(),
    {
      method: "POST",
      body: { emailCode, totpCode },
    },
  )
}

export function loadLoginIps() {
  return request("/api/v1/security/ips", z.array(IpStatusSchema))
}

export function changeIpBlock(
  ipAddress: string,
  blocked: boolean,
  emailCode: string,
  totpCode: string,
) {
  return request(`/api/v1/security/ips/${blocked ? "block" : "unblock"}`, z.unknown(), {
    method: "POST",
    body: { ipAddress, emailCode, totpCode },
  })
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

export function loadKycProvider() {
  return request("/api/v1/compliance/kyc/provider", GenericObjectSchema)
}

export function completeKycSimulation(decision: "APPROVED" | "REJECTED" | "MANUAL_REVIEW") {
  return request("/api/v1/compliance/kyc/simulation/complete", GenericObjectSchema, {
    method: "POST",
    body: { decision },
  })
}

export function refreshKycSession() {
  return request("/api/v1/compliance/kyc/session/refresh", GenericObjectSchema, {
    method: "POST",
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
  if (!session) return Promise.reject(new Error(t("Please sign in before transferring funds.")))
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
  instrumentId: string,
  productLine: ProductLine,
  marginMode?: string,
) {
  const query = new URLSearchParams({ userId: String(userId), instrumentId, productLine })
  if (marginMode) query.set("marginMode", marginMode)
  return request(
    `/api/v1/gateway/trading-leverage/settings?${query.toString()}`,
    GenericObjectSchema,
    { productLine },
  )
}

export function updateLeverageSetting(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  marginMode: string,
  leveragePpm: number,
  reason: string,
) {
  return request("/api/v1/gateway/trading-leverage/settings", GenericObjectSchema, {
    method: "POST",
    productLine,
    body: { userId, productLine, instrumentId, marginMode, leveragePpm, reason },
  })
}

export function loadPositionMargin(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  marginMode?: string,
) {
  const query = new URLSearchParams({ userId: String(userId), instrumentId })
  if (marginMode) query.set("marginMode", marginMode)
  return request(
    `/api/v1/gateway/account/position-margin?${query.toString()}`,
    GenericObjectSchema,
    { productLine },
  )
}

export function adjustPositionMargin(
  userId: string | number,
  instrumentId: string,
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
    body: { userId, instrumentId, marginMode, positionSide, amountUnits, referenceId, reason },
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
  return request(
    `/api/v1/gateway/risk/positions/latest?${query.toString()}`,
    PositionRiskListSchema,
    {
      productLine,
    },
  ).then((response) => response.positions)
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
  return (await loadAccountLedgerPage(asset, referenceType)).entries
}

export async function loadAccountLedgerPage(
  asset?: string,
  referenceType?: string,
  cursor?: string,
) {
  const query = new URLSearchParams({ limit: "100" })
  if (asset?.trim()) query.set("asset", asset.trim().toUpperCase())
  if (referenceType?.trim()) query.set("referenceType", referenceType.trim().toUpperCase())
  if (cursor) query.set("cursor", cursor)
  return request(`/api/v1/gateway/account/ledger?${query.toString()}`, AccountLedgerPageSchema)
}

export async function loadProductLedger(accountType: ProductLine, asset?: string) {
  return (await loadProductLedgerPage(accountType, asset)).entries
}

export async function loadProductLedgerPage(
  accountType: ProductLine,
  asset?: string,
  referenceType?: string,
  cursor?: string,
) {
  const query = new URLSearchParams({
    accountType: accountTypeForProductLine(accountType),
    limit: "100",
  })
  if (asset?.trim()) query.set("asset", asset.trim().toUpperCase())
  if (referenceType?.trim()) query.set("referenceType", referenceType.trim().toUpperCase())
  if (cursor) query.set("cursor", cursor)
  return request(
    `/api/v1/gateway/account/product-ledger?${query.toString()}`,
    AccountLedgerPageSchema,
    { productLine: accountType },
  )
}

export async function loadTransferHistory(
  accountType: ProductLine,
  asset?: string,
): Promise<readonly ApiProductTransferRecord[]> {
  return (await loadTransferHistoryPage(accountType, asset)).transfers
}

export async function loadTransferHistoryPage(
  accountType: ProductLine,
  asset?: string,
  cursor?: string,
) {
  const query = new URLSearchParams({ limit: "100" })
  query.set("accountType", accountTypeForProductLine(accountType))
  if (asset?.trim()) query.set("asset", asset.trim().toUpperCase())
  if (cursor) query.set("cursor", cursor)
  return request(
    `/api/v1/gateway/account/transfers?${query.toString()}`,
    ProductTransferRecordPageSchema,
    { productLine: accountType },
  )
}

export function loadFundingSettlement(instrumentId: string, productLine: ProductLine) {
  const query = new URLSearchParams({ instrumentId })
  return request(
    `/api/v1/gateway/funding/settlements/latest?${query.toString()}`,
    GenericObjectSchema,
    { productLine },
  )
}

/** Resolve original submissions and cancellations from realtime-owned views only. */
export async function checkOrderSubmission(pending: PendingOrderCommand) {
  if (pending.clientTriggerOrderId || pending.cancelTriggerOrderId) {
    const query = new URLSearchParams({ userId: pending.userId })
    if (pending.clientTriggerOrderId)
      query.set("clientTriggerOrderId", pending.clientTriggerOrderId)
    const path = pending.cancelTriggerOrderId
      ? `cancellations/${encodeURIComponent(pending.cancelTriggerOrderId)}`
      : "submission"
    const receipt = await request(
      `/api/v1/gateway/trading-trigger/${path}?${query}`,
      GenericObjectSchema,
      { productLine: pending.productLine, expectedUserId: pending.userId, retry: 0 },
    )
    if (
      typeof receipt["commandId"] !== "string" ||
      !receipt["commandId"] ||
      (pending.commandId && receipt["commandId"] !== pending.commandId)
    )
      throw new Error("Trigger receipt identity mismatch")
    if (receipt["outcome"] === "TERMINAL" && typeof receipt["code"] === "string" && receipt["code"])
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    if (receipt["outcome"] === "RESULT_UNKNOWN" && receipt["code"] === "RESULT_UNKNOWN")
      return "pending"
    throw new Error("Trigger receipt is unavailable")
  }
  if (pending.ocoTakeProfitClientId && pending.ocoStopLossClientId) {
    const query = new URLSearchParams({
      userId: pending.userId,
      takeProfitClientId: pending.ocoTakeProfitClientId,
      stopLossClientId: pending.ocoStopLossClientId,
    })
    const receipt = await request(
      `/api/v1/gateway/trading-trigger/oco-submission?${query}`,
      GenericObjectSchema,
      { productLine: pending.productLine, expectedUserId: pending.userId, retry: 0 },
    )
    if (
      typeof receipt["commandId"] !== "string" ||
      !receipt["commandId"] ||
      (pending.commandId && receipt["commandId"] !== pending.commandId)
    )
      throw new Error("OCO receipt identity mismatch")
    if (receipt["outcome"] === "TERMINAL" && typeof receipt["code"] === "string" && receipt["code"])
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    if (receipt["outcome"] === "RESULT_UNKNOWN" && receipt["code"] === "RESULT_UNKNOWN")
      return "pending"
    throw new Error("OCO receipt is unavailable")
  }
  if (pending.amendRequestId) {
    const query = new URLSearchParams({
      userId: pending.userId,
      clientRequestId: pending.amendRequestId,
    })
    const receipt = await request(
      `/api/v1/gateway/trading/amendments?${query}`,
      GenericObjectSchema,
      { productLine: pending.productLine, expectedUserId: pending.userId, retry: 0 },
    )
    if (
      typeof receipt["commandId"] !== "string" ||
      !receipt["commandId"] ||
      (pending.commandId && receipt["commandId"] !== pending.commandId)
    )
      throw new Error(t("Amendment result does not match the original request."))
    if (receipt["outcome"] === "TERMINAL" && typeof receipt["code"] === "string" && receipt["code"])
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    if (receipt["outcome"] === "RESULT_UNKNOWN" && receipt["code"] === "RESULT_UNKNOWN")
      return "pending"
    throw new Error(t("Amendment result is unavailable. Please check again."))
  }

  if (pending.cancelOrderId) {
    const receipt = await request(
      `/api/v1/gateway/trading/cancellations/${encodeURIComponent(pending.cancelOrderId)}?userId=${encodeURIComponent(pending.userId)}`,
      GenericObjectSchema,
      { productLine: pending.productLine, expectedUserId: pending.userId, retry: 0 },
    )
    if (
      typeof receipt["commandId"] !== "string" ||
      !receipt["commandId"] ||
      (pending.commandId && receipt["commandId"] !== pending.commandId) ||
      !Array.isArray(receipt["prospectiveOrderIds"]) ||
      receipt["prospectiveOrderIds"].length !== 1 ||
      String(receipt["prospectiveOrderIds"][0]) !== pending.cancelOrderId
    )
      throw new Error(t("Cancellation details do not match. Check the original order again."))
    if (receipt["outcome"] === "TERMINAL" && typeof receipt["code"] === "string" && receipt["code"])
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    if (receipt["outcome"] === "RESULT_UNKNOWN" && receipt["code"] === "RESULT_UNKNOWN")
      return "pending"
    throw new Error(t("Cancellation result is unavailable. Please check again."))
  }
  if (pending.clientOrderId && pending.instrumentId) {
    const query = new URLSearchParams({
      userId: pending.userId,
      clientOrderId: pending.clientOrderId,
    })
    const receipt = await request(
      `/api/v1/gateway/trading/submission?${query}`,
      GenericObjectSchema,
      {
        productLine: pending.productLine,
        expectedUserId: pending.userId,
        retry: 0,
      },
    )
    if (
      String(receipt["userId"]) !== pending.userId ||
      receipt["productLine"] !== pending.productLine ||
      receipt["clientOrderId"] !== pending.clientOrderId
    )
      throw new Error("Submission receipt identity mismatch")
    if (receipt["outcome"] === "TERMINAL") {
      if (
        receipt["instrumentId"] !== pending.instrumentId ||
        typeof receipt["commandId"] !== "string" ||
        !receipt["commandId"] ||
        (pending.commandId && receipt["commandId"] !== pending.commandId) ||
        typeof receipt["code"] !== "string" ||
        !receipt["code"]
      )
        throw new Error("Submission receipt identity mismatch")
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    }
    if (receipt["outcome"] !== "RESULT_UNKNOWN" || receipt["code"] !== "RESULT_UNKNOWN")
      throw new Error("Invalid submission receipt")
    try {
      const value = await request(
        `/api/v1/gateway/trading/by-client-order-id?${query}`,
        GenericObjectSchema,
        {
          productLine: pending.productLine,
          expectedUserId: pending.userId,
          retry: 0,
        },
      )
      const order = OrderSubmissionSchema.parse(value)
      if (
        String(value["userId"]) !== pending.userId ||
        order.clientOrderId !== pending.clientOrderId ||
        order.instrumentId !== pending.instrumentId ||
        !/^\d+$/.test(String(order.orderId)) ||
        BigInt(order.orderId) <= 0n
      )
        throw new Error("Order recovery identity mismatch")
      return order.status === "REJECTED" ? "rejected" : "confirmed"
    } catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
    }
    return "pending"
  }
  if (pending.commandId) {
    const receipt = await loadTradingCommand(pending.commandId, pending.productLine, pending.userId)
    if (receipt["commandId"] !== pending.commandId)
      throw new Error("Order receipt identity mismatch")
    if (
      receipt["outcome"] === "TERMINAL" &&
      typeof receipt["code"] === "string" &&
      receipt["code"] !== ""
    )
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
  }
  return "pending"
}

export function loadTradingCommand(
  commandId: string,
  productLine: ProductLine,
  expectedUserId?: string,
) {
  return request(
    `/api/v1/gateway/trading/commands/${encodeURIComponent(commandId)}`,
    GenericObjectSchema,
    { productLine, retry: 0, ...(expectedUserId === undefined ? {} : { expectedUserId }) },
  )
}

export async function loadOrderPriceProtection(productLine: ProductLine) {
  const policy = await request(
    "/api/v1/gateway/trading/price-protection",
    z.object({
      productLine: z.string(),
      marketMaxSlippagePpm: z.number().int().min(0).max(999999),
    }),
    { productLine },
  )
  if (policy.productLine !== productLine) throw new Error("Order protection product mismatch")
  return policy
}

export function placeOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return submitSingleOrder("/api/v1/gateway/trading", body, productLine)
}

/** Ordinary orders and dedicated position closes share the original order receipt. */
async function submitSingleOrder(
  path: string,
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  const intent: PendingOrderCommand | null = tracksSingleOrderIntent(productLine)
    ? {
        userId: String(body["userId"] ?? ""),
        productLine,
        clientOrderId: String(body[CLIENT_ORDER_ID_KEY] ?? ""),
        instrumentId: String(body["instrumentId"] ?? ""),
      }
    : null
  if (intent) {
    if (!intent.userId || !intent.clientOrderId || !intent.instrumentId)
      throw new Error("Order identity is required")
    const existing = readPendingCommand(intent.userId)
    if (existing) throw new PendingTradingCommand(existing.commandId)
    try {
      savePendingCommand(intent)
    } catch {
      throw new Error(t("Cannot save order recovery details. No order was sent."))
    }
  }
  try {
    const response = await request(path, GenericObjectSchema, {
      method: "POST",
      productLine,
      idempotencyKey: String(body[CLIENT_ORDER_ID_KEY] ?? ""),
      ...(intent ? { expectedUserId: intent.userId } : {}),
      body,
    })
    const order = OrderSubmissionSchema.safeParse(response)
    if (
      order.success &&
      /^\d+$/.test(String(order.data.orderId)) &&
      BigInt(order.data.orderId) > 0n
    ) {
      if (intent) clearPendingCommand(intent)
      return order.data
    }
    if (
      ["MATCHING_PENDING", "RESULT_UNKNOWN"].includes(String(response["outcome"])) &&
      typeof response["commandId"] === "string"
    ) {
      if (intent) savePendingCommand({ ...intent, commandId: response["commandId"] })
      throw new PendingTradingCommand(response["commandId"])
    }
    throw new ApiError(apiErrorMessage(response, 409), 502, response)
  } catch (reason) {
    if (!intent) throw reason
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    if (reason instanceof PendingTradingCommand) throw reason
    throw new PendingTradingCommand(readPendingCommand(intent.userId)?.commandId)
  }
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

export async function amendOrder(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  const userId = String(body["userId"] ?? ""),
    orderId = String(body["orderId"] ?? "")
  const requestId = String(body["clientRequestId"] ?? ""),
    clientId = String(body["newClientOrderId"] ?? "")
  if (
    !userId ||
    !/^[1-9]\d*$/.test(orderId) ||
    !requestId ||
    requestId.length > 64 ||
    !clientId ||
    clientId.length > 64
  )
    throw new Error(t("Amendment identity is required. No amendment was sent."))
  const intent: PendingOrderCommand | null =
    productLine === "SPOT"
      ? {
          userId,
          productLine,
          amendRequestId: requestId,
          amendOrderId: orderId,
          clientOrderId: clientId,
          instrumentId: String(body["instrumentId"] ?? ""),
        }
      : null
  if (intent) {
    if (!intent.instrumentId)
      throw new Error(t("Amendment identity is required. No amendment was sent."))
    const existing = readPendingCommand(userId)
    if (existing) throw new PendingTradingCommand(existing.commandId)
    try {
      savePendingCommand(intent)
    } catch {
      throw new Error(t("Cannot save amendment recovery details. No amendment was sent."))
    }
  }
  try {
    const response = await request("/api/v1/gateway/trading/amend", GenericObjectSchema, {
      method: "POST",
      productLine,
      expectedUserId: userId,
      idempotencyKey: requestId,
      body: {
        userId: body["userId"],
        orderId: body["orderId"],
        newClientOrderId: clientId,
        clientRequestId: requestId,
        priceTicks: body["priceTicks"],
        quantitySteps: body["quantitySteps"],
        ...(body["timeInForce"] === undefined ? {} : { timeInForce: body["timeInForce"] }),
        ...(body["postOnly"] === undefined ? {} : { postOnly: body["postOnly"] }),
      },
    })
    if (["MATCHING_PENDING", "RESULT_UNKNOWN"].includes(String(response["outcome"]))) {
      if (intent && typeof response["commandId"] === "string" && response["commandId"])
        savePendingCommand({ ...intent, commandId: response["commandId"] })
      throw new PendingTradingCommand(
        typeof response["commandId"] === "string" ? response["commandId"] : undefined,
        t("Amendment result is pending. Do not send it again."),
      )
    }
    const result = GenericObjectSchema.safeParse(response["result"])
    const original = OrderSubmissionSchema.safeParse(
      result.success ? result.data["originalOrder"] : null,
    )
    const replacement = OrderSubmissionSchema.safeParse(
      result.success ? result.data["replacementOrder"] : null,
    )
    if (
      response["outcome"] !== "TERMINAL" ||
      response["code"] !== "NONE" ||
      !result.success ||
      result.data["cancelRequested"] !== true ||
      !original.success ||
      String(original.data.orderId) !== orderId ||
      original.data.status !== "CANCELED" ||
      !replacement.success ||
      !/^[1-9]\d*$/.test(String(replacement.data.orderId)) ||
      String(replacement.data.orderId) === orderId
    )
      throw new ApiError(apiErrorMessage(response, 409), 502, response)
    if (intent) clearPendingCommand(intent)
    return result.data
  } catch (reason) {
    if (!intent) throw reason
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    if (reason instanceof PendingTradingCommand) throw reason
    throw new PendingTradingCommand(
      readPendingCommand(userId)?.commandId,
      t("Amendment result is pending. Do not send it again."),
    )
  }
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
  return submitSingleOrder("/api/v1/gateway/trading/close-position", body, productLine)
}

export function cancelOpenOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  if (productLine === "SPOT") return cancelSpotOpenOrders(body)
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
  if (productLine === "SPOT") return cancelSpotBatchOrders(body)
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
  instrumentId: string,
  productLine: ProductLine,
) {
  const query = new URLSearchParams({ userId: String(userId), instrumentId, limit: "100" })
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
  if (tracksTriggerIntent(productLine)) {
    const intent: PendingOrderCommand = {
      userId: String(body["userId"]),
      productLine,
      instrumentId: String(body["instrumentId"] ?? ""),
      clientTriggerOrderId: String(body["clientTriggerOrderId"] ?? ""),
    }
    if (
      !/^[1-9]\d*$/.test(intent.userId) ||
      !intent.instrumentId ||
      !intent.clientTriggerOrderId ||
      intent.clientTriggerOrderId.length > 64
    )
      return Promise.reject(new Error("Trigger request identities are required"))
    return submitTrackedTrigger(intent, "/api/v1/gateway/trading-trigger", body)
  }
  return request("/api/v1/gateway/trading-trigger", TriggerOrderSchema, {
    method: "POST",
    productLine,
    idempotencyKey: String(Reflect.get(body, "clientTriggerOrderId") ?? ""),
    body,
  })
}

export async function loadOpenTriggerOrders(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
): Promise<readonly ApiTriggerOrder[]> {
  const query = new URLSearchParams({ userId: String(userId), instrumentId, limit: "100" })
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
  instrumentId?: string,
): Promise<ApiTriggerOrder> {
  if (tracksTriggerIntent(productLine)) {
    const intent: PendingOrderCommand = {
      userId: String(userId),
      productLine,
      instrumentId: instrumentId ?? "",
      cancelTriggerOrderId: String(triggerOrderId),
    }
    if (
      !/^[1-9]\d*$/.test(intent.userId) ||
      !/^[1-9]\d*$/.test(String(triggerOrderId)) ||
      !intent.instrumentId
    )
      return Promise.reject(new Error("Trigger cancellation identities are required"))
    return submitTrackedTrigger(intent, "/api/v1/gateway/trading-trigger/cancel", {
      userId,
      triggerOrderId,
    })
  }
  return request("/api/v1/gateway/trading-trigger/cancel", TriggerOrderSchema, {
    method: "POST",
    productLine,
    idempotencyKey: `cancel-trigger-${triggerOrderId}`,
    body: { userId, triggerOrderId },
  })
}

/** Save the original trigger request before its sole POST. Resolution is GET only. */
async function submitTrackedTrigger(
  intent: PendingOrderCommand,
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<ApiTriggerOrder> {
  const existing = readPendingCommand(intent.userId)
  if (existing) throw new PendingTradingCommand(existing.commandId)
  try {
    savePendingCommand(intent)
  } catch {
    throw new Error(t("Cannot save order recovery details. No order was sent."))
  }
  try {
    const order = await request(path, TriggerOrderSchema, {
      method: "POST",
      productLine: intent.productLine,
      expectedUserId: intent.userId,
      retry: 0,
      body,
    })
    if (
      !/^[1-9]\d*$/.test(String(order.triggerOrderId)) ||
      !["PENDING", "TRIGGERING", "TRIGGERED", "TRIGGER_FAILED", "CANCELED", "EXPIRED"].includes(
        order.status,
      ) ||
      String(order.userId) !== intent.userId ||
      order.instrumentId !== intent.instrumentId ||
      (intent.clientTriggerOrderId && order.clientTriggerOrderId !== intent.clientTriggerOrderId) ||
      (intent.cancelTriggerOrderId &&
        (String(order.triggerOrderId) !== intent.cancelTriggerOrderId ||
          order.status !== "CANCELED"))
    )
      throw new Error("Trigger response identity mismatch")
    clearPendingCommand(intent)
    return order
  } catch (reason) {
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    throw new PendingTradingCommand(intent.commandId)
  }
}

export async function placeBatchTriggerOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  if (!tracksTriggerIntent(productLine) || body["atomic"] !== true)
    return request("/api/v1/gateway/trading-trigger/batch", GenericObjectSchema, {
      method: "POST",
      productLine,
      body,
    })
  const orders = z.array(GenericObjectSchema).length(2).parse(body["orders"])
  const tp = orders.find((r) => r["triggerType"] === "TAKE_PROFIT")
  const sl = orders.find((r) => r["triggerType"] === "STOP_LOSS")
  if (
    !tp ||
    !sl ||
    !tp["userId"] ||
    !tp["instrumentId"] ||
    !tp["clientTriggerOrderId"] ||
    !sl["clientTriggerOrderId"] ||
    tp["userId"] !== sl["userId"] ||
    tp["instrumentId"] !== sl["instrumentId"] ||
    tp["ocoGroupId"] !== sl["ocoGroupId"]
  )
    throw new Error("OCO request identities are required")
  const intent: PendingOrderCommand = {
    userId: String(tp["userId"]),
    productLine,
    instrumentId: String(tp["instrumentId"]),
    ocoTakeProfitClientId: String(tp["clientTriggerOrderId"]),
    ocoStopLossClientId: String(sl["clientTriggerOrderId"]),
  }
  const existing = readPendingCommand(intent.userId)
  if (existing) throw new PendingTradingCommand(existing.commandId)
  try {
    savePendingCommand(intent)
  } catch {
    throw new Error(t("Cannot save order recovery details. No order was sent."))
  }
  try {
    const response = await request("/api/v1/gateway/trading-trigger/batch", GenericObjectSchema, {
      method: "POST",
      productLine,
      expectedUserId: intent.userId,
      retry: 0,
      body,
    })
    const results = z.array(GenericObjectSchema).length(2).parse(response["results"])
    if (
      response["requested"] !== 2 ||
      response["completed"] !== 2 ||
      response["failed"] !== 0 ||
      new Set(results.map((r) => r["index"])).size !== 2
    )
      throw new Error("OCO response is incomplete")
    for (const item of results) {
      const index = item["index"]
      if (index !== 0 && index !== 1) throw new Error("OCO response index mismatch")
      const order = GenericObjectSchema.parse(item["order"])
      if (
        item["success"] !== true ||
        String(order["userId"]) !== intent.userId ||
        !["PENDING", "TRIGGERING", "TRIGGERED", "TRIGGER_FAILED", "CANCELED", "EXPIRED"].includes(
          String(order["status"]),
        ) ||
        !/^[1-9]\d*$/.test(String(order["triggerOrderId"])) ||
        order["clientTriggerOrderId"] !== orders[index]?.["clientTriggerOrderId"] ||
        order["instrumentId"] !== intent.instrumentId ||
        order["ocoGroupId"] !== tp["ocoGroupId"]
      )
        throw new Error("OCO response identity mismatch")
    }
    clearPendingCommand(intent)
    return response
  } catch (reason) {
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    throw new PendingTradingCommand(readPendingCommand(intent.userId)?.commandId)
  }
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

export async function loadOpenOrders(instrumentId: string, productLine: ProductLine) {
  const session = loadSession()
  if (!session) return [] as readonly ApiOrder[]
  const query = new URLSearchParams({
    userId: String(session.user.userId),
    limit: "50",
  })
  if (instrumentId.trim()) query.set("instrumentId", instrumentId.trim())
  const response = await request(
    `/api/v1/gateway/trading/open?${query.toString()}`,
    OrderListSchema,
    { productLine },
  )
  return orderRows(response)
}

export async function loadOrderHistory(
  instrumentId: string,
  productLine: ProductLine,
  startTime?: number,
  endTime?: number,
  cursor?: string,
  status?: string,
) {
  const session = loadSession()
  if (!session) throw new Error(t("Sign in required."))
  const query = new URLSearchParams({
    userId: String(session.user.userId),
    limit: "100",
  })
  if (instrumentId.trim()) query.set("instrumentId", instrumentId.trim())
  if (startTime !== undefined) query.set("startTime", String(startTime))
  if (endTime !== undefined) query.set("endTime", String(endTime))
  if (cursor) query.set("cursor", cursor)
  if (status) query.set("status", status)
  const response = await request(
    `/api/v1/gateway/trading/history?${query.toString()}`,
    OrderHistoryPageSchema,
    { productLine, expectedUserId: String(session.user.userId), retry: 0 },
  )
  if (
    (response.hasMore && response.nextCursor === cursor) ||
    response.orders.some(
      (row) =>
        String(row.userId) !== String(session.user.userId) ||
        (instrumentId.trim() && row.instrumentId !== instrumentId.trim()) ||
        (status && row.status !== status),
    )
  )
    throw new Error(t("Order history does not match the original query. Refresh to retry."))
  return response
}

export async function loadMyTrades(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  filters: {
    startTime?: number | undefined
    endTime?: number | undefined
    cursor?: string | undefined
  } = {},
) {
  const query = new URLSearchParams({ userId: String(userId), limit: "100" })
  if (instrumentId.trim()) query.set("instrumentId", instrumentId.trim())
  if (filters.startTime !== undefined) query.set("startTime", String(filters.startTime))
  if (filters.endTime !== undefined) query.set("endTime", String(filters.endTime))
  if (filters.cursor) query.set("cursor", filters.cursor)
  const response = await request(
    `/api/v1/gateway/trading/trades?${query.toString()}`,
    TradeFillPageSchema,
    { productLine, expectedUserId: String(userId), retry: 0 },
  )
  if (
    String(response.userId) !== String(userId) ||
    response.productLine !== productLine ||
    (response.hasMore && (!response.nextCursor || response.nextCursor === filters.cursor)) ||
    response.trades.some(
      (row) =>
        row.productLine !== productLine ||
        (instrumentId.trim() && row.instrumentId !== instrumentId.trim()),
    )
  )
    throw new Error(t("Trade history does not match the original query. Refresh to retry."))
  return response
}

export async function cancelOrder(_symbol: string, orderId: string, productLine: ProductLine) {
  const session = loadSession()
  if (!session) throw new Error(t("Please sign in before canceling orders."))
  if (!/^[1-9]\d*$/.test(orderId)) throw new Error("Invalid order ID")
  const pendingMessage = t("Cancellation result is pending. Do not send it again.")
  const userId = String(session.user.userId)
  const intent: PendingOrderCommand | null = tracksSingleOrderIntent(productLine)
    ? { userId, productLine, cancelOrderId: orderId }
    : null
  if (intent) {
    const existing = readPendingCommand(userId)
    if (existing) throw new PendingTradingCommand(existing.commandId)
    try {
      savePendingCommand(intent)
    } catch {
      throw new Error(t("Cannot save cancellation recovery details. No cancellation was sent."))
    }
  }
  try {
    const response = await request(`/api/v1/gateway/trading/cancel`, GenericObjectSchema, {
      method: "POST",
      productLine,
      expectedUserId: userId,
      idempotencyKey: `cancel-${orderId}`,
      body: { userId: session.user.userId, orderId },
    })
    if (["MATCHING_PENDING", "RESULT_UNKNOWN"].includes(String(response["outcome"]))) {
      if (intent && typeof response["commandId"] === "string" && response["commandId"])
        savePendingCommand({ ...intent, commandId: response["commandId"] })
      throw new PendingTradingCommand(
        typeof response["commandId"] === "string" ? response["commandId"] : undefined,
        pendingMessage,
      )
    }
    const order = OrderSubmissionSchema.safeParse(response)
    if (
      response["outcome"] !== "TERMINAL" ||
      response["code"] !== "NONE" ||
      !order.success ||
      String(order.data.orderId) !== orderId
    )
      throw new ApiError(apiErrorMessage(response, 409), 502, response)
    if (intent) clearPendingCommand(intent)
    return order.data
  } catch (reason) {
    if (!intent) throw reason
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    if (reason instanceof PendingTradingCommand) throw reason
    throw new PendingTradingCommand(readPendingCommand(userId)?.commandId, pendingMessage)
  }
}

export function loadOrderBook(instrumentId: string, productLine: ProductLine, depth = 50) {
  const query = new URLSearchParams({ instrumentId, depth: String(depth) }).toString()
  return request(`/api/v1/gateway/trading-market/orderbook?${query}`, OrderBookSchema, {
    productLine,
  })
}

export async function loadLatestTrade(instrumentId: string, productLine: ProductLine) {
  const query = new URLSearchParams({ instrumentId }).toString()
  return request(`/api/v1/gateway/trading-market/latest-trade?${query}`, GenericObjectSchema, {
    productLine,
  })
}

export function loadTicker24h(instrumentId: string, productLine: ProductLine) {
  const query = new URLSearchParams({ instrumentId })
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

export function loadAnnouncements(
  params: {
    locale?: string
    productLine?: string
    platform?: string
    placement?: string
    offset?: number
    limit?: number
  } = {},
) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries({
    locale: params.locale ?? "en-US",
    productLine: params.productLine ?? "ALL",
    platform: params.platform ?? "WEB",
    placement: params.placement ?? "CENTER",
    offset: params.offset ?? 0,
    limit: params.limit ?? 50,
  }))
    query.set(key, String(value))
  return request(
    `/api/v1/announcements?${query.toString()}`,
    z
      .object({
        announcements: ArraySchema,
        unreadCount: z.number(),
        offset: z.number(),
        limit: z.number(),
        hasMore: z.boolean(),
      })
      .passthrough(),
  )
}

export function markAnnouncementRead(
  announcementId: string,
  productLine = "ALL",
  placement = "CENTER",
  locale = "en-US",
) {
  const query = new URLSearchParams({ productLine, platform: "WEB", placement, locale })
  return request(
    `/api/v1/announcements/${encodeURIComponent(announcementId)}/read?${query.toString()}`,
    GenericObjectSchema,
    { method: "POST" },
  ).then((result) => {
    window.dispatchEvent(new Event("surprising-announcements-updated"))
    return result
  })
}

export function markAllAnnouncementsRead(productLine = "ALL") {
  const query = new URLSearchParams({ productLine, platform: "WEB", placement: "CENTER" })
  return request(
    `/api/v1/announcements/read-all?${query.toString()}`,
    z.object({ updated: z.number() }),
    { method: "POST" },
  ).then((result) => {
    window.dispatchEvent(new Event("surprising-announcements-updated"))
    return result
  })
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

export async function loadEffectiveTradingFee(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  changeId?: string,
) {
  const query = new URLSearchParams({ userId: String(userId), instrumentId, productLine })
  const fee = await request(
    `/api/v1/gateway/trading-fees/effective?${query}`,
    GenericObjectSchema,
    {
      productLine,
    },
  )
  if (
    productLine === "SPOT" &&
    (changeId == null ||
      String(fee["userId"]) !== String(userId) ||
      fee["productLine"] !== productLine ||
      String(fee["instrumentId"]) !== instrumentId ||
      String(fee["changeId"]) !== changeId ||
      typeof fee["takerFeeRatePpm"] !== "number" ||
      !Number.isSafeInteger(fee["takerFeeRatePpm"]) ||
      Math.abs(fee["takerFeeRatePpm"]) > 1000000)
  )
    throw new Error("Order fee metadata mismatch")
  return fee
}
