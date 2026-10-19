import { beforeEach, expect, it, vi } from "vitest"
import { request } from "./client"
import { loadEffectiveTradingFee, loadOrderPriceProtection } from "./endpoints"

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)
beforeEach(() => send.mockReset())

it("requires fees for the current user, product and instrument revision", async () => {
  const fee = {
    userId: 1,
    productLine: "SPOT",
    instrumentId: "2",
    changeId: "3",
    takerFeeRatePpm: 1000,
  }
  send.mockResolvedValue(fee)
  await expect(loadEffectiveTradingFee(1, "2", "SPOT", "3")).resolves.toEqual(fee)
  for (const changed of [
    { userId: 2 },
    { productLine: "OPTION" },
    { instrumentId: "4" },
    { changeId: "4" },
    { changeId: undefined },
    { changeId: undefined, instrumentChangeId: "3" },
    { takerFeeRatePpm: undefined },
    { takerFeeRatePpm: 1000001 },
  ]) {
    send.mockResolvedValue({ ...fee, ...changed })
    await expect(loadEffectiveTradingFee(1, "2", "SPOT", "3")).rejects.toThrow()
  }
})

it("reads the current product protection policy through the user trading route", async () => {
  send.mockResolvedValue({ productLine: "SPOT", marketMaxSlippagePpm: 10000 })
  await expect(loadOrderPriceProtection("SPOT")).resolves.toEqual({
    productLine: "SPOT",
    marketMaxSlippagePpm: 10000,
  })
  expect(send).toHaveBeenCalledWith("/api/v1/gateway/trading/price-protection", expect.anything(), {
    productLine: "SPOT",
  })
  send.mockResolvedValue({ productLine: "OPTION", marketMaxSlippagePpm: 10000 })
  await expect(loadOrderPriceProtection("SPOT")).rejects.toThrow()
})
