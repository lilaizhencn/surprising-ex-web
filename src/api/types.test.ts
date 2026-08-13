import { describe, expect, it } from "vitest"
import {
  AccountLedgerEntrySchema,
  AccountLedgerPageSchema,
  DepositAddressSchema,
  FundingPaymentPageSchema,
  FundingPaymentSchema,
  FundingRatePageSchema,
  OrderBookSchema,
  OrderSubmissionSchema,
  ProductTransferRecordPageSchema,
  ProductTransferRecordSchema,
  TriggerOrderQuerySchema,
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
        symbol: "BTCUSDT",
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
  })

  it("accepts the trigger order response used by the trading ticket", () => {
    const result = TriggerOrderQuerySchema.safeParse({
      count: 1,
      orders: [
        {
          triggerOrderId: 7001,
          userId: 42,
          symbol: "BTCUSDT_PERP",
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
        symbol: "BTC-USDT",
        sequence: "12",
        depth: 50,
        bids: [["64000.00", "1.5"]],
        asks: [["64001.00", "2.0"]],
      }).success,
    ).toBe(true)
    expect(
      OrderBookSchema.safeParse({
        symbol: "BTC-USDT",
        sequence: 13,
        previousSequence: 12,
        updateType: "SNAPSHOT",
        bids: [{ priceTicks: "6400000", quantitySteps: "150", orderCount: 2 }],
        asks: [{ priceTicks: "6400100", quantitySteps: "200", orderCount: 1 }],
      }).success,
    ).toBe(true)
  })
})
