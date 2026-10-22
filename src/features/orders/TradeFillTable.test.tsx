import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import { mapMarket } from "../../api/mappers"
import { TradeFillPageSchema } from "../../api/types"
import { TradeFillTable } from "./TradeFillTable"

const fill = {
  tradeId: "SPOT:100:1:9007199254740993:0",
  productLine: "SPOT",
  instrumentId: "868",
  orderId: "9007199254740993",
  side: "SELL",
  positionSide: "NET",
  liquidityRole: "MAKER",
  priceTicks: "12345",
  quantitySteps: "25",
  feeRatePpm: "-100",
  eventTime: "2026-10-20T00:00:00Z",
}
const market = mapMarket({
  instrumentId: "868",
  symbol: "BTC-USDT",
  productLine: "SPOT",
  contractType: "SPOT",
  instrumentType: "SPOT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  priceTickUnits: "5",
  quantityStepUnits: "20",
})
it("renders exact non-eight-decimal spot prices, base quantity, maker rebate rate and both self-trade roles", () => {
  const html = renderToStaticMarkup(
    <TradeFillTable
      rows={[
        fill,
        {
          ...fill,
          liquidityRole: "TAKER",
          side: "BUY",
          orderId: "9223372036854775807",
          feeRatePpm: "500",
        },
      ]}
      markets={{ "SPOT:868": market }}
      scales={{ BTC: "1000000", USDT: "1000" }}
    />,
  )
  expect(html).toContain("61.725 USDT")
  expect(html).toContain("0.0005 BTC")
  expect(html).toContain("-0.01%")
  expect(html).toContain("9223372036854775807")
  expect(html).toContain("Maker")
  expect(html).toContain("Taker")
  expect(html).not.toContain("takerUserId")
})
it.each([
  { orderId: 9007199254740992 },
  { liquidityRole: "UNKNOWN" },
  { productLine: "OPTION" },
  { feeRatePpm: "1000001" },
])("rejects malformed private execution fields %o", (invalid) => {
  expect(
    TradeFillPageSchema.safeParse({
      userId: 1,
      productLine: "SPOT",
      count: 1,
      trades: [{ ...fill, ...invalid }],
      hasMore: false,
      nextCursor: null,
      sort: "eventTime.desc",
      limit: 100,
    }).success,
  ).toBe(false)
})
