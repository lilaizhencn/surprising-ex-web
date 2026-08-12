import { z } from "zod"
import type { ProductLine } from "../types/domain"
import { request } from "./client"
import type {
  ApiBalance,
  ApiCandle,
  ApiFundingPayment,
  ApiFundingRate,
  ApiMarket,
  ApiOrder,
  ApiProductTransferRecord,
  ApiProductTransferResponse,
  ApiWithdrawalSubmission,
  AuthSession,
} from "./types"
import {
  AccountLedgerPageSchema,
  AuthSessionSchema,
  BalanceListSchema,
  CandleListSchema,
  DepositAddressSchema,
  FundingPaymentPageSchema,
  FundingRatePageSchema,
  FundingRateSchema,
  GenericObjectSchema,
  HelpArticleListSchema,
  KycProfileSchema,
  MarketListSchema,
  OrderBookSchema,
  OrderListSchema,
  ProductTransferRecordPageSchema,
  ProductTransferResponseSchema,
  SecurityApiKeyListSchema,
  WalletRecordsSchema,
  WithdrawalSubmissionSchema,
} from "./types"

const ArraySchema = z.array(GenericObjectSchema)
const CLIENT_ORDER_ID_KEY = "clientOrderId"
const ObjectOrArraySchema = z.union([
  ArraySchema,
  z.object({ items: ArraySchema.optional(), orders: ArraySchema.optional() }).passthrough(),
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
  const response = await request(
    "/api/v1/gateway/instrument/list?status=TRADING",
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
  amountUnits: number,
  idempotencyKey: string,
): Promise<ApiProductTransferResponse> {
  return request("/api/v1/gateway/account/transfers", ProductTransferResponseSchema, {
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

export function loadPositionMode(productLine: ProductLine) {
  return request(
    `/api/v1/gateway/account/position-mode?productLine=${encodeURIComponent(productLine)}`,
    GenericObjectSchema,
    { productLine },
  )
}

export function updatePositionMode(productLine: ProductLine, positionMode: string) {
  return request("/api/v1/gateway/account/position-mode", GenericObjectSchema, {
    method: "POST",
    productLine,
    body: { productLine, positionMode },
  })
}

export async function loadPositions(
  productLine: ProductLine,
): Promise<readonly Record<string, unknown>[]> {
  const response = await request(
    `/api/v1/gateway/account/positions?productLine=${encodeURIComponent(productLine)}`,
    ObjectOrArraySchema,
    { productLine },
  )
  return Array.isArray(response) ? response : (response.items ?? response.orders ?? [])
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
    accountType,
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
  const query = new URLSearchParams({
    accountType,
    limit: "100",
  })
  if (asset?.trim()) query.set("asset", asset.trim().toUpperCase())
  const response = await request(
    `/api/v1/gateway/account/transfers?${query.toString()}`,
    ProductTransferRecordPageSchema,
    { productLine: accountType },
  )
  return response.transfers
}

export function placeOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/gateway/trading/orders", GenericObjectSchema, {
    method: "POST",
    productLine,
    idempotencyKey: String(body[CLIENT_ORDER_ID_KEY] ?? ""),
    body,
  })
}

function binancePrefix(productLine: ProductLine): string {
  if (productLine === "SPOT") return "/api/v3"
  if (productLine === "OPTION") return "/eapi/v1"
  if (productLine === "INVERSE_PERPETUAL" || productLine === "INVERSE_DELIVERY") return "/dapi/v1"
  return "/fapi/v1"
}

function querySymbol(symbol: string, _productLine: ProductLine, limit = "50"): string {
  return new URLSearchParams({ symbol, limit }).toString()
}

export async function loadOpenOrders(symbol: string, productLine: ProductLine) {
  const response = await request(
    `${binancePrefix(productLine)}/openOrders?${querySymbol(symbol, productLine)}`,
    OrderListSchema,
    { productLine },
  )
  return orderRows(response)
}

export async function loadOrderHistory(symbol: string, productLine: ProductLine) {
  const response = await request(
    `${binancePrefix(productLine)}/allOrders?${querySymbol(symbol, productLine)}`,
    OrderListSchema,
    { productLine },
  )
  return orderRows(response)
}

export function cancelOrder(symbol: string, orderId: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol, orderId }).toString()
  return request(`${binancePrefix(productLine)}/order?${query}`, GenericObjectSchema, {
    method: "DELETE",
    productLine,
    idempotencyKey: `cancel-${orderId}`,
  })
}

export function loadOrderBook(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol, limit: "20" }).toString()
  return request(`${binancePrefix(productLine)}/depth?${query}`, OrderBookSchema, { productLine })
}

export async function loadLatestTrade(symbol: string, productLine: ProductLine) {
  const query = new URLSearchParams({ symbol }).toString()
  return request(`${binancePrefix(productLine)}/ticker/price?${query}`, GenericObjectSchema, {
    productLine,
  })
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
