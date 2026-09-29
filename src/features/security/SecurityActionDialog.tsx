import { X } from "lucide-react"
import { type ReactNode, useEffect, useRef } from "react"
import { t } from "../../i18n"

export function SecurityActionDialog({
  title,
  onClose,
  children,
}: {
  readonly title: string
  readonly onClose: () => void
  readonly children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="security-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="security-dialog-heading">
        <h2>{title}</h2>
        <button type="button" aria-label={t("Close")} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
