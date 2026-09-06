import { describe, expect, it } from "vitest"
import {
  accountEquity,
  newerPublicEvent,
  PRODUCTS,
  PrivateView,
  parseRealtimeJson,
  positionValuation,
  privateSubscriptions,
  record,
  unwrapEvent,
  type WsEnvelope,
} from "./realtime"

const version = (n: number) => `${String(n).padStart(19, "0")}:0000000000`
const event = (channel: string, n: number, value: unknown): WsEnvelope => ({
  op: "event",
  channel,
  data: { version: version(n), entityId: "user", value },
})
const snapshot = (n: number, overrides = {}): WsEnvelope => ({
  op: "snapshot",
  data: {
    status: "READY",
    snapshotVersion: version(n),
    account: { balances: [], positions: [], positionMode: "ONE_WAY" },
    openOrders: [],
    triggerOrders: [],
    ...overrides,
  },
})

describe("private state recovery", () => {
  it("preserves hedge mode across sparse balance updates", () => {
    const view = new PrivateView()
    view.apply(snapshot(1, { account: { positionMode: "HEDGE", balances: [], positions: [] } }))
    view.apply(
      event("accountState", 2, {
        balances: [{ asset: "USDT", availableUnits: "0", lockedUnits: "0" }],
      }),
    )
    expect(view.positionMode).toBe("HEDGE")
  })
  for (const product of PRODUCTS)
    it(`${product}: fences preserve newer updates and terminal tombstones`, () => {
      const view = new PrivateView()
      view.apply(event("orders", 12, { orderId: "9007199254740993", status: "OPEN" }))
      view.apply(snapshot(10))
      expect(view.rows("order")).toHaveLength(1)
      view.apply(event("orders", 14, { orderId: "9007199254740993", status: "FILLED" }))
      view.apply(event("orders", 13, { orderId: "9007199254740993", status: "OPEN" }))
      view.apply(snapshot(11, { openOrders: [{ orderId: "9007199254740993", status: "OPEN" }] }))
      expect(view.rows("order")).toHaveLength(0)
      view.apply(event("orders", 16, { orderId: "other", status: "OPEN" }))
      view.apply(snapshot(20))
      view.apply(snapshot(19, { openOrders: [{ orderId: "old", status: "OPEN" }] }))
      expect(view.rows("order")).toHaveLength(0)
    })
  it("retains zero balances, removes closed positions and triggered orders", () => {
    const view = new PrivateView()
    view.apply(
      snapshot(1, {
        account: {
          balances: [
            { asset: "BTC", availableUnits: 5 },
            { asset: "USDT", availableUnits: 10 },
          ],
          positions: [],
        },
      }),
    )
    view.apply(
      event("accountState", 2, { balances: [{ asset: "BTC", availableUnits: 0, lockedUnits: 0 }] }),
    )
    expect(view.rows("balance")).toHaveLength(2)
    expect(view.rows("balance").find((b) => b["asset"] === "BTC")?.["availableUnits"]).toBe(0)
    view.apply(event("positions", 3, { positions: [{ symbol: "BTC", signedQuantitySteps: 1 }] }))
    view.apply(event("positions", 5, { positions: [{ symbol: "BTC", signedQuantitySteps: 0 }] }))
    view.apply(event("positions", 4, { positions: [{ symbol: "BTC", signedQuantitySteps: 1 }] }))
    expect(view.rows("position")).toHaveLength(0)
    for (const status of ["TRIGGERED", "CANCELED", "EXPIRED", "TRIGGER_FAILED"]) {
      view.apply(event("triggerOrders", 6, [{ triggerOrderId: status, status: "PENDING" }]))
      view.apply(event("triggerOrders", 8, [{ triggerOrderId: status, status }]))
      view.apply(event("triggerOrders", 7, [{ triggerOrderId: status, status: "PENDING" }]))
    }
    expect(view.rows("trigger")).toHaveLength(0)
  })
  it("expires snapshots and treats UNAVAILABLE as non-current", () => {
    const view = new PrivateView()
    expect(view.ready()).toBe(false)
    view.apply(snapshot(1), 1000)
    expect(view.ready(2000)).toBe(true)
    expect(view.ready(16000)).toBe(false)
    view.apply({ op: "snapshot", data: { status: "UNAVAILABLE" } })
    expect(view.ready(2000)).toBe(false)
  })
})

