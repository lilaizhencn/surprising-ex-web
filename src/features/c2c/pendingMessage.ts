import { z } from "zod"
import { C2cMessageSchema, type C2cSend, recoverC2cMessage, sendC2cMessage } from "../../api/c2c"

const PendingSchema = z.object({
  requestId: z.uuid(),
  text: z.string().max(4000),
  attachmentId: z.uuid().nullable(),
})
const key = (owner: string, conversation: string) =>
  `surprising-ex.c2c.pending.${owner}.${conversation}`

export function pendingMessage(owner: string, conversation: string): C2cSend | null {
  try {
    const raw = window.sessionStorage.getItem(key(owner, conversation))
    if (!raw) return null
    return PendingSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}
export function rememberMessage(owner: string, conversation: string, message: C2cSend) {
  window.sessionStorage.setItem(
    key(owner, conversation),
    JSON.stringify(PendingSchema.parse(message)),
  )
}
export function forgetMessage(owner: string, conversation: string) {
  window.sessionStorage.removeItem(key(owner, conversation))
}

/** Recovery only reads. A retry must be an explicit action and reuse the saved body and UUID. */
export async function deliverMessage(
  owner: string,
  conversation: string,
  message: C2cSend,
  retry: boolean,
) {
  if (retry) {
    const receipt = await recoverC2cMessage(owner, conversation, message.requestId)
    if (receipt.status === "SENT") return C2cMessageSchema.parse(receipt.message)
  }
  return sendC2cMessage(owner, conversation, message)
}
