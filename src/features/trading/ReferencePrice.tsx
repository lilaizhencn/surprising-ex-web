import { type ReactNode, useEffect, useState } from "react"
import { t } from "../../i18n"

// Index and mark are published every second; expiry is a display guard, not a risk calculation.
export function referencePriceFresh(eventTime: unknown, now: number): boolean {
  if (typeof eventTime !== "string") return false
  const timestamp = Date.parse(eventTime)
  return Number.isFinite(timestamp) && timestamp <= now + 1_000 && now - timestamp <= 5_000
}

export function ReferencePrice({
  eventTime,
  connected,
  children,
}: {
  readonly eventTime: unknown
  readonly connected: boolean
  readonly children: ReactNode
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (typeof eventTime !== "string") return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [eventTime])
  const fresh = connected && referencePriceFresh(eventTime, Math.max(now, Date.now()))
  return fresh ? (
    children
  ) : (
    <span className="muted" title={t("Reference price is delayed. Waiting for a fresh update.")}>
      — {eventTime ? t("Price delayed") : ""}
    </span>
  )
}
