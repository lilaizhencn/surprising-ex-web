import { Bell, ChevronDown, CircleUserRound, Megaphone, Menu } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { loadAnnouncements } from "../../api/endpoints"
import type { AuthSession } from "../../api/types"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { t, useLocale } from "../../i18n"
import { IconButton } from "../ui/Primitives"
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
    locale: string
    count: number
  } | null>(null)
  const closeNavigation = useCallback(() => setMobileOpen(false), [])
  const pathname = window.location.pathname
  const locale = useLocale()
  const owner = String(session?.user.userId ?? "guest")
  const unreadAnnouncements =
    unreadSnapshot?.owner === owner && unreadSnapshot.locale === locale ? unreadSnapshot.count : 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: Route changes close the open navigation.
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
      void loadAnnouncements(
        {
          locale: locale === "zh" ? "zh-CN" : "en-US",
          productLine: "ALL",
          platform: "WEB",
          placement: "CENTER",
          limit: 1,
        },
        abort.signal,
      ).then(
        (result) => {
          if (!abort.signal.aborted) setUnreadSnapshot({ owner, locale, count: result.unreadCount })
        },
        () => {
          if (!abort.signal.aborted) setUnreadSnapshot(null)
        },
      )
    }
    refreshUnread()
    const timer = window.setInterval(refreshUnread, 60_000)
    window.addEventListener("focus", refreshUnread)
    window.addEventListener("surprising-announcements-updated", refreshUnread)
    return () => {
      request?.abort()
      window.clearInterval(timer)
      window.removeEventListener("focus", refreshUnread)
      window.removeEventListener("surprising-announcements-updated", refreshUnread)
    }
  }, [session, owner, locale])
  return (
    <header className="top-nav">
      <a className="skip-link" href="#main-content">
        {t("Skip to content")}
      </a>
      <div className="top-nav-inner">
        <a className="brand" href="/" aria-label={t("Surprising EX home")}>
          <span className="brand-mark">S</span>
          <span>Surprising EX</span>
        </a>
        <nav className="top-links" aria-label={t("Primary navigation")}>
          {publicNavigation.map((item) => (
            <DesktopNavigationItem key={item.href} item={item} pathname={pathname} />
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
          <ThemePicker />
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: Route changes close the open dropdown.
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
