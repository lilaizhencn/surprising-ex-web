import { ChevronDown, Code2, Grid2X2, IdCard, ShieldCheck, WalletCards } from "lucide-react"
import { useState } from "react"
import { t } from "../../i18n"
import { assetNavigation, securityNavigation } from "./navigation"

export function AccountSidebar() {
  const pathname = window.location.pathname
  const account = new URLSearchParams(window.location.search).get("account")
  const [assetsOpen, setAssetsOpen] = useState(
    pathname === "/assets" ||
      pathname === "/assets/ledger" ||
      pathname === "/orders" ||
      pathname === "/assets/orders" ||
      Boolean(account),
  )
  const [securityOpen, setSecurityOpen] = useState(pathname.startsWith("/security/"))
  return (
    <aside className="account-sidebar">
      <div className="account-sidebar-heading">
        <span className="account-badge">UP</span>
        <div>
          <strong>{t("Overview")}</strong>
          <span>{t("Your account and assets")}</span>
        </div>
      </div>
      <nav aria-label={t("Account navigation")}>
        <a className={pathname === "/assets" && !account ? "active" : ""} href="/assets">
          <Grid2X2 size={21} />
          <span>{t("Overview")}</span>
        </a>
        <div className="account-sidebar-group">
          <button
            className="account-sidebar-group-title"
            type="button"
            aria-expanded={assetsOpen}
            onClick={() => setAssetsOpen((open) => !open)}
          >
            <WalletCards size={21} />
            <span>{t("Assets")}</span>
            <ChevronDown size={16} className={assetsOpen ? "expanded" : ""} />
          </button>
          {assetsOpen ? (
            <div className="account-sidebar-children">
              {assetNavigation.map((item) => {
                const active =
                  item.href === "/assets/ledger"
                    ? pathname === item.href
                    : item.href === "/orders"
                      ? pathname === item.href || pathname === "/assets/orders"
                      : pathname === "/assets" &&
                        account ===
                          new URL(item.href, window.location.origin).searchParams.get("account")
                return (
                  <a
                    className={`account-sidebar-child${active ? " active" : ""}`}
                    href={item.href}
                    key={item.href}
                  >
                    <span>{t(item.label)}</span>
                  </a>
                )
              })}
            </div>
          ) : null}
        </div>
        <div className="account-sidebar-group">
          <button
            className="account-sidebar-group-title"
            type="button"
            aria-expanded={securityOpen}
            onClick={() => setSecurityOpen((open) => !open)}
          >
            <ShieldCheck size={21} />
            <span>{t("Security Center")}</span>
            <ChevronDown size={16} className={securityOpen ? "expanded" : ""} />
          </button>
          {securityOpen ? (
            <div className="account-sidebar-children">
              {securityNavigation.map((item) => (
                <a
                  className={
                    pathname === item.href
                      ? "active account-sidebar-child"
                      : "account-sidebar-child"
                  }
                  href={item.href}
                  key={item.href}
                >
                  <span>{t(item.label)}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <a
          className={
            pathname.startsWith("/account/kyc") || pathname.startsWith("/compliance")
              ? "active"
              : ""
          }
          href="/account/kyc"
        >
          <IdCard size={21} />
          <span>{t("Identity Verification")}</span>
        </a>
        <a className={pathname === "/api" ? "active" : ""} href="/api">
          <Code2 size={21} />
          <span>{t("Developer API")}</span>
        </a>
      </nav>
    </aside>
  )
}
