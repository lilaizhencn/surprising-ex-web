import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, it, vi } from "vitest"
import { useRealtimeAssets } from "../../hooks/useRealtimeAssets"
import { AssetsPage } from "./AssetsPage"

vi.mock("../../hooks/useRealtimeAssets", () => ({ useRealtimeAssets: vi.fn() }))
vi.mock("../../state/session", () => ({
  useSession: () => ({ user: { userId: "1" }, sessionKey: "access" }),
}))
beforeEach(() =>
  vi.mocked(useRealtimeAssets).mockReturnValue({
    balances: [{ accountType: "SPOT", asset: "USDT", available: 0, locked: 0, estimatedUsd: 0 }],
    ready: true,
    valuationUnavailable: false,
    products: ["SPOT"],
    readyProducts: ["SPOT"],
    error: null,
    refresh: vi.fn(),
  }),
)
it("shows a real zero cash balance as zero", () => {
  const html = renderToStaticMarkup(<AssetsPage account="spot" />)
  expect(html.match(/<td class="number mono">0<\/td>/g)).toHaveLength(3)
})
it("keeps the overview size stable while snapshots are still syncing", () => {
  vi.mocked(useRealtimeAssets).mockReturnValue({
    ...vi.mocked(useRealtimeAssets)(null, {}),
    balances: [],
    ready: false,
    products: [],
    readyProducts: [],
    error: "Valuation prices are unavailable or expired.",
  })
  const html = renderToStaticMarkup(<AssetsPage account={null} />)
  expect(html).toContain("asset-value-skeleton")
  expect(html).toContain("asset-distribution-skeleton")
  expect(html).toContain("asset-table-skeleton")
  expect(html).not.toContain("Valuation unavailable")
  expect(html).not.toContain("Valuation prices are unavailable or expired.")
})
it("keeps errors visible when cash data already exists", () => {
  vi.mocked(useRealtimeAssets).mockReturnValue({
    ...vi.mocked(useRealtimeAssets)(null, {}),
    balances: [{ accountType: "SPOT", asset: "USDT", available: 0, locked: 0, estimatedUsd: null }],
    error: "FX unavailable",
  })
  const html = renderToStaticMarkup(<AssetsPage account="spot" />)
  expect(html).toContain("FX unavailable")
  expect(html).toContain("Valuation unavailable")
  expect(html).not.toContain("Retry")
})
