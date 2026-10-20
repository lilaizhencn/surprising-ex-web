import { z } from "zod"
import { request, requestBlob } from "./client"

const id = z.string().regex(/^(0|[1-9]\d{0,18})$/)
export const C2cAttachmentSchema = z.object({
  attachmentId: z.string(),
  name: z.string(),
  contentType: z.string(),
  byteCount: z.number(),
  purpose: z.enum(["PAYMENT_QR", "PROOF", "MESSAGE"]),
  status: z.enum(["UPLOADING", "READY"]),
})
export const C2cMessageSchema = z.object({
  messageId: id,
  conversationId: z.string(),
  requestId: z.string(),
  senderUserId: id.nullable(),
  authorKind: z.enum(["USER", "SUPPORT", "SYSTEM"]),
  text: z.string(),
  attachment: C2cAttachmentSchema.nullable(),
  createdAt: z.string(),
  status: z.literal("SENT"),
})
export const C2cEventSchema = z.object({
  eventId: id,
  actorUserId: id.nullable(),
  type: z.string(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
})
export const C2cConversationSchema = z.object({
  conversationId: z.string(),
  orderId: z.string().nullable(),
  peer: z.object({ userId: id, nickname: z.string() }),
  unreadCount: id,
  lastMessage: z
    .object({
      messageId: id,
      text: z.string(),
      authorKind: z.string(),
      hasAttachment: z.boolean(),
      createdAt: z.string(),
    })
    .nullable(),
  order: z
    .object({ orderId: z.string(), status: z.string(), fiatAmount: z.string(), price: z.string() })
    .optional(),
})
export const C2cPageSchema = z.object({
  conversationId: z.string(),
  conversation: C2cConversationSchema.optional(),
  messages: z.array(C2cMessageSchema),
  orderEvents: z.array(C2cEventSchema),
  hasMore: z.boolean(),
  eventsHaveMore: z.boolean(),
  reads: z.array(z.object({ userId: id, messageId: id, eventId: id, revision: id })),
})
export const C2cOrderSchema = z.object({
  orderId: z.string(),
  buyerUserId: id,
  sellerUserId: id,
  status: z.string(),
  quantity: z.string(),
  fiatAmount: z.string(),
  price: z.string(),
  buyerFeeUnits: id,
  buyerReceivesUnits: id,
  createdAt: z.string(),
  terms: z.string(),
  market: z.object({ asset: z.string(), fiat: z.string(), assetScale: id }),
})
export type C2cAttachment = z.infer<typeof C2cAttachmentSchema>
export type C2cMessage = z.infer<typeof C2cMessageSchema>
export type C2cEvent = z.infer<typeof C2cEventSchema>
export type C2cConversation = z.infer<typeof C2cConversationSchema>
export type C2cPage = z.infer<typeof C2cPageSchema>
export type C2cOrder = z.infer<typeof C2cOrderSchema>
export type C2cSend = Readonly<{ requestId: string; text: string; attachmentId: string | null }>

const base = "/api/v1/c2c"
const conversationPath = (conversation: string) =>
  `${base}/conversations/${encodeURIComponent(conversation)}`
export function loadC2cStatus(signal?: AbortSignal) {
  return request(
    `${base}/status`,
    z.object({
      runtimeEnabled: z.boolean(),
      businessEnabled: z.boolean(),
      available: z.boolean(),
      reason: z.string(),
    }),
    signal ? { signal } : {},
  )
}
export function loadC2cConversations(owner: string, search = "", offset = 0, signal?: AbortSignal) {
  const query = new URLSearchParams({ search, offset: String(offset), limit: "30" })
  return request(
    `${base}/conversations?${query}`,
    z.object({ items: z.array(C2cConversationSchema), hasMore: z.boolean() }),
    { expectedUserId: owner, ...(signal ? { signal } : {}) },
  )
}
export function startC2cConversation(
  owner: string,
  target: { orderId: string } | { targetUserId: string },
) {
  return request(`${base}/conversations`, C2cConversationSchema, {
    method: "POST",
    body: target,
    expectedUserId: owner,
  })
}
export function loadC2cMessages(
  owner: string,
  conversation: string,
  options: {
    latest?: boolean
    before?: string
    after?: string
    afterEvent?: string
    signal?: AbortSignal
  } = {},
) {
  const query = new URLSearchParams({ limit: "50" })
  if (options.latest) query.set("latest", "true")
  for (const key of ["before", "after", "afterEvent"] as const)
    if (options[key]) query.set(key, options[key])
  return request(`${conversationPath(conversation)}/messages?${query}`, C2cPageSchema, {
    expectedUserId: owner,
    ...(options.signal ? { signal: options.signal } : {}),
  })
}
export function sendC2cMessage(owner: string, conversation: string, body: C2cSend) {
  return request(`${conversationPath(conversation)}/messages`, C2cMessageSchema, {
    method: "POST",
    body,
    expectedUserId: owner,
  })
}
export function recoverC2cMessage(owner: string, conversation: string, requestId: string) {
  return request(
    `${conversationPath(conversation)}/requests/${encodeURIComponent(requestId)}`,
    z.object({ status: z.enum(["UNKNOWN", "SENT"]), message: C2cMessageSchema.optional() }),
    { expectedUserId: owner },
  )
}
export function readC2cMessages(
  owner: string,
  conversation: string,
  messageId: string,
  eventId: string,
) {
  return request(
    `${conversationPath(conversation)}/read`,
    z.object({ reads: C2cPageSchema.shape.reads }),
    { method: "POST", body: { messageId, eventId }, expectedUserId: owner },
  )
}
export function uploadC2cAttachment(
  owner: string,
  conversation: C2cConversation,
  attachmentId: string,
  file: File,
) {
  const body = new FormData()
  body.set("purpose", "MESSAGE")
  body.set("conversationId", conversation.conversationId)
  if (conversation.orderId) body.set("orderId", conversation.orderId)
  body.set("file", file)
  return request(`${base}/attachments/${encodeURIComponent(attachmentId)}`, C2cAttachmentSchema, {
    method: "POST",
    body,
    expectedUserId: owner,
  })
}
export function recoverC2cAttachment(owner: string, attachmentId: string) {
  return request(
    `${base}/attachments/${encodeURIComponent(attachmentId)}`,
    z.union([
      C2cAttachmentSchema,
      z.object({ attachmentId: z.string(), status: z.literal("UNKNOWN") }),
    ]),
    { expectedUserId: owner },
  )
}
export function loadC2cAttachment(owner: string, attachmentId: string, signal?: AbortSignal) {
  return requestBlob(`${base}/attachments/${encodeURIComponent(attachmentId)}/content`, {
    expectedUserId: owner,
    ...(signal ? { signal } : {}),
  })
}
export function loadC2cOrders(owner: string, offset = 0, signal?: AbortSignal) {
  return request(
    `${base}/orders?state=ALL&limit=30&offset=${offset}`,
    z.object({ items: z.array(C2cOrderSchema), hasMore: z.boolean() }),
    { expectedUserId: owner, ...(signal ? { signal } : {}) },
  )
}
export function loadC2cOrder(owner: string, order: string, signal?: AbortSignal) {
  return request(`${base}/orders/${encodeURIComponent(order)}`, C2cOrderSchema, {
    expectedUserId: owner,
    ...(signal ? { signal } : {}),
  })
}
export function loadC2cQuickReplies(owner: string, signal?: AbortSignal) {
  return request(
    `${base}/me/quick-replies`,
    z.object({ items: z.array(z.object({ replyId: z.string(), text: z.string() })) }),
    { expectedUserId: owner, ...(signal ? { signal } : {}) },
  )
}

/** Histories and socket replays may overlap; keep the same server identity and exact int64 order. */
export function mergeC2cMessages(previous: readonly C2cMessage[], incoming: readonly C2cMessage[]) {
  return [
    ...new Map([...previous, ...incoming].map((message) => [message.messageId, message])).values(),
  ].sort((a, b) =>
    BigInt(a.messageId) < BigInt(b.messageId)
      ? -1
      : BigInt(a.messageId) > BigInt(b.messageId)
        ? 1
        : 0,
  )
}
