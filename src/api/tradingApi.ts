import { z } from "zod"
import { t } from "../i18n"
import {
  clearPendingCommand,
  type PendingOrderCommand,
  readPendingCommand,
  savePendingCommand,
  tracksSingleOrderIntent,
  tracksTriggerIntent,
} from "../state/pendingOrders"
import { currentAccountUserId, loadSession } from "../state/session"
import type { ProductLine } from "../types/domain"
import { cancelSpotBatchOrders, cancelSpotOpenOrders } from "./cancellation"
import { ApiError, request } from "./client"
import { apiErrorMessage } from "./errors"
import { isDefinitiveOrderRejection, PendingTradingCommand } from "./tradingCommand"
import type { ApiTriggerOrder } from "./types"
import {
  GenericObjectSchema,
  OrderHistoryPageSchema,
  OrderSubmissionSchema,
  PositionRiskListSchema,
  TradeFillPageSchema,
  TriggerOrderSchema,
} from "./types"

const ArraySchema = z.array(GenericObjectSchema)

const CLIENT_ORDER_ID_KEY = "clientOrderId"

const ObjectOrArraySchema = z.union([
  ArraySchema,
  z
    .object({
      items: ArraySchema.optional(),
      orders: ArraySchema.optional(),
      positions: ArraySchema.optional(),
      trades: ArraySchema.optional(),
      fills: ArraySchema.optional(),
    })
    .passthrough(),
])

export function updatePositionMode(
  userId: string | number,
  productLine: ProductLine,
  positionMode: string,
  referenceId: string,
) {
  return request("/api/v1/accounts/position-mode", GenericObjectSchema, {
    method: "POST",
    productLine,
    idempotencyKey: referenceId,
    body: { userId, productLine, positionMode, referenceId },
  })
}

export function loadLeverageSetting(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  marginMode?: string,
) {
  const query = new URLSearchParams({ userId: String(userId), instrumentId, productLine })
  if (marginMode) query.set("marginMode", marginMode)
  return request(`/api/v1/trading/leverage/settings?${query.toString()}`, GenericObjectSchema, {
    productLine,
  })
}

export function updateLeverageSetting(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  marginMode: string,
  leveragePpm: number,
  reason: string,
) {
  return request("/api/v1/trading/leverage/settings", GenericObjectSchema, {
    method: "POST",
    productLine,
    body: { userId, productLine, instrumentId, marginMode, leveragePpm, reason },
  })
}

export function adjustPositionMargin(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  marginMode: string,
  positionSide: string,
  amountUnits: string,
  referenceId: string,
  reason: string,
) {
  return request("/api/v1/accounts/position-margin-adjustments", GenericObjectSchema, {
    method: "POST",
    productLine,
    idempotencyKey: referenceId,
    body: { userId, instrumentId, marginMode, positionSide, amountUnits, referenceId, reason },
  })
}

export function loadPositionRisk(userId: string | number, productLine: ProductLine) {
  const query = new URLSearchParams({ userId: String(userId) })
  return request(`/api/v1/risk/positions/latest?${query.toString()}`, PositionRiskListSchema, {
    productLine,
  }).then((response) => response.positions)
}

