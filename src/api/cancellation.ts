import { t } from "../i18n"
import {
  type CancellationPlan,
  clearPendingCommand,
  type PendingOrderCommand,
  readPendingCommand,
  savePendingCommand,
} from "../state/pendingOrders"
import { loadSession } from "../state/session"
import { ApiError, request } from "./client"
import { isDefinitiveOrderRejection, PendingTradingCommand } from "./tradingCommand"
import { GenericObjectSchema } from "./types"

export type CancellationSummary = {
  requested: number
  completed: number
  failed: number
  failures: readonly { orderId: string; code: string }[]
  message: string
}
const pendingMessage = () =>
  t("Cancellation results are pending. Check and continue the original request.")
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d*$/.test(value) && BigInt(value) <= 9223372036854775807n
function requireUser(userId: string) {
  if (String(loadSession()?.user.userId ?? "") !== userId)
    throw new Error(t("Sign in to the original account to continue cancellation."))
}
async function withLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  if (!globalThis.navigator?.locks)
    throw new Error(t("Cancellation locking is unavailable. No cancellation was sent."))
  return navigator.locks.request(`surprising-ex.cancellations:${userId}`, operation)
}
function validate(plan: CancellationPlan) {
  if (
    !plan ||
    typeof plan.id !== "string" ||
    !Array.isArray(plan.batches) ||
    !plan.batches.length ||
    !Number.isInteger(plan.index) ||
    plan.index < 0 ||
    plan.index > plan.batches.length ||
    typeof plan.issued !== "boolean" ||
    !Number.isInteger(plan.completed) ||
    !Number.isInteger(plan.failed) ||
    plan.completed < 0 ||
    plan.failed < 0 ||
    !Array.isArray(plan.failures)
  )
    throw new Error(t("Stored cancellation details are invalid. No cancellation was sent."))
  const confirmed = new Set<string>()
  const ids = new Set<string>(),
    keys = new Set<string>()
  let processed = 0
  for (let i = 0; i < plan.batches.length; i++) {
    const batch = plan.batches[i]
    if (
      !batch ||
      typeof batch.key !== "string" ||
      !batch.key ||
      batch.key.length > 64 ||
      keys.has(batch.key) ||
      !Array.isArray(batch.orderIds) ||
      !batch.orderIds.length ||
      batch.orderIds.length > 50
    )
      throw new Error(t("Stored cancellation details are invalid. No cancellation was sent."))
    keys.add(batch.key)
    for (const id of batch.orderIds) {
      if (!validId(id) || ids.has(id))
        throw new Error(t("Stored cancellation details are invalid. No cancellation was sent."))
      ids.add(id)
    }
    if (i < plan.index) {
      processed += batch.orderIds.length
      for (const id of batch.orderIds) confirmed.add(id)
    }
  }
  if (
    plan.completed + plan.failed !== processed ||
    plan.failures.length !== plan.failed ||
    new Set(plan.failures.map((f) => f.orderId)).size !== plan.failed ||
    plan.failures.some(
      (f) =>
        !validId(f.orderId) || !confirmed.has(f.orderId) || typeof f.code !== "string" || !f.code,
    ) ||
    (plan.index === plan.batches.length && plan.issued)
  )
    throw new Error(t("Stored cancellation details are invalid. No cancellation was sent."))
}
function requiredPlan(pending: PendingOrderCommand): CancellationPlan {
  if (!pending.cancelPlan)
    throw new Error(t("Stored cancellation details are invalid. No cancellation was sent."))
  return pending.cancelPlan
}
function summary(plan: CancellationPlan): CancellationSummary {
  const requested = plan.completed + plan.failed
  const failedIds = plan.failures
    .slice(0, 5)
    .map((f) => `#${f.orderId}`)
    .join(", ")
  return {
    requested,
    completed: plan.completed,
    failed: plan.failed,
    failures: plan.failures,
    message: `${t("Cancellation requests processed")}: ${requested}; ${t("Succeeded")}: ${plan.completed}; ${t("Failed")}: ${plan.failed}.${failedIds ? ` ${t("Failed order IDs")}: ${failedIds}${plan.failed > 5 ? "…" : ""}` : ""}`,
  }
}
function outcomes(raw: Record<string, unknown>, pending: PendingOrderCommand) {
  const plan = requiredPlan(pending),
    batch = plan.batches[plan.index]
  if (!batch) throw new Error(t("Cancellation receipt does not match the original batch."))
  if (
    typeof raw["commandId"] !== "string" ||
    !raw["commandId"] ||
    (pending.commandId && pending.commandId !== raw["commandId"])
  )
    throw new Error(t("Cancellation receipt does not match the original batch."))
  if (raw["outcome"] === "RESULT_UNKNOWN" || raw["outcome"] === "MATCHING_PENDING") return null
  if (raw["outcome"] !== "TERMINAL")
    throw new Error(t("Cancellation receipt does not match the original batch."))
  const result = raw["result"] as Record<string, unknown> | undefined
  const ids = raw["prospectiveOrderIds"]
  if (
    !Array.isArray(ids) ||
    ids.length !== batch.orderIds.length ||
    ids.some((id, i) => String(id) !== batch.orderIds[i]) ||
    !result ||
    result["requested"] !== batch.orderIds.length ||
    !Array.isArray(result["results"]) ||
    result["results"].length !== batch.orderIds.length
  )
    throw new Error(t("Cancellation receipt does not match the original batch."))
  let completed = 0
  const failures: { orderId: string; code: string }[] = []
  for (const [i, orderId] of batch.orderIds.entries()) {
    const item = result["results"][i] as Record<string, unknown>
    const order = item?.["order"] as Record<string, unknown> | null | undefined
    if (
      !item ||
      item["index"] !== i ||
      typeof item["success"] !== "boolean" ||
      typeof item["message"] !== "string" ||
      !item["message"] ||
      item["success"] !== (item["message"] === "NONE") ||
      (order && String(order["orderId"]) !== orderId)
    )
      throw new Error(t("Cancellation receipt does not match the original batch."))
    if (item["success"]) completed++
    else failures.push({ orderId, code: item["message"] })
  }
  if (result["completed"] !== completed || result["failed"] !== failures.length)
    throw new Error(t("Cancellation receipt does not match the original batch."))
  return { completed, failed: failures.length, failures }
}
async function drive(initial: PendingOrderCommand): Promise<CancellationSummary> {
  let pending = initial
  validate(requiredPlan(pending))
  try {
    while (requiredPlan(pending).index < requiredPlan(pending).batches.length) {
      requireUser(pending.userId)
      const plan = requiredPlan(pending),
        batch = plan.batches[plan.index]
      if (!batch)
        throw new Error(t("Stored cancellation details are invalid. No cancellation was sent."))
      let resolved: ReturnType<typeof outcomes>
      if (plan.issued) {
        const query = new URLSearchParams({ userId: pending.userId, batchKey: batch.key })
        try {
          const receipt = await request(
            `/api/v1/gateway/trading/cancellation-batches?${query}`,
            GenericObjectSchema,
            { productLine: "SPOT", expectedUserId: pending.userId, retry: 0 },
          )
          resolved = outcomes(receipt, pending)
        } catch (reason) {
          const receipt =
            reason instanceof ApiError ? GenericObjectSchema.safeParse(reason.payload) : null
          if (!receipt?.success || receipt.data["outcome"] !== "TERMINAL") throw reason
          resolved = outcomes(receipt.data, pending)
        }
      } else {
        pending = { ...pending, cancelPlan: { ...plan, issued: true } }
        savePendingCommand(pending) // A crash after this point requires a GET, never another POST.
        try {
          const receipt = await request(
            "/api/v1/gateway/trading/batch-cancel",
            GenericObjectSchema,
            {
              method: "POST",
              productLine: "SPOT",
              expectedUserId: pending.userId,
              idempotencyKey: batch.key,
              body: {
                batchKey: batch.key,
                orders: batch.orderIds.map((orderId) => ({ userId: pending.userId, orderId })),
              },
            },
          )
          if (typeof receipt["commandId"] === "string" && receipt["commandId"]) {
            pending = { ...pending, commandId: receipt["commandId"] }
            savePendingCommand(pending)
          }
          resolved = outcomes(receipt, pending)
        } catch (reason) {
          if (!isDefinitiveOrderRejection(reason)) throw reason
          const raw =
            reason instanceof ApiError ? GenericObjectSchema.safeParse(reason.payload) : null
          const code =
            raw?.success && typeof raw.data["code"] === "string"
              ? raw.data["code"]
              : "REQUEST_REJECTED"
          resolved = {
            completed: 0,
            failed: batch.orderIds.length,
            failures: batch.orderIds.map((orderId) => ({ orderId, code })),
          }
        }
      }
      if (!resolved) throw new PendingTradingCommand(pending.commandId, pendingMessage())
      const { commandId: _previous, ...identity } = pending
      pending = {
        ...identity,
        cancelPlan: {
          ...plan,
          index: plan.index + 1,
          issued: false,
          completed: plan.completed + resolved.completed,
          failed: plan.failed + resolved.failed,
          failures: [...plan.failures, ...resolved.failures],
        },
      }
      savePendingCommand(pending) // Persist confirmed progress before issuing any later batch.
    }
    const result = summary(requiredPlan(pending))
    clearPendingCommand(pending)
    return result
  } catch (reason) {
    if (reason instanceof PendingTradingCommand) throw reason
    throw new PendingTradingCommand(pending.commandId, pendingMessage())
  }
}
async function start(
  userId: string,
  ids: readonly string[],
  batchKey?: string,
): Promise<CancellationSummary> {
  requireUser(userId)
  if (readPendingCommand(userId)) throw new PendingTradingCommand(undefined, pendingMessage())
  if (
    ids.some((id) => !validId(id)) ||
    new Set(ids).size !== ids.length ||
    (batchKey !== undefined && (!batchKey || batchKey.length > 64 || ids.length > 50))
  )
    throw new Error(t("Invalid cancellation targets. No cancellation was sent."))
  if (!ids.length)
    return {
      requested: 0,
      completed: 0,
      failed: 0,
      failures: [],
      message: t("There are no open orders in this scope."),
    }
  const batches = []
  for (let i = 0; i < ids.length; i += 50)
    batches.push({
      key: batchKey ?? `cancel-${crypto.randomUUID()}`,
      orderIds: ids.slice(i, i + 50),
    })
  const pending: PendingOrderCommand = {
    userId,
    productLine: "SPOT",
    cancelPlan: {
      id: crypto.randomUUID(),
      batches,
      index: 0,
      issued: false,
      completed: 0,
      failed: 0,
      failures: [],
    },
  }
  savePendingCommand(pending)
  return drive(pending)
}
export async function cancelSpotOpenOrders(
  body: Readonly<Record<string, unknown>>,
): Promise<CancellationSummary> {
  const userId = String(body["userId"] ?? ""),
    instrumentId = body["instrumentId"] == null ? null : String(body["instrumentId"])
  if (instrumentId !== null && !/^[1-9]\d{0,63}$/.test(instrumentId))
    throw new Error(t("Cancellation plan does not match the selected scope."))
  return withLock(userId, async () => {
    requireUser(userId)
    if (readPendingCommand(userId)) throw new PendingTradingCommand(undefined, pendingMessage())
    const query = new URLSearchParams({ userId })
    if (instrumentId) query.set("instrumentId", instrumentId)
    const plan = await request(
      `/api/v1/gateway/trading/cancellation-plan?${query}`,
      GenericObjectSchema,
      { productLine: "SPOT", expectedUserId: userId, retry: 0 },
    )
    if (
      String(plan["userId"]) !== userId ||
      plan["productLine"] !== "SPOT" ||
      (plan["instrumentId"] ?? null) !== (instrumentId || null) ||
      !Array.isArray(plan["orderIds"])
    )
      throw new Error(t("Cancellation plan does not match the selected scope."))
    return start(userId, plan["orderIds"].map(String))
  })
}
export async function cancelSpotBatchOrders(
  body: Readonly<Record<string, unknown>>,
): Promise<CancellationSummary> {
  const session = loadSession()
  if (!session) throw new Error(t("Sign in required."))
  const userId = String(session.user.userId),
    orders = body["orders"]
  if (
    !Array.isArray(orders) ||
    !orders.length ||
    orders.length > 50 ||
    orders.some((row) => String(row?.userId) !== userId)
  )
    throw new Error(t("Select between 1 and 50 orders from the same account."))
  return withLock(userId, () =>
    start(
      userId,
      orders.map((row) => String(row.orderId)),
      typeof body["batchKey"] === "string" ? body["batchKey"] : undefined,
    ),
  )
}
export async function continueCancellationPlan(
  original: PendingOrderCommand,
): Promise<CancellationSummary> {
  return withLock(original.userId, () => {
    requireUser(original.userId)
    const current = readPendingCommand(original.userId)
    if (!current?.cancelPlan || current.cancelPlan.id !== original.cancelPlan?.id)
      throw new Error(t("The pending cancellation plan changed. Refresh order state."))
    return drive(current)
  })
}
