import { Download, FileText, ImageIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { type C2cAttachment, loadC2cAttachment } from "../../api/c2c"
import { Button } from "../../components/ui/Primitives"
import { t } from "../../i18n"

export function ChatAttachment({
  owner,
  attachment,
}: {
  readonly owner: string
  readonly attachment: C2cAttachment
}) {
  const root = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const image = ["image/jpeg", "image/png"].includes(attachment.contentType)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(entries.some((entry) => entry.isIntersecting))
      },
      { rootMargin: "160px" },
    )
    if (root.current) observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) {
      setUrl("")
      return
    }
    const abort = new AbortController()
    let objectUrl = ""
    setError("")
    void loadC2cAttachment(owner, attachment.attachmentId, abort.signal)
      .then((blob) => {
        if (abort.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : t("Unable to load attachment."))
      })
    return () => {
      abort.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [owner, attachment.attachmentId, visible, attempt])
  return (
    <div ref={root} className={`c2c-attachment ${image ? "c2c-attachment-image" : ""}`}>
      {image && url ? (
        <a href={url} target="_blank" rel="noreferrer" aria-label={t("Open image")}>
          <img src={url} alt={attachment.name} width={260} height={180} decoding="async" />
        </a>
      ) : (
        <div className="c2c-file-placeholder">
          {image ? <ImageIcon size={24} /> : <FileText size={24} />}
        </div>
      )}
      <span title={attachment.name}>{attachment.name}</span>
      {error ? (
        <>
          <span role="alert">{error}</span>
          <Button tone="outline" onClick={() => setAttempt((n) => n + 1)}>
            {t("Retry")}
          </Button>
        </>
      ) : url ? (
        <a className="c2c-download" href={url} download={attachment.name}>
          <Download size={14} />
          {t("Download")}
        </a>
      ) : (
        <small>{t("Loading attachment…")}</small>
      )}
    </div>
  )
}
