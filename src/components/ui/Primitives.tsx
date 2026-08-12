import { Check, Copy, LoaderCircle, Search, Star, TriangleAlert } from "lucide-react"
import type { ButtonHTMLAttributes, ReactNode } from "react"

const priceFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 })

type ButtonTone = "primary" | "outline" | "ghost" | "positive" | "negative"

export function Button({
  children,
  tone = "primary",
  loading = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly tone?: ButtonTone
  readonly loading?: boolean
}) {
  return (
    <button
      type="button"
      className={`button button-${tone}`}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : children}
    </button>
  )
}

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

export function Panel({
  children,
  className = "",
  dense = false,
}: {
  readonly children: ReactNode
  readonly className?: string
  readonly dense?: boolean
}) {
  return (
    <section className={`panel ${dense ? "panel-dense" : ""} ${className}`}>{children}</section>
  )
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  readonly label: string
  readonly error?: string
  readonly hint?: string
  readonly children: ReactNode
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder = "Search...",
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
}) {
  return (
    <div className="search-field">
      <Search size={18} aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  )
}

export function AssetIcon({ asset }: { readonly asset: string }) {
  return (
    <span className={`asset-icon asset-${asset.toLowerCase()}`} aria-hidden="true">
      {asset.slice(0, 1)}
    </span>
  )
}

export function Badge({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode
  readonly tone?: "neutral" | "positive" | "negative" | "warning" | "info"
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Price({
  value,
  prefix = "",
}: {
  readonly value: number | null
  readonly prefix?: string
}) {
  return (
    <span className="mono">
      {value === null ? "—" : `${prefix}${priceFormatter.format(value)}`}
    </span>
  )
}

export function Sparkline({
  values,
  positive = true,
}: {
  readonly values: readonly number[]
  readonly positive?: boolean
}) {
  const safe = values.length > 1 ? values : [0, 1]
  const min = Math.min(...safe)
  const max = Math.max(...safe)
  const range = max - min || 1
  const points = safe
    .map(
      (value, index) =>
        `${(index / (safe.length - 1)) * 100},${100 - ((value - min) / range) * 82 - 9}`,
    )
    .join(" ")
  return (
    <svg
      className={`sparkline ${positive ? "sparkline-positive" : "sparkline-negative"}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Price trend"
    >
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function StateView({
  kind,
  message,
  retry,
}: {
  readonly kind: "loading" | "empty" | "error"
  readonly message: string
  readonly retry?: () => void
}) {
  if (kind === "loading")
    return (
      <div className="state-view">
        <div className="skeleton state-icon" />
        <div className="skeleton state-line" />
        <div className="skeleton state-line state-line-short" />
      </div>
    )
  return (
    <div className="state-view">
      <TriangleAlert size={22} aria-hidden="true" />
      <p>{message}</p>
      {retry ? (
        <Button tone="outline" onClick={retry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

export function CopyButton({ value }: { readonly value: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(value)
  }
  return (
    <IconButton label="Copy" onClick={() => void copy()}>
      <Copy size={16} />
    </IconButton>
  )
}

export function FavoriteButton({
  active,
  onClick,
}: {
  readonly active: boolean
  readonly onClick: () => void
}) {
  return (
    <IconButton label={active ? "Remove from favorites" : "Add to favorites"} onClick={onClick}>
      <Star size={17} fill={active ? "currentColor" : "none"} />
    </IconButton>
  )
}

export function SuccessMark() {
  return (
    <span className="success-mark" role="img" aria-label="Success">
      <Check size={16} />
    </span>
  )
}
