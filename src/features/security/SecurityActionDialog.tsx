import type { ReactNode } from "react"
import { StandardDialog } from "../../components/ui/StandardDialog"

export function SecurityActionDialog({
  title,
  subtitle,
  onClose,
  children,
}: {
  readonly title: string
  readonly subtitle?: string
  readonly onClose: () => void
  readonly children: ReactNode
}) {
  return (
    <StandardDialog
      title={title}
      {...(subtitle ? { subtitle } : {})}
      onClose={onClose}
      className="security-dialog"
    >
      {children}
    </StandardDialog>
  )
}
