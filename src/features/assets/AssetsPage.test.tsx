import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, it, vi } from "vitest"
import { useRealtimeAssets } from "../../hooks/useRealtimeAssets"
import { AssetsPage } from "./AssetsPage"

vi.mock("../../hooks/useRealtimeAssets", () => ({ useRealtimeAssets: vi.fn() }))
vi.mock("../../state/session", () => ({
  useSession: () => ({ user: { userId: "1" }, accessToken: "access" }),
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
it("keeps errors visible when cash data already exists", () => {
  vi.mocked(useRealtimeAssets).mockReturnValue({
    ...vi.mocked(useRealtimeAssets)(null, {}),
    balances: [{ accountType: "SPOT", asset: "USDT", available: 0, locked: 0, estimatedUsd: null }],
    error: "FX unavailable",
  })
  const html = renderToStaticMarkup(<AssetsPage account="spot" />)
  expect(html).toContain("FX unavailable")
  expect(html).toContain("Valuation unavailable")
  expect(html).toContain("Retry")
})
