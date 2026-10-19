import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearPendingCommand, readPendingCommand, savePendingCommand } from "../state/pendingOrders"
import { saveSession } from "../state/session"
import { ApiError, request } from "./client"
import {
  amendOrder,
  cancelOrder,
  checkOrderSubmission,
  loadTradingCommand,
  PendingTradingCommand,
  placeOrder,
} from "./endpoints"

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)
function storage() {
  const values: Record<string, string> = {}
  Object.defineProperties(values, {
    getItem: { value: (key: string) => values[key] ?? null },
    setItem: {
      configurable: true,
      value: (key: string, value: string) => {
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
beforeEach(() => {
  send.mockReset()
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { localStorage: storage(), sessionStorage: storage() }),
  )
})
afterEach(() => vi.unstubAllGlobals())
const body = { userId: 1, clientOrderId: "spot-1", instrumentId: "1" }
const intent = {
  userId: "1",
  productLine: "SPOT" as const,
  clientOrderId: "spot-1",
  instrumentId: "1",
}
describe("spot command receipts", () => {
  it("keeps an unanswered spot write pending instead of inviting another order", async () => {
    send.mockRejectedValue(new TypeError("connection reset after sending"))
    await expect(
      placeOrder({ userId: 1, clientOrderId: "spot-lost", instrumentId: "1" }, "SPOT"),
    ).rejects.toBeInstanceOf(PendingTradingCommand)
    expect(send).toHaveBeenCalledTimes(1)
    expect(readPendingCommand("1")?.clientOrderId).toBe("spot-lost")
  })
  it("persists the request before sending and blocks another write while its result is unknown", async () => {
    send.mockImplementation(async () => {
      expect(readPendingCommand("1")).toEqual(intent)
      throw new TypeError("lost response")
    })
    await expect(placeOrder(body, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
    await expect(placeOrder({ ...body, clientOrderId: "another" }, "SPOT")).rejects.toBeInstanceOf(
      PendingTradingCommand,
    )
    expect(send).toHaveBeenCalledTimes(1)
  })
  it("sends nothing if recovery storage fails", async () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    await expect(placeOrder(body, "SPOT")).rejects.toThrow("No order was sent")
    expect(send).not.toHaveBeenCalled()
  })
  it("retains malformed successful responses and server errors, but releases an explicit validation rejection", async () => {
    send.mockResolvedValue({})
    await expect(placeOrder(body, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
    expect(readPendingCommand("1")).toEqual(intent)
    clearPendingCommand(intent)
    send.mockRejectedValue(new ApiError("unavailable", 503))
    await expect(placeOrder(body, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
    expect(readPendingCommand("1")).toEqual(intent)
    clearPendingCommand(intent)
    send.mockRejectedValue(new ApiError("invalid quantity", 400))
    await expect(placeOrder(body, "SPOT")).rejects.toThrow("invalid quantity")
    expect(readPendingCommand("1")).toBeNull()
  })
  it("preserves a terminal order and its exact ID", async () => {
    send.mockResolvedValue({
      outcome: "TERMINAL",
      code: "NONE",
      result: { resultType: "order", orderId: "9007199254740993", status: "ACCEPTED" },
    })
    const order = await placeOrder(
      {
        userId: 1,
        clientOrderId: "spot-1",
        instrumentId: "1",
        bboPriceMode: "OPPONENT_5",
        timeInForce: "GTX",
        priceTicks: 0,
      },
      "SPOT",
    )
    expect(order.orderId).toBe("9007199254740993")
    expect(readPendingCommand("1")).toBeNull()
    expect(send).toHaveBeenCalledWith(
      "/api/v1/gateway/trading",
      expect.anything(),
      expect.objectContaining({
        productLine: "SPOT",
        idempotencyKey: "spot-1",
        body: expect.objectContaining({ timeInForce: "GTX", priceTicks: 0 }),
      }),
    )
  })
  for (const outcome of ["MATCHING_PENDING", "RESULT_UNKNOWN"]) {
    it(`treats ${outcome} as pending and sends no second order`, async () => {
      send.mockResolvedValue({ commandId: "command-1", outcome, code: outcome, result: null })
      await expect(placeOrder(body, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
      expect(send).toHaveBeenCalledTimes(1)
      expect(readPendingCommand("1")).toEqual({ ...intent, commandId: "command-1" })
    })
  }
  it("checks the original command on the original product without retrying a write", async () => {
    send.mockResolvedValue({ outcome: "TERMINAL", code: "NONE" })
    await loadTradingCommand("command/1", "SPOT")
    expect(send).toHaveBeenCalledWith(
      "/api/v1/gateway/trading/commands/command%2F1",
      expect.anything(),
      { productLine: "SPOT", retry: 0 },
    )
  })
  for (const status of ["FILLED", "CANCELED", "ACCEPTED", "REJECTED"]) {
    it(`recovers ${status} by the original client ID from realtime without resending`, async () => {
      send
        .mockResolvedValueOnce({
          ...intent,
          instrumentId: null,
          commandId: "known",
          outcome: "RESULT_UNKNOWN",
          code: "RESULT_UNKNOWN",
        })
        .mockResolvedValueOnce({ ...intent, orderId: "9007199254740993", status })
      await expect(checkOrderSubmission(intent)).resolves.toBe(
        status === "REJECTED" ? "rejected" : "confirmed",
      )
      expect(send).toHaveBeenCalledWith(
        "/api/v1/gateway/trading/by-client-order-id?userId=1&clientOrderId=spot-1",
        expect.anything(),
        { productLine: "SPOT", retry: 0, expectedUserId: "1" },
      )
      expect(send).toHaveBeenCalledTimes(2)
    })
  }
  it("does not infer a rejected order from an absent projection or a rejected receipt lookup", async () => {
    send
      .mockResolvedValueOnce({
        ...intent,
        instrumentId: null,
        commandId: "known",
        outcome: "RESULT_UNKNOWN",
        code: "RESULT_UNKNOWN",
      })
      .mockRejectedValueOnce(new ApiError("not found", 404))
    await expect(checkOrderSubmission(intent)).resolves.toBe("pending")
    send.mockResolvedValue({
      commandId: "known",
      outcome: "NOT_ACCEPTED",
      code: "CLIENT_BACKPRESSURED",
    })
    await expect(
      checkOrderSubmission({ userId: "1", productLine: "SPOT", commandId: "known" }),
    ).resolves.toBe("pending")
  })
  it("recovers a committed rejection without an order and without relying on Core retention", async () => {
    send.mockResolvedValueOnce({
      ...intent,
      commandId: "known",
      outcome: "TERMINAL",
      code: "ORDER_NOT_FOUND",
    })
    await expect(checkOrderSubmission(intent)).resolves.toBe("rejected")
    expect(send).toHaveBeenLastCalledWith(
      "/api/v1/gateway/trading/submission?userId=1&clientOrderId=spot-1",
      expect.anything(),
      { productLine: "SPOT", expectedUserId: "1", retry: 0 },
    )
    expect(send).toHaveBeenCalledTimes(1)
  })
  it("does not use another product or instrument's committed rejection", async () => {
    for (const mismatch of [
      { productLine: "OPTION" },
      { instrumentId: "2" },
      { userId: "2" },
      { commandId: "" },
    ]) {
      send.mockReset().mockResolvedValueOnce({
        ...intent,
        commandId: "known",
        outcome: "TERMINAL",
        code: "ORDER_NOT_FOUND",
        ...mismatch,
      })
      await expect(checkOrderSubmission(intent)).rejects.toThrow("identity mismatch")
    }
  })
  it("rejects another user's projection and never falls back to Core on view unavailability", async () => {
    send.mockResolvedValue({ ...intent, userId: 2, orderId: "1", status: "FILLED" })
    await expect(checkOrderSubmission(intent)).rejects.toThrow("identity mismatch")
    send.mockReset().mockRejectedValue(new ApiError("view unavailable", 503))
    await expect(checkOrderSubmission({ ...intent, commandId: "known" })).rejects.toThrow(
      "view unavailable",
    )
    expect(send).toHaveBeenCalledTimes(1)
  })
  it("keeps separate users and requests durable and migrates an existing tab receipt once", () => {
    savePendingCommand(intent)
    const other = { ...intent, userId: "2" }
    savePendingCommand(other)
    const second = { ...intent, clientOrderId: "spot-2" }
    savePendingCommand(second)
    clearPendingCommand(intent)
    expect(readPendingCommand("1")).toEqual(second)
    expect(readPendingCommand("2")).toEqual(other)
    window.sessionStorage.setItem(
      "surprising-ex.pending-command:3",
      JSON.stringify({ userId: "3", productLine: "SPOT", commandId: "old" }),
    )
    expect(readPendingCommand("3")?.commandId).toBe("old")
    expect(window.sessionStorage.getItem("surprising-ex.pending-command:3")).toBeNull()
  })
})

describe("spot cancellation recovery", () => {
  it("never reports an unresolved cancellation receipt as success", async () => {
    send.mockResolvedValue({
      commandId: "cancel-1",
      outcome: "RESULT_UNKNOWN",
      code: "RESULT_UNKNOWN",
      result: null,
    })
    await expect(cancelOrder("1", "91", "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
  })

  const orderId = "9007199254740993"
  const intent = { userId: "1", productLine: "SPOT" as const, cancelOrderId: orderId }
  beforeEach(() =>
    saveSession({
      accessToken: "test",
      refreshToken: "test",
      user: { userId: 1, username: "spot", email: "", status: "ACTIVE" },
    }),
  )
  for (const outcome of ["MATCHING_PENDING", "RESULT_UNKNOWN"]) {
    it(`persists before the cancellation and treats ${outcome} as pending`, async () => {
      send.mockImplementation(async () => {
        expect(readPendingCommand("1")).toEqual(intent)
        return { commandId: "cancel-1", outcome, code: outcome }
      })
      await expect(cancelOrder("1", orderId, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
      expect(readPendingCommand("1")).toEqual({ ...intent, commandId: "cancel-1" })
      expect(send).toHaveBeenCalledTimes(1)
    })
  }
  it("keeps a lost response durable and blocks duplicate cancellation and new spot orders", async () => {
    send.mockRejectedValue(new TypeError("response lost"))
    await expect(cancelOrder("1", orderId, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
    expect(readPendingCommand("1")).toEqual(intent)
    await expect(cancelOrder("1", "92", "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
    await expect(placeOrder(body, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it("never sends a cancellation when durable storage fails", async () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw Error("quota")
    })
    await expect(cancelOrder("1", orderId, "SPOT")).rejects.toThrow("No cancellation was sent")
    expect(send).not.toHaveBeenCalled()
  })
  it("accepts only the matching terminal order and preserves its exact ID", async () => {
    send.mockResolvedValue({
      commandId: "cancel-1",
      outcome: "TERMINAL",
      code: "NONE",
      result: { orderId, status: "CANCELED" },
    })
    expect((await cancelOrder("1", orderId, "SPOT")).orderId).toBe(orderId)
    expect(readPendingCommand("1")).toBeNull()
    expect(send).toHaveBeenCalledWith(
      "/api/v1/gateway/trading/cancel",
      expect.anything(),
      expect.objectContaining({ expectedUserId: "1", body: { userId: 1, orderId } }),
    )
  })
  it("keeps malformed and mismatched replies pending but clears definitive refusal", async () => {
    for (const response of [
      {},
      {
        commandId: "c",
        outcome: "TERMINAL",
        code: "NONE",
        result: { orderId: "92", status: "CANCELED" },
      },
    ]) {
      send.mockResolvedValue(response)
      await expect(cancelOrder("1", orderId, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
      expect(readPendingCommand("1")).toEqual(intent)
      clearPendingCommand(intent)
    }
    send.mockRejectedValue(new ApiError("validation", 400))
    await expect(cancelOrder("1", orderId, "SPOT")).rejects.toThrow("validation")
    expect(readPendingCommand("1")).toBeNull()
    send.mockResolvedValue({ commandId: "c", outcome: "TERMINAL", code: "ORDER_NOT_FOUND" })
    await expect(cancelOrder("1", orderId, "SPOT")).rejects.toBeInstanceOf(ApiError)
    expect(readPendingCommand("1")).toBeNull()
  })
  it("recovers only the original committed cancellation by GET without inspecting order existence", async () => {
    const receipt = {
      commandId: "cancel-1",
      prospectiveOrderIds: [orderId],
      outcome: "RESULT_UNKNOWN",
      code: "RESULT_UNKNOWN",
    }
    send.mockResolvedValue(receipt)
    expect(await checkOrderSubmission(intent)).toBe("pending")
    send.mockResolvedValue({ ...receipt, outcome: "TERMINAL", code: "NONE" })
    expect(await checkOrderSubmission(intent)).toBe("confirmed")
    send.mockResolvedValue({ ...receipt, outcome: "TERMINAL", code: "ORDER_NOT_FOUND" })
    expect(await checkOrderSubmission(intent)).toBe("rejected")
    expect(send).toHaveBeenLastCalledWith(
      `/api/v1/gateway/trading/cancellations/${orderId}?userId=1`,
      expect.anything(),
      { productLine: "SPOT", expectedUserId: "1", retry: 0 },
    )
    expect(send).toHaveBeenCalledTimes(3)
  })
  it("does not clear an unresolved cancellation for a different receipt or unavailable query", async () => {
    for (const bad of [
      { prospectiveOrderIds: ["92"] },
      { commandId: "different" },
      { outcome: "NOT_ACCEPTED" },
    ]) {
      send.mockResolvedValue({
        commandId: "cancel-1",
        prospectiveOrderIds: [orderId],
        outcome: "TERMINAL",
        code: "NONE",
        ...bad,
      })
      await expect(checkOrderSubmission({ ...intent, commandId: "cancel-1" })).rejects.toThrow()
    }
    send.mockRejectedValue(new ApiError("unavailable", 503))
    await expect(checkOrderSubmission(intent)).rejects.toThrow("unavailable")
  })
})

describe("spot amendment recovery", () => {
  const input = {
    userId: 1,
    orderId: "91",
    instrumentId: "1",
    newClientOrderId: "replacement-1",
    clientRequestId: "edit-1",
    priceTicks: "1100",
    quantitySteps: "2",
  }
  const intent = {
    userId: "1",
    productLine: "SPOT" as const,
    amendOrderId: "91",
    amendRequestId: "edit-1",
    clientOrderId: "replacement-1",
    instrumentId: "1",
  }
  beforeEach(() =>
    saveSession({
      accessToken: "test",
      refreshToken: "test",
      user: { userId: 1, username: "spot", email: "", status: "ACTIVE" },
    }),
  )
  it("sends the required request identity after durable save and keeps lost replies pending", async () => {
    send.mockImplementation(async () => {
      expect(readPendingCommand("1")).toEqual(intent)
      throw new TypeError("reply lost")
    })
    await expect(amendOrder(input, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
    expect(readPendingCommand("1")).toEqual(intent)
    await expect(
      amendOrder({ ...input, clientRequestId: "another" }, "SPOT"),
    ).rejects.toBeInstanceOf(PendingTradingCommand)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      "/api/v1/gateway/trading/amend",
      expect.anything(),
      expect.objectContaining({
        expectedUserId: "1",
        idempotencyKey: "edit-1",
        body: expect.objectContaining({
          clientRequestId: "edit-1",
          newClientOrderId: "replacement-1",
        }),
      }),
    )
  })
  it("never sends without a request ID or when recovery storage fails", async () => {
    await expect(amendOrder({ ...input, clientRequestId: "" }, "SPOT")).rejects.toThrow(
      "No amendment was sent",
    )
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw Error("quota")
    })
    await expect(amendOrder(input, "SPOT")).rejects.toThrow("No amendment was sent")
    expect(send).not.toHaveBeenCalled()
  })
  it("decodes both order images and preserves the new 64 bit ID", async () => {
    send.mockResolvedValue({
      outcome: "TERMINAL",
      code: "NONE",
      result: {
        originalOrder: { orderId: "91", status: "CANCELED" },
        replacementOrder: { orderId: "9007199254740993", status: "ACCEPTED" },
        cancelRequested: true,
      },
    })
    const result = await amendOrder(input, "SPOT")
    expect((result["replacementOrder"] as { orderId: string }).orderId).toBe("9007199254740993")
    expect(readPendingCommand("1")).toBeNull()
  })
  it("keeps incomplete or pending results, but releases a definitive refusal", async () => {
    send.mockResolvedValue({
      outcome: "RESULT_UNKNOWN",
      code: "RESULT_UNKNOWN",
      commandId: "command-1",
    })
    await expect(amendOrder(input, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
    expect(readPendingCommand("1")).toEqual({ ...intent, commandId: "command-1" })
    clearPendingCommand({ ...intent, commandId: "command-1" })
    send.mockResolvedValue({ outcome: "TERMINAL", code: "NONE", result: {} })
    await expect(amendOrder(input, "SPOT")).rejects.toBeInstanceOf(PendingTradingCommand)
    clearPendingCommand(intent)
    send.mockRejectedValue(
      new ApiError("insufficient", 409, {
        outcome: "TERMINAL",
        code: "INSUFFICIENT_AVAILABLE_BALANCE",
        commandId: "command-1",
      }),
    )
    await expect(amendOrder(input, "SPOT")).rejects.toThrow("insufficient")
    expect(readPendingCommand("1")).toBeNull()
  })
  it("queries only the original amendment and never mistakes missing or wrong receipts for confirmation", async () => {
    send.mockResolvedValue({
      outcome: "RESULT_UNKNOWN",
      code: "RESULT_UNKNOWN",
      commandId: "command-1",
    })
    expect(await checkOrderSubmission(intent)).toBe("pending")
    send.mockResolvedValue({ outcome: "TERMINAL", code: "NONE", commandId: "command-1" })
    expect(await checkOrderSubmission(intent)).toBe("confirmed")
    send.mockResolvedValue({
      outcome: "TERMINAL",
      code: "INSUFFICIENT_AVAILABLE_BALANCE",
      commandId: "command-1",
    })
    expect(await checkOrderSubmission(intent)).toBe("rejected")
    send.mockResolvedValue({ outcome: "TERMINAL", code: "NONE", commandId: "another" })
    await expect(checkOrderSubmission({ ...intent, commandId: "command-1" })).rejects.toThrow()
    expect(send).toHaveBeenLastCalledWith(
      "/api/v1/gateway/trading/amendments?userId=1&clientRequestId=edit-1",
      expect.anything(),
      { productLine: "SPOT", expectedUserId: "1", retry: 0 },
    )
  })
})
