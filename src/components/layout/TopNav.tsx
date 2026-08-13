import { Bell, ChevronDown, CircleUserRound, Menu, Moon, Search, Sun } from "lucide-react"
import { useState } from "react"
import type { AuthSession } from "../../api/types"
import { IconButton } from "../ui/Primitives"
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
  const pathname = window.location.pathname
  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.dataset[THEME_KEY] = next ? "dark" : "light"
    localStorage.setItem("surprising-ex.theme", next ? "dark" : "light")
  }
  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <a className="brand" href="/" aria-label="Surprising EX home">
          <span className="brand-mark">S</span>
          <span>Surprising EX</span>
        </a>
        <nav
          className={`top-links ${mobileOpen ? "top-links-open" : ""}`}
          aria-label="Primary navigation"
        >
          {publicNavigation.map((item) => (
            <div className="nav-item" key={item.href}>
              <a className={pathname.startsWith(item.href) ? "active" : ""} href={item.href}>
                {item.label}
                {"menu" in item ? <ChevronDown size={15} /> : null}
              </a>
              {"menu" in item ? (
                <div className="nav-menu">
                  {item.menu.map((child) => (
                    <a key={child.href} href={child.href}>
                      {child.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="nav-actions">
          <IconButton
            label="Search"
            onClick={() => {
              window.location.href = "/markets"
            }}
          >
            <Search size={20} />
          </IconButton>
          {session ? (
            <IconButton
              label="Notifications"
              onClick={() => {
                window.location.href = "/notifications"
              }}
            >
              <Bell size={20} />
            </IconButton>
          ) : null}
          <IconButton label={dark ? "Use light theme" : "Use dark theme"} onClick={toggleTheme}>
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </IconButton>
          <a
            className="nav-account"
            href={session ? "/account/security" : "/auth/login"}
            aria-label={session ? "Account security" : "Sign in"}
          >
            <CircleUserRound size={21} />
          </a>
          {session ? (
            <button type="button" className="nav-logout" onClick={onLogout}>
              Sign out
            </button>
          ) : null}
          <IconButton
            label="Open navigation"
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
