import { Bell, CheckCheck, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../api/endpoints"
import { Button, Panel, StateView } from "../../components/ui/Primitives"
import { loadSession } from "../../state/session"

type Notification = Readonly<Record<string, unknown>>
const READ_AT_KEY = "readAt"

export function NotificationsPage() {
  const session = loadSession()
  const [rows, setRows] = useState<readonly Notification[]>([])
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const load = () => {
    if (!session) return
    setLoading(true)
    setError("")
    void loadNotifications(unreadOnly)
      .then(setRows, (reason: unknown) => setError(readError(reason)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [session, unreadOnly])
  const unreadCount = useMemo(() => rows.filter((row) => !row[READ_AT_KEY]).length, [rows])
  if (!session)
    return (
      <div className="container section">
        <Panel>
          <StateView kind="error" message="Sign in to view account notifications." />
          <a className="route-link" href="/auth/login">
            Go to login
          </a>
        </Panel>
      </div>
    )
  return (
    <div className="container section notifications-page">
      <div className="page-heading">
        <div>
          <h1>Notification Center</h1>
          <p>System and account messages are loaded from the authenticated notification service.</p>
        </div>
        <Bell size={28} color="var(--color-primary)" />
      </div>
      <div className="history-toolbar">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />{" "}
          Unread only
        </label>
        <span className="muted">{unreadCount} unread in this view</span>
        <Button tone="outline" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </Button>
        <Button
          tone="outline"
          disabled={unreadCount === 0}
          onClick={() =>
            void markAllNotificationsRead().then(load, (reason: unknown) =>
              setError(readError(reason)),
            )
          }
        >
          <CheckCheck size={16} /> Mark all read
        </Button>
      </div>
      <Panel>
        {error ? (
          <StateView kind="error" message={error} retry={load} />
        ) : loading ? (
          <StateView kind="loading" message="Loading notifications" />
        ) : rows.length === 0 ? (
          <StateView
            kind="empty"
            message={
              unreadOnly ? "No unread notifications." : "No notifications returned by the backend."
            }
          />
        ) : (
          <div className="notification-list">
            {rows.map((row, index) => (
              <NotificationRow
                key={text(row, "notificationId") || String(index)}
                row={row}
                onRead={(message) => {
                  if (message) setError(message)
                  else load()
                }}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function NotificationRow({
  row,
  onRead,
}: {
  readonly row: Notification
  readonly onRead: (message: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const id = text(row, "notificationId")
  return (
    <article
      className={`notification-item ${row[READ_AT_KEY] ? "notification-read" : "notification-unread"}`}
    >
      <div>
        <span className="eyebrow">{text(row, "category") || "SYSTEM"}</span>
        <h2>{text(row, "title") || "Notification"}</h2>
        <p>{text(row, "body") || "—"}</p>
        <small className="muted">{text(row, "createdAt") || "—"}</small>
      </div>
      {!row[READ_AT_KEY] ? (
        <Button
          tone="outline"
          loading={loading}
          disabled={!id}
          onClick={() => {
            setLoading(true)
            void markNotificationRead(id)
              .then(
                () => onRead(""),
                (reason: unknown) => onRead(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        >
          Mark read
        </Button>
      ) : (
        <span className="muted">Read</span>
      )}
    </article>
  )
}

function text(row: Notification | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "通知服务暂不可用，请稍后重试。"
}