export async function checkOrderSubmission(pending: PendingOrderCommand) {
  if (pending.clientTriggerOrderId || pending.cancelTriggerOrderId) {
    const query = new URLSearchParams({ userId: pending.userId })
    if (pending.clientTriggerOrderId)
      query.set("clientTriggerOrderId", pending.clientTriggerOrderId)
    const path = pending.cancelTriggerOrderId
      ? `cancellations/${encodeURIComponent(pending.cancelTriggerOrderId)}`
      : "submission"
    const receipt = await request(
      `/api/v1/trading/trigger-orders/${path}?${query}`,
      GenericObjectSchema,
      { productLine: pending.productLine, expectedUserId: pending.userId, retry: 0 },
    )
    if (
      typeof receipt["commandId"] !== "string" ||
      !receipt["commandId"] ||
      (pending.commandId && receipt["commandId"] !== pending.commandId)
    )
      throw new Error("Trigger receipt identity mismatch")
    if (receipt["outcome"] === "TERMINAL" && typeof receipt["code"] === "string" && receipt["code"])
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    if (receipt["outcome"] === "RESULT_UNKNOWN" && receipt["code"] === "RESULT_UNKNOWN")
      return "pending"
    throw new Error("Trigger receipt is unavailable")
  }
  if (pending.ocoTakeProfitClientId && pending.ocoStopLossClientId) {
    const query = new URLSearchParams({
      userId: pending.userId,
      takeProfitClientId: pending.ocoTakeProfitClientId,
      stopLossClientId: pending.ocoStopLossClientId,
    })
    const receipt = await request(
      `/api/v1/trading/trigger-orders/oco-submission?${query}`,
      GenericObjectSchema,
      { productLine: pending.productLine, expectedUserId: pending.userId, retry: 0 },
    )
    if (
      typeof receipt["commandId"] !== "string" ||
      !receipt["commandId"] ||
      (pending.commandId && receipt["commandId"] !== pending.commandId)
    )
      throw new Error("OCO receipt identity mismatch")
    if (receipt["outcome"] === "TERMINAL" && typeof receipt["code"] === "string" && receipt["code"])
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    if (receipt["outcome"] === "RESULT_UNKNOWN" && receipt["code"] === "RESULT_UNKNOWN")
      return "pending"
    throw new Error("OCO receipt is unavailable")
  }
  if (pending.amendRequestId) {
    const query = new URLSearchParams({
      userId: pending.userId,
      clientRequestId: pending.amendRequestId,
    })
    const receipt = await request(
      `/api/v1/trading/orders/amendments?${query}`,
      GenericObjectSchema,
      { productLine: pending.productLine, expectedUserId: pending.userId, retry: 0 },
    )
    if (
      typeof receipt["commandId"] !== "string" ||
      !receipt["commandId"] ||
      (pending.commandId && receipt["commandId"] !== pending.commandId)
    )
      throw new Error(t("Amendment result does not match the original request."))
    if (receipt["outcome"] === "TERMINAL" && typeof receipt["code"] === "string" && receipt["code"])
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    if (receipt["outcome"] === "RESULT_UNKNOWN" && receipt["code"] === "RESULT_UNKNOWN")
      return "pending"
    throw new Error(t("Amendment result is unavailable. Please check again."))
  }

  if (pending.cancelOrderId) {
    const receipt = await request(
      `/api/v1/trading/orders/cancellations/${encodeURIComponent(pending.cancelOrderId)}?userId=${encodeURIComponent(pending.userId)}`,
      GenericObjectSchema,
      { productLine: pending.productLine, expectedUserId: pending.userId, retry: 0 },
    )
    if (
      typeof receipt["commandId"] !== "string" ||
      !receipt["commandId"] ||
      (pending.commandId && receipt["commandId"] !== pending.commandId) ||
      !Array.isArray(receipt["prospectiveOrderIds"]) ||
      receipt["prospectiveOrderIds"].length !== 1 ||
      String(receipt["prospectiveOrderIds"][0]) !== pending.cancelOrderId
    )
      throw new Error(t("Cancellation details do not match. Check the original order again."))
    if (receipt["outcome"] === "TERMINAL" && typeof receipt["code"] === "string" && receipt["code"])
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    if (receipt["outcome"] === "RESULT_UNKNOWN" && receipt["code"] === "RESULT_UNKNOWN")
      return "pending"
    throw new Error(t("Cancellation result is unavailable. Please check again."))
  }
  if (pending.clientOrderId && pending.instrumentId) {
    const query = new URLSearchParams({
      userId: pending.userId,
      clientOrderId: pending.clientOrderId,
    })
    const receipt = await request(
      `/api/v1/trading/orders/submission?${query}`,
      GenericObjectSchema,
      {
        productLine: pending.productLine,
        expectedUserId: pending.userId,
        retry: 0,
      },
    )
    if (
      String(receipt["userId"]) !== pending.userId ||
      receipt["productLine"] !== pending.productLine ||
      receipt["clientOrderId"] !== pending.clientOrderId
    )
      throw new Error("Submission receipt identity mismatch")
    if (receipt["outcome"] === "TERMINAL") {
      if (
        receipt["instrumentId"] !== pending.instrumentId ||
        typeof receipt["commandId"] !== "string" ||
        !receipt["commandId"] ||
        (pending.commandId && receipt["commandId"] !== pending.commandId) ||
        typeof receipt["code"] !== "string" ||
        !receipt["code"]
      )
        throw new Error("Submission receipt identity mismatch")
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
    }
    if (receipt["outcome"] !== "RESULT_UNKNOWN" || receipt["code"] !== "RESULT_UNKNOWN")
      throw new Error("Invalid submission receipt")
    try {
      const value = await request(
        `/api/v1/trading/orders/by-client-order-id?${query}`,
        GenericObjectSchema,
        {
          productLine: pending.productLine,
          expectedUserId: pending.userId,
          retry: 0,
        },
      )
      const order = OrderSubmissionSchema.parse(value)
      if (
        String(value["userId"]) !== pending.userId ||
        order.clientOrderId !== pending.clientOrderId ||
        order.instrumentId !== pending.instrumentId ||
        !/^\d+$/.test(String(order.orderId)) ||
        BigInt(order.orderId) <= 0n
      )
        throw new Error("Order recovery identity mismatch")
      return order.status === "REJECTED" ? "rejected" : "confirmed"
    } catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
    }
    return "pending"
  }
  if (pending.commandId) {
    const receipt = await loadTradingCommand(pending.commandId, pending.productLine, pending.userId)
    if (receipt["commandId"] !== pending.commandId)
      throw new Error("Order receipt identity mismatch")
    if (
      receipt["outcome"] === "TERMINAL" &&
      typeof receipt["code"] === "string" &&
      receipt["code"] !== ""
    )
      return receipt["code"] === "NONE" ? "confirmed" : "rejected"
  }
  return "pending"
}

