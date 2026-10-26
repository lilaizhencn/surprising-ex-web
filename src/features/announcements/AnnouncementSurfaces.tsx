import { BellRing, Megaphone } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { loadAnnouncements, markAnnouncementRead } from "../../api/endpoints"
import type { ApiAnnouncement } from "../../api/types"
import { Button } from "../../components/ui/Primitives"
import { StandardDialog } from "../../components/ui/StandardDialog"
import { t, useLocale } from "../../i18n"
import { useSession } from "../../state/session"
import { announcementCategory, contentError, pageProductLine } from "./presentation"

export function AnnouncementSurfaces() {
  const locale = useLocale() === "zh" ? "zh-CN" : "en-US"
  const session = useSession()
  const owner = String(session?.user.userId ?? "guest")
  const line = pageProductLine()
  return (
    <ScopedSurfaces key={`${owner}:${line}:${locale}`} owner={owner} line={line} locale={locale} />
  )
}
function readShown(owner: string): string[] {
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem("surprising-ex.announcement-seen:" + owner) ?? "[]",
    )
    return Array.isArray(parsed) &&
      parsed.length <= 200 &&
      parsed.every((value) => typeof value === "string" && value.length <= 64)
      ? parsed
      : []
  } catch {
    return []
  }
}
const shownByUser = new Map<string, Set<string>>()
function shownInTab(owner: string) {
  const current = shownByUser.get(owner)
  if (current) return current
  const value = new Set(readShown(owner))
  shownByUser.set(owner, value)
  while (shownByUser.size > 4) shownByUser.delete(shownByUser.keys().next().value as string)
  return value
}
function ScopedSurfaces({
  owner,
  line,
  locale,
}: {
  readonly owner: string
  readonly line: string
  readonly locale: string
}) {
  const [banner, setBanner] = useState<ApiAnnouncement | null>(null)
  const [modal, setModal] = useState<ApiAnnouncement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const shown = useRef(shownInTab(owner))
  const current = useRef<ApiAnnouncement | null>(null)
  const writing = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    let timer: number,
      inFlight = false
    const refresh = async () => {
      if (inFlight || abort.signal.aborted || document.visibilityState !== "visible") return
      inFlight = true
      try {
        const responses = await Promise.allSettled([
          loadAnnouncements(
            { locale, productLine: line, placement: "BANNER", limit: 1 },
            abort.signal,
          ),
          owner === "guest"
            ? Promise.resolve(null)
            : loadAnnouncements(
                { locale, productLine: line, placement: "MODAL", limit: 20 },
                abort.signal,
              ),
        ])
        if (abort.signal.aborted) return
        const [bannerResult, modalResult] = responses
        setBanner(
          bannerResult.status === "fulfilled"
            ? (bannerResult.value.announcements[0] ?? null)
            : null,
        )
        if (!current.current && modalResult.status === "fulfilled" && modalResult.value) {
          const next = modalResult.value.announcements.find(
            (row) => !row.readAt && !shown.current.has(row.announcementId + ":" + row.version),
          )
          if (next) {
            shown.current.add(next.announcementId + ":" + next.version)
            while (shown.current.size > 200)
              shown.current.delete(shown.current.values().next().value as string)
            try {
              sessionStorage.setItem(
                "surprising-ex.announcement-seen:" + owner,
                JSON.stringify([...shown.current]),
              )
            } catch {
              /* Keep the shown set in this mounted view. */
            }
            current.current = next
            setModal(next)
            setError("")
          }
        }
      } finally {
        inFlight = false
      }
    }
    const tick = async () => {
      await refresh()
      if (!abort.signal.aborted) timer = window.setTimeout(() => void tick(), 60_000)
    }
    const focus = () => {
      void refresh()
    }
    void tick()
    window.addEventListener("focus", focus)
    return () => {
      abort.abort()
      window.clearTimeout(timer)
      window.removeEventListener("focus", focus)
    }
  }, [owner, line, locale])
  const close = () => {
    current.current = null
    setModal(null)
    setError("")
  }
  const readAndClose = async () => {
    const signal = lifetime.current?.signal
    if (!modal || !signal || signal.aborted || writing.current) return
    writing.current = true
    setBusy(true)
    setError("")
    try {
      await markAnnouncementRead(modal.announcementId, line, "MODAL", locale, signal)
      if (!signal.aborted) close()
    } catch (reason) {
      if (!signal.aborted) setError(contentError(reason))
    } finally {
      writing.current = false
      if (!signal.aborted) setBusy(false)
    }
  }
  return (
    <>
      {banner ? (
        <aside className="announcement-banner" role="status">
          <Megaphone size={18} aria-hidden="true" />
          <strong>{banner.title}</strong>
          <span>{banner.summary}</span>
          <a href="/announcements">{t("Read announcement")}</a>
        </aside>
      ) : null}
      {modal ? (
        <StandardDialog
          title={modal.title}
          subtitle={modal.summary}
          onClose={close}
          closeDisabled={busy}
          className="announcement-popup"
        >
          <div className="announcement-popup-category">
            <BellRing size={20} aria-hidden="true" />
            <span className="eyebrow">{t(announcementCategory(modal.category))}</span>
          </div>
          <div className="announcement-body">{modal.body}</div>
          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="announcement-modal-actions">
            <a
              href={busy ? undefined : "/announcements"}
              aria-disabled={busy || undefined}
              onClick={(event) => {
                if (busy) event.preventDefault()
                else close()
              }}
            >
              {t("Open announcement center")}
            </a>
            <Button loading={busy} onClick={() => void readAndClose()}>
              {t("Read and close")}
            </Button>
          </div>
        </StandardDialog>
      ) : null}
    </>
  )
}
