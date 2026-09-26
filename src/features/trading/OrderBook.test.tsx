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
          onDepthChange: () => {},
          onPrecisionChange: () => {},
        }),
      )
      expect(html.match(/class="order-book-columns"/g)).toHaveLength(2)
      expect(html).toContain('class="order-book-sides"')
      expect(html).toContain('class="order-book-last-trade"')
      expect(html).toContain("65,000.12")
      expect(html).not.toContain("Order book data is not available")
    }
  })
})
