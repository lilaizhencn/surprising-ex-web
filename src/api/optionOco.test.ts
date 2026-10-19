import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { readPendingCommand } from "../state/pendingOrders"
import { ApiError, request } from "./client"
import { checkOrderSubmission, PendingTradingCommand, placeBatchTriggerOrders } from "./endpoints"

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)
let failStorage = false
function storage() {
  const rows: Record<string, string> = {}
  Object.defineProperties(rows, {
    getItem: { value: (k: string) => rows[k] ?? null },
    setItem: {
      value: (k: string, v: string) => {
        if (failStorage) throw Error("full")
        rows[k] = v
      },
    },
    removeItem: {
      value: (k: string) => {
        delete rows[k]
      },
    },
  })
  return rows as unknown as Storage
}
const orders = ["TAKE_PROFIT", "STOP_LOSS"].map((triggerType, index) => ({
  userId: 1,
  instrumentId: "74",
  clientTriggerOrderId: `original-${index}`,
  ocoGroupId: "original-pair",
  triggerType,
  side: "SELL",
  triggerPriceTicks: index ? "19100" : "24690",
  quantitySteps: "2",
  marginMode: "CROSS",
  positionSide: "NET",
  orderType: "LIMIT",
  timeInForce: "GTC",
  priceTicks: "20000",
  priceSource: "LAST",
}))
const body = { atomic: true, orders }
const accepted = () => ({
  requested: 2,
  completed: 2,
  failed: 0,
  results: orders.map((order, index) => ({
    index,
    success: true,
    message: "completed",
    order: { ...order, triggerOrderId: String(100 + index), status: "PENDING" },
  })),
})
beforeEach(() => {
  failStorage = false
  send.mockReset()
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { localStorage: storage(), sessionStorage: storage() }),
  )
})
afterEach(() => vi.unstubAllGlobals())

it("persists one atomic OPTION request before sending both original leg identities", async () => {
  send.mockImplementation(async (_url, _schema, options) => {
    expect(readPendingCommand("1")).toMatchObject({
      productLine: "OPTION",
      instrumentId: "74",
      ocoTakeProfitClientId: "original-0",
      ocoStopLossClientId: "original-1",
    })
    expect(options).toMatchObject({
      method: "POST",
      productLine: "OPTION",
      expectedUserId: "1",
      retry: 0,
      body,
    })
    return accepted()
  })
  await placeBatchTriggerOrders(body, "OPTION")
  expect(send).toHaveBeenCalledTimes(1)
  expect(readPendingCommand("1")).toBeNull()
})
it("lost reply survives re-read and resolves only via the original realtime receipt", async () => {
  send.mockRejectedValueOnce(new TypeError("lost response"))
  await expect(placeBatchTriggerOrders(body, "OPTION")).rejects.toBeInstanceOf(
    PendingTradingCommand,
  )
  const pending = readPendingCommand("1")
  expect(pending).not.toBeNull()
  await expect(placeBatchTriggerOrders(body, "OPTION")).rejects.toBeInstanceOf(
    PendingTradingCommand,
  )
  expect(send).toHaveBeenCalledTimes(1)
  if (!pending) throw Error("missing original intent")
  send.mockResolvedValueOnce({
    commandId: "original-command",
    outcome: "RESULT_UNKNOWN",
    code: "RESULT_UNKNOWN",
  })
  expect(await checkOrderSubmission(pending)).toBe("pending")
  send.mockResolvedValueOnce({ commandId: "original-command", outcome: "TERMINAL", code: "NONE" })
  expect(await checkOrderSubmission(pending)).toBe("confirmed")
  expect(
    send.mock.calls
      .slice(1)
      .every(
        ([url, , options]) =>
          url.includes(
            "oco-submission?userId=1&takeProfitClientId=original-0&stopLossClientId=original-1",
          ) && options?.method === undefined,
      ),
  ).toBe(true)
})
it("unknown or incomplete acknowledgments retain the pair without inferring acceptance", async () => {
  const response = accepted()
  const second = response.results[1]
  if (!second) throw Error("missing leg")
  second.order.instrumentId = "99"
  send.mockResolvedValue(response)
  await expect(placeBatchTriggerOrders(body, "OPTION")).rejects.toBeInstanceOf(
    PendingTradingCommand,
  )
  expect(readPendingCommand("1")).not.toBeNull()
  send.mockResolvedValue({
    commandId: "original-command",
    outcome: "NOT_ACCEPTED",
    code: "UNAVAILABLE",
  })
  const pending = readPendingCommand("1")
  if (!pending) throw Error("missing original intent")
  await expect(checkOrderSubmission(pending)).rejects.toThrow()
})
it("local storage failure prevents either leg being sent", async () => {
  failStorage = true
  await expect(placeBatchTriggerOrders(body, "OPTION")).rejects.toThrow("No order was sent")
  expect(send).not.toHaveBeenCalled()
})
it("a definitive validation rejection clears the pair but a timeout preserves it", async () => {
  send.mockRejectedValueOnce(new ApiError("invalid", 400))
  await expect(placeBatchTriggerOrders(body, "OPTION")).rejects.toBeInstanceOf(ApiError)
  expect(readPendingCommand("1")).toBeNull()
  send.mockRejectedValueOnce(new ApiError("timeout", 504))
  await expect(placeBatchTriggerOrders(body, "OPTION")).rejects.toBeInstanceOf(
    PendingTradingCommand,
  )
  expect(readPendingCommand("1")).not.toBeNull()
})
