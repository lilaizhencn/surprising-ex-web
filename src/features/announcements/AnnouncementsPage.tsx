import { Megaphone } from "lucide-react"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import {
  loadAnnouncements,
  markAllAnnouncementsRead,
  markAnnouncementRead,
} from "../../api/endpoints"
import type { ApiAnnouncement } from "../../api/types"
import { Button, Panel, StateView } from "../../components/ui/Primitives"
import { t, useLocale } from "../../i18n"
import { contentLocale } from "../../i18n/locales"
import { useSession } from "../../state/session"
import { ArticleView } from "./ArticleView"
import {
  announcementCategory,
  announcementDate,
  contentError,
  pageProductLine,
} from "./presentation"

export { AnnouncementSurfaces } from "./AnnouncementSurfaces"

type Page = Awaited<ReturnType<typeof loadAnnouncements>>
const PAGE_SIZE = 5
export function AnnouncementsPage() {
  const locale = contentLocale(useLocale())
  const session = useSession()
  const line = pageProductLine()
  return (
    <AnnouncementCenter
      key={`${session?.user.userId ?? "guest"}:${locale}:${line}`}
      authenticated={Boolean(session)}
      locale={locale}
      line={line}
    />
  )
}
function AnnouncementCenter({
  authenticated,
  locale,
  line,
}: {
  readonly authenticated: boolean
  readonly locale: string
  readonly line: string
}) {
  const [page, setPage] = useState<Page | null>(null)
  const [selected, setSelected] = useState<ApiAnnouncement | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [paging, setPaging] = useState(false)
  const [error, setError] = useState("")
  const [actionError, setActionError] = useState("")
  const [allBusy, setAllBusy] = useState(false)
  const [reading, setReading] = useState(new Set<string>())
  const [notice, setNotice] = useState("")
  const life = useRef<AbortController | null>(null)
  const query = useRef<AbortController | null>(null)
  const readLocks = useRef(new Set<string>())
  const allLock = useRef(false)
  const detailTitle = useRef<HTMLHeadingElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const mutating = allBusy || reading.size > 0 || paging
  const initialLoad = useEffectEvent(() => {
    void load(0)
  })
  const selectedId = selected?.announcementId
  useEffect(() => {
    const abort = new AbortController()
    life.current = abort
    initialLoad()
    return () => {
      abort.abort()
      query.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (!selectedId) return
    detailTitle.current?.focus({ preventScroll: true })
    if (window.innerWidth < 760) detailTitle.current?.scrollIntoView({ block: "start" })
  }, [selectedId])
  async function load(offset = page?.offset ?? 0) {
    query.current?.abort()
    const abort = new AbortController()
    query.current = abort
    const isPaging = page !== null
    if (isPaging) {
      setPaging(true)
    } else {
      setInitialLoading(true)
      setSelected(null)
    }
    setError("")
    setActionError("")
    try {
      const result = await loadAnnouncements(
        {
          locale,
          productLine: line,
          platform: "WEB",
          placement: "CENTER",
          offset,
          limit: PAGE_SIZE,
        },
        abort.signal,
      )
      if (result.offset !== offset || result.limit !== PAGE_SIZE)
        throw new Error(
          t("The service returned an unexpected response. Please refresh and try again."),
        )
      if (!abort.signal.aborted) setPage(result)
    } catch (reason) {
      if (!abort.signal.aborted) {
        if (isPaging) setActionError(contentError(reason))
        else setError(contentError(reason))
      }
    } finally {
      if (!abort.signal.aborted) {
        if (isPaging) setPaging(false)
        else setInitialLoading(false)
      }
    }
  }
  async function open(row: ApiAnnouncement) {
    setSelected(row)
    if (
      !authenticated ||
      row.readAt ||
      readLocks.current.has(row.announcementId) ||
      allLock.current
    )
      return
    const signal = life.current?.signal
    if (!signal || signal.aborted) return
    readLocks.current.add(row.announcementId)
    setReading(new Set(readLocks.current))
    setActionError("")
    try {
      const result = await markAnnouncementRead(row.announcementId, line, "CENTER", locale, signal)
      if (signal.aborted) return
      setPage((current) => {
        if (!current) return current
        const wasUnread = current.announcements.some(
          (item) => item.announcementId === row.announcementId && !item.readAt,
        )
        return {
          ...current,
          announcements: current.announcements.map((item) =>
            item.announcementId === row.announcementId ? result : item,
          ),
          unreadCount: Math.max(0, current.unreadCount - (wasUnread ? 1 : 0)),
        }
      })
      setSelected((current) => (current?.announcementId === row.announcementId ? result : current))
    } catch (reason) {
      if (!signal.aborted) setActionError(contentError(reason))
    } finally {
      readLocks.current.delete(row.announcementId)
      if (!signal.aborted) setReading(new Set(readLocks.current))
    }
  }
  async function markAll() {
    const signal = life.current?.signal
    if (
      !signal ||
      signal.aborted ||
      allLock.current ||
      readLocks.current.size ||
      !page?.unreadCount
    )
      return
    allLock.current = true
    setAllBusy(true)
    setActionError("")
    setNotice("")
    try {
      await markAllAnnouncementsRead(line, signal)
      if (!signal.aborted) {
        setNotice(t("All announcements marked as read."))
        await load(page.offset)
      }
    } catch (reason) {
      if (!signal.aborted) setActionError(contentError(reason))
    } finally {
      allLock.current = false
      if (!signal.aborted) setAllBusy(false)
    }
  }
  const visible = unreadOnly
    ? (page?.announcements.filter((row) => !row.readAt) ?? [])
    : (page?.announcements ?? [])
  return (
    <div className="container section announcements-page">
      <div className="page-heading">
        <div>
          <h1>{t("Announcements")}</h1>
        </div>
        <Megaphone size={28} aria-hidden="true" />
      </div>
      <Panel>
        {authenticated ? (
          <div className="announcement-toolbar">
            <span role="status">
              {t("Unread")}: {page?.unreadCount ?? "—"}
            </span>
            <div>
              <Button
                tone="outline"
                disabled={mutating || initialLoading}
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly((value) => !value)}
              >
                {unreadOnly ? t("Show all") : t("Unread only")}
              </Button>
              <Button
                tone="outline"
                onClick={() => void markAll()}
                loading={allBusy}
                disabled={mutating || initialLoading || !page?.unreadCount}
              >
                {t("Mark all read")}
              </Button>
            </div>
          </div>
        ) : null}
        {notice ? (
          <p className="content-notice" role="status">
            {notice}
          </p>
        ) : null}
        {actionError ? (
          <p role="alert" className="inline-error content-notice">
            {actionError}
          </p>
        ) : null}
        {initialLoading && !page ? (
          <div role="status" aria-busy="true">
            <StateView kind="loading" message="Loading announcements" />
            <span className="sr-only">{t("Loading announcements")}</span>
          </div>
        ) : error && !page ? (
          <StateView kind="error" message={error} retry={() => void load(0)} />
        ) : (
          <>
            {visible.length === 0 && unreadOnly ? (
              <StateView
                kind="empty"
                message="No unread announcements on this page."
              />
            ) : null}
            <div className="announcement-layout">
              <ul
                ref={list}
                tabIndex={-1}
                className={`announcement-list ${paging ? "paging" : ""}`}
                aria-label={t("Announcements")}
                aria-busy={paging || undefined}
              >
                {visible.map((row) => (
                  <li key={row.announcementId}>
                    <button
                      type="button"
                      disabled={allBusy}
                      aria-current={
                        selected?.announcementId === row.announcementId ? "true" : undefined
                      }
                      className={`announcement-list-item ${selected?.announcementId === row.announcementId ? "active" : ""} ${row.readAt || !authenticated ? "read" : "unread"}`}
                      onClick={() => void open(row)}
                    >
                      <span className="eyebrow">{t(announcementCategory(row.category))}</span>
                      <strong>{row.title}</strong>
                      <span>{row.summary}</span>
                      <small>
                        <time dateTime={row.startsAt}>{announcementDate(row.startsAt)}</time>
                        {reading.has(row.announcementId) ? " · " + t("Updating read status…") : ""}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              <article className="announcement-detail" data-empty={!selected || undefined}>
                {selected ? (
                  <>
                    <span className="eyebrow">{t(announcementCategory(selected.category))}</span>
                    <h2 ref={detailTitle} tabIndex={-1}>
                      {selected.title}
                    </h2>
                    {selected.summary ? (
                      <p className="announcement-summary">{selected.summary}</p>
                    ) : null}
                    <ArticleView
                      html={selected.bodyHtml}
                      text={selected.body}
                      locale={selected.locale}
                    />
                    <small>
                      <time dateTime={selected.startsAt}>
                        {announcementDate(selected.startsAt)}
                      </time>
                    </small>
                    <div className="announcement-detail-actions">
                      {authenticated && !selected.readAt ? (
                        <Button
                          tone="outline"
                          loading={reading.has(selected.announcementId)}
                          disabled={allBusy}
                          onClick={() => void open(selected)}
                        >
                          {t("Mark read")}
                        </Button>
                      ) : null}
                      <Button
                        tone="ghost"
                        onClick={() => {
                          setSelected(null)
                          requestAnimationFrame(() => list.current?.focus())
                        }}
                      >
                        {t("Back to announcements")}
                      </Button>
                    </div>
                  </>
                ) : null}
              </article>
            </div>
            {page && (page.offset > 0 || page.hasMore) ? (
              <nav className="announcement-pagination" aria-label={t("Announcement pages")}>
                <Button
                  tone="outline"
                  disabled={mutating || page.offset === 0}
                  onClick={() => void load(Math.max(0, page.offset - PAGE_SIZE))}
                >
                  {t("Previous")}
                </Button>
                <span className="muted">
                  {t("Page")} {Math.floor(page.offset / PAGE_SIZE) + 1}
                  {unreadOnly ? " · " + t("Unread filter applies to this page.") : ""}
                </span>
                <Button
                  tone="outline"
                  disabled={mutating || !page.hasMore}
                  onClick={() => void load(page.offset + PAGE_SIZE)}
                >
                  {t("Next")}
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  )
}
