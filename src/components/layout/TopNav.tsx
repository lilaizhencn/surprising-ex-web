import { Bell, ChevronDown, CircleUserRound, Megaphone, Menu, Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { loadAnnouncements } from "../../api/endpoints"
import type { AuthSession } from "../../api/types"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { t, useLocale } from "../../i18n"
import { writeStoredValue } from "../../lib/storage"
import { IconButton } from "../ui/Primitives"
import { LanguagePicker } from "./LanguagePicker"
import { publicNavigation } from "./navigation"

const THEME_KEY = "theme"

export function TopNav({
  session,
  onLogout,
}: {
  readonly session: AuthSession | null
  readonly onLogout: () => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dark, setDark] = useState(document.documentElement.dataset[THEME_KEY] === "dark")
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0)
  const pathname = window.location.pathname
  const locale = useLocale()
  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.dataset[THEME_KEY] = next ? "dark" : "light"
    writeStoredValue("surprising-ex.theme", next ? "dark" : "light")
  }
  useEffect(() => {
    let active = true
    const refreshUnread = () => {
      if (!session) {
        setUnreadAnnouncements(0)
        return
      }
      void loadAnnouncements({
        locale: locale === "zh" ? "zh-CN" : "en-US",
        productLine: "ALL",
        platform: "WEB",
        placement: "CENTER",
        limit: 1,
      })
        .then((result) => {
          if (active) setUnreadAnnouncements(result.unreadCount)
        })
        .catch(() => {})
    }
    refreshUnread()
    const timer = window.setInterval(refreshUnread, 60_000)
    window.addEventListener("focus", refreshUnread)
    window.addEventListener("surprising-announcements-updated", refreshUnread)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener("focus", refreshUnread)
      window.removeEventListener("surprising-announcements-updated", refreshUnread)
    }
  }, [session?.accessToken, locale])
  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <a className="brand" href="/" aria-label={t("Surprising EX home")}>
          <span className="brand-mark">S</span>
          <span>Surprising EX</span>
        </a>
        <nav
          className={`top-links ${mobileOpen ? "top-links-open" : ""}`}
          aria-label={t("Primary navigation")}
        >
          {publicNavigation.map((item) => (
            <div className="nav-item" key={item.href}>
              <a className={pathname.startsWith(item.href) ? "active" : ""} href={item.href}>
                {t(item.label)}
                {"menu" in item ? <ChevronDown size={15} /> : null}
              </a>
              {"menu" in item ? (
                <div className="nav-menu">
                  {item.menu.map((child) => (
                    <a key={child.href} href={child.href}>
                      {t(child.label)}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="nav-actions">
          <LanguagePicker />
          <IconButton
            label={t("Announcements")}
            onClick={() => {
              navigateInApplication("/announcements")
            }}
          >
            <span className="announcement-nav-icon">
              <Megaphone size={20} />
              {unreadAnnouncements > 0 ? (
                <span>{unreadAnnouncements > 99 ? "99+" : unreadAnnouncements}</span>
              ) : null}
            </span>
          </IconButton>
          {session ? (
            <IconButton
              label={t("Notifications")}
              onClick={() => {
                navigateInApplication("/notifications")
              }}
            >
              <Bell size={20} />
            </IconButton>
          ) : null}
          <IconButton
            label={dark ? t("Use light theme") : t("Use dark theme")}
            onClick={toggleTheme}
          >
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </IconButton>
          <a
            className={session?.user.displayName ? "nav-account nav-account-named" : "nav-account"}
            href={session ? "/assets" : "/auth/login"}
            aria-label={session ? t("Overview") : t("Sign in")}
          >
            <CircleUserRound size={21} />
            {session?.user.displayName ? (
              <span className="nav-display-name" title={session.user.displayName}>
                {session.user.displayName}
              </span>
            ) : null}
          </a>
          {session ? (
            <button type="button" className="nav-logout" onClick={onLogout}>
              {" "}
              {t("Sign out")}{" "}
            </button>
          ) : null}
          <IconButton
            label={t("Open navigation")}
            className="mobile-nav-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu size={20} />
          </IconButton>
        </div>
      </div>
    </header>
  )
}