export function loadTradingCommand(
  commandId: string,
  productLine: ProductLine,
  expectedUserId?: string,
) {
  return request(
    `/api/v1/trading/orders/commands/${encodeURIComponent(commandId)}`,
    GenericObjectSchema,
    { productLine, retry: 0, ...(expectedUserId === undefined ? {} : { expectedUserId }) },
  )
}

export async function loadOrderPriceProtection(productLine: ProductLine) {
  const policy = await request(
    "/api/v1/trading/orders/price-protection",
    z.object({
      productLine: z.string(),
      marketMaxSlippagePpm: z.number().int().min(0).max(999999),
    }),
    { productLine },
  )
  if (policy.productLine !== productLine) throw new Error("Order protection product mismatch")
  return policy
}

export function placeOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return submitSingleOrder("/api/v1/trading/orders", body, productLine)
}

/** Ordinary orders and dedicated position closes share the original order receipt. */

async function submitSingleOrder(
  path: string,
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  const intent: PendingOrderCommand | null = tracksSingleOrderIntent(productLine)
    ? {
        userId: String(body["userId"] ?? ""),
        productLine,
        clientOrderId: String(body[CLIENT_ORDER_ID_KEY] ?? ""),
        instrumentId: String(body["instrumentId"] ?? ""),
      }
    : null
  if (intent) {
    if (!intent.userId || !intent.clientOrderId || !intent.instrumentId)
      throw new Error("Order identity is required")
    const existing = readPendingCommand(intent.userId)
    if (existing) throw new PendingTradingCommand(existing.commandId)
    try {
      savePendingCommand(intent)
    } catch {
      throw new Error(t("Cannot save order recovery details. No order was sent."))
    }
  }
  try {
    const response = await request(path, GenericObjectSchema, {
      method: "POST",
      productLine,
      idempotencyKey: String(body[CLIENT_ORDER_ID_KEY] ?? ""),
      ...(intent ? { expectedUserId: intent.userId } : {}),
      body,
    })
    const order = OrderSubmissionSchema.safeParse(response)
    if (
      order.success &&
      /^\d+$/.test(String(order.data.orderId)) &&
      BigInt(order.data.orderId) > 0n
    ) {
      if (intent) clearPendingCommand(intent)
      return order.data
    }
    if (
      ["MATCHING_PENDING", "RESULT_UNKNOWN"].includes(String(response["outcome"])) &&
      typeof response["commandId"] === "string"
    ) {
      if (intent) savePendingCommand({ ...intent, commandId: response["commandId"] })
      throw new PendingTradingCommand(response["commandId"])
    }
    throw new ApiError(apiErrorMessage(response, 409), 502, response)
  } catch (reason) {
    if (!intent) throw reason
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    if (reason instanceof PendingTradingCommand) throw reason
    throw new PendingTradingCommand(readPendingCommand(intent.userId)?.commandId)
  }
}

