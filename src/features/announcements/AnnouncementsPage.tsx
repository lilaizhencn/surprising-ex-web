import { BellRing, Megaphone } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import {
  loadAnnouncements,
  markAllAnnouncementsRead,
  markAnnouncementRead,
} from "../../api/endpoints"
import { Button, Panel, StateView } from "../../components/ui/Primitives"
import { t, useLocale } from "../../i18n"
import { useSession } from "../../state/session"

type Announcement = Readonly<Record<string, unknown> & { readAt?: unknown }>

export function AnnouncementsPage() {
  const locale = useLocale()
  const [rows, setRows] = useState<readonly Announcement[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Announcement | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const load = useCallback(
    (nextOffset = 0, append = false) => {
      setLoading(true)
      setError("")
      void loadAnnouncements({
        locale: locale === "zh" ? "zh-CN" : "en-US",
        productLine: pageProductLine(),
        platform: "WEB",
        placement: "CENTER",
        offset: nextOffset,
        limit: 100,
      })
        .then(
          (result) => {
            const items = (result.announcements ?? []) as readonly Announcement[]
            setRows((current) => (append ? [...current, ...items] : items))
            setUnreadCount(result.unreadCount)
            setHasMore(result.hasMore)
          },
          (reason) => setError(readError(reason)),
        )
        .finally(() => setLoading(false))
    },
    [locale],
  )
  useEffect(load, [load])
  const visible = unreadOnly ? rows.filter((row) => !row.readAt) : rows

  async function open(row: Announcement) {
    setSelected(row)
    const id = text(row, "announcementId")
    if (!id || row.readAt) return
    try {
      const result = await markAnnouncementRead(
        id,
        pageProductLine(),
        "CENTER",
        locale === "zh" ? "zh-CN" : "en-US",
      )
      setSelected(result)
      setRows((current) =>
        current.map((item) => (text(item, "announcementId") === id ? result : item)),
      )
      setUnreadCount((value) => Math.max(0, value - 1))
    } catch (reason) {
      setError(readError(reason))
    }
  }

  async function markAll() {
    try {
      await markAllAnnouncementsRead(pageProductLine())
      await load(0)
    } catch (reason) {
      setError(readError(reason))
    }
  }

  return (
    <div className="container section announcements-page">
      <div className="page-heading">
        <div>
          <h1>{t("Announcements")}</h1>
          <p>{t("Exchange updates, maintenance notices and important service information.")}</p>
        </div>
        <Megaphone size={28} color="var(--color-primary)" />
      </div>
      <Panel>
        <div className="announcement-toolbar">
          <span>
            {t("Unread")}: {unreadCount}
          </span>
          <div>
            <Button tone="outline" onClick={() => setUnreadOnly((value) => !value)}>
              {unreadOnly ? t("Show all") : t("Unread only")}
            </Button>
            <Button tone="outline" onClick={() => void markAll()} disabled={unreadCount === 0}>
              {t("Mark all read")}
            </Button>
            <Button tone="outline" onClick={() => void load(0)} loading={loading}>
              {t("Refresh")}
            </Button>
          </div>
        </div>
        {error ? <StateView kind="error" message={error} /> : null}
        {loading && !rows.length ? (
          <StateView kind="loading" message={t("Loading announcements")} />
        ) : null}
        {!loading && !error && visible.length === 0 ? (
          <StateView kind="empty" message={t("No announcements yet.")} />
        ) : null}
        <div className="announcement-layout">
          <ul className="announcement-list" aria-label={t("Announcements")}>
            {visible.map((row) => {
              const id = text(row, "announcementId")
              const active = id === text(selected, "announcementId")
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`announcement-list-item ${active ? "active" : ""} ${row.readAt ? "read" : "unread"}`}
                    onClick={() => void open(row)}
                  >
                    <span className="eyebrow">{t(categoryLabel(text(row, "category")))}</span>
                    <strong>{text(row, "title") || t("Announcement")}</strong>
                    <span>{text(row, "summary")}</span>
                    <small>{formatDate(text(row, "startsAt"))}</small>
                  </button>
                </li>
              )
            })}
          </ul>
          <article className="announcement-detail">
            {selected ? (
              <>
                <span className="eyebrow">{t(categoryLabel(text(selected, "category")))}</span>
                <h2>{text(selected, "title")}</h2>
                {text(selected, "summary") ? (
                  <p className="announcement-summary">{text(selected, "summary")}</p>
                ) : null}
                <div className="announcement-body">{text(selected, "body")}</div>
                <small>{formatDate(text(selected, "startsAt"))}</small>
              </>
            ) : (
              <StateView kind="empty" message={t("Select an announcement to read its details.")} />
            )}
          </article>
        </div>
        {hasMore ? (
          <div className="announcement-load-more">
            <Button tone="outline" onClick={() => void load(rows.length, true)} loading={loading}>
              {t("Load more")}
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

export function AnnouncementSurfaces() {
  const locale = useLocale()
  const session = useSession()
  const [banner, setBanner] = useState<Announcement | null>(null)
  const [modal, setModal] = useState<Announcement | null>(null)
  const [busy, setBusy] = useState(false)
  const line = pageProductLine()

  useEffect(() => {
    let active = true
    const refresh = () => {
      void loadAnnouncements({
        locale: locale === "zh" ? "zh-CN" : "en-US",
        productLine: line,
        platform: "WEB",
        placement: "BANNER",
        limit: 1,
      }).then(
        (result) => {
          if (active) setBanner(result.announcements[0] ?? null)
        },
        () => {
          if (active) setBanner(null)
        },
      )
      if (session) {
        void loadAnnouncements({
          locale: locale === "zh" ? "zh-CN" : "en-US",
          productLine: line,
          platform: "WEB",
          placement: "MODAL",
          limit: 20,
        }).then(
          (result) => {
            if (!active) return
            const next = (result.announcements as Announcement[]).find(
              (row) =>
                !row.readAt &&
                !sessionStorage.getItem(
                  `announcement-modal:${session.user.userId}:${text(row, "announcementId")}`,
                ),
            )
            if (next) {
              sessionStorage.setItem(
                `announcement-modal:${session.user.userId}:${text(next, "announcementId")}`,
                "shown",
              )
              setModal(next)
            }
          },
          () => {},
        )
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener("focus", refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [locale, line, session?.accessToken])

  async function readAndClose() {
    if (!modal) return
    setBusy(true)
    try {
      await markAnnouncementRead(
        text(modal, "announcementId"),
        line,
        "MODAL",
        locale === "zh" ? "zh-CN" : "en-US",
      )
      setModal(null)
    } catch {
      setBusy(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {banner ? (
        <aside className="announcement-banner" role="status">
          <Megaphone size={18} />
          <strong>{text(banner, "title")}</strong>
          <span>{text(banner, "summary")}</span>
          <a href="/announcements">{t("Read announcement")}</a>
        </aside>
      ) : null}
      {modal ? (
        <div className="announcement-modal-backdrop" role="presentation">
          <section
            className="announcement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-modal-title"
          >
            <div className="announcement-modal-icon">
              <BellRing size={24} />
            </div>
            <span className="eyebrow">{t(categoryLabel(text(modal, "category")))}</span>
            <h2 id="announcement-modal-title">{text(modal, "title")}</h2>
            {text(modal, "summary") ? <p>{text(modal, "summary")}</p> : null}
            <div className="announcement-body">{text(modal, "body")}</div>
            <div className="announcement-modal-actions">
              <a href="/announcements">{t("Open announcement center")}</a>
              <Button onClick={() => void readAndClose()} loading={busy}>
                {t("Read and close")}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}

function text(row: Announcement | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

function pageProductLine() {
  const path = window.location.pathname
  const key = path.startsWith("/trade/") ? path.slice("/trade/".length) : ""
  return (
    (
      {
        spot: "SPOT",
        "usd-perpetual": "LINEAR_PERPETUAL",
        "usd-m-perpetuals": "LINEAR_PERPETUAL",
        "coin-perpetual": "INVERSE_PERPETUAL",
        "coin-m-perpetuals": "INVERSE_PERPETUAL",
        "delivery-futures": "LINEAR_DELIVERY",
        "coin-m-delivery": "INVERSE_DELIVERY",
        options: "OPTION",
      } as Record<string, string>
    )[key] ?? "ALL"
  )
}

function categoryLabel(value: string) {
  return (
    (
      {
        GENERAL: "General",
        PRODUCT: "Product update",
        MAINTENANCE: "Maintenance",
        SECURITY: "Security",
        RISK: "Risk notice",
      } as Record<string, string>
    )[value] ?? "Announcement"
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
}

function readError(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : t("Announcement service unavailable. Please retry later.")
}
