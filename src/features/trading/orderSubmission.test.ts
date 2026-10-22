import { beforeEach, describe, expect, it, vi } from "vitest"
import { placeBatchTriggerOrders, placeOrder, placeTriggerOrder } from "../../api/endpoints"
import { mapMarket } from "../../api/mappers"
import type { Market, ProductLine } from "../../types/domain"
import { PRODUCT_LINES } from "../../types/domain"
import {
  type OrderAccount,
  type OrderTicket,
  prepareOrderSubmission,
  submitPreparedOrder,
} from "./orderSubmission"

vi.mock("../../api/endpoints", () => ({
  placeOrder: vi.fn(),
  placeTriggerOrder: vi.fn(),
  placeBatchTriggerOrders: vi.fn(),
}))

const scales = { BTC: "100000000", USDT: "100000000", USD: "100000000" }
const account: OrderAccount = {
  userId: "9007199254740993",
  ready: true,
  balance: { asset: "USDT", availableUnits: "1000000000000000000" },
  positions: [],
  settings: { marginMode: "CROSS", positionMode: "ONE_WAY", positionSide: "NET" },
  leverageReady: true,
}
const ticket: OrderTicket = {
  side: "BUY",
  orderType: "LIMIT",
  ticketAction: "OPEN",
  quantity: "2",
  price: "100",
  useBbo: false,
  bboPriceMode: "OPPONENT_1",
  spotTimeInForce: "GTC",
  triggerPrice: "90",
  triggerType: "STOP_LOSS",
  triggerPriceSource: "MARK",
  triggerExecutionType: "MARKET",
  protectionMode: "SINGLE",
  takeProfitTriggerPrice: "110",
  takeProfitLimitPrice: "109",
  takeProfitExecutionType: "MARKET",
}
function market(line: ProductLine): Market {
  return {
    instrumentId: "123",
    productLine: line,
    symbol: "BTC-USDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    price: 100,
    change24h: null,
    volume24h: null,
    high24h: null,
    low24h: null,
    pricePrecision: 4,
    quantityPrecision: 2,
    maxLeverage: 10,
    quantityStepUnits: "1000000",
    priceTickUnits: "10000",
    status: "TRADING",
    expiryTime: "2099-01-01T00:00:00Z",
  }
}
function prepare(
  line: ProductLine,
  draft: Partial<OrderTicket> = {},
  owner: Partial<OrderAccount> = {},
  selected: Partial<Market> = {},
) {
  return prepareOrderSubmission(
    {
      current: { ...market(line), ...selected },
      productLine: line,
      assetScales: scales,
      referencePrice: 100,
    },
    { ...account, ...owner },
    { ...ticket, ...draft },
    "receipt-identity",
  )
}
const longPosition = {
  instrumentId: "123",
  marginMode: "CROSS",
  positionSide: "NET",
  signedQuantitySteps: "3",
}

