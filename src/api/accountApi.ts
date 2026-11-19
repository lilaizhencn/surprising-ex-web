import { z } from "zod"
import { t } from "../i18n"
import { currentAccountUserId, loadSession } from "../state/session"
import type { ProductLine } from "../types/domain"
import { request } from "./client"
import type {
  ApiBalance,
  ApiProductTransferRecord,
  ApiProductTransferResponse,
  ApiWithdrawalSubmission,
} from "./types"
import {
  AccountLedgerPageSchema,
  AnnouncementPageSchema,
  AnnouncementSchema,
  BalanceListSchema,
  GenericObjectSchema,
  HelpArticleListSchema,
  NotificationListSchema,
  NotificationSchema,
  ProductTransferRecordPageSchema,
  ProductTransferResponseSchema,
  WalletRecordsSchema,
  WithdrawalQuoteSchema,
  WithdrawalSubmissionSchema,
} from "./types"

type AccountType =
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

export async function loadBalances(
  productLine?: ProductLine,
  accountType?: string,
  signal?: AbortSignal,
): Promise<readonly ApiBalance[]> {
  const session = typeof window === "undefined" ? null : loadSession()
  const requestedAccountType =
    accountType ?? (productLine ? accountTypeForProductLine(productLine) : undefined)
  const query = new URLSearchParams()
  const owner = currentAccountUserId(session)
  if (owner) query.set("userId", String(owner))
  if (requestedAccountType && requestedAccountType !== "FUNDING")
    query.set("accountType", requestedAccountType)
  const path = requestedAccountType === "FUNDING" ? "balances" : "product-balances"
  const response = await request(
    `/api/v1/accounts/${path}?${query.toString()}`,
    BalanceListSchema,
    { ...(productLine ? { productLine } : {}), ...(signal ? { signal } : {}) },
  )
  return response.balances ?? response.items ?? []
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
  return request("/api/v1/accounts/transfers", ProductTransferResponseSchema, {
    method: "POST",
    idempotencyKey,
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: {
      userId: currentAccountUserId(session),
      sourceAccountType,
      targetAccountType,
      asset,
      amountUnits,
      referenceId: idempotencyKey,
      reason: "web product transfer",
    },
  })
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
  return request(`/api/v1/accounts/ledger?${query.toString()}`, AccountLedgerPageSchema)
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
  return request(`/api/v1/accounts/product-ledger?${query.toString()}`, AccountLedgerPageSchema, {
    productLine: accountType,
  })
}

export async function loadTransferHistory(
  accountType: ProductLine,
  asset?: string,
  signal?: AbortSignal,
): Promise<readonly ApiProductTransferRecord[]> {
  return (await loadTransferHistoryPage(accountType, asset, undefined, signal)).transfers
}

export async function loadTransferHistoryPage(
  accountType: ProductLine,
  asset?: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ limit: "100" })
  query.set("accountType", accountTypeForProductLine(accountType))
  if (asset?.trim()) query.set("asset", asset.trim().toUpperCase())
  if (cursor) query.set("cursor", cursor)
  return request(
    `/api/v1/accounts/transfers?${query.toString()}`,
    ProductTransferRecordPageSchema,
    { productLine: accountType, ...(signal ? { signal } : {}) },
  )
}

export function loadFundingSettlement(instrumentId: string, productLine: ProductLine) {
  const query = new URLSearchParams({ instrumentId })
  return request(`/api/v1/funding/settlements/latest?${query.toString()}`, GenericObjectSchema, {
    productLine,
  })
}

/** Resolve original submissions and cancellations from realtime-owned views only. */

export function loadDepositHistory(asset?: string, chain?: string, signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (asset) query.set("asset", asset)
  if (chain) query.set("chain", chain)
  query.set("limit", "50")
  return request(
    `/api/v1/wallet/deposits?${query.toString()}`,
    WalletRecordsSchema,
    signal ? { signal } : {},
  )
}

export function loadWithdrawalHistory(asset?: string, chain?: string, signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (asset) query.set("asset", asset)
  if (chain) query.set("chain", chain)
  query.set("limit", "50")
  return request(`/api/v1/wallet/withdrawals?${query.toString()}`, WalletRecordsSchema, {
    ...(signal ? { signal } : {}),
  })
}

