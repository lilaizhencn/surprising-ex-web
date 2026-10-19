export type CancellationBatch = { readonly key: string; readonly orderIds: readonly string[] }
export type CancellationPlan = {
  readonly id: string
  readonly batches: readonly CancellationBatch[]
  readonly index: number
  readonly issued: boolean
  readonly completed: number
  readonly failed: number
  readonly failures: readonly { readonly orderId: string; readonly code: string }[]
}

import type { ProductLine } from "../types/domain"
import { PRODUCT_LINES } from "../types/domain"

export type PendingOrderCommand = {
  readonly userId: string
  readonly productLine: ProductLine
  readonly commandId?: string
  readonly clientOrderId?: string
  readonly instrumentId?: string
  readonly cancelOrderId?: string
  readonly amendRequestId?: string
  readonly amendOrderId?: string
  readonly cancelPlan?: CancellationPlan
}

export const tracksSingleOrderIntent = (line: ProductLine) =>
  line === "SPOT" || line === "LINEAR_DELIVERY" || line === "INVERSE_DELIVERY"

export const pendingOrderChanged = "surprising-ex.pending-order-changed"
const prefix = (userId: string) => `surprising-ex.pending-command:${userId}`
const key = (pending: PendingOrderCommand) =>
  `${prefix(pending.userId)}:${pending.cancelPlan ? `cancel-plan-${pending.cancelPlan.id}` : pending.amendRequestId ? `amend-${pending.amendRequestId}` : pending.cancelOrderId ? `cancel-${pending.cancelOrderId}` : (pending.clientOrderId ?? pending.commandId)}`

export function readPendingCommand(userId: string): PendingOrderCommand | null {
  try {
    // Move an existing tab's command receipt into durable storage once.
    const oldKey = prefix(userId)
    const old = window.sessionStorage.getItem(oldKey)
    if (old) {
      const value = JSON.parse(old) as PendingOrderCommand
      if (value.userId === userId && value.commandId) {
        window.localStorage.setItem(key(value), old)
        window.sessionStorage.removeItem(oldKey)
      }
    }
    const keys = Object.keys(window.localStorage).filter((value) => value.startsWith(`${oldKey}:`))
    for (const storageKey of keys.sort()) {
      const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "null")
      if (
        value?.userId === userId &&
        Object.values(PRODUCT_LINES).includes(value.productLine) &&
        (value.cancelPlan != null ||
          (typeof value.commandId === "string" && value.commandId.length > 0) ||
          (tracksSingleOrderIntent(value.productLine) &&
            typeof value.cancelOrderId === "string" &&
            /^[1-9]\d*$/.test(value.cancelOrderId)) ||
          (tracksSingleOrderIntent(value.productLine) &&
            typeof value.clientOrderId === "string" &&
            value.clientOrderId.length > 0 &&
            typeof value.instrumentId === "string" &&
            value.instrumentId.length > 0))
      )
        return value
    }
  } catch {}
  return null
}

/** One durable row per request; a response from another tab cannot overwrite it. */
export function savePendingCommand(pending: PendingOrderCommand): void {
  window.localStorage.setItem(key(pending), JSON.stringify(pending))
  window.dispatchEvent(new Event(pendingOrderChanged))
}

export function clearPendingCommand(pending: PendingOrderCommand): void {
  window.localStorage.removeItem(key(pending))
  window.dispatchEvent(new Event(pendingOrderChanged))
}
