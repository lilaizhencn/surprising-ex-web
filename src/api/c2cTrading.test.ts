import { beforeEach, describe, expect, it, vi } from "vitest"
import { c2cDecimal, clearTrade, loadPendingTrade, prepareTrade, tradeReceipt } from "./c2cTrading"
import { request } from "./client"

vi.mock("./client", () => ({ request: vi.fn() }))
const values = new Map<string, string>()
beforeEach(() => {
  values.clear()
  vi.clearAllMocks()
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  })
})
describe("C2C financial request recovery", () => {
  it("keeps the exact original order and its cross-language SHA-256 identity", async () => {
    const original = await prepareTrade("12", "ORDER_CREATE", { quoteId: "abc" })
    expect(original.requestHash).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
    expect(loadPendingTrade("12")).toEqual(original)
    await expect(prepareTrade("12", "ORDER_CREATE", { quoteId: "other" })).rejects.toThrow(
      "请先确认原请求结果",
    )
    expect(request).not.toHaveBeenCalled()
  })
  it("does not expose or clear another account's original request", async () => {
    const original = await prepareTrade("12", "AD_PUBLISH", {
      payload: { price: "6.650000000000000001", quantity: "1" },
    })
    expect(loadPendingTrade("13")).toBeNull()
    clearTrade("13")
    expect(loadPendingTrade("12")).toEqual(original)
  })
  it("requires a successful durable write and never stores verification secrets", async () => {
    await expect(
      prepareTrade("12", "ORDER_CREATE", { quoteId: "abc", verification: { emailCode: "123456" } }),
    ).rejects.toThrow()
    expect(values.size).toBe(0)
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {
        throw Error("Storage full")
      },
    })
    await expect(prepareTrade("12", "ORDER_CREATE", { quoteId: "abc" })).rejects.toThrow(
      "Storage full",
    )
    expect(request).not.toHaveBeenCalled()
  })
  it("receipt recovery is an owner-bound read and never resends the mutation", async () => {
    const original = await prepareTrade("12", "ORDER_CREATE", { quoteId: "abc" })
    vi.mocked(request).mockResolvedValue({
      ownerUserId: "12",
      requestKey: original.requestKey,
      kind: original.kind,
      requestHash: original.requestHash,
      status: "SUCCEEDED",
      resultId: "11111111-1111-4111-8111-111111111111",
      errorCode: null,
      message: null,
    })
    await tradeReceipt("12", original)
    expect(request).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(
        `/submissions/${original.requestKey}?kind=ORDER_CREATE&requestHash=${original.requestHash}`,
      ),
      expect.anything(),
      { expectedUserId: "12" },
    )
  })
  it("formats money without rounding or stripping integer zeroes", () => {
    expect(c2cDecimal("1000")).toBe("1000")
    expect(c2cDecimal("6.650000000000000000")).toBe("6.65")
    expect(c2cDecimal("92233720368.5477580700")).toBe("92233720368.54775807")
    expect(c2cDecimal("0.0000000100")).toBe("0.00000001")
  })
  it("rejects mismatched receipts without clearing the durable original request", async () => {
    const original = await prepareTrade("12", "ORDER_CREATE", { quoteId: "abc" })
    vi.mocked(request).mockResolvedValue({
      ownerUserId: "13",
      requestKey: original.requestKey,
      kind: original.kind,
      requestHash: original.requestHash,
      status: "SUCCEEDED",
      resultId: "11111111-1111-4111-8111-111111111111",
      errorCode: null,
      message: null,
    })
    await expect(tradeReceipt("12", original)).rejects.toThrow("回执身份不匹配")
    expect(loadPendingTrade("12")).toEqual(original)
  })
  it("does not accept a stored body with another request key or verification codes", async () => {
    const original = await prepareTrade("12", "ORDER_CREATE", { quoteId: "abc" })
    values.set(
      "surprising.c2c.trade.12",
      JSON.stringify({
        ...original,
        body: { ...original.body, requestKey: "different-request-key" },
      }),
    )
    expect(() => loadPendingTrade("12")).toThrow()
    values.set(
      "surprising.c2c.trade.12",
      JSON.stringify({
        ...original,
        body: { ...original.body, verification: { emailCode: "123456" } },
      }),
    )
    expect(() => loadPendingTrade("12")).toThrow()
    expect(values.size).toBe(1)
  })
})
