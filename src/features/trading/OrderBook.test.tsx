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
      expect(html).toContain("Price (USDT)")
      expect(html).toContain("Quantity (BTC)")
      expect(html).toContain("Total (BTC)")
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

it("scales row backgrounds by individual quantity on a shared bid/ask scale", () => {
  const render = (asks: readonly [string, string][]) =>
    renderToStaticMarkup(
      createElement(OrderBook, {
        book: { bids: [["100", "2"]], asks },
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
  const html = render([
    ["101", "1"],
    ["102", "4"],
  ])
  expect(html.match(/class="order-book-row"/g)).toHaveLength(3)
  expect(html).toContain(
    'class="order-book-depth-fill negative" aria-hidden="true" style="transform:scaleX(0.25)"',
  )
  expect(html).toContain(
    'class="order-book-depth-fill negative" aria-hidden="true" style="transform:scaleX(1)"',
  )
  expect(html).toContain(
    'class="order-book-depth-fill positive" aria-hidden="true" style="transform:scaleX(0.5)"',
  )
  expect(render([["101", "2"]])).toContain("transform:scaleX(1)")
  expect(render([["101", "0"]])).not.toContain("scaleX(NaN)")
})

it("preserves adjacent sub-cent and sub-nanocent price levels", () => {
  const html = renderToStaticMarkup(
    createElement(OrderBook, {
      book: {
        bids: [
          ["0.000000000123", "1"],
          ["0.000000000122", "2"],
        ],
        asks: [["0.000000000124", "1"]],
      },
      latestTrade: { price: "0.000000000123", side: "BUY" },
      depth: 50,
      precision: 1,
      priceStep: 1e-12,
      dollar: true,
      baseAsset: "TINY",
      quoteAsset: "USDT",
      onDepthChange: () => {},
      onPrecisionChange: () => {},
    }),
  )
  expect(html).toContain("0.000000000123")
  expect(html).toContain("0.000000000122")
  expect(html).toContain("0.000000000124")
})

it("aggregates only price and preserves fractional base quantities", () => {
  const html = renderToStaticMarkup(
    createElement(OrderBook, {
      book: {
        bids: [
          ["100.11", "0.01"],
          ["100.12", "0.02"],
        ],
        asks: [],
      },
      latestTrade: null,
      depth: 50,
      precision: 1,
      priceStep: 0.1,
      dollar: true,
      baseAsset: "BTC",
      quoteAsset: "USDT",
      onDepthChange: () => {},
      onPrecisionChange: () => {},
    }),
  )
  expect(html).toContain("100.10")
  expect(html).toContain('title="0.03"')
  expect(html).toContain("Price step")
  expect(html).not.toContain("Quantity step")
})
