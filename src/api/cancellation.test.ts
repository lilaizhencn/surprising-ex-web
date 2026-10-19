import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { readPendingCommand } from "../state/pendingOrders"
import { saveSession } from "../state/session"
import {
  cancelSpotBatchOrders,
  cancelSpotOpenOrders,
  continueCancellationPlan,
} from "./cancellation"
import { ApiError, request } from "./client"
import { PendingTradingCommand } from "./tradingCommand"

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)
const ids = Array.from({ length: 120 }, (_, i) => String(9007199254740993n + BigInt(i)))
const firstId = "9007199254740993"
const account = (userId = 1) => ({ accessToken: "test", refreshToken: "test", user: { userId } })
let writes = 0
let failAt = 0
function storage() {
  const values: Record<string, string> = {}
  Object.defineProperties(values, {
    getItem: { value: (key: string) => values[key] ?? null },
    setItem: {
      value: (key: string, value: string) => {
        if (++writes === failAt) throw Error("disk full")
        values[key] = value
      },
    },
    removeItem: {
      value: (key: string) => {
        delete values[key]
      },
    },
  })
  return values as unknown as Storage
}
function terminal(orderIds: readonly string[], failed = 0, commandId = "command-1") {
  return {
    commandId,
    outcome: "TERMINAL",
    code: "NONE",
    prospectiveOrderIds: orderIds,
    result: {
      requested: orderIds.length,
      completed: orderIds.length - failed,
      failed,
      results: orderIds.map((_, index) => ({
        index,
        success: index >= failed,
        message: index >= failed ? "NONE" : "ORDER_NOT_FOUND",
        order: null,
      })),
    },
  }
}
function callAt(index: number) {
  const call = send.mock.calls[index]
  if (!call) throw Error("missing HTTP call")
  return call
}
function bodyAt(index: number) {
  return callAt(index)[2]?.body as {
    batchKey: string
    orders: { userId: string; orderId: string }[]
  }
}
function replyToBatch(options: Parameters<typeof request>[2]) {
  if (!options?.body) throw Error("missing batch body")
  const body = options.body as ReturnType<typeof bodyAt>
  return terminal(body.orders.map((o) => o.orderId))
}
let locks: Promise<unknown>
beforeEach(() => {
  writes = 0
  failAt = 0
  locks = Promise.resolve()
  send.mockReset()
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { localStorage: storage(), sessionStorage: storage() }),
  )
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, operation: () => Promise<unknown>) => {
        const next = locks.then(operation)
        locks = next.catch(() => undefined)
        return next
      },
    },
  })
  saveSession(account())
})
afterEach(() => vi.unstubAllGlobals())
it("fixes all targets before writes, persists every checkpoint and reports partial native results", async () => {
  send.mockImplementation(async (url, _schema, options) => {
    if (url.includes("cancellation-plan"))
      return { userId: 1, productLine: "SPOT", instrumentId: "1", orderIds: ids }
    const pending = readPendingCommand("1")
    expect(pending?.cancelPlan?.issued).toBe(true)
    expect(pending?.cancelPlan?.batches.flatMap((b) => b.orderIds)).toEqual(ids)
    const body = options?.body as ReturnType<typeof bodyAt>
    expect(body.batchKey).toBe(pending?.cancelPlan?.batches[pending.cancelPlan.index]?.key)
    expect(options).toMatchObject({
      method: "POST",
      productLine: "SPOT",
      expectedUserId: "1",
      idempotencyKey: body.batchKey,
    })
    return terminal(
      body.orders.map((o) => o.orderId),
      1,
    )
  })
  const result = await cancelSpotOpenOrders({ userId: 1, instrumentId: "1" })
  expect(result).toMatchObject({ requested: 120, completed: 117, failed: 3 })
  expect(result.message).toContain(firstId)
  expect([1, 2, 3].map((i) => bodyAt(i).orders.length)).toEqual([50, 50, 20])
  expect(new Set([1, 2, 3].map((i) => bodyAt(i).batchKey)).size).toBe(3)
  expect(readPendingCommand("1")).toBeNull()
})
it("retains lost replies across reload, reads the issued batch and only sends previously unissued targets", async () => {
  send
    .mockResolvedValueOnce({ userId: 1, productLine: "SPOT", instrumentId: null, orderIds: ids })
    .mockRejectedValueOnce(new TypeError("connection reset"))
  await expect(cancelSpotOpenOrders({ userId: 1 })).rejects.toBeInstanceOf(PendingTradingCommand)
  const original = JSON.parse(JSON.stringify(readPendingCommand("1")))
  expect(original.cancelPlan.issued).toBe(true)
  send.mockResolvedValueOnce({ commandId: "command-1", outcome: "RESULT_UNKNOWN" })
  await expect(continueCancellationPlan(original)).rejects.toBeInstanceOf(PendingTradingCommand)
  expect(callAt(2)[0]).toContain(`batchKey=${bodyAt(1).batchKey}`)
  expect(callAt(2)[2]).toMatchObject({
    retry: 0,
    expectedUserId: "1",
    productLine: "SPOT",
  })
  send
    .mockResolvedValueOnce(terminal(ids.slice(0, 50), 1))
    .mockImplementation(async (_url, _schema, options) => replyToBatch(options))
  await expect(continueCancellationPlan(original)).resolves.toMatchObject({
    requested: 120,
    completed: 119,
    failed: 1,
  })
  expect(send.mock.calls.filter(([, , o]) => o?.method === "POST")).toHaveLength(3)
  expect(send.mock.calls.filter(([url]) => url.includes("cancellation-plan"))).toHaveLength(1)
  expect(bodyAt(4).orders.map((o) => o.orderId)).toEqual(ids.slice(50, 100))
})
for (const kind of [
  "missing-result",
  "wrong-ids",
  "wrong-command",
  "bad-count",
  "bad-success-code",
  "503",
  "lookup-400",
]) {
  it(`keeps an issued batch locked on ${kind} and never resends it`, async () => {
    send.mockRejectedValueOnce(new TypeError("lost"))
    await expect(
      cancelSpotBatchOrders({ orders: [{ userId: 1, orderId: firstId }] }),
    ).rejects.toBeInstanceOf(PendingTradingCommand)
    const pending = readPendingCommand("1")
    if (!pending) throw Error("missing pending")
    if (kind === "503" || kind === "lookup-400")
      send.mockRejectedValueOnce(new ApiError("offline", kind === "503" ? 503 : 400))
    else {
      const receipt = terminal([firstId])
      if (kind === "missing-result") Object.assign(receipt, { result: null })
      if (kind === "wrong-ids") receipt.prospectiveOrderIds = ["9"]
      if (kind === "wrong-command") receipt.commandId = ""
      if (kind === "bad-count") receipt.result.completed = 4
      if (kind === "bad-success-code")
        receipt.result.results.forEach((item) => {
          item.message = "ORDER_NOT_FOUND"
        })
      send.mockResolvedValueOnce(receipt)
    }
    await expect(continueCancellationPlan(pending)).rejects.toBeInstanceOf(PendingTradingCommand)
    expect(readPendingCommand("1")?.cancelPlan?.issued).toBe(true)
    expect(send.mock.calls.filter(([, , o]) => o?.method === "POST")).toHaveLength(1)
  })
}
it("accepts a complete committed rejection on GET409 as per-item failure", async () => {
  send.mockRejectedValueOnce(Error("lost"))
  await expect(
    cancelSpotBatchOrders({ batchKey: "explicit", orders: [{ userId: 1, orderId: firstId }] }),
  ).rejects.toBeInstanceOf(PendingTradingCommand)
  const pending = readPendingCommand("1")
  if (!pending) throw Error("missing pending")
  const receipt = terminal([firstId], 1)
  receipt.code = "ORDER_OWNER_MISMATCH"
  receipt.result.results.forEach((item) => {
    item.message = receipt.code
  })
  send.mockRejectedValueOnce(new ApiError("rejected", 409, receipt))
  await expect(continueCancellationPlan(pending)).resolves.toMatchObject({
    requested: 1,
    completed: 0,
    failed: 1,
  })
  expect(bodyAt(0).batchKey).toBe("explicit")
})
for (const checkpoint of [1, 2, 3, 4]) {
  it(`survives a persistence failure at checkpoint ${checkpoint}`, async () => {
    failAt = writes + checkpoint
    send.mockImplementation(async (_url, _schema, options) => replyToBatch(options))
    await expect(
      cancelSpotBatchOrders({ orders: [{ userId: 1, orderId: firstId }] }),
    ).rejects.toThrow()
    expect(send.mock.calls.filter(([, , o]) => o?.method === "POST")).toHaveLength(
      checkpoint >= 3 ? 1 : 0,
    )
    failAt = 0
    const pending = readPendingCommand("1")
    if (pending) {
      send.mockResolvedValueOnce(terminal([firstId]))
      await expect(continueCancellationPlan(pending)).resolves.toMatchObject({ completed: 1 })
      expect(send.mock.calls.filter(([, , o]) => o?.method === "POST")).toHaveLength(1)
    }
  })
}
it("serializes competing resumptions and preserves the original account", async () => {
  send.mockRejectedValueOnce(Error("lost"))
  await expect(
    cancelSpotBatchOrders({ orders: [{ userId: 1, orderId: firstId }] }),
  ).rejects.toBeInstanceOf(PendingTradingCommand)
  const pending = readPendingCommand("1")
  if (!pending) throw Error("missing pending")
  saveSession(account(2))
  await expect(continueCancellationPlan(pending)).rejects.toThrow("original account")
  expect(send).toHaveBeenCalledTimes(1)
  saveSession(account())
  send.mockResolvedValueOnce(terminal([firstId]))
  const outcomes = await Promise.allSettled([
    continueCancellationPlan(pending),
    continueCancellationPlan(pending),
  ])
  expect(outcomes.map((r) => r.status)).toEqual(["fulfilled", "rejected"])
  expect(send).toHaveBeenCalledTimes(2)
})
it("rejects mismatched scopes and storage failures without a mutation; empty scope is complete", async () => {
  send.mockResolvedValueOnce({
    userId: 1,
    productLine: "OPTION",
    instrumentId: null,
    orderIds: ids,
  })
  await expect(cancelSpotOpenOrders({ userId: 1 })).rejects.toThrow("selected scope")
  send.mockResolvedValueOnce({ userId: 1, productLine: "SPOT", instrumentId: null, orderIds: [] })
  await expect(cancelSpotOpenOrders({ userId: 1 })).resolves.toMatchObject({ requested: 0 })
  vi.stubGlobal("navigator", {})
  await expect(cancelSpotBatchOrders({ orders: [{ userId: 1, orderId: "1" }] })).rejects.toThrow(
    "locking is unavailable",
  )
  expect(send.mock.calls.every(([, , o]) => o?.method !== "POST")).toBe(true)
})