export function loadNotifications(unreadOnly = false, signal?: AbortSignal) {
  const query = new URLSearchParams({ unreadOnly: String(unreadOnly), limit: "100" })
  return request(
    `/api/v1/notifications?${query.toString()}`,
    NotificationListSchema,
    signal ? { signal } : {},
  )
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
  signal?: AbortSignal,
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
    AnnouncementPageSchema,
    signal ? { signal } : {},
  )
}

export function markAnnouncementRead(
  announcementId: string,
  productLine = "ALL",
  placement = "CENTER",
  locale = "en-US",
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ productLine, platform: "WEB", placement, locale })
  return request(
    `/api/v1/announcements/${encodeURIComponent(announcementId)}/read?${query.toString()}`,
    AnnouncementSchema,
    { method: "POST", ...(signal ? { signal } : {}) },
  ).then((result) => {
    if (result.announcementId !== announcementId || !result.readAt)
      throw new Error(
        t("The service returned an unexpected response. Please refresh and try again."),
      )
    window.dispatchEvent(new Event("surprising-announcements-updated"))
    return result
  })
}

export function markAllAnnouncementsRead(productLine = "ALL", signal?: AbortSignal) {
  const query = new URLSearchParams({ productLine, platform: "WEB", placement: "CENTER" })
  return request(
    `/api/v1/announcements/read-all?${query.toString()}`,
    z.object({ updated: z.number().int().nonnegative() }),
    { method: "POST", ...(signal ? { signal } : {}) },
  ).then((result) => {
    window.dispatchEvent(new Event("surprising-announcements-updated"))
    return result
  })
}

export function loadHelpArticles(query = "", category = "", signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (query.trim()) params.set("query", query.trim())
  if (category) params.set("category", category)
  return request(
    `/api/v1/help/articles?${params.toString()}`,
    HelpArticleListSchema,
    signal ? { signal } : {},
  )
}

