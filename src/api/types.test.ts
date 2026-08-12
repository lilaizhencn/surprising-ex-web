import { describe, expect, it } from "vitest"
import {
  AccountLedgerEntrySchema,
  AccountLedgerPageSchema,
  DepositAddressSchema,
  FundingPaymentPageSchema,
  FundingPaymentSchema,
  FundingRatePageSchema,
  OrderSubmissionSchema,
  ProductTransferRecordPageSchema,
  ProductTransferRecordSchema,
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
})
