import { Bell, Check, CheckCheck, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../api/endpoints"
import type { ApiNotification } from "../../api/types"
import { Button, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"

export function NotificationsPage() {
  const session = useSession()
  return session ? (
    <AccountNotifications key={String(session.user.userId)} />
  ) : (
    <div className="container section notifications-page">
      <div className="page-heading">
        <div>
          <h1>{t("Notification Center")}</h1>
          <p>{t("System and account messages are available after sign in.")}</p>
        </div>
        <Bell size={28} aria-hidden="true" />
      </div>
      <Panel>
        <StateView kind="empty" message="Sign in to view account notifications." />
        <a className="button button-primary" href="/auth/login">
          {t("Go to login")}
        </a>
      </Panel>
    </div>
  )
}
function AccountNotifications() {
  const [rows, setRows] = useState<ApiNotification[] | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [actionError, setActionError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState("")
  const [reload, setReload] = useState(0)
  const writing = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    return () => abort.abort()
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    setRows(null)
    setLoading(true)
    setError("")
    setActionError("")
    void loadNotifications(unreadOnly, abort.signal)
      .then(
        (value) => {
          if (!abort.signal.aborted) setRows(value)
        },
        (reason) => {
          if (!abort.signal.aborted) setError(readError(reason))
        },
      )
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    return () => abort.abort()
  }, [unreadOnly, reload])
  const unreadCount = rows?.filter((row) => !row.readAt).length
  const mark = async (id?: string) => {
    const signal = lifetime.current?.signal
    if (!signal || signal.aborted || writing.current || loading) return
    writing.current = true
    setBusy(id ?? "all")
    setActionError("")
    setNotice("")
    try {
      if (id) await markNotificationRead(id, signal)
      else await markAllNotificationsRead(signal)
      if (!signal.aborted) {
        setNotice(t(id ? "Notification marked as read." : "All notifications marked as read."))
        setReload((value) => value + 1)
      }
    } catch (reason) {
      if (!signal.aborted) setActionError(readError(reason))
    } finally {
      writing.current = false
      if (!signal.aborted) setBusy("")
    }
  }
  return (
    <div className="container section notifications-page">
      <div className="page-heading">
        <div>
          <h1>{t("Notification Center")}</h1>
          <p>{t("Read account updates, security alerts and service messages in one place.")}</p>
        </div>
        <Bell size={28} aria-hidden="true" />
      </div>
      <div className="history-toolbar content-toolbar">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={unreadOnly}
            disabled={Boolean(busy)}
            onChange={(event) => {
              setUnreadOnly(event.target.checked)
              setNotice("")
            }}
          />
          {t("Unread only")}
        </label>
        <span className="muted" role="status">
          {unreadCount ?? "—"} {t("unread in this view")}
        </span>
        <Button
          tone="outline"
          disabled={Boolean(busy)}
          loading={loading}
          onClick={() => {
            setNotice("")
            setReload((value) => value + 1)
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {t("Refresh")}
        </Button>
        <Button
          tone="outline"
          disabled={loading || !unreadCount || Boolean(busy)}
          loading={busy === "all"}
          onClick={() => void mark()}
        >
          <CheckCheck size={16} aria-hidden="true" />
          {t("Mark all read")}
        </Button>
      </div>
      {notice ? (
        <p className="content-notice" role="status">
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p className="inline-error content-notice" role="alert">
          {actionError}
        </p>
      ) : null}
      <Panel>
        {loading ? (
          <div role="status" aria-busy="true">
            <StateView kind="loading" message="Loading notifications" />
            <span className="sr-only">{t("Loading notifications")}</span>
          </div>
        ) : error ? (
          <StateView kind="error" message={error} retry={() => setReload((value) => value + 1)} />
        ) : !rows?.length ? (
          <StateView
            kind="empty"
            message={unreadOnly ? "No unread notifications." : "No notifications yet."}
          />
        ) : (
          <>
            <div className="notification-list">
              {rows.map((row) => (
                <article
                  key={row.notificationId}
                  className={`notification-item ${row.readAt ? "notification-read" : "notification-unread"}`}
                >
                  <div className="notification-content">
                    <span className="eyebrow">{t(categoryLabel(row.category))}</span>
                    <h2>{row.title}</h2>
                    <p>{row.body}</p>
                    <small className="muted">
                      <time dateTime={row.createdAt}>
                        {new Date(row.createdAt).toLocaleString()}
                      </time>
                    </small>
                  </div>
                  {row.readAt ? (
                    <span className="notification-read-label">
                      <Check size={15} aria-hidden="true" />
                      {t("Read")}
                    </span>
                  ) : (
                    <Button
                      tone="outline"
                      loading={busy === row.notificationId}
                      disabled={Boolean(busy)}
                      onClick={() => void mark(row.notificationId)}
                    >
                      {t("Mark read")}
                    </Button>
                  )}
                </article>
              ))}
            </div>
            {rows.length === 100 ? (
              <p className="muted content-limit-note">
                {t("Showing the latest 100 notifications in this view.")}
              </p>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  )
}
function categoryLabel(value: string) {
  return (
    (
      {
        SYSTEM: "System",
        SECURITY: "Security",
        ACCOUNT: "Account",
        TRADING: "Trading",
        FUNDING: "Funding",
      } as Record<string, string>
    )[value] ?? value
  )
}
function readError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : t("Notification service unavailable. Please retry later.")
}
