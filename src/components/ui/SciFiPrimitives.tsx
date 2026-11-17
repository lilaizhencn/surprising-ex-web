import { X } from "lucide-react"
import type { ReactNode } from "react"

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly value: T
  readonly onChange: (value: T) => void
  readonly ariaLabel: string
}) {
  return (
    <div className="sf-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className="sf-segmented-item ds-control"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function LeverageSlider({
  value,
  min = 1,
  max = 100,
  step = 1,
  ticks = [1, 10, 25, 50, 100],
  onChange,
  ariaLabel = "Leverage",
}: {
  readonly value: number
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly ticks?: readonly number[]
  readonly onChange: (next: number) => void
  readonly ariaLabel?: string
}) {
  return (
    <div className="sf-slider-wrap">
      <input
        type="range"
        className="sf-slider ds-control"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="sf-slider-ticks">
        {ticks.map((tick) => (
          <button
            key={tick}
            type="button"
            className="button-ghost ds-control"
            style={{ padding: "2px 4px", border: 0, fontSize: "inherit" }}
            onClick={() => onChange(tick)}
          >
            {tick}x
          </button>
        ))}
      </div>
    </div>
  )
}

export function Skeleton({
  height = 16,
  width = "100%",
  label = "Loading",
}: {
  readonly height?: number | string
  readonly width?: number | string
  readonly label?: string
}) {
  return <div className="sf-skeleton" style={{ height, width }} role="status" aria-label={label} />
}

export function AdlEnergyBar({
  level,
  max = 5,
}: {
  readonly level: number
  readonly max?: number
}) {
  const clamped = Math.max(0, Math.min(max, Math.round(level)))
  const tier = clamped <= 2 ? "low" : clamped <= 3 ? "mid" : "high"
  return (
    <span className="sf-adl-bar" role="img" aria-label={`ADL risk level ${clamped} of ${max}`}>
      {Array.from({ length: max }, (_, idx) => (
        <span
          key={idx}
          className="sf-adl-cell"
          data-active={idx < clamped ? "true" : "false"}
          data-tier={tier}
        />
      ))}
    </span>
  )
}

export function SciFiEmptyState({
  title,
  description,
  action,
}: {
  readonly title: string
  readonly description?: string | undefined
  readonly action?: ReactNode | undefined
}) {
  return (
    <div className="sf-empty-state">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <circle
          cx="28"
          cy="28"
          r="24"
          stroke="var(--border-strong)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <circle cx="28" cy="28" r="14" stroke="var(--aurora-cyan)" strokeWidth="1.5" />
        <path
          d="M28 8V14M28 42V48M8 28H14M42 28H48"
          stroke="var(--aurora-violet)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="28" cy="28" r="3" fill="var(--aurora-cyan)" />
      </svg>
      <strong style={{ color: "var(--text-primary)" }}>{title}</strong>
      {description ? <span className="muted">{description}</span> : null}
      {action}
    </div>
  )
}

export function ToastBanner({
  id,
  message,
  onDismiss,
}: {
  readonly id: string
  readonly message: string
  readonly onDismiss: () => void
}) {
  return (
    <div
      id={id}
      className="sf-toast"
      role="status"
      {...({ popover: "manual" } as Record<string, unknown>)}
    >
      <span>{message}</span>
      <button
        type="button"
        className="icon-button ds-control"
        aria-label="Close notification"
        onClick={onDismiss}
      >
        <X size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  )
}