describe("exact order request construction", () => {
  it.each(Object.values(PRODUCT_LINES))(
    "rejects %s submission when the prior account view is no longer ready",
    (line) => {
      expect(() =>
        prepare(
          line,
          { quantity: line === "SPOT" ? "0.02" : "2" },
          { ready: false, positions: [longPosition] },
        ),
      ).toThrow("Account syncing")
      if (line !== "SPOT")
        expect(() =>
          prepare(
            line,
            { side: "SELL", orderType: "STOP" },
            { ready: false, positions: [longPosition] },
          ),
        ).toThrow("Account syncing")
      expect(placeOrder).not.toHaveBeenCalled()
      expect(placeTriggerOrder).not.toHaveBeenCalled()
    },
  )

  it.each(Object.values(PRODUCT_LINES))("preserves %s route and integer units", (line) => {
    const request = prepare(line, { quantity: line === "SPOT" ? "0.02" : "2" })
    expect(request.productLine).toBe(line)
    expect(request.kind).toBe("order")
    expect(request.body).toMatchObject({
      userId: "9007199254740993",
      instrumentId: "123",
      clientOrderId: "web-receipt-identity",
      priceTicks: "1000000",
      quantitySteps: "2",
      reduceOnly: false,
      positionSide: "NET",
    })
  })
  it("keeps a tick beyond the JavaScript safe integer range exact", () => {
    const request = prepare(
      "SPOT",
      { price: "90071992.54740993", quantity: "0.00000001" },
      {},
      { priceTickUnits: "1", quantityStepUnits: "1" },
    )
    expect(request.body["priceTicks"]).toBe("9007199254740993")
    expect(request.body["quantitySteps"]).toBe("1")
  })
  it("rejects spot fractions smaller than a step and fractional derivative contracts", () => {
    expect(() => prepare("SPOT", { quantity: "0.001" })).toThrow()
    expect(() => prepare("LINEAR_PERPETUAL", { quantity: "0.5" })).toThrow()
  })
  it("rejects missing precision, invalid quantity, unavailable leverage and inadequate balance", () => {
    expect(() => prepare("SPOT", {}, {}, { quantityStepUnits: undefined })).toThrow()
    expect(() => prepare("SPOT", { quantity: "NaN" })).toThrow()
    expect(() => prepare("LINEAR_PERPETUAL", {}, { leverageReady: false })).toThrow()
    expect(() =>
      prepare("SPOT", { quantity: "0.02" }, { balance: { asset: "USDT", availableUnits: "1" } }),
    ).toThrow()
  })
  it("rejects unknown and conflicting backend identities again when preparing an order", () => {
    const wire = {
      instrumentId: "123",
      symbol: "BTC-USDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      status: "TRADING",
    }
    for (const metadata of [
      { contractType: "FUTURE_LINEAR_DELIVERY" },
      { productLine: "SPOT", contractType: "INVERSE_PERPETUAL" },
      { productLine: "SPOT", contractType: "SPOT", instrumentType: "PERPETUAL" },
      { productLine: "SPOT" },
    ]) {
      const selected = mapMarket({ ...wire, ...metadata })
      expect(selected.productLine).toBe("UNKNOWN")
      expect(() => prepare("SPOT", {}, {}, selected)).toThrow()
    }
  })
  it("never admits a market from another product's page", () => {
    expect(() => prepare("SPOT", {}, {}, { productLine: "LINEAR_PERPETUAL" })).toThrow()
    expect(() => prepare("SPOT", {}, {}, { productLine: "UNKNOWN" })).toThrow()
  })
  it("preserves post-only and server-selected BBO price semantics", () => {
    const request = prepare("SPOT", {
      quantity: "0.02",
      useBbo: true,
      bboPriceMode: "SAME_SIDE_5",
      price: "",
      spotTimeInForce: "GTX",
    })
    expect(request.body).toMatchObject({
      priceTicks: 0,
      bboPriceMode: "SAME_SIDE_5",
      postOnly: true,
      timeInForce: "GTX",
    })
  })
  it("bounds direct closes by the selected position, including settling delivery", () => {
    const request = prepare(
      "LINEAR_DELIVERY",
      { side: "SELL", ticketAction: "CLOSE" },
      { positions: [longPosition], leverageReady: false },
      { status: "SETTLING" },
    )
    expect(request.body).toMatchObject({ side: "SELL", reduceOnly: true, quantitySteps: "2" })
    expect(() => prepare("LINEAR_DELIVERY", {}, {}, { status: "SETTLING" })).toThrow()
    expect(() =>
      prepare(
        "LINEAR_PERPETUAL",
        { side: "SELL", ticketAction: "CLOSE", quantity: "4" },
        { positions: [longPosition] },
      ),
    ).toThrow()
  })
  it("uses the actual short owner for a hedge close", () => {
    const request = prepare(
      "INVERSE_PERPETUAL",
      { side: "BUY", ticketAction: "CLOSE" },
      {
        settings: { marginMode: "ISOLATED", positionMode: "HEDGE", positionSide: "SHORT" },
        positions: [
          {
            instrumentId: "123",
            marginMode: "ISOLATED",
            positionSide: "SHORT",
            signedQuantitySteps: "-3",
          },
        ],
      },
    )
    expect(request.body).toMatchObject({
      marginMode: "ISOLATED",
      positionSide: "SHORT",
      reduceOnly: true,
    })
  })
})

