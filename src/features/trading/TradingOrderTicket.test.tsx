import { type ComponentProps, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { AuthSession } from "../../api/types"
import { TradingOrderTicket } from "./TradingOrderTicket"

function render(
  session: AuthSession | null,
  overrides: Partial<ComponentProps<typeof TradingOrderTicket>> = {},
) {
  return renderToStaticMarkup(
    createElement(TradingOrderTicket, {
      current: null,
      productLine: "SPOT",
      session,
      accountReady: true,
      assetScales: {},
      marketQuote: null,
      book: null,
      balances: [],
      positions: [],
      openOrders: [],
      orderSettings: { marginMode: "CROSS", positionMode: "ONE_WAY", positionSide: "NET" },
      onSettingsChange: () => {},
      leverageSetting: null,
      onLeverageChange: () => {},
      pendingCommand: null,
      selectedBookPrice: null,
      onRefresh: () => {},
      onNotice: () => {},
      ...overrides,
    }),
  )
}

describe("order ticket entry points", () => {
  it("routes an authenticated trader to order management", () => {
    const html = render({ accessToken: "test-token", user: { userId: "123" } })
    expect(html).toContain('href="/orders">Manage orders</a>')
    expect(html).not.toContain('href="/auth/login"')
    expect(html).not.toContain("Login required")
  })
  it("keeps sign-in and registration as distinct actions for a guest", () => {
    const html = render(null)
    expect(html).toContain('href="/auth/login">Log in to trade</a>')
    expect(html).toContain('href="/auth/register">Create an account</a>')
    expect(html).toContain("Login required")
  })
})

const signedIn = { accessToken: "test-token", user: { userId: "123" } }
const market = {
  instrumentId: "123",
  productLine: "SPOT" as const,
  symbol: "BTC-USDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  price: 100,
  change24h: null,
  volume24h: null,
  high24h: null,
  low24h: null,
  maxLeverage: null,
  pricePrecision: 2,
  quantityPrecision: 2,
  quantityStepUnits: "1",
  priceTickUnits: "1",
  status: "TRADING",
}
const priorAccount = {
  current: market,
  assetScales: { BTC: "100000000", USDT: "100000000" },
  balances: [{ asset: "USDT", availableUnits: "98765432100000000" }],
}

it("masks a previously known balance and disables new orders after readiness is lost", () => {
  const ready = render(signedIn, { ...priorAccount, accountReady: true })
  expect(ready).toContain("987,654,321")
  const stale = render(signedIn, { ...priorAccount, accountReady: false })
  expect(stale).not.toContain("987,654,321")
  expect(stale).toContain("Account syncing")
  expect(stale.match(/<button[^>]*>Buy BTC<\/button>/)?.[0]).toContain('disabled=""')
})
it("preserves the pending receipt query while the account view is unavailable", () => {
  const stale = render(signedIn, {
    ...priorAccount,
    accountReady: false,
    pendingCommand: {
      userId: "123",
      productLine: "SPOT",
      instrumentId: "123",
      clientOrderId: "original-order",
    },
  })
  expect(stale).toContain("Order result is pending. Do not submit it again.")
  const query = stale.match(/<button[^>]*>Check order result<\/button>/)?.[0]
  expect(query).toBeDefined()
  expect(query).not.toContain("disabled")
  expect(stale.match(/<button[^>]*>Buy BTC<\/button>/)?.[0]).toContain('disabled=""')
})
