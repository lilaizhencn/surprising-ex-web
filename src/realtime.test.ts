import { describe, expect, it, vi } from "vitest"
import {
  accountEquity,
  integer,
  newerPublicEvent,
  PRODUCTS,
  PrivateView,
  parseRealtimeJson,
  positionValuation,
  privateSubscriptions,
  record,
  rows,
  unwrapEvent,
  type WsEnvelope,
} from "./realtime"

const version = (n: number) => `${String(n).padStart(19, "0")}:0000000000`
const positionDefaults = {
  positionSide: "NET",
  marginMode: "CROSS",
  marginAsset: "USDT",
  entryPriceTicks: 100,
  entryValueTicks: 0,
  realizedPnlUnits: 0,
  positionMarginUnits: 0,
}
const orderDefaults = {
  ...positionDefaults,
  instrumentId: "BTC",
  side: "BUY",
  orderType: "LIMIT",
  timeInForce: "GTC",
  priceTicks: 100,
  quantitySteps: 10,
  executedQuantitySteps: 0,
  remainingQuantitySteps: 10,
  cumulativeFeeUnits: 0,
}
const event = (channel: string, n: number, value: unknown): WsEnvelope => {
  let fullValue = value
  if (channel === "positions")
    fullValue = {
      ...record(value),
      positions: rows(record(value)["positions"]).map((v) => ({ ...positionDefaults, ...v })),
    }
  if (channel === "orders") fullValue = { ...orderDefaults, ...record(value) }
  if (channel === "triggerOrders")
    fullValue = rows(value).map((v) => ({
      ...orderDefaults,
      userId: "1",
      triggerType: "STOP_LOSS",
      triggerPriceTicks: 10,
      activationPriceTicks: 0,
      callbackRatePpm: 0,
      highestPriceTicks: 0,
      lowestPriceTicks: 0,
      ...v,
    }))
  return { op: "event", channel, data: { version: version(n), entityId: "user", value: fullValue } }
}
const snapshot = (n: number, overrides: Record<string, unknown> = {}): WsEnvelope => {
  const account = record(overrides["account"])
  const orderDefaults = {
    instrumentId: "BTC",
    positionSide: "NET",
    marginMode: "CROSS",
    side: "BUY",
    orderType: "LIMIT",
    timeInForce: "GTC",
    priceTicks: 100,
    quantitySteps: 10,
    executedQuantitySteps: 0,
    remainingQuantitySteps: 10,
    cumulativeFeeUnits: 0,
  }
  return {
    op: "snapshot",
    data: {
      status: "READY",
      snapshotVersion: version(n),
      triggerOrders: [],
      positionRisks: [],
      ...overrides,
      account: {
        balances: [],
        reservations: [],
        leverages: [],
        positionMode: "ONE_WAY",
        ...account,
        positions: rows(account["positions"]).map((p) => ({
          positionSide: "NET",
          marginMode: "CROSS",
          marginAsset: "USDT",
          entryPriceTicks: 100,
          entryValueTicks: 0,
          realizedPnlUnits: 0,
          positionMarginUnits: 0,
          ...p,
        })),
      },
      openOrders: rows(overrides["openOrders"]).map((order) => ({ ...orderDefaults, ...order })),
    },
  }
}