it("preserves 64-bit identifiers without rounding or rewriting string contents", () => {
  const data = record(
    parseRealtimeJson(
      '{"data":{"orderId":9007199254740993,"otherId":9007199254740992,"text":"9007199254740993","price":12.5}}',
    ).data,
  )
  expect(data["orderId"]).toBe("9007199254740993")
  expect(data["orderId"]).not.toBe(data["otherId"])
  expect(data["text"]).toBe("9007199254740993")
  expect(data["price"]).toBe(12.5)
})
it("normalizes full depth snapshots, including empty sides", () => {
  expect(
    record(
      unwrapEvent(
        event("depth", 1, { levels: [{ side: "BUY", priceTicks: 10, quantitySteps: 2 }] }),
      ).data,
    )["asks"],
  ).toEqual([])
  expect(record(unwrapEvent(event("depth", 2, { levels: [] })).data)["bids"]).toEqual([])
})
it("accepts restarted price publishers while rejecting old core book versions", () => {
  expect(
    newerPublicEvent(
      { channel: "mark", version: version(1), eventTime: "2026-01-01T00:00:02Z" },
      { version: version(100), eventTime: "2026-01-01T00:00:01Z" },
    ),
  ).toBe(true)
  expect(
    newerPublicEvent({ channel: "depth", version: version(1) }, { version: version(100) }),
  ).toBe(false)
})
it("subscribes six accounts without obsolete matches", () => {
  const plan = privateSubscriptions(PRODUCTS)
  expect(plan.some((s) => s.channel === "matches")).toBe(false)
  for (const p of PRODUCTS)
    expect(plan.filter((s) => s.productLine === p && s.channel === "accountState")).toHaveLength(1)
})
it("uses integer linear/inverse PnL and signed option market value", () => {
  const p = { signedQuantitySteps: 2, entryPriceTicks: 100 }
  const m = {
    priceTickUnits: 1,
    markPriceTicks: 120,
    notionalMultiplierUnits: 10,
    contractType: "LINEAR_PERPETUAL",
  }
  expect(positionValuation(p, m)).toEqual({ pnl: 400n, value: 400n })
  expect(positionValuation(p, { ...m, contractType: "VANILLA_OPTION" })).toEqual({
    pnl: 400n,
    value: 2400n,
  })
  expect(
    positionValuation({ ...p, signedQuantitySteps: -2 }, { ...m, contractType: "VANILLA_OPTION" }),
  ).toEqual({ pnl: -400n, value: -2400n })
  expect(
    positionValuation(p, { ...m, contractType: "INVERSE_PERPETUAL", settleScaleUnits: 1000 }),
  ).toEqual({ pnl: 33n, value: 33n })
  expect(positionValuation(p, { ...m, contractType: "INVERSE_PERPETUAL" })).toBeNull()
})
it("closing a position does not double-count realized PnL", () => {
  const view = new PrivateView()
  const p = {
    symbol: "BTC",
    marginAsset: "USDT",
    instrumentVersion: 1,
    signedQuantitySteps: 2,
    entryPriceTicks: 100,
    realizedPnlUnits: 20,
  }
  view.apply(
    snapshot(1, {
      account: {
        balances: [{ asset: "USDT", availableUnits: 1000, lockedUnits: 100 }],
        positions: [p],
      },
    }),
  )
  const markets = [
    {
      symbol: "BTC",
      version: 1,
      priceTickUnits: 1,
      notionalMultiplierUnits: 10,
      markPriceTicks: 120,
      contractType: "LINEAR_PERPETUAL",
    },
  ]
  expect(accountEquity(view, markets, "LINEAR_PERPETUAL").balances[0]?.["equityUnits"]).toBe("1500")
  view.apply(event("positions", 2, { positions: [{ ...p, signedQuantitySteps: 0 }] }))
  view.apply(
    event("accountState", 3, {
      balances: [{ asset: "USDT", availableUnits: 1500, lockedUnits: 0 }],
    }),
  )
  expect(accountEquity(view, markets, "LINEAR_PERPETUAL").balances[0]?.["equityUnits"]).toBe("1500")
})