export function markNotificationRead(notificationId: string, signal?: AbortSignal) {
  return request(
    `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
    NotificationSchema,
    {
      method: "POST",
      ...(signal ? { signal } : {}),
    },
  ).then((result) => {
    if (result.notificationId !== notificationId || !result.readAt)
      throw new Error(
        t("The service returned an unexpected response. Please refresh and try again."),
      )
    return result
  })
}

export function markAllNotificationsRead(signal?: AbortSignal) {
  return request("/api/v1/notifications/read-all", z.number().int().nonnegative(), {
    method: "POST",
    ...(signal ? { signal } : {}),
  })
}

export function quoteWithdrawal(
  chain: string,
  assetSymbol: string,
  amount: string,
  signal?: AbortSignal,
) {
  return request("/api/v1/wallet/withdrawals/quote", WithdrawalQuoteSchema, {
    method: "POST",
    body: { chain, assetSymbol, amount },
    ...(signal ? { signal } : {}),
  })
}

export function loadWithdrawalSubmission(reference: string, signal?: AbortSignal) {
  return request(
    `/api/v1/wallet/withdrawals/submission?${new URLSearchParams({ reference })}`,
    WithdrawalSubmissionSchema,
    { ...(signal ? { signal } : {}), retry: 0 },
  )
}

export function createWithdrawal(
  chain: string,
  assetSymbol: string,
  toAddress: string,
  amount: string,
  externalReference: string,
  emailCode: string,
  totpCode: string,
  networkRevision: number,
): Promise<ApiWithdrawalSubmission> {
  return request("/api/v1/wallet/withdrawals", WithdrawalSubmissionSchema, {
    method: "POST",
    idempotencyKey: externalReference,
    headers: {
      "X-Security-Email-Code": emailCode,
      "X-Security-TOTP-Code": totpCode,
    },
    body: { chain, assetSymbol, toAddress, amount, externalReference, networkRevision },
  })
}

export interface VipTierDefinition {
  readonly tierLevel: number
  readonly tierCode: string
  readonly min30DayVolumeUsd: number
  readonly minAssetBalanceUsd: number
  readonly makerFeeRatePpm: number
  readonly takerFeeRatePpm: number
}

export interface UserVipStatus {
  readonly userId: number
  readonly currentTierLevel: number
  readonly currentTierCode: string
  readonly makerFeeRatePpm: number
  readonly takerFeeRatePpm: number
  readonly rolling30DayVolumeUsd: number
  readonly nextTierMinVolumeUsd: number
  readonly volumeNeededForNextTier: number
}

const VipTierDefinitionSchema = z.object({
  tierLevel: z.number(),
  tierCode: z.string(),
  min30DayVolumeUsd: z.number(),
  minAssetBalanceUsd: z.number(),
  makerFeeRatePpm: z.number(),
  takerFeeRatePpm: z.number(),
})

export async function loadVipLevels(): Promise<readonly VipTierDefinition[]> {
  return request("/api/v1/trading/fees/vip/levels", z.array(VipTierDefinitionSchema))
}

export async function loadMyVipStatus(): Promise<UserVipStatus> {
  const res = await request("/api/v1/trading/fees/vip/my-status", GenericObjectSchema)
  return res as unknown as UserVipStatus
}

export async function evaluateMyVip(productLine?: string): Promise<UserVipStatus> {
  const query = productLine ? `?productLine=${productLine}` : ""
  const res = await request(`/api/v1/trading/fees/vip/evaluate${query}`, GenericObjectSchema, {
    method: "POST",
  })
  return res as unknown as UserVipStatus
}

// ---------------------- 网格策略机器人 API ----------------------

export interface SubAccountRecord {
  readonly id: number
  readonly parentUserId: number
  readonly subUserId: number
  readonly subAccountName: string
  readonly permissions: string
  readonly status: string
  readonly createdAt: string
}

interface SubAccountTransferRequest {
  readonly subUserId: number
  readonly fromParentToSub: boolean
  readonly asset: string
  readonly amountUnits: number | string
  readonly productLine?: string
}

interface SubAccountTransferResponse {
  readonly transferId: string
  readonly fromUserId: number
  readonly toUserId: number
  readonly asset: string
  readonly amountUnits: number
  readonly status: string
  readonly timestamp: string
}

export async function createSubAccount(body: {
  subAccountName: string
  permissions?: string
}): Promise<SubAccountRecord> {
  const res = await request("/api/v1/sub-account/create", GenericObjectSchema, {
    method: "POST",
    body,
  })
  return res as unknown as SubAccountRecord
}

export async function loadSubAccounts(): Promise<readonly SubAccountRecord[]> {
  const res = await request("/api/v1/sub-account/list", z.array(GenericObjectSchema))
  return res as unknown as readonly SubAccountRecord[]
}

export async function transferSubAccount(
  body: SubAccountTransferRequest,
): Promise<SubAccountTransferResponse> {
  const res = await request("/api/v1/sub-account/transfer", GenericObjectSchema, {
    method: "POST",
    body,
  })
  return res as unknown as SubAccountTransferResponse
}

// ---------------------- 默克尔树资产储备证明 (PoR) API ----------------------

export interface PorSnapshotSummary {
  readonly snapshotId: string
  readonly rootHash: string
  readonly totalLiabilityUsd: number
  readonly totalReserveUsd: number
  readonly reserveRatioPpm: number
  readonly totalUserCount: number
  readonly snapshotTime: string
}

export interface MerkleProofStep {
  readonly siblingHash: string
  readonly isRightSibling: boolean
}

export interface UserPorProof {
  readonly userId: number
  readonly snapshotId: string
  readonly rootHash: string
  readonly userLiabilityUsd: number
  readonly userNonce: string
  readonly proofPath: readonly MerkleProofStep[]
  readonly snapshotTime: string
}

interface VerifyPorProofResponse {
  readonly valid: boolean
  readonly computedRootHash: string
  readonly expectedRootHash: string
}

export async function loadLatestPor(): Promise<PorSnapshotSummary> {
  const res = await request("/api/v1/compliance/por/latest", GenericObjectSchema)
  return res as unknown as PorSnapshotSummary
}

export async function loadMyPorProof(): Promise<UserPorProof> {
  const res = await request("/api/v1/compliance/por/my-proof", GenericObjectSchema)
  return res as unknown as UserPorProof
}

export async function verifyPorProof(body: {
  rootHash: string
  userId: number
  userLiabilityUsd: number
  userNonce: string
  proofPath: readonly MerkleProofStep[]
}): Promise<VerifyPorProofResponse> {
  const res = await request("/api/v1/compliance/por/verify", GenericObjectSchema, {
    method: "POST",
    body,
  })
  return res as unknown as VerifyPorProofResponse
}
