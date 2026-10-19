import { expect, it } from "vitest"
import type { Market } from "../../types/domain"
import { optionChain } from "./OptionMarketPanel"

const selected = {
  productLine: "OPTION",
  instrumentId: "1",
  underlyingInstrumentId: "604",
  underlyingProductLine: "LINEAR_PERPETUAL",
  expiryTime: "2030-01-01T08:00:00Z",
  strikePriceUnits: "9007199254740993",
  optionType: "CALL",
  quoteAsset: "USDT",
  settleAsset: "USDT",
} as Market
it("groups exact strikes and keeps every selectable contract without mixing same-day expiries or underlying identity", () => {
  const chain = optionChain(
    [
      selected,
      { ...selected, instrumentId: "2", optionType: "PUT" },
      { ...selected, instrumentId: "3" },
      { ...selected, instrumentId: "4", strikePriceUnits: "9007199254740992" },
      { ...selected, underlyingProductLine: "SPOT" },
      { ...selected, expiryTime: "2030-01-01T16:00:00Z" },
      { ...selected, settleAsset: "BTC" },
      { ...selected, productLine: "LINEAR_DELIVERY" },
    ],
    selected,
  )
  expect(chain.map((r) => r.strike)).toEqual(["9007199254740992", "9007199254740993"])
  expect(chain[1]?.calls.map((m) => m.instrumentId)).toEqual(["1", "3"])
  expect(chain[1]?.puts.map((m) => m.instrumentId)).toEqual(["2"])
  expect(optionChain([selected], { ...selected, underlyingInstrumentId: undefined })).toEqual([])
})
