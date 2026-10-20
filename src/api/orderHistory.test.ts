import { afterEach, expect, it, vi } from "vitest"
import { request } from "./client"
import { loadOrderHistory } from "./endpoints"

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  request: vi.fn(),
}))
vi.mock("../state/session", () => ({
  loadSession: () => ({ user: { userId: "1" }, accessToken: "qa" }),
}))
const send = vi.mocked(request)
const row = {
  orderId: "9007199254740993",
  userId: "1",
  clientOrderId: "own-order",
  instrumentId: "868",
  side: "BUY",
  orderType: "LIMIT",
  timeInForce: "GTC",
  priceTicks: "12345",
  quantitySteps: "25",
  executedQuantitySteps: "10",
  remainingQuantitySteps: "15",
  marginMode: "CROSS",
  positionSide: "NET",
  status: "CANCELED",
  cumulativeFeeUnits: "-1",
  averagePriceTicks: "12344.5",
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:01:00Z",
}
const page = () => ({
  count: 1,
  orders: [row],
  nextCursor: "page-2",
  hasMore: true,
  sort: "updatedAt.desc",
  limit: 100,
})
afterEach(() => vi.resetAllMocks())
it("retains realtime history pages and the original query cursor with authenticated identity", async () => {
  send.mockResolvedValue(page())
  const result = await loadOrderHistory("868", "SPOT", 1, 2, "original+cursor")
  expect(result).toMatchObject({
    orders: [{ orderId: "9007199254740993" }],
    nextCursor: "page-2",
    hasMore: true,
  })
  const [url, , options] = send.mock.calls[0] ?? []
  expect(String(url)).toContain("cursor=original%2Bcursor")
  expect(String(url)).toContain("startTime=1&endTime=2")
  expect(options).toMatchObject({ productLine: "SPOT", expectedUserId: "1", retry: 0 })
})
it.each(["user", "instrument", "cursor"])("rejects unrelated %s history", async (mismatch) => {
  const value = page()
  if (mismatch === "user") value.orders = [{ ...row, userId: "2" }]
  if (mismatch === "instrument") value.orders = [{ ...row, instrumentId: "869" }]
  if (mismatch === "cursor") value.nextCursor = "original+cursor"
  send.mockResolvedValue(value)
  await expect(
    loadOrderHistory("868", "SPOT", undefined, undefined, "original+cursor"),
  ).rejects.toThrow()
})
