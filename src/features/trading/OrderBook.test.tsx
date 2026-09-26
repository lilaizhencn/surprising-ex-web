import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { OrderBook } from "./TradePage"

describe("empty order book layout", () => {
  it("keeps both headers and the latest trade before the first snapshot and after an empty snapshot", () => {
    for (const book of [null, { bids: [], asks: [], sequence: "1" }]) {
      const html = renderToStaticMarkup(
        createElement(OrderBook, {
          book,
          latestTrade: { price: "65000.12", side: "BUY" },
          depth: 50,
          precision: 1,
          priceStep: 0.01,
          dollar: true,
          baseAsset: "BTC",
          quoteAsset: "USDT",
          onDepthChange: () => {},
          onPrecisionChange: () => {},
        }),
      )
      expect(html.match(/class="order-book-columns"/g)).toHaveLength(2)
      expect(html).toContain('class="order-book-sides"')
      expect(html).toContain('class="order-book-last-trade"')
      expect(html).toContain("65,000.12")
      expect(html).toContain("价格 (USDT)")
      expect(html).toContain("数量 (BTC)")
      expect(html).toContain("合计 (BTC)")
      expect(html).not.toContain("Order book data is not available")
    }
  })
})

it("accumulates from the best price before reversing asks and uses exact decimal amounts", () => {
  const html = renderToStaticMarkup(
    createElement(OrderBook, {
      book: {
        bids: [
          ["100", "0.1"],
          ["99", "0.2"],
        ],
        asks: [
          ["101", "0.000001"],
          ["102", "0.000002"],
        ],
      },
      latestTrade: null,
      depth: 50,
      precision: 1,
      priceStep: 0.01,
      dollar: true,
      baseAsset: "BTC",
      quoteAsset: "USDT",
      onDepthChange: () => {},
      onPrecisionChange: () => {},
    }),
  )
  expect(html).toContain('title="0.3"')
  expect(html).toContain('title="0.000003"')
  expect(html.indexOf('title="0.000003"')).toBeLessThan(html.indexOf('title="0.000001"'))
  expect(html).not.toContain("0.30000000000000004")
})
