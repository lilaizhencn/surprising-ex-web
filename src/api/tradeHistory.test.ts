import { afterEach, expect, it, vi } from "vitest"
import { request } from "./client"
import { loadMyTrades } from "./endpoints"

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)
const fill = {
  tradeId: "SPOT:100:1:9007199254740993:0",
  productLine: "SPOT",
  instrumentId: "868",
  orderId: "9007199254740993",
  side: "SELL",
  positionSide: "NET",
  liquidityRole: "MAKER",
  priceTicks: "12345",
  quantitySteps: "25",
  feeRatePpm: "-100",
  eventTime: "2026-10-20T00:00:00Z",
}
const page = () => ({
  userId: "1",
  productLine: "SPOT",
  count: 1,
  trades: [fill],
  hasMore: false,
  nextCursor: null,
  sort: "eventTime.desc",
  limit: 100,
})
afterEach(() => vi.resetAllMocks())
it("uses the authenticated realtime fill route and retains exact order identity and maker rate", async () => {
  send.mockResolvedValue(page())
  const result = await loadMyTrades(1, "868", "SPOT")
  expect(send.mock.calls[0]?.[0]).toContain("/api/v1/gateway/trading/trades?")
  expect(send.mock.calls[0]?.[2]).toMatchObject({
    expectedUserId: "1",
    productLine: "SPOT",
    retry: 0,
  })
  expect(result).toMatchObject({
    count: 1,
    trades: [{ orderId: "9007199254740993", feeRatePpm: "-100" }],
  })
})
it.each(["user", "product", "cursor"])(
  "refuses an unrelated %s page instead of showing empty success",
  async (mismatch) => {
    send.mockResolvedValue({
      ...page(),
      ...(mismatch === "user"
        ? { userId: "2" }
        : mismatch === "product"
          ? { productLine: "OPTION" }
          : { hasMore: true }),
    })
    await expect(loadMyTrades(1, "868", "SPOT")).rejects.toThrow()
  },
)
