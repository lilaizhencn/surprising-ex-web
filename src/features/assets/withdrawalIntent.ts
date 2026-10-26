import { z } from "zod"
import { t } from "../../i18n"

const Receipt = z.object({
  id: z.string().min(1).max(160),
  withdrawalId: z.string().min(1).max(160),
  status: z.string().min(1).max(64),
})
const Intent = z.object({
  userId: z.string().regex(/^[1-9]\d{0,18}$/),
  reference: z.string().regex(/^withdraw-[0-9a-f-]{36}$/),
  asset: z.string().regex(/^[A-Z0-9]{2,32}$/),
  network: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/),
  address: z.string().trim().min(1).max(160),
  amount: z
    .string()
    .max(120)
    .regex(/^\d+(?:\.\d+)?$/)
    .refine((value) => /[1-9]/.test(value)),
  createdAt: z.iso.datetime(),
  rejected: z.boolean().optional(),
  receipt: Receipt.optional(),
})
export type WithdrawalIntent = z.infer<typeof Intent>
export const withdrawalIntentChanged = "surprising-ex.withdrawal-intent-changed"
export const withdrawalIntentKey = (userId: string) => `surprising-ex.withdrawal-intent:${userId}`

/** Persistence is mandatory before a withdrawal is sent. Security codes are never stored. */
export function readWithdrawalIntent(userId: string): WithdrawalIntent | null {
  try {
    const raw = window.localStorage.getItem(withdrawalIntentKey(userId))
    if (raw === null) return null
    const parsed = Intent.safeParse(JSON.parse(raw))
    if (!parsed.success || parsed.data.userId !== userId) throw new Error()
    return parsed.data
  } catch {
    throw new Error(
      t(
        "The saved withdrawal reference cannot be read. Check the original request before submitting again.",
      ),
    )
  }
}

export function saveWithdrawalIntent(intent: WithdrawalIntent): void {
  const value = Intent.parse(intent)
  const serialized = JSON.stringify(value)
  try {
    window.localStorage.setItem(withdrawalIntentKey(value.userId), serialized)
    if (window.localStorage.getItem(withdrawalIntentKey(value.userId)) !== serialized)
      throw new Error()
  } catch {
    throw new Error(
      t("Cannot save the withdrawal reference. Check browser storage before submitting."),
    )
  }
  window.dispatchEvent(new Event(withdrawalIntentChanged))
}

export function withdrawalRecorded(intent: WithdrawalIntent): boolean {
  return (
    intent.rejected === true ||
    ["PENDING_APPROVAL", "SUBMITTED", "COMPLETED", "REFUNDED", "REJECTED"].includes(
      intent.receipt?.status ?? "",
    )
  )
}

export function clearWithdrawalIntent(intent: WithdrawalIntent): void {
  const current = readWithdrawalIntent(intent.userId)
  if (!current || current.reference !== intent.reference || !withdrawalRecorded(current))
    throw new Error(t("Confirm the original withdrawal result before starting another request."))
  try {
    window.localStorage.removeItem(withdrawalIntentKey(intent.userId))
    if (window.localStorage.getItem(withdrawalIntentKey(intent.userId)) !== null) throw new Error()
  } catch {
    throw new Error(
      t("Cannot save withdrawal confirmation. Keep the original reference and retry."),
    )
  }
  window.dispatchEvent(new Event(withdrawalIntentChanged))
}

/** A browser-owned lock prevents two tabs from creating different references at the same time. */
export async function withWithdrawalLock<T>(userId: string, run: () => Promise<T>): Promise<T> {
  if (!navigator.locks)
    throw new Error(t("This browser cannot coordinate withdrawal requests across tabs."))
  return navigator.locks.request(
    withdrawalIntentKey(userId),
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw new Error(
          t("Another tab is handling this withdrawal. Check its result before retrying."),
        )
      return run()
    },
  )
}
