import { useCallback, useRef, useState } from "react"
import { t } from "../../i18n"
import { Button } from "./Primitives"
import { StandardDialog } from "./StandardDialog"

export type ConfirmOptions = Readonly<{
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}>

type PendingConfirm = ConfirmOptions & {
  resolve: (confirmed: boolean) => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  readonly open: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  if (!open) return null
  return (
    <StandardDialog title={title} onClose={onCancel} closeOnBackdrop>
      {description ? <p style={{ whiteSpace: "pre-line" }}>{description}</p> : null}
      <div className="security-dialog-actions" style={{ justifyContent: "flex-end" }}>
        <Button tone="outline" onClick={onCancel}>
          {cancelLabel ?? t("Cancel")}
        </Button>
        <Button tone={danger ? "negative" : "primary"} onClick={onConfirm}>
          {confirmLabel ?? t("Confirm")}
        </Button>
      </div>
    </StandardDialog>
  )
}

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const pendingRef = useRef<PendingConfirm | null>(null)

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const normalized: ConfirmOptions = typeof options === "string" ? { title: options } : options
    if (pendingRef.current) pendingRef.current.resolve(false)
    return new Promise<boolean>((resolve) => {
      const next: PendingConfirm = { ...normalized, resolve }
      pendingRef.current = next
      setPending(next)
    })
  }, [])

  const finish = useCallback((result: boolean) => {
    const current = pendingRef.current
    pendingRef.current = null
    setPending(null)
    current?.resolve(result)
  }, [])

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ""}
      {...(pending?.description ? { description: pending.description } : {})}
      {...(pending?.confirmLabel ? { confirmLabel: pending.confirmLabel } : {})}
      {...(pending?.cancelLabel ? { cancelLabel: pending.cancelLabel } : {})}
      danger={Boolean(pending?.danger)}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    />
  )

  return { confirm, dialog }
}
