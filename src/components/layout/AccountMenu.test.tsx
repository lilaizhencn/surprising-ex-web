import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { AuthSession } from "../../api/types"
import { AccountSwitcher } from "./AccountMenu"

const parentSession: AuthSession = {
  sessionKey: "s",
  user: { userId: "42", displayName: "Parent" },
}

const switched: AuthSession = {
  sessionKey: "s",
  user: { userId: "42", displayName: "Parent" },
  operatingAccount: {
    userId: "2001",
    displayName: "bot",
    status: "NORMAL",
    subAccountStatus: "ACTIVE",
    parent: false,
  },
}

const accounts = [
  {
    id: 1,
    parentUserId: 42,
    subUserId: 2001,
    subAccountName: "bot",
    permissions: "TRADE_SPOT",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    parentUserId: 42,
    subUserId: 2002,
    subAccountName: "audit",
    permissions: "READONLY",
    status: "FROZEN",
    createdAt: "2026-01-02T00:00:00Z",
  },
] as const

describe("account switcher", () => {
  it("marks the parent account as selected before a switch", () => {
    const html = renderToStaticMarkup(
      createElement(AccountSwitcher, { session: parentSession, accounts }),
    )
    expect(html).toContain("Switch account")
    expect(html).toContain("Main account")
    expect(html).toContain("bot")
    expect(html).toContain("Frozen")
    expect(html).toMatch(/aria-current="true"[^>]*>[\s\S]*Parent/)
  })

  it("marks the switched sub-account as selected", () => {
    const html = renderToStaticMarkup(
      createElement(AccountSwitcher, { session: switched, accounts }),
    )
    expect(html).toContain('aria-current="true"')
    expect(html).toContain("UID 2001")
    const selected = html.split('aria-current="true"')[1] ?? ""
    expect(selected).toContain("bot")
    expect(selected).not.toContain("Main account")
  })
})
