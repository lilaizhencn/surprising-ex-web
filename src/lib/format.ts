const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })

export function formatNumber(value: number | null, maximumFractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value)
}

/** Decimal places needed for a tick, including non-power-of-ten ticks such as 0.000025. */
export function priceDecimalsForStep(step: number, declaredPrecision = 2): number {
  if (!Number.isFinite(step) || step <= 0) return Math.max(0, Math.min(20, declaredPrecision))
  const [coefficient = "", exponent = "0"] = step.toString().toLowerCase().split("e")
  const fraction = coefficient.split(".")[1]?.length ?? 0
  return Math.max(2, Math.min(20, fraction - Number(exponent)))
}

export function formatPrice(value: number | null, precision?: number): string {
  if (value === null || !Number.isFinite(value)) return "—"
  const magnitude = Math.abs(value)
  // Unknown instruments use enough significant digits to keep tiny prices visible.
  const visibleDigits = magnitude > 0 && magnitude < 1 ? Math.ceil(-Math.log10(magnitude)) + 2 : 2
  let digits = precision === undefined ? visibleDigits : Math.max(0, Math.min(20, precision))
  if (magnitude > 0 && magnitude < 0.5 * 10 ** -digits) digits = visibleDigits
  if (digits > 20) return value.toExponential(3)
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: precision === undefined ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value)
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
