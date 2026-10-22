import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import { TradeMarketPanel } from "./TradeMarketPanel"

it("keeps the product unit explicit before instrument metadata arrives", () => {
  const render = (productLine: "SPOT" | "LINEAR_PERPETUAL") =>
    renderToStaticMarkup(
      createElement(TradeMarketPanel, {
        current: null,
        productLine,
        assetScales: {},
        book: null,
        recentTrades: [],
        onPriceSelect: () => {},
      }),
    )
  expect(render("SPOT")).toContain("Quantity (—)")
  expect(render("SPOT")).not.toContain("Contracts")
  expect(render("LINEAR_PERPETUAL")).toContain("Quantity (Contracts)")
})
