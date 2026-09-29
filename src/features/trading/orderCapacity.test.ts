import { describe, expect, it } from "vitest"
import type { Market } from "../../types/domain"
import { linearOpeningCapacity, orderPositionSide } from "./orderCapacity"
import { parseSetting } from "./TradingTicketControls"

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
describe("opening capacity", () => {
  it("rounds margin and fee upward in settlement units before dividing available funds", () => {
    expect(linearOpeningCapacity(input)).toBe("9")
    expect(linearOpeningCapacity({ ...input, availableUnits: "100" })).toBe("0")
  })
  it("reserves directional position capacity for existing positions and opening orders", () => {
    expect(
      linearOpeningCapacity({
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
    expect(linearOpeningCapacity({ ...input, feeRatePpm: undefined })).toBeNull()
    expect(linearOpeningCapacity({ ...input, referencePrice: "100.01" })).toBeNull()
    expect(
      linearOpeningCapacity({ ...input, market: { ...market, productLine: "INVERSE_PERPETUAL" } }),
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