describe("position protection requests", () => {
  it.each(Object.values(PRODUCT_LINES).filter((line) => line !== "SPOT"))(
    "builds %s protection with a stable identity",
    (line) => {
      const request = prepare(
        line,
        { side: "SELL", orderType: "STOP" },
        { positions: [longPosition] },
      )
      expect(request.kind).toBe("trigger")
      expect(request.body).toMatchObject({
        clientTriggerOrderId: "web-trigger-receipt-identity",
        triggerPriceTicks: "900000",
        priceTicks: 0,
        quantitySteps: "2",
        timeInForce: "IOC",
        positionSide: "NET",
      })
    },
  )
  it("rejects a trigger that opens instead of reducing, or exceeds the position", () => {
    expect(() =>
      prepare("LINEAR_PERPETUAL", { orderType: "STOP" }, { positions: [longPosition] }),
    ).toThrow()
    expect(() =>
      prepare(
        "LINEAR_PERPETUAL",
        { side: "SELL", orderType: "STOP", quantity: "4" },
        { positions: [longPosition] },
      ),
    ).toThrow()
    expect(() => prepare("LINEAR_PERPETUAL", { side: "SELL", orderType: "STOP" })).toThrow()
  })
  it("builds one atomic OCO request with linked, distinct receipt identities", () => {
    const request = prepare(
      "OPTION",
      { side: "SELL", orderType: "STOP", protectionMode: "OCO", takeProfitExecutionType: "LIMIT" },
      { positions: [longPosition] },
    )
    expect(request.kind).toBe("oco")
    expect(request.body["atomic"]).toBe(true)
    const legs = request.body["orders"] as readonly Record<string, unknown>[]
    expect(legs).toHaveLength(2)
    expect(legs[0]).toMatchObject({
      triggerType: "TAKE_PROFIT",
      triggerPriceTicks: "1100000",
      priceTicks: "1090000",
      clientTriggerOrderId: "web-tp-receipt-identity",
      ocoGroupId: "web-oco-receipt-identity",
    })
    expect(legs[1]).toMatchObject({
      triggerType: "STOP_LOSS",
      clientTriggerOrderId: "web-trigger-receipt-identity",
      ocoGroupId: "web-oco-receipt-identity",
    })
    expect(() =>
      prepare(
        "OPTION",
        { side: "SELL", orderType: "STOP", protectionMode: "OCO", takeProfitTriggerPrice: "80" },
        { positions: [longPosition] },
      ),
    ).toThrow()
  })
})

describe("submission receipt semantics", () => {
  beforeEach(() => vi.resetAllMocks())
  it.each(["PENDING_RESERVE", "ACCEPTED", "PARTIALLY_FILLED", "FILLED"] as const)(
    "accepts ordinary %s receipts",
    async (status) => {
      vi.mocked(placeOrder).mockResolvedValue({ orderId: "456", status })
      const request = prepare("LINEAR_PERPETUAL")
      expect((await submitPreparedOrder(request)).accepted).toBe(true)
      expect(placeOrder).toHaveBeenCalledWith(request.body, request.productLine)
    },
  )
  it("does not claim a rejected/unknown terminal state succeeded", async () => {
    vi.mocked(placeOrder).mockResolvedValue({
      orderId: "456",
      status: "REJECTED",
      rejectReason: "INVALID_COMMAND",
    })
    expect((await submitPreparedOrder(prepare("SPOT"))).accepted).toBe(false)
    vi.mocked(placeOrder).mockResolvedValue({ orderId: "456", status: "CANCELED" })
    expect((await submitPreparedOrder(prepare("SPOT"))).accepted).toBe(false)
  })
  it("does not convert an indeterminate network result into a rejection or resend", async () => {
    const unknown = new Error("connection closed before receipt")
    vi.mocked(placeOrder).mockRejectedValue(unknown)
    await expect(submitPreparedOrder(prepare("SPOT"))).rejects.toBe(unknown)
    expect(placeOrder).toHaveBeenCalledTimes(1)
  })
  it("accepts pending protection, and rejects a failed trigger receipt", async () => {
    const command = prepare(
      "LINEAR_PERPETUAL",
      { side: "SELL", orderType: "STOP" },
      { positions: [longPosition] },
    )
    const receipt = {
      triggerOrderId: "456",
      instrumentId: "123",
      side: "SELL" as const,
      triggerType: "STOP_LOSS" as const,
      triggerPriceTicks: "900000",
      orderType: "MARKET" as const,
      timeInForce: "IOC" as const,
      priceTicks: "0",
      quantitySteps: "2",
      status: "PENDING" as const,
    }
    vi.mocked(placeTriggerOrder).mockResolvedValue(receipt)
    expect((await submitPreparedOrder(command)).accepted).toBe(true)
    expect(placeTriggerOrder).toHaveBeenCalledWith(command.body, command.productLine)
    vi.mocked(placeTriggerOrder).mockResolvedValue({
      ...receipt,
      status: "TRIGGER_FAILED",
      rejectReason: "INVALID_COMMAND",
    })
    expect((await submitPreparedOrder(command)).accepted).toBe(false)
  })
  it("requires both atomic OCO legs to be accepted", async () => {
    vi.mocked(placeBatchTriggerOrders).mockResolvedValue({ completed: 1, failed: 1 })
    const command = prepare(
      "LINEAR_PERPETUAL",
      { side: "SELL", orderType: "STOP", protectionMode: "OCO" },
      { positions: [longPosition] },
    )
    await expect(submitPreparedOrder(command)).rejects.toThrow()
    vi.mocked(placeBatchTriggerOrders).mockResolvedValue({ completed: 2, failed: 0 })
    expect((await submitPreparedOrder(command)).accepted).toBe(true)
  })
})
