import { useEffect, useState } from "react"
import type { ApiFundingPayment, ApiFundingRate } from "../../api/types"
import { Badge, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { signedUnitsToDecimal } from "../../lib/units"

export function formatFundingRate(
  value: Pick<ApiFundingRate, "fundingRatePpm"> | Pick<ApiFundingPayment, "fundingRatePpm"> | null,
): string {
  const raw = value?.fundingRatePpm
  const ppm = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
  return Number.isFinite(ppm) ? `${ppm >= 0 ? "+" : ""}${(ppm / 10_000).toFixed(4)}%` : "—"
}

function formatFundingAmount(
  value: ApiFundingPayment,
  assetScales: Readonly<Record<string, string>>,
): string {
  const asset = value.asset
  const scale = asset ? assetScales[asset] : undefined
  if (!asset || !scale) return `${String(value.amountUnits)} units`
  try {
    return `${signedUnitsToDecimal(value.amountUnits, scale)} ${asset}`
  } catch {
    return `${String(value.amountUnits)} units`
  }
}

export function FundingPayments({
  symbol,
  rows,
  error,
  assetScales,
}: {
  readonly symbol: string
  readonly rows: readonly ApiFundingPayment[]
  readonly error: string
  readonly assetScales: Readonly<Record<string, string>>
}) {
  return (
    <Panel dense>
      <div className="panel-heading">
        <h2>{t("Funding payment history")}</h2>
        <Badge tone="info">{t("Backend records")}</Badge>
      </div>
      {error ? (
        <StateView kind="error" message={error} />
      ) : rows.length === 0 ? (
        <StateView kind="empty" message="No funding payments returned for this contract." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Symbol")}</th>
                <th>{t("Asset")}</th>
                <th>{t("Rate")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Created")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.paymentId) || String(index)}>
                  <td>{symbol}</td>
                  <td>{row.asset || "—"}</td>
                  <td className="mono">{formatFundingRate(row)}</td>
                  <td className="mono">{formatFundingAmount(row, assetScales)}</td>
                  <td>{row.createdAt || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

export function FundingMarketHistory({
  rows,
  settlement,
  error,
}: {
  readonly rows: readonly ApiFundingRate[]
  readonly settlement: Record<string, unknown> | null
  readonly error: string
}) {
  return (
    <Panel dense>
      <div className="panel-heading">
        <h2>{t("Funding market history")}</h2>
        <Badge tone="info">{t("Backend records")}</Badge>
      </div>
      {error ? <StateView kind="error" message={error} /> : null}
      <div className="risk-summary-grid">
        <Detail
          label={t("Latest settlement")}
          value={text(settlement, "fundingTime") || text(settlement, "eventTime") || "—"}
        />
        <Detail label={t("Settlement status")} value={text(settlement, "status") || "—"} />
        <Detail label={t("Settled payments")} value={text(settlement, "positionCount") || "—"} />
      </div>
      {rows.length === 0 ? (
        <StateView kind="empty" message="No funding rate history returned for this contract." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Funding time")}</th>
                <th>{t("Rate")}</th>
                <th>{t("Premium")}</th>
                <th>{t("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row, index) => (
                <tr key={`${row.sequence}-${index}`}>
                  <td>{row.fundingTime || "—"}</td>
                  <td className="mono">{formatFundingRate(row)}</td>
                  <td className="mono">
                    {row.premiumRatePpm == null ? t("Unavailable") : ppmText(row.premiumRatePpm)}
                  </td>
                  <td>{row.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function ppmText(value: string | number): string {
  const ppm = Number(value)
  return Number.isFinite(ppm) ? `${(ppm / 10_000).toFixed(4)}%` : "—"
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="contract-detail">
      <small>{label}</small>
      <strong className="mono">{value}</strong>
    </div>
  )
}

function text(row: Record<string, unknown> | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
export function formatNextFundingTime(value: ApiFundingRate | null): string {
  return formatFundingCountdown(value?.fundingTime)
}

export function formatFundingCountdown(raw?: string | null): string {
  if (typeof raw !== "string" || !raw) return "—"
  const target = new Date(raw).getTime()
  if (Number.isNaN(target)) return "—"
  const diff = target - Date.now()
  if (diff <= 0) return "00:00:00"
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function FundingCountdown({ value }: { readonly value: ApiFundingRate | null }) {
  const [countdown, setCountdown] = useState(() => formatFundingCountdown(value?.fundingTime))

  useEffect(() => {
    setCountdown(formatFundingCountdown(value?.fundingTime))
    const timer = setInterval(() => {
      setCountdown(formatFundingCountdown(value?.fundingTime))
    }, 1000)
    return () => clearInterval(timer)
  }, [value?.fundingTime])

  return <span>{countdown}</span>
}
