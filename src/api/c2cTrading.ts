import { z } from "zod"
import { request } from "./client"

const decimal = z.string().regex(/^\d+(\.\d+)?$/)
const id = z.string().regex(/^(0|[1-9]\d{0,18})$/)
export const marketSchema = z.object({
  marketId: z.string(),
  asset: z.string(),
  fiat: z.string(),
  assetScale: id,
  minFiat: decimal,
  maxFiat: decimal,
  paymentWindowSeconds: z.number(),
})
export const accountSchema = z.object({
  accountId: z.string(),
  methodCode: z.string(),
  fiat: z.string(),
  maskedLabel: z.string(),
  status: z.string(),
  revision: id,
})
export const adSchema = z.object({
  adId: z.string(),
  makerUserId: id,
  market: marketSchema,
  side: z.enum(["BUY", "SELL"]),
  price: decimal,
  availableQuantity: decimal,
  minFiat: decimal,
  maxFiat: decimal,
  revision: id.optional(),
  status: z.string().optional(),
  methodCodes: z.array(z.string()),
  merchant: z
    .object({ nickname: z.string(), completedOrders: id.optional() })
    .passthrough()
    .optional(),
  paymentOptions: z
    .array(z.object({ accountId: z.string(), methodCode: z.string(), maskedLabel: z.string() }))
    .optional(),
})
export const quoteSchema = z.object({
  quoteId: z.string(),
  market: marketSchema,
  quantity: decimal,
  fiatAmount: decimal,
  price: decimal,
  buyerFeeUnits: id,
  buyerReceivesUnits: id,
  expiresAt: z.string(),
  serverTime: z.string(),
  valid: z.boolean(),
})
export const orderSchema = z.object({
  orderId: z.string(),
  market: marketSchema,
  buyerUserId: id,
  sellerUserId: id,
  quantity: decimal,
  fiatAmount: decimal,
  price: decimal,
  buyerFeeUnits: id,
  buyerReceivesUnits: id,
  paymentExpiresAt: z.string().nullable(),
  terms: z.string(),
  status: z.string(),
})
export const bondSchema = z.object({
  policy: z.object({
    configured: z.boolean(),
    revision: id,
    asset: z.string().optional(),
    amount: decimal.optional(),
  }),
  bond: z
    .object({
      bondId: z.string(),
      requestId: z.string(),
      asset: z.string(),
      amount: decimal,
      status: z.string(),
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
export function c2cWrite(owner: string, path: string, body: unknown) {
  return request(`${base}${path}`, object, { method: "POST", body, expectedUserId: owner })
}
export const c2cMarkets = (owner: string, signal?: AbortSignal) =>
  c2cRead(
    owner,
    "/markets",
    z.object({
      markets: z.array(marketSchema),
      paymentMethods: z.array(
        z.object({ code: z.string(), label: z.string(), currencies: z.array(z.string()) }),
      ),
    }),
    signal,
  )
export const c2cAccounts = (owner: string, signal?: AbortSignal) =>
  c2cRead(owner, "/payment-accounts", z.object({ items: z.array(accountSchema) }), signal)
export const c2cMe = (owner: string, signal?: AbortSignal) =>
  c2cRead(
    owner,
    "/me",
    z.object({
      kycVerified: z.boolean(),
      merchant: z
        .object({ status: z.string(), revision: id, reviewReason: z.string().nullable() })
        .nullable(),
    }),
    signal,
  )
export const c2cBond = (owner: string, signal?: AbortSignal) =>
  c2cRead(owner, "/me/merchant-bond", bondSchema, signal)
export const c2cTradingOrders = (owner: string, signal?: AbortSignal) =>
  c2cRead(
    owner,
    "/orders?state=ALL",
    z.object({ items: z.array(orderSchema), hasMore: z.boolean() }),
    signal,
  )
export const c2cMyAds = (owner: string, signal?: AbortSignal) =>
  c2cRead(owner, "/me/ads", z.object({ items: z.array(adSchema) }), signal)
export function challengeC2c(owner: string, sceneCode = "WITHDRAWAL") {
  return request("/api/v1/security/verification/challenge", object, {
    method: "POST",
    body: { sceneCode },
    expectedUserId: owner,
  })
}

const pendingSchema = z.object({
  owner: z.string(),
  kind: z.enum(["ORDER_CREATE", "AD_PUBLISH"]),
  requestKey: z.string(),
  requestHash: z.string(),
  body: object,
})
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
  const pending = { owner, kind, requestKey, requestHash, body: { requestKey, ...input } }
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
      status: z.string(),
      resultId: z.string().nullable(),
      errorMessage: z.string().nullable().optional(),
    }),
  )
}

export function c2cDecimal(value: string) {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value
}
