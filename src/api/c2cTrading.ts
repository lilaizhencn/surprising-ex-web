import { z } from "zod"
import { request } from "./client"

const decimal = z
  .string()
  .max(80)
  .regex(/^\d+(\.\d+)?$/)
const id = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n)
const positiveId = id.refine((value) => value !== "0")
const uuid = z.uuid()
const instant = z.iso.datetime({ offset: true })
export const orderStatusSchema = z.enum([
  "RESERVING",
  "PAYMENT_PENDING",
  "PAID",
  "APPEALED",
  "RELEASE_PENDING",
  "REFUND_PENDING",
  "COMPLETED",
  "CANCELED",
  "EXPIRED",
  "FAILED",
])
const adStatusSchema = z.enum(["RESERVING", "ACTIVE", "PAUSED", "CLOSING", "CLOSED", "REJECTED"])
const unique = <T>(rows: T[], key: (row: T) => string) =>
  new Set(rows.map(key)).size === rows.length
export const marketSchema = z.object({
  marketId: uuid,
  asset: z.string().min(1),
  fiat: z.string().min(1),
  assetScale: positiveId.refine((value) => /^10*$/.test(value)),
  minFiat: decimal,
  maxFiat: decimal,
  paymentWindowSeconds: z.number().int().min(60).max(3600),
})
export const accountSchema = z.object({
  accountId: uuid,
  methodCode: z.string(),
  fiat: z.string(),
  maskedLabel: z.string(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "DISABLED"]),
  revision: positiveId,
})
export const adSchema = z.object({
  adId: uuid,
  makerUserId: positiveId,
  market: marketSchema,
  side: z.enum(["BUY", "SELL"]),
  price: decimal,
  availableQuantity: decimal,
  minFiat: decimal,
  maxFiat: decimal,
  revision: positiveId,
  status: adStatusSchema,
  methodCodes: z.array(z.string()),
  merchant: z
    .object({ nickname: z.string(), completedTotal: id.optional(), completed30d: id.optional() })
    .passthrough()
    .optional(),
  paymentOptions: z
    .array(z.object({ accountId: uuid, methodCode: z.string(), maskedLabel: z.string() }))
    .optional(),
})
export const adDetailSchema = adSchema.extend({
  paymentOptions: adSchema.shape.paymentOptions.unwrap(),
})
export const quoteSchema = z.object({
  quoteId: uuid,
  ownerUserId: positiveId,
  adId: uuid,
  paymentAccountId: uuid,
  market: marketSchema,
  quantity: decimal,
  fiatAmount: decimal,
  price: decimal,
  buyerFeeUnits: id,
  buyerReceivesUnits: id,
  expiresAt: instant,
  serverTime: instant,
  valid: z.boolean(),
})
export const orderSchema = z.object({
  orderId: uuid,
  market: marketSchema,
  buyerUserId: positiveId,
  sellerUserId: positiveId,
  quantity: decimal,
  fiatAmount: decimal,
  price: decimal,
  buyerFeeUnits: id,
  buyerReceivesUnits: id,
  paymentExpiresAt: instant.nullable(),
  terms: z.string(),
  status: orderStatusSchema,
})
export const orderDetailSchema = orderSchema.extend({
  serverTime: instant,
  payment: z.object({
    holderName: z.string().min(1),
    accountNumber: z.string().min(1),
    bankName: z.string().nullable(),
    methodCode: z.string().min(1),
    fiat: z.string().min(1),
  }),
  events: z.array(z.object({ eventId: positiveId, type: z.string().min(1), createdAt: instant })),
  appeals: z.array(
    z.object({
      appealId: uuid,
      status: z.enum(["OPEN", "REVIEWING", "RESOLVED", "WITHDRAWN"]),
      reason: z.string(),
      decision: z.string().nullable(),
      decisionReason: z.string().nullable(),
      createdAt: instant,
    }),
  ),
})
export const bondSchema = z.object({
  policy: z
    .object({
      configured: z.boolean(),
      revision: id,
      asset: z.string().optional(),
      amount: decimal.optional(),
    })
    .refine(
      (policy) =>
        !policy.configured ||
        (policy.revision !== "0" &&
          typeof policy.asset === "string" &&
          policy.asset.length > 0 &&
          typeof policy.amount === "string" &&
          /[1-9]/.test(policy.amount)),
    ),
  bond: z
    .object({
      bondId: z.string(),
      requestId: z.string(),
      asset: z.string(),
      amount: decimal,
      status: z.enum(["RESERVING", "LOCKED", "REFUND_PENDING", "RETURNED", "FAILED"]),
    })
    .nullable(),
})
const object = z.record(z.string(), z.unknown())
const base = "/api/v1/c2c"
export type C2cMarket = z.infer<typeof marketSchema>
export type C2cAd = z.infer<typeof adSchema>
export type C2cQuote = z.infer<typeof quoteSchema>
export type C2cTradingOrder = z.infer<typeof orderSchema>
export type C2cBond = z.infer<typeof bondSchema>
export type Verification = { emailCode: string; totpCode: string }
export function c2cRead<T>(
  owner: string,
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  return request(`${base}${path}`, schema, { expectedUserId: owner, ...(signal ? { signal } : {}) })
}
export function c2cWrite(owner: string, path: string, body: unknown, signal?: AbortSignal) {
  return request(`${base}${path}`, object, {
    method: "POST",
    body,
    expectedUserId: owner,
    ...(signal ? { signal } : {}),
  })
}
export const c2cMarkets = (owner: string, signal?: AbortSignal) =>
  c2cRead(
    owner,
    "/markets",
    z.object({
      markets: z.array(marketSchema).refine((rows) => unique(rows, (row) => row.marketId)),
      paymentMethods: z
        .array(
          z.object({
            code: z.string(),
            label: z.string(),
            currencies: z.array(z.string()),
            requiresBankName: z.boolean(),
            supportsQr: z.boolean(),
          }),
        )
        .refine((rows) => unique(rows, (row) => row.code)),
    }),
    signal,
  )
