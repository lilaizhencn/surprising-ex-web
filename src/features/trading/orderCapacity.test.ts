import { describe, expect, it } from "vitest"
import type { Market } from "../../types/domain"
import {
  contractOpeningCapacity,
  deliveryFee,
  orderPositionSide,
  spotAmendmentTerms,
  spotFeeReserve,
  spotOrderQuantity,
  spotReferenceTicks,
} from "./orderCapacity"
import { parseSetting } from "./TradingTicketControls"

describe("linear delivery fee units", () => {
  const delivery = {
    productLine: "LINEAR_DELIVERY",
    quoteAsset: "USDT",
    settleAsset: "USDT",
    priceTickUnits: "10000000",
    notionalMultiplierUnits: "10000",
  } as Market
  it("uses contracts and notional multiplier rather than treating a contract as a whole BTC", () => {
    expect(deliveryFee(delivery, { USDT: "100000000" }, "50000", "1", 500)).toBe("0.025")
    expect(deliveryFee(delivery, { USDT: "100000000" }, "50000", "2", 500)).toBe("0.05")
    expect(deliveryFee(delivery, { USDT: "100000000" }, "50000", "1", 0)).toBe("0")
  })
  it("honors asset scales and rounds fee units upward", () => {
    const small = { ...delivery, priceTickUnits: "1", notionalMultiplierUnits: "1" }
    expect(deliveryFee(small, { USDT: "1000000" }, "0.000001", "1", 1)).toBe("0.000001")
  })
  it("does not invent a fee when precision, reference or whole-contract quantity is missing", () => {
    expect(deliveryFee(delivery, {}, "50000", "1", 500)).toBeNull()
    expect(deliveryFee(delivery, { USDT: "100000000" }, "", "1", 500)).toBeNull()
    expect(deliveryFee(delivery, { USDT: "100000000" }, "50000", "0.5", 500)).toBeNull()
    expect(
      deliveryFee({ ...delivery, productLine: "OPTION" }, { USDT: "100000000" }, "50000", "1", 500),
    ).toBeNull()
  })
})

const market: Market = {
  symbol: "BTC-USDT",
  instrumentId: "1",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  productLine: "LINEAR_PERPETUAL",
  price: null,
  change24h: null,
  volume24h: null,
  high24h: null,
  low24h: null,
  pricePrecision: 1,
  quantityPrecision: 2,
  maxLeverage: null,
  priceTickUnits: "10",
  contractMultiplierPpm: 10000,
  notionalMultiplierUnits: "1",
  minQuantitySteps: "1",
  maxQuantitySteps: "1000",
  maxPositionNotionalUnits: "1000000",
  userOpenInterestLimitFloorUnits: "1000000",
}
const input = {
  market,
  scales: { USDT: "100" },
  availableUnits: "1000",
  referencePrice: "100",
  marginRatePpm: 100000,
  feeRatePpm: 1000,
  positions: [],
  orders: [],
  side: "BUY" as const,
}

