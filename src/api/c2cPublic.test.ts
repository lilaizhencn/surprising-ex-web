import { beforeEach, describe, expect, it, vi } from "vitest"
import type { z } from "zod"

const fixture = vi.hoisted(() => ({
  value: {} as unknown,
  calls: [] as { path: string; options: unknown }[],
}))
vi.mock("./client", () => ({
  request: vi.fn(async (path: string, schema: z.ZodType, options: unknown) => {
    fixture.calls.push({ path, options })
    return schema.parse(fixture.value)
  }),
}))

import { c2cPublicMarkets, c2cPublicOffers } from "./c2cTrading"

const uuid = "11111111-1111-4111-8111-111111111111"
const market = {
  marketId: uuid,
  asset: "USDT",
  fiat: "CNY",
  assetScale: "100000000",
  minFiat: "1",
  maxFiat: "100000",
  paymentWindowSeconds: 900,
}
const ad = {
  adId: uuid,
  makerUserId: "9007199254740993",
  market,
  side: "SELL",
  price: "6.650000000000000001",
  availableQuantity: "10",
  minFiat: "1",
  maxFiat: "100",
  revision: "1",
  status: "ACTIVE",
  methodCodes: ["BANK"],
}
const filters = {
  marketId: uuid,
  side: "BUY" as const,
  amount: "1.00000001",
  methodCode: "BANK",
  offset: 0,
}
beforeEach(() => {
  fixture.calls.length = 0
})
describe("public C2C discovery", () => {
  it("uses public reads with cancellation and preserves exact amounts without a private owner", async () => {
    const abort = new AbortController()
    fixture.value = { items: [ad], hasMore: false, offset: 0 }
    expect((await c2cPublicOffers(filters, abort.signal)).items[0]?.price).toBe(ad.price)
    const url = new URL(fixture.calls[0]?.path ?? "", "https://example.test")
    expect(url.searchParams.get("amount")).toBe(filters.amount)
    expect(fixture.calls[0]?.options).toEqual({ signal: abort.signal })
  })
  it("rejects detached market, direction, status and page responses", async () => {
    for (const value of [
      { ...ad, side: "BUY" },
      { ...ad, status: "PAUSED" },
      { ...ad, market: { ...market, marketId: "22222222-2222-4222-8222-222222222222" } },
    ]) {
      fixture.value = { items: [value], hasMore: false, offset: 0 }
      await expect(c2cPublicOffers(filters)).rejects.toThrow()
    }
    fixture.value = { items: [ad], hasMore: false, offset: 20 }
    await expect(c2cPublicOffers(filters)).rejects.toThrow()
  })
  it("rejects incomplete, duplicate or oversized offer pages rather than displaying an empty success", async () => {
    for (const value of [
      { items: [] },
      { items: [ad, ad], hasMore: false, offset: 0 },
      { items: Array(21).fill(ad), hasMore: false, offset: 0 },
    ]) {
      fixture.value = value
      await expect(c2cPublicOffers(filters)).rejects.toThrow()
    }
  })
  it("uses the same validated market catalog for public and signed-in entry points", async () => {
    fixture.value = { markets: [market], paymentMethods: [] }
    expect((await c2cPublicMarkets()).markets[0]?.asset).toBe("USDT")
    fixture.value = { markets: [market, market], paymentMethods: [] }
    await expect(c2cPublicMarkets()).rejects.toThrow()
  })
})