export function placeBatchOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/trading/orders/batch", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function testOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/trading/orders/test", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export async function amendOrder(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  const userId = String(body["userId"] ?? ""),
    orderId = String(body["orderId"] ?? "")
  const requestId = String(body["clientRequestId"] ?? ""),
    clientId = String(body["newClientOrderId"] ?? "")
  if (
    !userId ||
    !/^[1-9]\d*$/.test(orderId) ||
    !requestId ||
    requestId.length > 64 ||
    !clientId ||
    clientId.length > 64
  )
    throw new Error(t("Amendment identity is required. No amendment was sent."))
  const intent: PendingOrderCommand | null =
    productLine === "SPOT"
      ? {
          userId,
          productLine,
          amendRequestId: requestId,
          amendOrderId: orderId,
          clientOrderId: clientId,
          instrumentId: String(body["instrumentId"] ?? ""),
        }
      : null
  if (intent) {
    if (!intent.instrumentId)
      throw new Error(t("Amendment identity is required. No amendment was sent."))
    const existing = readPendingCommand(userId)
    if (existing) throw new PendingTradingCommand(existing.commandId)
    try {
      savePendingCommand(intent)
    } catch {
      throw new Error(t("Cannot save amendment recovery details. No amendment was sent."))
    }
  }
  try {
    const response = await request("/api/v1/trading/orders/amend", GenericObjectSchema, {
      method: "POST",
      productLine,
      expectedUserId: userId,
      idempotencyKey: requestId,
      body: {
        userId: body["userId"],
        orderId: body["orderId"],
        newClientOrderId: clientId,
        clientRequestId: requestId,
        priceTicks: body["priceTicks"],
        quantitySteps: body["quantitySteps"],
        ...(body["timeInForce"] === undefined ? {} : { timeInForce: body["timeInForce"] }),
        ...(body["postOnly"] === undefined ? {} : { postOnly: body["postOnly"] }),
      },
    })
    if (["MATCHING_PENDING", "RESULT_UNKNOWN"].includes(String(response["outcome"]))) {
      if (intent && typeof response["commandId"] === "string" && response["commandId"])
        savePendingCommand({ ...intent, commandId: response["commandId"] })
      throw new PendingTradingCommand(
        typeof response["commandId"] === "string" ? response["commandId"] : undefined,
        t("Amendment result is pending. Do not send it again."),
      )
    }
    const result = GenericObjectSchema.safeParse(response["result"])
    const original = OrderSubmissionSchema.safeParse(
      result.success ? result.data["originalOrder"] : null,
    )
    const replacement = OrderSubmissionSchema.safeParse(
      result.success ? result.data["replacementOrder"] : null,
    )
    if (
      response["outcome"] !== "TERMINAL" ||
      response["code"] !== "NONE" ||
      !result.success ||
      result.data["cancelRequested"] !== true ||
      !original.success ||
      String(original.data.orderId) !== orderId ||
      original.data.status !== "CANCELED" ||
      !replacement.success ||
      !/^[1-9]\d*$/.test(String(replacement.data.orderId)) ||
      String(replacement.data.orderId) === orderId
    )
      throw new ApiError(apiErrorMessage(response, 409), 502, response)
    if (intent) clearPendingCommand(intent)
    return result.data
  } catch (reason) {
    if (!intent) throw reason
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    if (reason instanceof PendingTradingCommand) throw reason
    throw new PendingTradingCommand(
      readPendingCommand(userId)?.commandId,
      t("Amendment result is pending. Do not send it again."),
    )
  }
}