const spot = {
  ...market,
  productLine: "SPOT" as const,
  priceTickUnits: "100",
  quantityStepUnits: "10",
  minNotionalUnits: "1",
  maxNotionalUnits: "9223372036854775807",
}
const spotInput = {
  market: spot,
  scales: { BTC: "1000", USDT: "1000" },
  availableUnits: "10000",
  referenceTicks: "1000",
  feeRatePpm: 1000,
  percentage: 100,
  side: "BUY" as const,
}
describe("spot percentage quantity", () => {
  it("displays the same exact fragmented fee reserve used by percentage sizing", () => {
    expect(spotFeeReserve(spot, spotInput.scales, "1000", "0.09", 1000)).toBe("0.009")
    expect(spotFeeReserve(spot, spotInput.scales, "1000", "0.09", undefined)).toBeNull()
  })
  it("reserves fee per step and floors funds before calculating partial percentages", () => {
    expect(spotOrderQuantity(spotInput)).toBe("0.09")
    expect(spotOrderQuantity({ ...spotInput, percentage: 50 })).toBe("0.04")
    expect(spotOrderQuantity({ ...spotInput, availableUnits: "5", referenceTicks: "1" })).toBe(
      "0.02",
    )
    expect(spotOrderQuantity({ ...spotInput, availableUnits: "95", side: "SELL" })).toBe("0.09")
  })
  it("preserves 18-digit asset precision and values above the JavaScript safe integer range", () => {
    expect(
      spotOrderQuantity({
        ...spotInput,
        market: { ...spot, quantityStepUnits: "1", maxQuantitySteps: "9223372036854775807" },
        scales: { BTC: "1000000000000000000" },
        availableUnits: "9007199254740993",
        referenceTicks: "1",
        side: "SELL",
      }),
    ).toBe("0.009007199254740993")
    expect(
      spotOrderQuantity({
        ...spotInput,
        market: { ...spot, quantityStepUnits: "1000000000000000" },
        scales: { BTC: "1000000000000000000", USDT: "1000000" },
        availableUnits: "1000000",
        referenceTicks: "100000",
      }),
    ).toBe("0.009")
  })
  it("obeys order/notional limits and never invents missing metadata", () => {
    expect(spotOrderQuantity({ ...spotInput, market: { ...spot, maxQuantitySteps: "3" } })).toBe(
      "0.03",
    )
    expect(spotOrderQuantity({ ...spotInput, market: { ...spot, maxNotionalUnits: "2000" } })).toBe(
      "0.02",
    )
    expect(
      spotOrderQuantity({ ...spotInput, market: { ...spot, minNotionalUnits: "10001" } }),
    ).toBe("0")
    expect(spotOrderQuantity({ ...spotInput, feeRatePpm: undefined })).toBeNull()
    expect(spotOrderQuantity({ ...spotInput, referenceTicks: null })).toBeNull()
    expect(spotOrderQuantity({ ...spotInput, scales: {} })).toBeNull()
    expect(
      spotOrderQuantity({ ...spotInput, availableUnits: Number.MAX_SAFE_INTEGER + 1 }),
    ).toBeNull()
  })
})
it("uses the selected BBO level and side, and protects MARKET with server slippage", () => {
  const input = {
    market: spot,
    scales: { USDT: "1000" },
    book: {
      bids: ["99", "98", "97", "96", "95"].map((priceTicks) => ({
        priceTicks,
        quantitySteps: "1",
      })),
      asks: ["101", "102", "103", "104", "105"].map((priceTicks) => ({
        priceTicks,
        quantitySteps: "1",
      })),
    },
    price: "100",
    side: "BUY" as const,
    orderType: "LIMIT",
    bboMode: "OPPONENT_5",
    slippagePpm: 10000,
  }
  expect(spotReferenceTicks(input)).toBe("1050")
  expect(spotReferenceTicks({ ...input, side: "SELL" })).toBe("950")
  expect(spotReferenceTicks({ ...input, bboMode: "SAME_SIDE_5" })).toBe("950")
  expect(spotReferenceTicks({ ...input, orderType: "MARKET", bboMode: null })).toBe("1021")
  expect(spotReferenceTicks({ ...input, orderType: "MARKET", bboMode: null, side: "SELL" })).toBe(
    "980",
  )
  expect(spotReferenceTicks({ ...input, book: { bids: [], asks: [] } })).toBeNull()
})
describe("opening capacity", () => {
  it("rounds margin and fee upward in settlement units before dividing available funds", () => {
    expect(contractOpeningCapacity(input)).toBe("9")
    expect(contractOpeningCapacity({ ...input, availableUnits: "100" })).toBe("0")
  })
  it("reserves directional position capacity for existing positions and opening orders", () => {
    expect(
      contractOpeningCapacity({
        ...input,
        market: { ...market, userOpenInterestLimitFloorUnits: "10000" },
        positions: [{ instrumentId: market.instrumentId, signedQuantitySteps: "5" }],
        orders: [
          { instrumentId: market.instrumentId, side: "BUY", remainingQuantitySteps: "3" },
          {
            instrumentId: market.instrumentId,
            side: "BUY",
            remainingQuantitySteps: "9",
            reduceOnly: true,
          },
        ],
      }),
    ).toBe("2")
  })
  it("does not invent capacity for missing fees, invalid tick prices or inverse contracts", () => {
    expect(contractOpeningCapacity({ ...input, feeRatePpm: undefined })).toBeNull()
    expect(contractOpeningCapacity({ ...input, referencePrice: "100.01" })).toBeNull()
    expect(
      contractOpeningCapacity({
        ...input,
        market: { ...market, productLine: "INVERSE_PERPETUAL" },
      }),
    ).toBeNull()
  })
})
it("maps closing sides to the position being reduced", () => {
  expect(orderPositionSide("HEDGE", "OPEN", "BUY")).toBe("LONG")
  expect(orderPositionSide("HEDGE", "OPEN", "SELL")).toBe("SHORT")
  expect(orderPositionSide("HEDGE", "CLOSE", "BUY")).toBe("SHORT")
  expect(orderPositionSide("HEDGE", "CLOSE", "SELL")).toBe("LONG")
  expect(orderPositionSide("ONE_WAY", "CLOSE", "BUY")).toBe("NET")
})
it("requires confirmed valid leverage and margin mode from the server", () => {
  const setting = {
    leveragePpm: 3000000,
    maxLeveragePpm: 10000000,
    initialMarginRatePpm: 333334,
    marginMode: "CROSS",
  }
  expect(parseSetting(setting).leveragePpm).toBe(3000000)
  expect(() => parseSetting({ ...setting, leveragePpm: 11000000 })).toThrow()
  expect(() => parseSetting({ ...setting, initialMarginRatePpm: null })).toThrow()
  expect(() => parseSetting({ ...setting, marginMode: "UNKNOWN" })).toThrow()
})

