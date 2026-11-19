import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { SubAccountAssetList, SubAccountManagementControls } from "./SubAccountManagementControls"

describe("sub-account management controls", () => {
  it("shows freeze and view assets actions for an active sub-account", () => {
    const html = renderToStaticMarkup(
      createElement(SubAccountManagementControls, {
        account: {
          id: 1,
          parentUserId: 42,
          subUserId: 2001,
          subAccountName: "bot",
          permissions: "TRADE_SPOT",
          status: "ACTIVE",
          createdAt: "2026-01-01T00:00:00Z",
        },
      }),
    )
    expect(html).toContain("View assets")
    expect(html).toContain("Freeze")
    expect(html).not.toContain("Unfreeze")
  })

  it("offers unfreeze when the sub-account is already frozen", () => {
    const html = renderToStaticMarkup(
      createElement(SubAccountManagementControls, {
        account: {
          id: 1,
          parentUserId: 42,
          subUserId: 2001,
          subAccountName: "bot",
          permissions: "READONLY",
          status: "FROZEN",
          createdAt: "2026-01-01T00:00:00Z",
        },
      }),
    )
    expect(html).toContain("Unfreeze")
  })

  it("renders the sub-account asset list", () => {
    const html = renderToStaticMarkup(
      createElement(SubAccountAssetList, {
        balances: [{ asset: "USDT", accountType: "SPOT", availableUnits: "100", lockedUnits: "0" }],
      }),
    )
    expect(html).toContain("USDT")
    expect(html).toContain("100")
  })
})
