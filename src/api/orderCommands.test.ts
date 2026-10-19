import { beforeEach, describe, expect, it, vi } from "vitest"
import { request } from "./client"
import { loadTradingCommand, PendingTradingCommand, placeOrder } from "./endpoints"

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)
beforeEach(() => send.mockReset())
describe("spot command receipts", () => {
  it("preserves a terminal order and its exact ID", async () => {
    send.mockResolvedValue({
      outcome: "TERMINAL",
      code: "NONE",
      result: { resultType: "order", orderId: "9007199254740993", status: "ACCEPTED" },
    })
    const order = await placeOrder(
      {
        clientOrderId: "spot-1",
        instrumentId: "1",
        bboPriceMode: "OPPONENT_5",
        timeInForce: "GTX",
        priceTicks: 0,
      },
      "SPOT",
    )
    expect(order.orderId).toBe("9007199254740993")
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
      await expect(placeOrder({ clientOrderId: "spot-1" }, "SPOT")).rejects.toBeInstanceOf(
        PendingTradingCommand,
      )
      expect(send).toHaveBeenCalledTimes(1)
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
})
