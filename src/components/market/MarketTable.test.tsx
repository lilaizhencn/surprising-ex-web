import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { Market } from "../../types/domain"
import { MarketTable } from "./MarketTable"

const sampleMarket: Market = {
  productLine: "LINEAR_PERPETUAL",
  instrumentId: "9007199254740993",
  symbol: "BTC/USDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  price: 1,
  change24h: 0,
  volume24h: 2,
  quoteVolume24h: 3,
  high24h: 1,
  low24h: 1,
  pricePrecision: 8,
  quantityPrecision: 6,
  maxLeverage: null,
}

describe("market prices and units", () => {
  it("keeps tiny prices and instrument precision in the table and mobile cards", () => {
    const html = renderToStaticMarkup(
      <MarketTable
        markets={[{ ...sampleMarket, price: 0.00000001, high24h: 0.00000002, low24h: 0.00000001 }]}
        sort={{ field: "symbol", direction: "asc" }}
        onSort={() => {}}
      />,
    )
    expect(html.match(/0\.00000001/g)?.length).toBeGreaterThanOrEqual(4)
    expect(html).toContain('aria-sort="ascending"')
    expect(html).toContain('aria-pressed="false"')
  })
  it("labels quote-asset turnover without inventing a USD conversion", () => {
    const html = renderToStaticMarkup(
      <MarketTable
        markets={[{ ...sampleMarket, quoteAsset: "BTC", quoteVolume24h: 123.45 }]}
        sort={{ field: "quoteVolume24h", direction: "desc" }}
        onSort={() => {}}
      />,
    )
    expect(html).toContain("123.45")
    expect(html).toContain("BTC")
    expect(html).not.toContain("$123.45")
    expect(html).toContain("24h turnover")
  })
  it("does not round tiny quote-asset turnover down to a false zero", () => {
    const html = renderToStaticMarkup(
      <MarketTable
        markets={[{ ...sampleMarket, price: 10, quoteAsset: "BTC", quoteVolume24h: 0.00000001 }]}
        sort={{ field: "quoteVolume24h", direction: "desc" }}
        onSort={() => {}}
      />,
    )
    expect(html).toContain("0.00000001")
  })
})
