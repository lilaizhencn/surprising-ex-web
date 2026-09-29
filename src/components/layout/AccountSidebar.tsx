import { ChartNoAxesCombined, Clock3, Code2, Grid2X2, ShieldCheck, WalletCards } from "lucide-react"
import { t } from "../../i18n"
import { assetNavigation, securityNavigation } from "./navigation"

export function AccountSidebar() {
  const pathname = window.location.pathname
  const account = new URLSearchParams(window.location.search).get("account")
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
          <div className="account-sidebar-group-title">
            <WalletCards size={21} />
            <span>{t("Assets")}</span>
          </div>
          {assetNavigation.map((item) => (
            <a
              className={
                pathname === "/assets" &&
                account === new URL(item.href, window.location.origin).searchParams.get("account")
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
        <a className={pathname === "/assets/ledger" ? "active" : ""} href="/assets/ledger">
          <Clock3 size={21} />
          <span>{t("Ledger")}</span>
        </a>
        <div className="account-sidebar-group">
          <div className="account-sidebar-group-title">
            <ShieldCheck size={21} />
            <span>{t("Security Center")}</span>
          </div>
          {securityNavigation.map((item) => (
            <a
              className={
                pathname === item.href ? "active account-sidebar-child" : "account-sidebar-child"
              }
              href={item.href}
              key={item.href}
            >
              <span>{t(item.label)}</span>
            </a>
          ))}
        </div>
        <a className={pathname === "/api" ? "active" : ""} href="/api">
          <Code2 size={21} />
          <span>{t("Developer API")}</span>
        </a>
        <a
          className={pathname === "/orders" || pathname === "/assets/orders" ? "active" : ""}
          href="/orders"
        >
          <ChartNoAxesCombined size={21} />
          <span>{t("Orders")}</span>
        </a>
      </nav>
    </aside>
  )
}
