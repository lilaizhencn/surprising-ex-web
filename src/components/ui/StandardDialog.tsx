import { X } from "lucide-react"
import { type ReactNode, useEffect, useId, useRef } from "react"
import { t } from "../../i18n"

export function StandardDialog({
  title,
  subtitle,
  onClose,
  closeDisabled = false,
  closeOnBackdrop = false,
  className = "",
  returnFocus,
  children,
}: {
  readonly title: string
  readonly subtitle?: string
  readonly onClose: () => void
  readonly closeDisabled?: boolean
  readonly closeOnBackdrop?: boolean
  readonly className?: string
  readonly returnFocus?: HTMLElement | null
  readonly children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const subtitleId = useId()

  useEffect(() => {
    const element = dialog.current
    const previousFocus =
      returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    element?.showModal()
    return () => {
      element?.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [returnFocus])

  return (
    <dialog
      ref={dialog}
      className={`standard-dialog ${className}`.trim()}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0)
        const first = focusable[0]
        const last = focusable.at(-1)
        if (
          first &&
          last &&
          ((event.shiftKey && document.activeElement === first) ||
            (!event.shiftKey && document.activeElement === last))
        ) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }}
      onPointerDown={(event) => {
        if (!closeOnBackdrop || closeDisabled || event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose()
      }}
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