describe("private state recovery", () => {
  it("preserves hedge mode across sparse balance updates", () => {
    const view = new PrivateView()
    view.apply(
      snapshot(1, {
        account: {
          positionMode: "HEDGE",
          balances: [],
          reservations: [],
          positions: [],
          leverages: [],
        },
      }),
    )
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
      view.apply(event("orders", 16, { orderId: "9007199254740994", status: "OPEN" }))
      view.apply(snapshot(20))
      view.apply(snapshot(19, { openOrders: [{ orderId: "9007199254740995", status: "OPEN" }] }))
      expect(view.rows("order")).toHaveLength(0)
    })
  it("retains zero balances, removes closed positions and triggered orders", () => {
    const view = new PrivateView()
    view.apply(
      snapshot(1, {
        account: {
          positionMode: "ONE_WAY",
          reservations: [],
          leverages: [],
          balances: [
            { asset: "BTC", availableUnits: 5, lockedUnits: 0 },
            { asset: "USDT", availableUnits: 10, lockedUnits: 0 },
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
    view.apply(
      event("positions", 3, { positions: [{ instrumentId: "BTC", signedQuantitySteps: 1 }] }),
    )
    view.apply(
      event("positions", 5, { positions: [{ instrumentId: "BTC", signedQuantitySteps: 0 }] }),
    )
    view.apply(
      event("positions", 4, { positions: [{ instrumentId: "BTC", signedQuantitySteps: 1 }] }),
    )
    expect(view.rows("position")).toHaveLength(0)
    for (const [index, status] of [
      "TRIGGERED",
      "CANCELED",
      "EXPIRED",
      "TRIGGER_FAILED",
    ].entries()) {
      view.apply(
        event("triggerOrders", 6, [{ triggerOrderId: String(index + 1), status: "PENDING" }]),
      )
      view.apply(event("triggerOrders", 8, [{ triggerOrderId: String(index + 1), status }]))
      view.apply(
        event("triggerOrders", 7, [{ triggerOrderId: String(index + 1), status: "PENDING" }]),
      )
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
it("preserves depth snapshots and absolute deltas including zero removals", () => {
  for (const value of [
    { updateType: "SNAPSHOT", sequence: "1", depth: 50, bids: [], asks: [] },
    {
      updateType: "DELTA",
      sequence: "2",
      previousSequence: "1",
      depth: 50,
      bids: [{ priceTicks: 10, quantitySteps: 0, orderCount: 0 }],
      asks: [],
    },
  ])
    expect(unwrapEvent(event("depth", 2, value)).data).toEqual(value)
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
    instrumentId: "BTC",
    marginAsset: "USDT",
    instrumentChangeId: 1,
    signedQuantitySteps: 2,
    entryPriceTicks: 100,
    realizedPnlUnits: 20,
  }
  view.apply(
    snapshot(1, {
      account: {
        positionMode: "ONE_WAY",
        reservations: [],
        leverages: [],
        balances: [{ asset: "USDT", availableUnits: 1000, lockedUnits: 100 }],
        positions: [p],
      },
    }),
  )
  const markets = [
    {
      instrumentId: "BTC",
      changeId: 1,
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

it("accepts an authoritative depth snapshot after the Core sequence restarts", () => {
  const old = {
    op: "event",
    channel: "depth",
    version: "0000000009000000000:0000000000",
    data: { updateType: "DELTA" },
  }
  const fresh = {
    op: "event",
    channel: "depth",
    version: "0000000000000000001:0000000000",
    data: { updateType: "SNAPSHOT" },
  }
  expect(newerPublicEvent(fresh, old)).toBe(true)
  expect(newerPublicEvent({ ...fresh, data: { updateType: "DELTA" } }, old)).toBe(false)
})

it("uses identical complete account fields for REST snapshots and WS updates", () => {
  const first = new PrivateView(),
    second = new PrivateView()
  const order = {
    ...orderDefaults,
    side: "BUY",
    marginMode: "CROSS",
    positionSide: "NET",
    orderType: "LIMIT",
    timeInForce: "GTC",
    priceTicks: 100,
    quantitySteps: 10,
    orderId: "9007199254740993",
    instrumentId: "BTC-USDT",
    status: "OPEN",
    executedQuantitySteps: "2",
    remainingQuantitySteps: "8",
    cumulativeFeeUnits: "530",
    createdAtEpochMillis: "1790000000000",
    updatedAtEpochMillis: "1790000000500",
  }
  const position = {
    marginMode: "CROSS",
    entryPriceTicks: 100,
    realizedPnlUnits: 0,
    instrumentId: "BTC-USDT",
    positionSide: "NET",
    signedQuantitySteps: "2",
    marginAsset: "USDT",
    positionMarginUnits: "800000",
    entryValueTicks: "10000",
  }
  const leverage = { instrumentId: "BTC-USDT", marginMode: "CROSS", leveragePpm: "3000000" }
  first.apply(
    snapshot(3, {
      account: {
        positionMode: "ONE_WAY",
        reservations: [],
        balances: [],
        positions: [position],
        leverages: [leverage],
      },
      openOrders: [order],
    }),
  )
  second.apply(snapshot(1))
  second.apply(event("orders", 2, order))
  second.apply(event("positions", 2, { positions: [position] }))
  second.apply(event("accountState", 2, { leverages: [leverage] }))
  for (const kind of ["order", "position", "leverage"])
    expect(second.rows(kind)).toEqual(first.rows(kind))
  second.apply(snapshot(1))
  expect(second.rows("order")[0]?.["cumulativeFeeUnits"]).toBe("530")
})

describe("strict account snapshots", () => {
  it("rejects missing account sections without advancing the last valid fence", () => {
    const view = new PrivateView()
    expect(
      view.apply({
        op: "snapshot",
        data: { status: "READY", snapshotVersion: version(9), account: {} },
      }),
    ).toBe(false)
    expect(view.ready()).toBe(false)
    expect(view.fence).toBe("")
  })
  it("rejects invalid money atomically, preserving known balances", () => {
    const view = new PrivateView()
    const account = {
      positionMode: "ONE_WAY",
      balances: [{ asset: "USDT", availableUnits: "10", lockedUnits: "0" }],
      reservations: [],
      positions: [],
      leverages: [],
    }
    const complete = { account, positionRisks: [] }
    expect(view.apply(snapshot(1, complete))).toBe(true)
    const invalid = {
      ...account,
      balances: [{ asset: "USDT", availableUnits: "invalid", lockedUnits: "0" }],
    }
    expect(view.apply(snapshot(2, { ...complete, account: invalid }))).toBe(false)
    expect(view.fence).toBe(version(1))
    expect(view.rows("balance")[0]?.["availableUnits"]).toBe("10")
    expect(view.ready()).toBe(false)
    expect(view.apply(snapshot(2, complete))).toBe(true)
    expect(view.ready()).toBe(true)
  })
})

it("rejects malformed private deltas atomically and requires a new valid snapshot", () => {
  const view = new PrivateView()
  view.apply(
    snapshot(1, {
      account: { balances: [{ asset: "USDT", availableUnits: "10", lockedUnits: "0" }] },
    }),
  )
  expect(
    view.apply(
      event("accountState", 2, {
        balances: [
          { asset: "USDT", availableUnits: "20", lockedUnits: "0" },
          { asset: "BTC", availableUnits: "9223372036854775808", lockedUnits: "0" },
        ],
      }),
    ),
  ).toBe(false)
  expect(view.ready()).toBe(false)
  expect(view.fence).toBe(version(1))
  expect(view.rows("balance")).toEqual([{ asset: "USDT", availableUnits: "10", lockedUnits: "0" }])
  expect(view.apply(snapshot(2))).toBe(true)
  expect(view.ready()).toBe(true)
})

it("rejects duplicate snapshot money rows and validates repeated fences", () => {
  const view = new PrivateView()
  view.apply(snapshot(1))
  const balance = { asset: "USDT", availableUnits: "0", lockedUnits: "0" }
  expect(view.apply(snapshot(1, { account: { balances: [balance, balance] } }))).toBe(false)
  expect(view.ready()).toBe(false)
  expect(view.fence).toBe(version(1))
})

it.each(["9999999999999999999:0000000000", "0000000000000000001:2147483648"])(
  "rejects a fence outside the Core long/int range: %s",
  (fence) => {
    const view = new PrivateView()
    const valid = snapshot(1)
    expect(view.apply({ ...valid, data: { ...record(valid.data), snapshotVersion: fence } })).toBe(
      false,
    )
    expect(view.fence).toBe("")
    expect(view.ready()).toBe(false)
  },
)

it("rejects a nested private entity belonging to another signed-in user", () => {
  const view = new PrivateView()
  const first = snapshot(1)
  view.apply({ ...first, userId: "1", productLine: "SPOT" })
  const next = snapshot(2, {
    account: { balances: [{ asset: "USDT", availableUnits: "1", lockedUnits: "0", userId: "2" }] },
  })
  expect(view.apply({ ...next, userId: "1", productLine: "SPOT" })).toBe(false)
  expect(view.fence).toBe(version(1))
  expect(view.ready()).toBe(false)
})

it("rejects oversized money before BigInt conversion and recovers only on a valid snapshot", () => {
  const view = new PrivateView()
  view.apply(
    snapshot(1, {
      account: { balances: [{ asset: "USDT", availableUnits: "10", lockedUnits: "0" }] },
    }),
  )
  const huge = "9".repeat(1024 * 1024)
  const bigint = vi.spyOn(globalThis, "BigInt")
  try {
    expect(() => integer(huge)).toThrow()
    expect(
      view.apply(
        snapshot(2, {
          account: { balances: [{ asset: "USDT", availableUnits: huge, lockedUnits: "0" }] },
        }),
      ),
    ).toBe(false)
    expect(bigint).not.toHaveBeenCalled()
  } finally {
    bigint.mockRestore()
  }
  expect(view.ready()).toBe(false)
  expect(view.fence).toBe(version(1))
  expect(view.rows("balance")[0]?.["availableUnits"]).toBe("10")
  expect(view.apply(snapshot(2))).toBe(true)
  expect(integer("340282366920938463463374607431768211455")).toBe((1n << 128n) - 1n)
})

it("invalidates a current private baseline when an incoming delta cannot be ordered", () => {
  for (const invalid of [
    "invalid",
    "9223372036854775808:0000000000",
    "0000000000000000001:2147483648",
  ]) {
    const view = new PrivateView()
    view.apply(snapshot(1))
    const fence = view.fence
    const entities = [...view.entities]
    expect(
      view.apply({
        op: "event",
        channel: "accountState",
        data: { version: invalid, entityId: "user", value: { balances: [] } },
      }),
    ).toBe(false)
    expect(view.status).toBe("STALE")
    expect(view.ready()).toBe(false)
    expect(view.fence).toBe(fence)
    expect([...view.entities]).toEqual(entities)
    expect(view.apply(snapshot(2))).toBe(true)
    expect(view.ready()).toBe(true)
  }
})
