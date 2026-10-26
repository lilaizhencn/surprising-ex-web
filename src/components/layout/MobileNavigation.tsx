import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDot,
  Coins,
  Layers,
  LogOut,
  Megaphone,
  Wallet,
} from "lucide-react"
import { useEffect } from "react"
import { t } from "../../i18n"
import { StandardDialog } from "../ui/StandardDialog"
import { publicNavigation } from "./navigation"

const icons = {
  Announcements: Megaphone,
  Markets: ChartNoAxesCombined,
  C2C: ArrowLeftRight,
  Spot: Coins,
  Perpetuals: Layers,
  Futures: Layers,
  Options: CircleDot,
  Assets: Wallet,
}

export function MobileNavigation({
  onClose,
  onLogout,
  signedIn,
}: {
  readonly onClose: () => void
  readonly onLogout: () => void
  readonly signedIn: boolean
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const wideScreen = window.matchMedia("(min-width: 1281px)")
    const onResize = () => {
      if (wideScreen.matches) onClose()
    }
    wideScreen.addEventListener("change", onResize)
    return () => {
      document.body.style.overflow = previousOverflow
      wideScreen.removeEventListener("change", onResize)
    }
  }, [onClose])

  const pathname = window.location.pathname
  return (
    <StandardDialog
      title={t("Primary navigation")}
      onClose={onClose}
      closeOnBackdrop
      className="navigation-drawer"
    >
      <nav aria-label={t("Primary navigation")}>
        {publicNavigation.map((item) => {
          const Icon = icons[item.label]
          const active =
            "menu" in item
              ? item.menu.some((child) => pathname.startsWith(child.href))
              : pathname.startsWith(item.href)
          return (
            <div className="mobile-navigation-group" key={item.href}>
              <a
                href={item.href}
                onClick={onClose}
                className={active ? "active" : ""}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{t(item.label)}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </a>
              {"menu" in item ? (
                <div className="mobile-navigation-children">
                  {item.menu.map((child) => (
                    <a
                      href={child.href}
                      onClick={onClose}
                      key={child.href}
                      aria-current={pathname.startsWith(child.href) ? "page" : undefined}
                    >
                      {t(child.label)}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>
      {signedIn ? (
        <button
          type="button"
          className="mobile-navigation-logout"
          onClick={() => {
            onClose()
            onLogout()
          }}
        >
          <LogOut size={18} aria-hidden="true" />
          {t("Sign out")}
        </button>
      ) : null}
    </StandardDialog>
  )
}
