import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearPendingCommand, readPendingCommand, savePendingCommand } from "../state/pendingOrders"
import { ApiError, request } from "./client"
import {
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
