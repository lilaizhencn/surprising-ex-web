import { ChartNoAxesCombined, Clock3, Grid2X2, Layers3, WalletCards } from "lucide-react"
import { accountNavigation } from "./navigation"

const icons = [Grid2X2, WalletCards, ChartNoAxesCombined, Layers3, Clock3] as const

export function AccountSidebar() {
  const pathname = window.location.pathname
  return (
    <aside className="account-sidebar">
      <div className="account-sidebar-heading">
        <span className="account-badge">UP</span>
        <div>
          <strong>Assets</strong>
          <span>Manage your holdings</span>
        </div>
      </div>
      <nav aria-label="Asset navigation">
        {accountNavigation.map((item, index) => {
          const Icon = icons[index] ?? Grid2X2
          const basePath = item.href.split("?")[0] ?? item.href
          const active =
            item.href === "/assets" ? pathname === "/assets" : pathname.startsWith(basePath)
          return (
            <a className={active ? "active" : ""} href={item.href} key={item.href}>
              <Icon size={21} />
              <span>{item.label}</span>
            </a>
          )
        })}
      </nav>
    </aside>
  )
}
