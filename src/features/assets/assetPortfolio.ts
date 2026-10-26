import { formatNumber, formatPrice, formatUsd } from "../../lib/format"
import { signedUnitsToDecimal } from "../../lib/units"
import type { Balance, ProductLine } from "../../types/domain"

export const productAccounts: Readonly<Record<ProductLine, string>> = {
  SPOT: "SPOT",
  LINEAR_PERPETUAL: "USDT_PERPETUAL",
  INVERSE_PERPETUAL: "COIN_PERPETUAL",
  LINEAR_DELIVERY: "USDT_DELIVERY",
  INVERSE_DELIVERY: "COIN_DELIVERY",
  OPTION: "OPTION",
}
const accountKeys: Readonly<Record<ProductLine, string>> = {
  SPOT: "spot",
  LINEAR_PERPETUAL: "usd-perpetual",
  INVERSE_PERPETUAL: "coin-perpetual",
  LINEAR_DELIVERY: "usd-delivery",
  INVERSE_DELIVERY: "coin-delivery",
  OPTION: "options",
}
export const productAccountKey = (line: ProductLine) => accountKeys[line]

/** Keep original integer balances for display; numeric estimates are never used for submissions. */
export function aggregateAssets(rows: readonly Balance[]): readonly Balance[] {
  const byAsset = new Map<string, Balance>()
  for (const row of rows) {
    const current = byAsset.get(row.asset)
    if (!current) {
      byAsset.set(row.asset, row)
      continue
    }
    const sameScale = current.scaleUnits && current.scaleUnits === row.scaleUnits
    byAsset.set(row.asset, {
      asset: row.asset,
      available:
        current.available === null || row.available === null
          ? null
          : current.available + row.available,
      locked: current.locked === null || row.locked === null ? null : current.locked + row.locked,
      estimatedUsd:
        current.estimatedUsd === null || row.estimatedUsd === null
          ? null
          : current.estimatedUsd + row.estimatedUsd,
      ...(sameScale ? { scaleUnits: current.scaleUnits } : {}),
      ...(sameScale && current.availableUnits !== undefined && row.availableUnits !== undefined
        ? {
            availableUnits: (
              BigInt(current.availableUnits) + BigInt(row.availableUnits)
            ).toString(),
          }
        : {}),
      ...(sameScale && current.lockedUnits !== undefined && row.lockedUnits !== undefined
        ? { lockedUnits: (BigInt(current.lockedUnits) + BigInt(row.lockedUnits)).toString() }
        : {}),
    })
  }
  return [...byAsset.values()].sort(
    (left, right) => (right.estimatedUsd ?? -Infinity) - (left.estimatedUsd ?? -Infinity),
  )
}

export function assetAmount(balance: Balance, kind: "available" | "locked" | "total"): string {
  const units =
    kind === "available"
      ? balance.availableUnits
      : kind === "locked"
        ? balance.lockedUnits
        : balance.availableUnits !== undefined && balance.lockedUnits !== undefined
          ? (BigInt(balance.availableUnits) + BigInt(balance.lockedUnits)).toString()
          : undefined
  if (units !== undefined && balance.scaleUnits) {
    const decimal = signedUnitsToDecimal(units, balance.scaleUnits)
    const [whole = "", fraction] = decimal.split(".")
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`
  }
  const value =
    kind === "total"
      ? balance.available === null || balance.locked === null
        ? null
        : balance.available + balance.locked
      : balance[kind]
  return balance.scaleUnits
    ? formatNumber(value, Math.min(20, balance.scaleUnits.length - 1))
    : formatPrice(value)
}

export function assetUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  if (value !== 0 && Math.abs(value) < 0.01)
    return `${value < 0 ? "-" : ""}$${formatPrice(Math.abs(value))}`
  return formatUsd(value)
}

export function allocationSegments(rows: readonly Balance[]) {
  if (rows.some((row) => row.estimatedUsd === null || row.estimatedUsd < 0)) return []
  const positive = rows.filter((row) => (row.estimatedUsd ?? 0) > 0)
  const total = positive.reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0)
  if (!Number.isFinite(total) || total <= 0) return []
  const segments = positive.slice(0, 5).map((row, index) => ({
    asset: row.asset,
    value: row.estimatedUsd ?? 0,
    percent: ((row.estimatedUsd ?? 0) / total) * 100,
    color: `var(--color-portfolio-${index + 1})`,
  }))
  const remainder = positive.slice(5).reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0)
  if (remainder > 0)
    segments.push({
      asset: "Other",
      value: remainder,
      percent: (remainder / total) * 100,
      color: "var(--color-portfolio-other)",
    })
  return segments
}

export function allocationGradient(segments: ReturnType<typeof allocationSegments>) {
  let start = 0
  return `conic-gradient(${segments
    .map((segment) => {
      const end = start + segment.percent
      const stop = `${segment.color} ${start}% ${end}%`
      start = end
      return stop
    })
    .join(", ")})`
}