export function amendBatchOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/trading/orders/batch-amend", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function closePosition(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return submitSingleOrder("/api/v1/trading/orders/close-position", body, productLine)
}

export function cancelOpenOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  if (productLine === "SPOT") return cancelSpotOpenOrders(body)
  return request("/api/v1/trading/orders/cancel-open", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelBatchOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  if (productLine === "SPOT") return cancelSpotBatchOrders(body)
  return request("/api/v1/trading/orders/batch-cancel", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelAllAfter(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/trading/orders/cancel-all-after", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function placeAlgoOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/trading/orders/algo", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelAlgoOrder(body: Readonly<Record<string, unknown>>, productLine: ProductLine) {
  return request("/api/v1/trading/orders/algo/cancel", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export function cancelOpenAlgoOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/trading/orders/algo/cancel-open", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export async function loadOpenAlgoOrders(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
) {
  const query = new URLSearchParams({ userId: String(userId), instrumentId, limit: "100" })
  const response = await request(
    `/api/v1/trading/orders/algo/open?${query.toString()}`,
    ObjectOrArraySchema,
    { productLine },
  )
  return Array.isArray(response) ? response : (response.items ?? response.orders ?? [])
}

export function placeTriggerOrder(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
): Promise<ApiTriggerOrder> {
  if (tracksTriggerIntent(productLine)) {
    const intent: PendingOrderCommand = {
      userId: String(body["userId"]),
      productLine,
      instrumentId: String(body["instrumentId"] ?? ""),
      clientTriggerOrderId: String(body["clientTriggerOrderId"] ?? ""),
    }
    if (
      !/^[1-9]\d*$/.test(intent.userId) ||
      !intent.instrumentId ||
      !intent.clientTriggerOrderId ||
      intent.clientTriggerOrderId.length > 64
    )
      return Promise.reject(new Error("Trigger request identities are required"))
    return submitTrackedTrigger(intent, "/api/v1/trading/trigger-orders", body)
  }
  return request("/api/v1/trading/trigger-orders", TriggerOrderSchema, {
    method: "POST",
    productLine,
    idempotencyKey: String(Reflect.get(body, "clientTriggerOrderId") ?? ""),
    body,
  })
}

export function cancelTriggerOrder(
  userId: string | number,
  triggerOrderId: string | number,
  productLine: ProductLine,
  instrumentId?: string,
): Promise<ApiTriggerOrder> {
  if (tracksTriggerIntent(productLine)) {
    const intent: PendingOrderCommand = {
      userId: String(userId),
      productLine,
      instrumentId: instrumentId ?? "",
      cancelTriggerOrderId: String(triggerOrderId),
    }
    if (
      !/^[1-9]\d*$/.test(intent.userId) ||
      !/^[1-9]\d*$/.test(String(triggerOrderId)) ||
      !intent.instrumentId
    )
      return Promise.reject(new Error("Trigger cancellation identities are required"))
    return submitTrackedTrigger(intent, "/api/v1/trading/trigger-orders/cancel", {
      userId,
      triggerOrderId,
    })
  }
  return request("/api/v1/trading/trigger-orders/cancel", TriggerOrderSchema, {
    method: "POST",
    productLine,
    idempotencyKey: `cancel-trigger-${triggerOrderId}`,
    body: { userId, triggerOrderId },
  })
}

/** Save the original trigger request before its sole POST. Resolution is GET only. */

async function submitTrackedTrigger(
  intent: PendingOrderCommand,
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<ApiTriggerOrder> {
  const existing = readPendingCommand(intent.userId)
  if (existing) throw new PendingTradingCommand(existing.commandId)
  try {
    savePendingCommand(intent)
  } catch {
    throw new Error(t("Cannot save order recovery details. No order was sent."))
  }
  try {
    const order = await request(path, TriggerOrderSchema, {
      method: "POST",
      productLine: intent.productLine,
      expectedUserId: intent.userId,
      retry: 0,
      body,
    })
    if (
      !/^[1-9]\d*$/.test(String(order.triggerOrderId)) ||
      !["PENDING", "TRIGGERING", "TRIGGERED", "TRIGGER_FAILED", "CANCELED", "EXPIRED"].includes(
        order.status,
      ) ||
      String(order.userId) !== intent.userId ||
      order.instrumentId !== intent.instrumentId ||
      (intent.clientTriggerOrderId && order.clientTriggerOrderId !== intent.clientTriggerOrderId) ||
      (intent.cancelTriggerOrderId &&
        (String(order.triggerOrderId) !== intent.cancelTriggerOrderId ||
          order.status !== "CANCELED"))
    )
      throw new Error("Trigger response identity mismatch")
    clearPendingCommand(intent)
    return order
  } catch (reason) {
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    throw new PendingTradingCommand(intent.commandId)
  }
}

export async function placeBatchTriggerOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  if (!tracksTriggerIntent(productLine) || body["atomic"] !== true)
    return request("/api/v1/trading/trigger-orders/batch", GenericObjectSchema, {
      method: "POST",
      productLine,
      body,
    })
  const orders = z.array(GenericObjectSchema).length(2).parse(body["orders"])
  const tp = orders.find((r) => r["triggerType"] === "TAKE_PROFIT")
  const sl = orders.find((r) => r["triggerType"] === "STOP_LOSS")
  if (
    !tp ||
    !sl ||
    !tp["userId"] ||
    !tp["instrumentId"] ||
    !tp["clientTriggerOrderId"] ||
    !sl["clientTriggerOrderId"] ||
    tp["userId"] !== sl["userId"] ||
    tp["instrumentId"] !== sl["instrumentId"] ||
    tp["ocoGroupId"] !== sl["ocoGroupId"]
  )
    throw new Error("OCO request identities are required")
  const intent: PendingOrderCommand = {
    userId: String(tp["userId"]),
    productLine,
    instrumentId: String(tp["instrumentId"]),
    ocoTakeProfitClientId: String(tp["clientTriggerOrderId"]),
    ocoStopLossClientId: String(sl["clientTriggerOrderId"]),
  }
  const existing = readPendingCommand(intent.userId)
  if (existing) throw new PendingTradingCommand(existing.commandId)
  try {
    savePendingCommand(intent)
  } catch {
    throw new Error(t("Cannot save order recovery details. No order was sent."))
  }
  try {
    const response = await request("/api/v1/trading/trigger-orders/batch", GenericObjectSchema, {
      method: "POST",
      productLine,
      expectedUserId: intent.userId,
      retry: 0,
      body,
    })
    const results = z.array(GenericObjectSchema).length(2).parse(response["results"])
    if (
      response["requested"] !== 2 ||
      response["completed"] !== 2 ||
      response["failed"] !== 0 ||
      new Set(results.map((r) => r["index"])).size !== 2
    )
      throw new Error("OCO response is incomplete")
    for (const item of results) {
      const index = item["index"]
      if (index !== 0 && index !== 1) throw new Error("OCO response index mismatch")
      const order = GenericObjectSchema.parse(item["order"])
      if (
        item["success"] !== true ||
        String(order["userId"]) !== intent.userId ||
        !["PENDING", "TRIGGERING", "TRIGGERED", "TRIGGER_FAILED", "CANCELED", "EXPIRED"].includes(
          String(order["status"]),
        ) ||
        !/^[1-9]\d*$/.test(String(order["triggerOrderId"])) ||
        order["clientTriggerOrderId"] !== orders[index]?.["clientTriggerOrderId"] ||
        order["instrumentId"] !== intent.instrumentId ||
        order["ocoGroupId"] !== tp["ocoGroupId"]
      )
        throw new Error("OCO response identity mismatch")
    }
    clearPendingCommand(intent)
    return response
  } catch (reason) {
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    throw new PendingTradingCommand(readPendingCommand(intent.userId)?.commandId)
  }
}

export function cancelOpenTriggerOrders(
  body: Readonly<Record<string, unknown>>,
  productLine: ProductLine,
) {
  return request("/api/v1/trading/trigger-orders/cancel-open", GenericObjectSchema, {
    method: "POST",
    productLine,
    body,
  })
}

export async function loadOrderHistory(
  instrumentId: string,
  productLine: ProductLine,
  startTime?: number,
  endTime?: number,
  cursor?: string,
  status?: string,
) {
  const session = loadSession()
  if (!session) throw new Error(t("Sign in required."))
  const query = new URLSearchParams({
    userId: String(currentAccountUserId(session)),
    limit: "100",
  })
  if (instrumentId.trim()) query.set("instrumentId", instrumentId.trim())
  if (startTime !== undefined) query.set("startTime", String(startTime))
  if (endTime !== undefined) query.set("endTime", String(endTime))
  if (cursor) query.set("cursor", cursor)
  if (status) query.set("status", status)
  const response = await request(
    `/api/v1/trading/orders/history?${query.toString()}`,
    OrderHistoryPageSchema,
    { productLine, expectedUserId: String(session.user.userId), retry: 0 },
  )
  if (
    (response.hasMore && response.nextCursor === cursor) ||
    response.orders.some(
      (row) =>
        String(row.userId) !== String(currentAccountUserId(session)) ||
        (instrumentId.trim() && row.instrumentId !== instrumentId.trim()) ||
        (status && row.status !== status),
    )
  )
    throw new Error(t("Order history does not match the original query. Refresh to retry."))
  return response
}

export async function loadMyTrades(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  filters: {
    startTime?: number | undefined
    endTime?: number | undefined
    cursor?: string | undefined
  } = {},
) {
  const query = new URLSearchParams({ userId: String(userId), limit: "100" })
  if (instrumentId.trim()) query.set("instrumentId", instrumentId.trim())
  if (filters.startTime !== undefined) query.set("startTime", String(filters.startTime))
  if (filters.endTime !== undefined) query.set("endTime", String(filters.endTime))
  if (filters.cursor) query.set("cursor", filters.cursor)
  const response = await request(
    `/api/v1/trading/orders/trades?${query.toString()}`,
    TradeFillPageSchema,
    { productLine, expectedUserId: String(userId), retry: 0 },
  )
  if (
    String(response.userId) !== String(userId) ||
    response.productLine !== productLine ||
    (response.hasMore && (!response.nextCursor || response.nextCursor === filters.cursor)) ||
    response.trades.some(
      (row) =>
        row.productLine !== productLine ||
        (instrumentId.trim() && row.instrumentId !== instrumentId.trim()),
    )
  )
    throw new Error(t("Trade history does not match the original query. Refresh to retry."))
  return response
}

export async function cancelOrder(_symbol: string, orderId: string, productLine: ProductLine) {
  const session = loadSession()
  if (!session) throw new Error(t("Please sign in before canceling orders."))
  if (!/^[1-9]\d*$/.test(orderId)) throw new Error("Invalid order ID")
  const pendingMessage = t("Cancellation result is pending. Do not send it again.")
  const userId = String(currentAccountUserId(session))
  const intent: PendingOrderCommand | null = tracksSingleOrderIntent(productLine)
    ? { userId, productLine, cancelOrderId: orderId }
    : null
  if (intent) {
    const existing = readPendingCommand(userId)
    if (existing) throw new PendingTradingCommand(existing.commandId)
    try {
      savePendingCommand(intent)
    } catch {
      throw new Error(t("Cannot save cancellation recovery details. No cancellation was sent."))
    }
  }
  try {
    const response = await request(`/api/v1/trading/orders/cancel`, GenericObjectSchema, {
      method: "POST",
      productLine,
      expectedUserId: userId,
      idempotencyKey: `cancel-${orderId}`,
      body: { userId: currentAccountUserId(session), orderId },
    })
    if (["MATCHING_PENDING", "RESULT_UNKNOWN"].includes(String(response["outcome"]))) {
      if (intent && typeof response["commandId"] === "string" && response["commandId"])
        savePendingCommand({ ...intent, commandId: response["commandId"] })
      throw new PendingTradingCommand(
        typeof response["commandId"] === "string" ? response["commandId"] : undefined,
        pendingMessage,
      )
    }
    const order = OrderSubmissionSchema.safeParse(response)
    if (
      response["outcome"] !== "TERMINAL" ||
      response["code"] !== "NONE" ||
      !order.success ||
      String(order.data.orderId) !== orderId
    )
      throw new ApiError(apiErrorMessage(response, 409), 502, response)
    if (intent) clearPendingCommand(intent)
    return order.data
  } catch (reason) {
    if (!intent) throw reason
    if (isDefinitiveOrderRejection(reason)) {
      clearPendingCommand(intent)
      throw reason
    }
    if (reason instanceof PendingTradingCommand) throw reason
    throw new PendingTradingCommand(readPendingCommand(userId)?.commandId, pendingMessage)
  }
}

export async function loadEffectiveTradingFee(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  changeId?: string,
) {
  const query = new URLSearchParams({ userId: String(userId), instrumentId, productLine })
  const fee = await request(`/api/v1/trading/fees/effective?${query}`, GenericObjectSchema, {
    productLine,
  })
  if (
    productLine === "SPOT" &&
    (changeId == null ||
      String(fee["userId"]) !== String(userId) ||
      fee["productLine"] !== productLine ||
      String(fee["instrumentId"]) !== instrumentId ||
      String(fee["changeId"]) !== changeId ||
      typeof fee["takerFeeRatePpm"] !== "number" ||
      !Number.isSafeInteger(fee["takerFeeRatePpm"]) ||
      Math.abs(fee["takerFeeRatePpm"]) > 1000000)
  )
    throw new Error("Order fee metadata mismatch")
  return fee
}

// ---------------------- VIP 动态阶梯费率 API ----------------------

interface CreateGridStrategyRequest {
  readonly instrumentId: string
  readonly productLine?: string
  readonly lowerPriceTicks: number | string
  readonly upperPriceTicks: number | string
  readonly gridCount: number
  readonly totalInvestmentUnits: number | string
  readonly isArithmetic: boolean
}

export interface GridStrategyRecord {
  readonly strategyId: number
  readonly userId: number
  readonly instrumentId: string
  readonly productLine: string
  readonly lowerPriceTicks: number
  readonly upperPriceTicks: number
  readonly gridCount: number
  readonly isArithmetic: boolean
  readonly totalInvestmentUnits: number
  readonly status: string
  readonly totalProfitUnits: number
  readonly matchedTradeCount: number
  readonly createdAt: string
}

export async function createGridStrategy(
  body: CreateGridStrategyRequest,
  currentPriceTicks = 0,
): Promise<GridStrategyRecord> {
  const query = currentPriceTicks > 0 ? `?currentPriceTicks=${currentPriceTicks}` : ""
  const res = await request(`/api/v1/trading/grid/create${query}`, GenericObjectSchema, {
    method: "POST",
    body,
  })
  return res as unknown as GridStrategyRecord
}

export async function loadGridStrategies(): Promise<readonly GridStrategyRecord[]> {
  const res = await request("/api/v1/trading/grid/list", GenericObjectSchema)
  return Array.isArray(res) ? (res as unknown as readonly GridStrategyRecord[]) : []
}

export async function stopGridStrategy(strategyId: number | string): Promise<GridStrategyRecord> {
  const res = await request(`/api/v1/trading/grid/${strategyId}/stop`, GenericObjectSchema, {
    method: "POST",
  })
  return res as unknown as GridStrategyRecord
}

// ---------------------- 主子账户体系 API ----------------------
