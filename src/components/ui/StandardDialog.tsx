import { X } from "lucide-react"
import { type ReactNode, useEffect, useId, useRef } from "react"
import { t } from "../../i18n"

export function StandardDialog({
  title,
  subtitle,
  onClose,
  closeDisabled = false,
  className = "",
  children,
}: {
  readonly title: string
  readonly subtitle?: string
  readonly onClose: () => void
  readonly closeDisabled?: boolean
  readonly className?: string
  readonly children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const subtitleId = useId()

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      className={`standard-dialog ${className}`.trim()}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        if (!closeDisabled) onClose()
      }}
    >
      <div className="standard-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label={t("Close")} onClick={onClose} disabled={closeDisabled}>
          <X size={20} />
        </button>
      </div>
      {subtitle ? (
        <p id={subtitleId} className="standard-dialog-subtitle">
          {subtitle}
        </p>
      ) : null}
      <div className="standard-dialog-content">{children}</div>
    </dialog>
  )
}
