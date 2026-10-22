import { describe, expect, it, vi } from "vitest"
import {
  AccountLedgerEntrySchema,
  AccountLedgerPageSchema,
  AuthSessionSchema,
  DepositAddressSchema,
  FundingPaymentPageSchema,
  FundingPaymentSchema,
  FundingRatePageSchema,
  JwtPrincipalSchema,
  OrderBookSchema,
  OrderSubmissionSchema,
  PositionRiskListSchema,
  PositionSchema,
  ProductTransferRecordPageSchema,
  ProductTransferRecordSchema,
  TriggerOrderQuerySchema,
  UserSchema,
} from "./types"

describe("gateway financial response schemas", () => {
  it("accepts the backend ledger, transfer, and funding payment shapes", () => {
    expect(
      AccountLedgerEntrySchema.safeParse({
        entryId: 1,
        userId: 42,
        asset: "USDT",
        amountUnits: 100,
        balanceAfterUnits: 100,
        referenceType: "TRANSFER",
        createdAt: "2026-08-12T00:00:00Z",
      }).success,
    ).toBe(true)
    expect(
      ProductTransferRecordSchema.safeParse({
        transferId: 1,
        userId: 42,
        sourceAccountType: "FUNDING",
        targetAccountType: "SPOT",
        asset: "USDT",
        amountUnits: 100,
        status: "COMPLETED",
        createdAt: "2026-08-12T00:00:00Z",
      }).success,
    ).toBe(true)
    expect(
      FundingPaymentSchema.safeParse({
        paymentId: 1,
        settlementId: 2,
        userId: 42,
        instrumentId: "BTCUSDT",
        asset: "USDT",
        marginMode: "CROSS",
        positionSide: "NET",
        signedQuantitySteps: 1,
        notionalUnits: 100,
        fundingRatePpm: 10,
        amountUnits: 1,
        createdAt: "2026-08-12T00:00:00Z",
      }).success,
    ).toBe(true)
  })

  it("keeps committed final rates when old prediction components were not retained", () => {
    const rate = {
      instrumentId: "604",
      sequence: "123456",
      fundingRatePpm: "100",
      premiumRatePpm: null,
      interestRatePpm: null,
      fundingIntervalHours: null,
      fundingTime: "2026-10-08T16:00:00Z",
      eventTime: "2026-10-08T16:00:01Z",
      status: "FINAL",
    }
    const page = {
      count: 1,
      rates: [rate],
      nextCursor: null,
      hasMore: false,
      sort: "eventTime.desc",
      limit: 100,
    }
    const parsed = FundingRatePageSchema.parse(page)
    expect(parsed.rates[0]?.fundingRatePpm).toBe("100")
    expect(parsed.rates[0]?.premiumRatePpm).toBeNull()
    expect(
      FundingRatePageSchema.safeParse({ ...page, rates: [{ ...rate, fundingRatePpm: null }] })
        .success,
    ).toBe(false)
  })

  it("rejects a ledger row without its accounting fields", () => {
    expect(AccountLedgerEntrySchema.safeParse({ entryId: 1, asset: "USDT" }).success).toBe(false)
  })

  it("rejects empty pagination responses at the API boundary", () => {
    expect(AccountLedgerPageSchema.safeParse({}).success).toBe(false)
    expect(ProductTransferRecordPageSchema.safeParse({}).success).toBe(false)
    expect(FundingPaymentPageSchema.safeParse({}).success).toBe(false)
    expect(FundingRatePageSchema.safeParse({}).success).toBe(false)
  })

  it("rejects a custody address response without an address", () => {
    expect(DepositAddressSchema.safeParse({ status: "PENDING" }).success).toBe(false)
  })

  it("requires an order id and known status before showing submission success", () => {
    expect(OrderSubmissionSchema.safeParse({}).success).toBe(false)
    expect(OrderSubmissionSchema.safeParse({ orderId: "1001", status: "ACCEPTED" }).success).toBe(
      true,
    )
    expect(OrderSubmissionSchema.safeParse({ orderId: "1001", status: "REJECTED" }).success).toBe(
      true,
    )
    expect(
      OrderSubmissionSchema.parse({
        outcome: "TERMINAL",
        result: { orderId: "1286349972006421045", status: "ACCEPTED" },
      }).orderId,
    ).toBe("1286349972006421045")
  })

  it("accepts the trigger order response used by the trading ticket", () => {
    const result = TriggerOrderQuerySchema.safeParse({
      count: 1,
      orders: [
        {
          triggerOrderId: 7001,
          userId: 42,
          instrumentId: "BTCUSDT_PERP",
          side: "SELL",
          triggerType: "STOP_LOSS",
          triggerCondition: "LESS_OR_EQUAL",
          triggerPriceTicks: "6400000000",
          orderType: "MARKET",
          timeInForce: "IOC",
          priceTicks: 0,
          quantitySteps: "100000",
          status: "PENDING",
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.orders[0]?.triggerPriceTicks).toBe("6400000000")
      expect(result.data.orders[0]?.quantitySteps).toBe("100000")
    }
  })

  it("accepts REST tuple and WebSocket native order-book levels", () => {
    expect(
      OrderBookSchema.safeParse({
        instrumentId: "BTC-USDT",
        sequence: "12",
        depth: 50,
        bids: [["64000.00", "1.5"]],
        asks: [["64001.00", "2.0"]],
      }).success,
    ).toBe(true)
    expect(
      OrderBookSchema.safeParse({
        instrumentId: "BTC-USDT",
        sequence: 13,
        previousSequence: 12,
        updateType: "SNAPSHOT",
        bids: [{ priceTicks: "6400000", quantitySteps: "150", orderCount: 2 }],
        asks: [{ priceTicks: "6400100", quantitySteps: "200", orderCount: 1 }],
      }).success,
    ).toBe(true)
  })
})

it("accepts a depth baseline without a predecessor and zero-quantity removal deltas", () => {
  expect(
    OrderBookSchema.safeParse({
      updateType: "SNAPSHOT",
      sequence: "1",
      previousSequence: null,
      depth: 50,
      bids: [],
      asks: [],
    }).success,
  ).toBe(true)
  expect(
    OrderBookSchema.safeParse({
      updateType: "DELTA",
      sequence: "2",
      previousSequence: "1",
      depth: 50,
      bids: [{ priceTicks: 100, quantitySteps: 0, orderCount: 0 }],
      asks: [],
    }).success,
  ).toBe(true)
})

describe("position risk response", () => {
  const risk = {
    instrumentId: "604",
    marginMode: "CROSS",
    positionSide: "NET",
    signedQuantitySteps: 180,
    entryPriceTicks: 835866,
    liquidationPriceTicks: 281913,
  }
  it("accepts risk snapshots without realized PnL and preserves the liquidation price", () => {
    expect(
      PositionRiskListSchema.parse({ positions: [risk] }).positions[0]?.liquidationPriceTicks,
    ).toBe("281913")
    expect(PositionSchema.safeParse(risk).success).toBe(false)
  })
  it("distinguishes an explicit absent boundary from a malformed response", () => {
    expect(
      PositionRiskListSchema.parse({ positions: [{ ...risk, liquidationPriceTicks: null }] })
        .positions[0]?.liquidationPriceTicks,
    ).toBeNull()
    expect(PositionRiskListSchema.safeParse({}).success).toBe(false)
    expect(
      PositionRiskListSchema.safeParse({ positions: [{ ...risk, liquidationPriceTicks: "bad" }] })
        .success,
    ).toBe(false)
  })
})

describe("HTTP user identity boundaries", () => {
  const principal = { status: "ACTIVE", roles: [], expiresAt: "2026-12-31T00:00:00Z" }
  it("retains the wire type of valid positive int64 identities", () => {
    for (const userId of [
      1,
      Number.MAX_SAFE_INTEGER,
      "1",
      "9007199254740993",
      "9223372036854775807",
    ]) {
      expect(UserSchema.parse({ userId }).userId).toBe(userId)
      expect(JwtPrincipalSchema.parse({ ...principal, userId }).userId).toBe(userId)
      expect(AuthSessionSchema.parse({ accessToken: "token", user: { userId } }).user.userId).toBe(
        userId,
      )
    }
  })
  it("rejects noncanonical, unsafe and oversized identities without BigInt conversion", () => {
    const convert = vi.spyOn(globalThis, "BigInt")
    try {
      for (const userId of [
        0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        "0",
        "01",
        "-1",
        "1.0",
        "1e3",
        " 1",
        "9223372036854775808",
        "9".repeat(4 * 1024 * 1024),
      ]) {
        expect(UserSchema.safeParse({ userId }).success).toBe(false)
        expect(JwtPrincipalSchema.safeParse({ ...principal, userId }).success).toBe(false)
        expect(
          AuthSessionSchema.safeParse({ accessToken: "token", user: { userId } }).success,
        ).toBe(false)
      }
      expect(convert).not.toHaveBeenCalled()
    } finally {
      convert.mockRestore()
    }
  })
})