export const c2cAccounts = (owner: string, signal?: AbortSignal) =>
  c2cRead(
    owner,
    "/payment-accounts",
    z.object({
      items: z.array(accountSchema).refine((rows) => unique(rows, (row) => row.accountId)),
    }),
    signal,
  )
export const c2cMe = (owner: string, signal?: AbortSignal) =>
  c2cRead(
    owner,
    "/me",
    z.object({
      kycVerified: z.boolean(),
      merchant: z
        .object({
          status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED", "WITHDRAWN"]),
          revision: positiveId,
          reviewReason: z.string().nullable(),
        })
        .nullable(),
    }),
    signal,
  )
export const c2cBond = (owner: string, signal?: AbortSignal) =>
  c2cRead(owner, "/me/merchant-bond", bondSchema, signal)
export const c2cTradingOrders = (owner: string, signal?: AbortSignal, offset = 0) =>
  c2cRead(
    owner,
    `/orders?state=ALL&limit=30&offset=${offset}`,
    z
      .object({
        items: z
          .array(orderSchema)
          .max(30)
          .refine((rows) => unique(rows, (row) => row.orderId)),
        hasMore: z.boolean(),
        offset: z.number().int().nonnegative(),
      })
      .refine((page) => page.offset === offset),
    signal,
  )
export const c2cMyAds = (owner: string, signal?: AbortSignal) =>
  c2cRead(
    owner,
    "/me/ads",
    z.object({
      items: z
        .array(adSchema)
        .max(100)
        .refine((rows) => unique(rows, (row) => row.adId)),
    }),
    signal,
  )
export function challengeC2c(owner: string, sceneCode = "WITHDRAWAL") {
  return request("/api/v1/security/verification/challenge", object, {
    method: "POST",
    body: { sceneCode },
    expectedUserId: owner,
  })
}

const pendingSchema = z
  .object({
    owner: z.string(),
    kind: z.enum(["ORDER_CREATE", "AD_PUBLISH"]),
    requestKey: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    body: object,
  })
  .refine(
    (value) =>
      value.body["requestKey"] === value.requestKey &&
      !Object.hasOwn(value.body, "verification") &&
      (value.kind === "ORDER_CREATE"
        ? typeof value.body["quoteId"] === "string" && value.body["quoteId"].length > 0
        : value.body["payload"] !== null && typeof value.body["payload"] === "object"),
  )
export type C2cPendingTrade = z.infer<typeof pendingSchema>
const pendingKey = (owner: string) => `surprising.c2c.trade.${owner}`
export function loadPendingTrade(owner: string) {
  const raw = sessionStorage.getItem(pendingKey(owner))
  if (!raw) return null
  const value = pendingSchema.parse(JSON.parse(raw))
  if (value.owner !== owner) throw Error("交易请求归属不匹配")
  return value
}
export async function prepareTrade(
  owner: string,
  kind: C2cPendingTrade["kind"],
  input: Record<string, unknown>,
) {
  if (loadPendingTrade(owner)) throw Error("请先确认原请求结果")
  if (Object.hasOwn(input, "verification")) throw Error("安全验证码不能保存到原请求中")
  const requestKey = crypto.randomUUID()
  const identity =
    kind === "ORDER_CREATE" ? String(input["quoteId"]) : JSON.stringify(input["payload"])
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity))
  const requestHash = [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
  const pending = pendingSchema.parse({
    owner,
    kind,
    requestKey,
    requestHash,
    body: { ...input, requestKey },
  })
  // Persist the original business request before any mutation. Verification codes are never stored.
  sessionStorage.setItem(pendingKey(owner), JSON.stringify(pending))
  return pending
}
export function clearTrade(owner: string) {
  sessionStorage.removeItem(pendingKey(owner))
}
export function tradeReceipt(owner: string, pending: C2cPendingTrade) {
  return c2cRead(
    owner,
    `/submissions/${encodeURIComponent(pending.requestKey)}?${new URLSearchParams({ kind: pending.kind, requestHash: pending.requestHash })}`,
    z.object({
      ownerUserId: positiveId,
      requestKey: z.string(),
      kind: z.enum(["ORDER_CREATE", "AD_PUBLISH"]),
      requestHash: z.string(),
      status: z.enum(["UNKNOWN", "PROCESSING", "SUCCEEDED", "REJECTED"]),
      resultId: uuid.nullable(),
      errorCode: z.string().nullable(),
      message: z.string().nullable(),
    }),
  ).then((result) => {
    if (
      result.ownerUserId !== owner ||
      result.requestKey !== pending.requestKey ||
      result.kind !== pending.kind ||
      result.requestHash !== pending.requestHash ||
      (result.status === "SUCCEEDED" && !result.resultId)
    )
      throw Error("原请求回执身份不匹配，请重新查询")
    return result
  })
}

export function c2cDecimal(value: string) {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value
}
