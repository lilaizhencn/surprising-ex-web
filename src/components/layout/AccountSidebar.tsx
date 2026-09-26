import { ChartNoAxesCombined, Clock3, Grid2X2, Layers3, WalletCards } from "lucide-react"
import { t } from "../../i18n"
import { accountNavigation } from "./navigation"

const icons = [Grid2X2, WalletCards, ChartNoAxesCombined, Layers3, Clock3] as const

export function AccountSidebar() {
  const pathname = window.location.pathname
  const account = new URLSearchParams(window.location.search).get("account")
  return (
    <aside className="account-sidebar">
      <div className="account-sidebar-heading">
        <span className="account-badge">UP</span>
        <div>
          <strong>{t("Assets")}</strong>
          <span>{t("Manage your holdings")}</span>
        </div>
      </div>
      <nav aria-label={t("Asset navigation")}>
        {accountNavigation.map((item, index) => {
          const Icon = icons[index] ?? Grid2X2
          const basePath = item.href.split("?")[0] ?? item.href
          const itemAccount = new URL(item.href, window.location.origin).searchParams.get("account")
          const active = itemAccount
            ? pathname === "/assets" && account === itemAccount
            : item.href === "/assets"
              ? pathname === "/assets" && !account
              : pathname.startsWith(basePath)
          return (
            <a className={active ? "active" : ""} href={item.href} key={item.href}>
              <Icon size={21} />
              <span>{t(item.label)}</span>
            </a>
          )
        })}
      </nav>
    </aside>
  )
}