describe("spot amendment precision", () => {
  const spot = {
    ...market,
    productLine: "SPOT" as const,
    status: "TRADING",
    priceTickUnits: "100",
    quantityStepUnits: "10",
    minNotionalUnits: "1",
    maxNotionalUnits: "9223372036854775807",
  }
  const order = {
    instrumentId: "1",
    orderType: "LIMIT",
    status: "PARTIALLY_FILLED",
    priceTicks: "1000",
    quantitySteps: "10",
    remainingQuantitySteps: "3",
  }
  it("uses a new remaining quantity and exact price steps", () => {
    expect(spotAmendmentTerms(spot, { BTC: "1000", USDT: "1000" }, order, "101.1", "0.02")).toEqual(
      { priceTicks: "1011", quantitySteps: "2" },
    )
  })
  it("rejects unchanged orders, invalid precision, limits, absent metadata and the wrong product", () => {
    for (const [m, price, q] of [
      [spot, "100", "0.03"],
      [spot, "100.01", "0.02"],
      [spot, "100", "0.001"],
      [{ ...spot, maxQuantitySteps: "1" }, "101", "0.02"],
      [{ ...spot, notionalMultiplierUnits: undefined }, "101", "0.02"],
      [{ ...spot, productLine: "LINEAR_DELIVERY" as const }, "101", "0.02"],
    ] as const)
      expect(() => spotAmendmentTerms(m, { BTC: "1000", USDT: "1000" }, order, price, q)).toThrow()
  })
})

describe("inverse delivery settlement-asset estimates", () => {
  const inverse = {
    ...market,
    productLine: "INVERSE_DELIVERY" as const,
    settleAsset: "BTC",
    priceTickUnits: "10000000",
    notionalMultiplierUnits: "100000000000",
    maxQuantitySteps: "100000",
    maxPositionNotionalUnits: "100000000000",
    userOpenInterestLimitFloorUnits: "100000000000",
  }
  const scales = { BTC: "100000000", USDT: "100000000" }
  it("prices whole contracts in BTC with Core HALF_UP notional and upward fee rounding", () => {
    expect(deliveryFee(inverse, scales, "50000", "1", 500)).toBe("0.00001")
    expect(deliveryFee(inverse, scales, "50000", "2", 500)).toBe("0.00002")
    expect(deliveryFee(inverse, scales, "60000", "1", 500)).toBe("0.00000834")
    expect(deliveryFee(inverse, scales, "50000", "0.5", 500)).toBeNull()
    expect(deliveryFee(inverse, { USDT: "100000000" }, "50000", "1", 500)).toBeNull()
  })
  it("uses inverse margin costs and deducts same-side exposure from the BTC cap", () => {
    const params = {
      ...input,
      market: inverse,
      scales,
      availableUnits: "1000000",
      referencePrice: "50000",
      marginRatePpm: 10000,
      feeRatePpm: 500,
    }
    expect(contractOpeningCapacity(params)).toBe("47")
    expect(
      contractOpeningCapacity({
        ...params,
        market: { ...inverse, maxPositionNotionalUnits: "10000000" },
        positions: [{ instrumentId: "1", signedQuantitySteps: "3" }],
        orders: [
          { instrumentId: "1", side: "BUY", remainingQuantitySteps: "1", reduceOnly: false },
        ],
      }),
    ).toBe("1")
    expect(contractOpeningCapacity({ ...params, availableUnits: 9007199254740992 })).toBeNull()
  })
})
