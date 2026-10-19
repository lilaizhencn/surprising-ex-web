import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readPendingCommand } from "../state/pendingOrders"
import { ApiError, request } from "./client"
import {
  cancelTriggerOrder,
  checkOrderSubmission,
  PendingTradingCommand,
  placeTriggerOrder,
} from "./endpoints"

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)
describe.each(["OPTION", "LINEAR_DELIVERY"] as const)("%s trigger recovery", (product) => {
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
  const body = {
    userId: 1,
    instrumentId: "74",
    clientTriggerOrderId: "original-single",
    side: "SELL",
    triggerType: "TAKE_PROFIT",
    priceSource: "LAST",
    triggerPriceTicks: "24690",
    orderType: "LIMIT",
    timeInForce: "GTC",
    priceTicks: "24680",
    quantitySteps: "1",
    marginMode: "CROSS",
    positionSide: "NET",
  }
  const accepted = () => ({ ...body, triggerOrderId: "9007199254740993", status: "PENDING" })
  beforeEach(() => {
    failStorage = false
    send.mockReset()
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), { localStorage: storage(), sessionStorage: storage() }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it("saves independent OPTION identity before its sole POST and clears only an accepted matching response", async () => {
    send.mockImplementation(async (_url, _schema, options) => {
      expect(readPendingCommand("1")).toMatchObject({
        productLine: product,
        instrumentId: "74",
        clientTriggerOrderId: "original-single",
      })
      expect(options).toMatchObject({
        method: "POST",
        productLine: product,
        expectedUserId: "1",
        retry: 0,
        body,
      })
      return accepted()
    })
    expect((await placeTriggerOrder(body, product)).triggerOrderId).toBe("9007199254740993")
    expect(readPendingCommand("1")).toBeNull()
    expect(send).toHaveBeenCalledTimes(1)
  })
  for (const cancel of [false, true]) {
    it(`${cancel ? "cancel" : "place"} unknown response survives storage reads; recovery uses only original GET`, async () => {
      const write = () =>
        cancel
          ? cancelTriggerOrder(1, "9007199254740993", product, "74")
          : placeTriggerOrder(body, product)
      send.mockRejectedValueOnce(new TypeError("reply lost"))
      await expect(write()).rejects.toBeInstanceOf(PendingTradingCommand)
      const original = readPendingCommand("1")
      expect(original).not.toBeNull()
      await expect(write()).rejects.toBeInstanceOf(PendingTradingCommand)
      expect(send).toHaveBeenCalledTimes(1)
      if (!original) throw Error("missing original")
      send.mockResolvedValueOnce({
        commandId: "original-command",
        outcome: "RESULT_UNKNOWN",
        code: "RESULT_UNKNOWN",
      })
      expect(await checkOrderSubmission(original)).toBe("pending")
      send.mockResolvedValueOnce({
        commandId: "original-command",
        outcome: "TERMINAL",
        code: "NONE",
      })
      expect(await checkOrderSubmission(original)).toBe("confirmed")
      const expected = cancel
        ? "/cancellations/9007199254740993?userId=1"
        : "/submission?userId=1&clientTriggerOrderId=original-single"
      for (const [url, , options] of send.mock.calls.slice(1)) {
        expect(url).toBe(`/api/v1/gateway/trading-trigger${expected}`)
        expect(options).toMatchObject({ productLine: product, expectedUserId: "1", retry: 0 })
        expect(options?.method).toBeUndefined()
      }
    })
  }
  it("missing, mismatched or malformed response cannot release the original request", async () => {
    for (const change of [
      { instrumentId: "99" },
      { userId: 2 },
      { clientTriggerOrderId: "another" },
      { triggerOrderId: "0" },
      { status: undefined },
    ]) {
      send.mockResolvedValueOnce({ ...accepted(), ...change })
      await expect(placeTriggerOrder(body, product)).rejects.toBeInstanceOf(PendingTradingCommand)
      expect(readPendingCommand("1")).toMatchObject({ clientTriggerOrderId: "original-single" })
      for (const key of Object.keys(window.localStorage)) window.localStorage.removeItem(key)
    }
  })
  it("cancellation cannot accept another trigger or a still-pending status", async () => {
    send.mockResolvedValueOnce(accepted())
    await expect(cancelTriggerOrder(1, "9007199254740993", product, "74")).rejects.toBeInstanceOf(
      PendingTradingCommand,
    )
    expect(readPendingCommand("1")).toMatchObject({ cancelTriggerOrderId: "9007199254740993" })
  })
  it("storage failure prevents place and cancel writes", async () => {
    failStorage = true
    await expect(placeTriggerOrder(body, product)).rejects.toThrow("No order was sent")
    await expect(cancelTriggerOrder(1, "99", product, "74")).rejects.toThrow("No order was sent")
    expect(send).not.toHaveBeenCalled()
  })
  it("definitive gateway rejection clears; timeout and unavailable lookup retain identity", async () => {
    send.mockRejectedValueOnce(new ApiError("invalid", 400))
    await expect(placeTriggerOrder(body, product)).rejects.toBeInstanceOf(ApiError)
    expect(readPendingCommand("1")).toBeNull()
    send.mockRejectedValueOnce(new ApiError("timeout", 504))
    await expect(placeTriggerOrder(body, product)).rejects.toBeInstanceOf(PendingTradingCommand)
    const pending = readPendingCommand("1")
    if (!pending) throw Error("missing original")
    send.mockResolvedValueOnce({
      commandId: "original",
      outcome: "NOT_ACCEPTED",
      code: "UNAVAILABLE",
    })
    await expect(checkOrderSubmission(pending)).rejects.toThrow()
    expect(readPendingCommand("1")).not.toBeNull()
  })
})
