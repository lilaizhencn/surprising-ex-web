import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import type { ProductLine } from "../../types/domain"
import { TradingAccountTables } from "./TradingAccountTables"

function panel(productLine: ProductLine, loggedIn = true) {
  return renderToStaticMarkup(
    <TradingAccountTables
      market={null}
      markets={[]}
      productLine={productLine}
      assetScales={{}}
      positions={[]}
      orders={[]}
      triggers={[]}
      account={undefined}
      events={[]}
      loggedIn={loggedIn}
      userId="1"
      onNotice={() => {}}
      commandPending
    />,
  )
}
it("spot offers order views rather than a position tab", () => {
  const html = panel("SPOT")
  expect(html).toContain("Open orders")
  expect(html).toContain("Recent order updates")
  expect(html).not.toContain("Positions (0)")
})
it("delivery preserves its applicable position tab", () => {
  expect(panel("LINEAR_DELIVERY")).toContain("Positions (0)")
})
it("spot login invites account and order access", () => {
  const html = panel("SPOT", false)
  expect(html).toContain("Log in to view account and orders.")
  expect(html).not.toContain("positions.")
})
