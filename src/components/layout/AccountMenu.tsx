import { CircleUserRound, LogOut } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { loadSubAccounts, type SubAccountRecord } from "../../api/accountApi"
import { switchOperatingAccount } from "../../api/subAccountApi"
import type { AuthSession } from "../../api/types"
import { t } from "../../i18n"
import { currentAccountUserId, isParentOperatingAccount } from "../../state/session"
import "./AccountMenu.css"

export function AccountMenu({
  session,
  pathname,
  onLogout,
}: {
  readonly session: AuthSession
  readonly pathname: string
  readonly onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
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
  const operating = session.operatingAccount
  const accountLabel =
    (!isParentOperatingAccount(session) && (operating?.displayName || operating?.username)) ||
    session.user.displayName ||
    session.user.email ||
    `UID ${session.user.userId}`
  const items = [
    { label: "Assets", href: "/assets" },
    { label: "Orders", href: "/orders" },
    { label: "Account security", href: "/security/account" },
    { label: "Sub-Accounts", href: "/sub-accounts" },
  ] as const
  return (
    <div ref={container} className="nav-account-wrap">
      <button
        ref={trigger}
        type="button"
        className={session.user.displayName ? "nav-account nav-account-named" : "nav-account"}
        aria-label={t("Overview")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <CircleUserRound size={20} />
        {session.user.displayName ? (
          <span className="nav-display-name" title={session.user.displayName}>
            {session.user.displayName}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="nav-account-menu" role="menu">
          <div className="nav-account-header" title={accountLabel}>
            <strong>{accountLabel}</strong>
            {session.user.email && session.user.email !== accountLabel ? (
              <small>{session.user.email}</small>
            ) : null}
          </div>
          <AccountSwitcher session={session} />
          <hr className="nav-account-divider" />
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              role="menuitem"
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {t(item.label)}
            </a>
          ))}
          <hr className="nav-account-divider" />
          <button
            type="button"
            role="menuitem"
            className="nav-account-signout"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          >
            <LogOut size={15} aria-hidden="true" />
            {t("Sign out")}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function AccountSwitcher({
  session,
  accounts,
  switchingUserId,
  error,
  onSelect,
}: {
  readonly session: AuthSession
  readonly accounts?: readonly SubAccountRecord[]
  readonly switchingUserId?: string | number | null
  readonly error?: string | null
  readonly onSelect?: (userId: string | number) => void
}) {
  const [loaded, setLoaded] = useState<readonly SubAccountRecord[] | null>(accounts ?? null)
  const [loadError, setLoadError] = useState<string | null>(error ?? null)
  const [pending, setPending] = useState<string | number | null>(switchingUserId ?? null)
  useEffect(() => {
    if (accounts) {
      setLoaded(accounts)
      return
    }
    let cancelled = false
    void loadSubAccounts().then(
      (list) => {
        if (!cancelled) setLoaded(list)
      },
      (reason: unknown) => {
        if (!cancelled)
          setLoadError(reason instanceof Error ? reason.message : t("Unable to load sub-accounts."))
      },
    )
    return () => {
      cancelled = true
    }
  }, [accounts, session.user.userId])
  const selected = String(currentAccountUserId(session) ?? "")
  const parentId = session.user.userId
  const parentLabel =
    session.user.displayName || session.user.username || session.user.email || `UID ${parentId}`
  const select = async (userId: string | number) => {
    if (String(userId) === selected || pending != null) return
    if (onSelect) {
      onSelect(userId)
      return
    }
    setPending(userId)
    setLoadError(null)
    try {
      await switchOperatingAccount(userId)
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : t("Unable to switch account."))
    } finally {
      setPending(null)
    }
  }
  return (
    <div className="nav-account-switcher">
      <div className="nav-account-switcher-label">{t("Switch account")}</div>
      <AccountChoice
        label={parentLabel}
        detail={t("Main account")}
        selected={selected === String(parentId)}
        pending={pending != null && String(pending) === String(parentId)}
        onSelect={() => void select(parentId)}
      />
      {(loaded ?? []).map((account) => {
        const status =
          account.status === "FROZEN"
            ? t("Frozen")
            : account.permissions === "READONLY"
              ? t("Read only")
              : t("Sub-account")
        return (
          <AccountChoice
            key={String(account.subUserId)}
            label={account.subAccountName || `UID ${account.subUserId}`}
            detail={`UID ${account.subUserId} · ${status}`}
            selected={selected === String(account.subUserId)}
            pending={pending != null && String(pending) === String(account.subUserId)}
            onSelect={() => void select(account.subUserId)}
          />
        )
      })}
      {loadError ? <div className="nav-account-switcher-error">{loadError}</div> : null}
    </div>
  )
}

export function AccountChoice({
  label,
  detail,
  selected,
  pending,
  onSelect,
}: {
  readonly label: string
  readonly detail: string
  readonly selected: boolean
  readonly pending?: boolean
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      className="nav-account-choice"
      aria-current={selected ? "true" : undefined}
      aria-checked={selected}
      disabled={pending}
      onClick={onSelect}
    >
      <span className="nav-account-choice-label">
        <span>{label}</span>
        <small>{detail}</small>
      </span>
    </button>
  )
}
