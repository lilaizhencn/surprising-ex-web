import type { ApiAccountLedgerEntry, ApiOrder, ApiProductTransferRecord } from "../../api/types"
import { t } from "../../i18n"

export type RecordRow =
  | ApiOrder
  | ApiAccountLedgerEntry
  | ApiProductTransferRecord
  | Readonly<Record<string, unknown>>

export type OrdersTab =
  | "open"
  | "history"
  | "fills"
  | "ledger"
  | "product-ledger"
  | "transfers"
  | "algo"
  | "triggers"
  | "advanced"

export function text(row: RecordRow | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

export function readError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : t("Order service unavailable. Please retry later.")
}

export function dateValue(value: string, end = false): number | undefined {
  if (!value) return undefined
  const parsed = Date.parse(`${value}T${end ? "23:59:59.999" : "00:00:00"}`)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function inDateRange(row: RecordRow, from: string, to: string): boolean {
  const value = row["createdAt"] ?? row["eventTime"] ?? row["updatedAt"]
  const timestamp = Date.parse(String(value ?? ""))
  if (!Number.isFinite(timestamp)) return !from && !to
  const start = from ? Date.parse(`${from}T00:00:00`) : Number.NEGATIVE_INFINITY
  const end = to ? Date.parse(`${to}T23:59:59.999`) : Number.POSITIVE_INFINITY
  return timestamp >= start && timestamp <= end
}

export function downloadCsv(rows: readonly RecordRow[], tab: OrdersTab): void {
  if (rows.length === 0) return
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const lines = [columns, ...rows.map((row) => columns.map((column) => text(row, column)))]
    .map((values) => values.map(csvValue).join(","))
    .join("\n")
  const blob = new Blob([`\uFEFF${lines}`], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `surprising-ex-${tab}-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvValue(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}
