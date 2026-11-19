import { Bell, ChevronDown, Menu } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { loadNotifications } from "../../api/endpoints"
import type { AuthSession } from "../../api/types"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { t } from "../../i18n"
import { IconButton } from "../ui/Primitives"
import { AccountMenu } from "./AccountMenu"
import { AeternMark } from "./AeternMark"
import { LanguagePicker } from "./LanguagePicker"
import { MobileNavigation } from "./MobileNavigation"
import { publicNavigation } from "./navigation"
import { ThemePicker } from "./ThemePicker"

export function TopNav({
  session,
  onLogout,
}: {
  readonly session: AuthSession | null
  readonly onLogout: () => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unreadSnapshot, setUnreadSnapshot] = useState<{
    owner: string
    count: number
  } | null>(null)
  const closeNavigation = useCallback(() => setMobileOpen(false), [])
  const pathname = window.location.pathname
  const owner = String(session?.user.userId ?? "guest")
  const unreadNotifications = unreadSnapshot?.owner === owner ? unreadSnapshot.count : 0
  useEffect(() => setMobileOpen(false), [pathname])
  useEffect(() => {
    let request: AbortController | null = null
    const refreshUnread = () => {
      request?.abort()
      if (!session) {
        setUnreadSnapshot(null)
        return
      }
      if (document.visibilityState !== "visible") return
      const abort = new AbortController()
      request = abort
      void loadNotifications(true, abort.signal).then(
        (rows) => {
          if (!abort.signal.aborted)
            setUnreadSnapshot({ owner, count: rows.filter((row) => !row.readAt).length })
        },
        () => {
          if (!abort.signal.aborted) setUnreadSnapshot(null)
        },
      )
    }
    refreshUnread()
    const timer = window.setInterval(refreshUnread, 60_000)
    window.addEventListener("focus", refreshUnread)
    window.addEventListener("surprising-notifications-updated", refreshUnread)
    return () => {
      request?.abort()
      window.clearInterval(timer)
      window.removeEventListener("focus", refreshUnread)
      window.removeEventListener("surprising-notifications-updated", refreshUnread)
    }
  }, [session, owner])
  return (
    <header className="top-nav">
      <a className="skip-link" href="#main-content">
        {t("Skip to content")}
      </a>
      <div className="top-nav-inner">
        <a className="brand" href="/" aria-label={t("AETERN home")}>
          <AeternMark size={28} />
          <span className="brand-name">AETERN</span>
        </a>
        <nav className="top-links" aria-label={t("Primary navigation")}>
          {publicNavigation.map((item) => (
            <DesktopNavigationItem key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="nav-actions">
          {session ? (
            <AccountMenu session={session} pathname={pathname} onLogout={onLogout} />
          ) : (
            <div className="nav-auth-buttons">
              <a className="nav-login-link" href="/auth/login">
                {t("Log in")}
              </a>
              <a className="nav-signup-btn" href="/auth/register">
                {t("Sign up")}
              </a>
            </div>
          )}
          <div className="nav-divider" />
          <IconButton
            label={t("Notifications")}
            onClick={() => {
              navigateInApplication(
                session ? "/notifications" : "/auth/login?redirect=%2Fnotifications",
              )
            }}
          >
            <span className="announcement-nav-icon">
              <Bell size={18} />
              {unreadNotifications > 0 ? (
                <span>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
              ) : null}
            </span>
          </IconButton>
          <ThemePicker />
          <LanguagePicker />
          <IconButton
            label={t("Open navigation")}
            className="mobile-nav-toggle"
            aria-expanded={mobileOpen}
            aria-haspopup="dialog"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu size={20} />
          </IconButton>
        </div>
      </div>
      {mobileOpen ? (
        <MobileNavigation onClose={closeNavigation} onLogout={onLogout} signedIn={!!session} />
      ) : null}
    </header>
  )
}

function DesktopNavigationItem({
  item,
  pathname,
}: {
  readonly item: (typeof publicNavigation)[number]
  readonly pathname: string
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = "menu" in item ? item.menu : null
  const active = menu
    ? menu.some((child) => pathname.startsWith(child.href))
    : pathname.startsWith(item.href)
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener("focusin", onFocus)
    document.addEventListener("pointerdown", outside)
    document.addEventListener("keydown", onEscape)
    return () => {
      document.removeEventListener("focusin", onFocus)
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("keydown", onEscape)
    }
  }, [open])
  return (
    <div ref={container} className="nav-item">
      <a
        className={active ? "active" : ""}
        href={item.href}
        aria-current={pathname === item.href ? "page" : undefined}
      >
        {t(item.label)}
      </a>
      {menu ? (
        <>
          <button
            ref={trigger}
            type="button"
            className="nav-menu-trigger"
            aria-label={`${t(item.label)}: ${t("Show options")}`}
            aria-expanded={open}
            aria-controls={`navigation-${item.label}`}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <div id={`navigation-${item.label}`} className="nav-menu" hidden={!open}>
            {menu.map((child) => (
              <a
                key={child.href}
                href={child.href}
                aria-current={pathname.startsWith(child.href) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {t(child.label)}
              </a>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
