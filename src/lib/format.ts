const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })
const dataFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 })

export function formatNumber(value: number | null, maximumFractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value)
}

export function formatPrice(value: number | null): string {
  return value === null ? "—" : dataFormatter.format(value)
}

export function formatUsd(value: number | null): string {
  return value === null ? "—" : `$${numberFormatter.format(value)}`
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

export function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-US", { hour12: false })
}
