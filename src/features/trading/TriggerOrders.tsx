import { useState } from "react"
import { cancelTriggerOrder } from "../../api/endpoints"
import type { ApiTriggerOrder } from "../../api/types"
import { Badge } from "../../components/ui/Primitives"
import { t, tf } from "../../i18n"
import { stepUnitsToDecimal } from "../../lib/units"
import { type Market, PRODUCT_LINES, type ProductLine } from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"

export function TriggerOrders({
  rows,
  pending,
  productLine,
  userId,
  market,
  assetScales,
  onDone,
}: {
  readonly rows: readonly ApiTriggerOrder[]
  readonly pending: boolean
  readonly productLine: ProductLine
  readonly userId: string | number | undefined
  readonly market: Market | null
  readonly assetScales: Readonly<Record<string, string>>
  readonly onDone: (message: string) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="trigger-orders-state">
        <p className="account-table-empty">{t("No pending trigger orders for this pair.")}</p>
      </div>
    )
  }
  return (
    <div className="trigger-orders-state">
      <div className="table-wrap">
        <table className="data-table compact-trading-table">
          <thead>
            <tr>
              <th>{t("Protection")}</th>
              <th>{t("Trigger price")}</th>
              <th>{t("Close side")}</th>
              <th>{t("Quantity")}</th>
              <th>{t("Execution")}</th>
              <th>{t("Status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <TriggerOrderRow
                key={String(row.triggerOrderId)}
                pending={pending}
                row={row}
                productLine={productLine}
                userId={userId}
                market={market}
                assetScales={assetScales}
                onDone={onDone}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TriggerOrderRow({
  row,
  pending,
  productLine,
  userId,
  market,
  assetScales,
  onDone,
}: {
  readonly row: ApiTriggerOrder
  readonly pending: boolean
  readonly productLine: ProductLine
  readonly userId: string | number | undefined
  readonly market: Market | null
  readonly assetScales: Readonly<Record<string, string>>
  readonly onDone: (message: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const triggerPrice = formatTriggerOrderPrice(row, market, assetScales)
  const quantity = formatTriggerOrderQuantity(row, market, assetScales)
  return (
    <tr>
      <td>
        <b>{triggerTypeLabel(row.triggerType)}</b>
        <small className="table-subline mono">#{String(row.triggerOrderId)}</small>
      </td>
      <td className="mono" title={tf("ticks: {p0}", { p0: String(row.triggerPriceTicks) })}>
        {row.triggerCondition === "GREATER_OR_EQUAL" ? "≥" : "≤"} {triggerPrice}
        <small className="table-subline">
          {t(
            row.priceSource === "LAST"
              ? "Last traded price"
              : row.priceSource === "INDEX"
                ? "Index price"
                : "Mark price",
          )}
        </small>
      </td>
      <td>{row.side === "SELL" ? t("Close long") : t("Close short")}</td>
      <td className="mono">{quantity}</td>
      <td>{row.orderType === "MARKET" ? t("Market") : t("Limit")}</td>
      <td>
        <Badge tone={triggerStatusTone(row.status)}>{triggerStatusLabel(row.status)}</Badge>
      </td>
      <td>
        <button
          type="button"
          className="compact-cancel"
          aria-busy={loading}
          disabled={loading || pending || userId === undefined || row.status !== "PENDING"}
          onClick={() => {
            if (
              userId === undefined ||
              !window.confirm(t("Cancel this take-profit / stop-loss order?"))
            )
              return
            setLoading(true)
            void cancelTriggerOrder(userId, row.triggerOrderId, productLine, row.instrumentId)
              .then(
                () => onDone(t("Trigger order cancellation requested.")),
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        >
          {t("Revoke")}
        </button>
      </td>
    </tr>
  )
}

function triggerTypeLabel(value: ApiTriggerOrder["triggerType"]): string {
  if (value === "STOP_LOSS") return t("Stop loss")
  if (value === "TAKE_PROFIT") return t("Take profit")
  return t("Trailing stop")
}

function triggerStatusLabel(value: ApiTriggerOrder["status"]): string {
  const labels: Readonly<Record<ApiTriggerOrder["status"], string>> = {
    PENDING: t("Pending"),
    TRIGGERING: t("Triggering"),
    TRIGGERED: t("Triggered"),
    TRIGGER_FAILED: t("Failed"),
    CANCELED: t("Canceled"),
    EXPIRED: t("Expired"),
  }
  return labels[value]
}

function triggerStatusTone(
  value: ApiTriggerOrder["status"],
): "neutral" | "positive" | "negative" | "warning" | "info" {
  if (value === "PENDING") return "info"
  if (value === "TRIGGERED") return "positive"
  if (value === "TRIGGER_FAILED") return "negative"
  if (value === "TRIGGERING") return "warning"
  return "neutral"
}

function formatTriggerOrderPrice(
  row: ApiTriggerOrder,
  market: Market | null,
  assetScales: Readonly<Record<string, string>>,
): string {
  if (!market?.priceTickUnits || !assetScales[market.quoteAsset]) {
    return `ticks ${String(row.triggerPriceTicks)}`
  }
  try {
    return `${stepUnitsToDecimal(row.triggerPriceTicks, market.priceTickUnits, assetScales[market.quoteAsset] ?? "1")} ${market.quoteAsset}`
  } catch {
    return `ticks ${String(row.triggerPriceTicks)}`
  }
}

function formatTriggerOrderQuantity(
  row: ApiTriggerOrder,
  market: Market | null,
  assetScales: Readonly<Record<string, string>>,
): string {
  if (!market) {
    return `steps ${String(row.quantitySteps)}`
  }
  try {
    const spec = marketQuantitySpec(market, assetScales)
    return `${stepUnitsToDecimal(row.quantitySteps, spec.unitSize, spec.scale)} ${market.productLine === PRODUCT_LINES.spot ? market.baseAsset : t("Contracts")}`
  } catch {
    return `steps ${String(row.quantitySteps)}`
  }
}

function readError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : t("Trading service is unavailable. Please retry later.")
}
