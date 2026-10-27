import { describe, expect, it } from "vitest"
import { responseDeadline } from "../features/c2c/C2cOrderPanel"
import {
  adDetailSchema,
  bondSchema,
  orderDetailSchema,
  orderSchema,
  quoteSchema,
} from "./c2cTrading"

const id = "11111111-1111-4111-8111-111111111111"
const market = {
  marketId: id,
  asset: "USDT",
  fiat: "CNY",
  assetScale: "100000000",
  minFiat: "1",
  maxFiat: "100000",
  paymentWindowSeconds: 900,
}
const order = {
  orderId: id,
  market,
  buyerUserId: "9007199254740993",
  sellerUserId: "2",
  quantity: "0.00000001",
  fiatAmount: "6.650000000000000001",
  price: "6.650000000000000001",
  buyerFeeUnits: "0",
  buyerReceivesUnits: "1",
  paymentExpiresAt: "2030-01-01T00:00:00Z",
  terms: "Synthetic terms",
  status: "PAYMENT_PENDING",
}
describe("C2C business boundaries", () => {
  it("does not treat an incomplete configured bond policy as available or zero", () => {
    expect(
      bondSchema.safeParse({ policy: { configured: false, revision: "0" }, bond: null }).success,
    ).toBe(true)
    for (const policy of [
      { configured: true, revision: "1" },
      { configured: true, revision: "1", asset: "USDT", amount: "0" },
    ])
      expect(bondSchema.safeParse({ policy, bond: null }).success).toBe(false)
  })
  it("requires payment choices in ad details rather than silently rendering an incomplete selection", () => {
    const ad = {
      adId: id,
      makerUserId: "2",
      market,
      side: "SELL",
      price: "6.65",
      availableQuantity: "1",
      minFiat: "1",
      maxFiat: "100",
      revision: "1",
      status: "ACTIVE",
      methodCodes: ["BANK"],
    }
    expect(adDetailSchema.safeParse(ad).success).toBe(false)
    expect(
      adDetailSchema.safeParse({
        ...ad,
        paymentOptions: [{ accountId: id, methodCode: "BANK", maskedLabel: "****1234" }],
      }).success,
    ).toBe(true)
  })
  it("retains exact participant identities and amounts, rejects unknown terminal states and scales", () => {
    expect(orderSchema.parse(order).fiatAmount).toBe("6.650000000000000001")
    for (const value of [
      { ...order, status: "SUCCESS" },
      { ...order, buyerUserId: "9223372036854775808" },
      { ...order, market: { ...market, assetScale: "0" } },
      { ...order, market: { ...market, assetScale: "3" } },
      { ...order, paymentExpiresAt: "invalid" },
    ])
      expect(orderSchema.safeParse(value).success).toBe(false)
  })
  it("requires the order payment snapshot and rejects incomplete or malformed details", () => {
    const details = {
      ...order,
      serverTime: "2026-10-27T00:00:00Z",
      payment: {
        holderName: "Synthetic buyer",
        accountNumber: "123456",
        bankName: null,
        methodCode: "BANK",
        fiat: "CNY",
      },
      events: [],
      appeals: [],
    }
    expect(orderDetailSchema.safeParse(details).success).toBe(true)
    expect(
      orderDetailSchema.safeParse({ ...details, payment: { accountNumber: "123456" } }).success,
    ).toBe(false)
  })
  it("requires quote bindings and clock metadata instead of accepting a detached price", () => {
    const quote = {
      quoteId: id,
      ownerUserId: "9007199254740993",
      adId: id,
      paymentAccountId: id,
      market,
      quantity: "1",
      fiatAmount: "6.65",
      price: "6.65",
      buyerFeeUnits: "0",
      buyerReceivesUnits: "100000000",
      expiresAt: "2030-01-01T00:00:00Z",
      serverTime: "2026-10-27T00:00:00Z",
      valid: true,
    }
    expect(quoteSchema.safeParse(quote).success).toBe(true)
    expect(quoteSchema.safeParse({ ...quote, paymentAccountId: undefined }).success).toBe(false)
  })
  it("expires against server duration and includes elapsed request time conservatively", () => {
    expect(responseDeadline("2026-10-27T00:01:00Z", "2026-10-27T00:00:00Z", 1000)).toBe(61000)
    expect(responseDeadline("2026-10-26T23:59:00Z", "2026-10-27T00:00:00Z", 1000)).toBe(1000)
  })
})
