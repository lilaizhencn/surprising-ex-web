import { Paperclip, Send, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
  type C2cAttachment,
  type C2cConversation,
  type C2cMessage,
  type C2cSend,
  loadC2cQuickReplies,
  recoverC2cAttachment,
  uploadC2cAttachment,
} from "../../api/c2c"
import { ApiError } from "../../api/client"
import { Button, IconButton } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { deliverMessage, forgetMessage, pendingMessage, rememberMessage } from "./pendingMessage"

export function ChatComposer({
  owner,
  conversation,
  onSent,
}: {
  readonly owner: string
  readonly conversation: C2cConversation
  readonly onSent: (message: C2cMessage) => void
}) {
  const id = conversation.conversationId
  const [pending, setPending] = useState<C2cSend | null>(() => pendingMessage(owner, id))
  const [text, setText] = useState(() => pending?.text ?? "")
  const [attachment, setAttachment] = useState<C2cAttachment | null>(null)
  const [upload, setUpload] = useState<{ id: string; file: File } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [replies, setReplies] = useState<{ replyId: string; text: string }[]>([])
  const alive = useRef(true)
  const busy = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    alive.current = true
    const abort = new AbortController()
    void loadC2cQuickReplies(owner, abort.signal)
      .then((page) => {
        if (!abort.signal.aborted) setReplies(page.items)
      })
      .catch(() => {})
    return () => {
      alive.current = false
      abort.abort()
    }
  }, [owner])

  const send = async () => {
    if (busy.current || uploading || upload || (!pending && !text.trim() && !attachment)) return
    const message = pending ?? {
      requestId: crypto.randomUUID(),
      text: text.trim(),
      attachmentId: attachment?.attachmentId ?? null,
    }
    busy.current = true
    setError("")
    setSending(true)
    try {
      // Persistence must succeed before the mutation. Refreshing an uncertain send
      // then offers the same request instead of inventing a new message identity.
      rememberMessage(owner, id, message)
      setPending(message)
      const result = await deliverMessage(owner, id, message, pending !== null)
      forgetMessage(owner, id)
      if (alive.current) {
        setText("")
        setAttachment(null)
        setPending(null)
        onSent(result)
      }
    } catch (failure) {
      if (!alive.current) return
      // Explicit validation/permission rejections have not committed this new send.
      // Timeouts, rate limiting and malformed success responses remain recoverable.
      if (
        !pending &&
        failure instanceof ApiError &&
        [400, 403, 404, 409, 413, 415, 422].includes(failure.status)
      ) {
        forgetMessage(owner, id)
        setPending(null)
      }
      setError(failure instanceof Error ? failure.message : t("Unable to send message."))
    } finally {
      busy.current = false
      if (alive.current) setSending(false)
    }
  }

  const attach = async (candidate: { id: string; file: File }, retry = false) => {
    if (busy.current || uploading) return
    setError("")
    setUploading(true)
    try {
      if (retry) {
        const recovered = await recoverC2cAttachment(owner, candidate.id)
        if (recovered.status === "READY") {
          if (alive.current) {
            setAttachment(recovered)
            setUpload(null)
          }
          return
        }
      }
      const result = await uploadC2cAttachment(owner, conversation, candidate.id, candidate.file)
      if (alive.current) {
        setAttachment(result)
        setUpload(null)
      }
    } catch (failure) {
      if (alive.current) {
        setUpload(candidate)
        setError(failure instanceof Error ? failure.message : t("Unable to upload attachment."))
      }
    } finally {
      if (alive.current) setUploading(false)
    }
  }
  const selectFile = (file: File | undefined) => {
    if (!file) return
    if (
      !file.size ||
      file.size > 10 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "application/pdf"].includes(file.type)
    ) {
      setError(t("Choose a JPG, PNG or PDF up to 10 MB."))
      return
    }
    const candidate = { id: crypto.randomUUID(), file }
    setUpload(candidate)
    void attach(candidate)
  }

  return (
    <form
      className="c2c-composer"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      {replies.length > 0 ? (
        <label className="c2c-quick-reply">
          {t("Quick replies")}
          <select
            aria-label={t("Quick replies")}
            value=""
            disabled={pending !== null}
            onChange={(event) => setText(event.target.value)}
          >
            <option value="">{t("Choose a reply")}</option>
            {replies.map((reply) => (
              <option key={reply.replyId} value={reply.text}>
                {reply.text}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {pending ? (
        <div className="c2c-notice" role="status">
          {t("Delivery is unconfirmed. Retry checks the original request first.")}
        </div>
      ) : null}
      {attachment || upload ? (
        <div className="c2c-selected-file">
          <Paperclip size={16} />
          <span>{attachment?.name ?? upload?.file.name}</span>
          {uploading ? (
            <small>{t("Uploading…")}</small>
          ) : upload ? (
            <Button tone="outline" onClick={() => void attach(upload, true)}>
              {t("Retry upload")}
            </Button>
          ) : (
            <small>{t("Ready")}</small>
          )}
          <IconButton
            label="Remove attachment"
            disabled={sending || uploading || pending !== null}
            onClick={() => {
              setAttachment(null)
              setUpload(null)
            }}
          >
            <X size={16} />
          </IconButton>
        </div>
      ) : null}
      {error ? (
        <p className="c2c-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="c2c-compose-row">
        <IconButton
          label="Attach a file"
          disabled={pending !== null || uploading || sending}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip size={20} />
        </IconButton>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          hidden
          onChange={(event) => {
            selectFile(event.target.files?.[0])
            event.target.value = ""
          }}
        />
        <textarea
          aria-label={t("Message")}
          placeholder={t("Write a message…")}
          value={text}
          maxLength={4000}
          rows={2}
          disabled={pending !== null || sending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <Button
          type="submit"
          loading={sending}
          disabled={uploading || upload !== null || (!pending && !text.trim() && !attachment)}
        >
          <Send size={17} />
          {pending ? t("Check and retry") : t("Send")}
        </Button>
      </div>
      <small className="c2c-compose-hint">
        {t("Keep payment discussions here. A chat message does not confirm payment.")}
      </small>
    </form>
  )
}
