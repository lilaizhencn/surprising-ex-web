import { z } from "zod"
import { loadSession } from "../state/session"
import { request } from "./client"

const id = z.string().regex(/^[1-9][0-9]*$/)
const amount = z.string().regex(/^[0-9]+$/)
const ppm = z.number().int().min(0).max(1_000_000)
const invitation = z.object({
  code: z.string(),
  inviterId: id,
  targetUserId: id.nullable(),
  cooperation: z.boolean(),
  sharePpm: ppm.nullable(),
  expiresAt: z.string().nullable(),
  acceptedBy: id.nullable(),
})
const profile = z.object({
  userId: id,
  inviteCode: z.string(),
  kolEnabled: z.boolean(),
  autoSettlement: z.boolean(),
  ratePpm: ppm.nullable(),
  createdAt: z.string(),
})
const balance = z.object({
  productLine: z.string(),
  asset: z.string(),
  receivedUnits: amount,
  delegatedUnits: amount,
  retainedUnits: amount,
  pendingUnits: amount,
  paidUnits: amount,
  inFlightUnits: amount,
  teamFeeUnits: amount,
  directFeeUnits: amount,
  tradingUsers: amount,
})
const overview = z.object({
  rootRatePpm: ppm,
  teamActive: z.boolean(),
  teamPath: z.array(z.object({ parentId: id, childId: id, sharePpm: ppm })),
  profile,
  settings: z.object({
    referralRatePpm: ppm,
    kolRatePpm: ppm,
    settlementHours: z.number().int().positive(),
    version: z.number().int(),
  }),
  counts: z.object({ directInviteCount: amount, teamInviteCount: amount }),
  balances: z.array(balance),
  invitations: z.array(invitation),
})
const member = z.object({
  userId: id,
  kolEnabled: z.boolean(),
  acceptedAt: z.string(),
  sharePpm: ppm.nullable(),
  teamParentId: id.nullable(),
  directInviteCount: amount,
  contributions: z.array(
    z.object({
      userId: id,
      productLine: z.string(),
      asset: z.string(),
      feeUnits: amount,
      receivedUnits: amount,
      retainedUnits: amount,
    }),
  ),
})
const entry = z.object({
  commissionId: id,
  productLine: z.string(),
  asset: z.string(),
  sourceUserId: id,
  orderId: id,
  feeUnits: amount,
  receivedUnits: amount,
  delegatedUnits: amount,
  retainedUnits: amount,
  occurredAt: z.string(),
  status: z.string(),
  payoutId: z.string().nullable(),
})
const payout = z.object({
  payoutId: z.string(),
  userId: id,
  budgetUserId: id,
  productLine: z.string(),
  asset: z.string(),
  amountUnits: amount,
  status: z.string(),
  transferId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
})
const page = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ items: z.array(schema), nextCursor: z.string().nullable() })
const options = (signal?: AbortSignal) => ({
  ...(signal ? { signal } : {}),
  expectedUserId: String(loadSession()?.user.userId ?? ""),
})
export const affiliateApi = {
  preview: (code: string, signal?: AbortSignal) =>
    request(
      `/api/v1/affiliate/preview?code=${encodeURIComponent(code)}`,
      invitation,
      signal ? { signal } : {},
    ),
  overview: (line: string, subject?: string, signal?: AbortSignal) =>
    request(
      `/api/v1/affiliate/${subject ? `members/${subject}` : "me"}?productLine=${encodeURIComponent(line)}`,
      overview,
      options(signal),
    ),
  members: (parentId?: string, cursor = "0", signal?: AbortSignal) =>
    request(
      `/api/v1/affiliate/members?cursor=${cursor}${parentId ? `&parentId=${parentId}` : ""}`,
      page(member),
      options(signal),
    ),
  entries: (line: string, cursor = "0", signal?: AbortSignal) =>
    request(
      `/api/v1/affiliate/entries?productLine=${encodeURIComponent(line)}&cursor=${cursor}`,
      page(entry),
      options(signal),
    ),
  payouts: (signal?: AbortSignal) =>
    request("/api/v1/affiliate/payouts", z.object({ items: z.array(payout) }), options(signal)),
  accept: (code: string) =>
    request("/api/v1/affiliate/accept", z.object({ accepted: z.boolean() }), {
      ...options(),
      method: "POST",
      body: { code },
    }),
  invite: (targetUserId: string, sharePpm: number) =>
    request("/api/v1/affiliate/invitations", invitation, {
      ...options(),
      method: "POST",
      body: { targetUserId: targetUserId || null, sharePpm },
    }),
  share: (userId: string, sharePpm: number) =>
    request(`/api/v1/affiliate/members/${userId}/share`, z.object({ saved: z.boolean() }), {
      ...options(),
      method: "POST",
      body: { sharePpm },
    }),
}
export type AffiliateOverview = z.infer<typeof overview>
export type AffiliateMember = z.infer<typeof member>
export type AffiliateEntry = z.infer<typeof entry>
export type AffiliateInvitation = z.infer<typeof invitation>
export type AffiliatePayout = z.infer<typeof payout>

export function percentPpm(text: string): number {
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(text.trim()))
    throw new Error("请输入 0–100 的百分比，最多四位小数")
  const [whole, decimal = ""] = text.trim().split(".")
  const value = Number(whole) * 10000 + Number(decimal.padEnd(4, "0"))
  if (value > 1000000) throw new Error("分配比例不能超过 100%")
  return value
}
