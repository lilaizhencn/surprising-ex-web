import { XCircle } from "lucide-react"
import { useState } from "react"
import { cancelOrder } from "../../api/endpoints"
import { useConfirmDialog } from "../../components/ui/ConfirmDialog"
import { Button } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import type { Market, ProductLine } from "../../types/domain"
import { SpotAmendOrderButton } from "../trading/SpotAmendOrderButton"
import { statusLabels, units } from "../trading/TradingAccountTables"
import { type RecordRow, readError, text } from "./ordersShared"

export function RecordTable({
  rows,
  mode,
  assetScales,
  productLine,
}: {
  readonly rows: readonly RecordRow[]
  readonly mode: "ledger" | "product-ledger" | "transfers" | "fills"
  readonly assetScales: Readonly<Record<string, string>>
  readonly productLine: ProductLine
}) {
  void productLine
  const columns =
    mode === "ledger" || mode === "product-ledger"
      ? ["asset", "referenceType", "amountUnits", "balanceAfterUnits", "createdAt"]
      : mode === "transfers"
        ? ["asset", "sourceAccountType", "targetAccountType", "amountUnits", "status", "createdAt"]
        : ["tradeId", "symbol", "side", "priceTicks", "quantitySteps", "eventTime"]
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{labelFor(column)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={text(row, "id") || text(row, "transferId") || String(index)}>
              {columns.map((column) => (
                <td className={column.toLowerCase().includes("units") ? "mono" : ""} key={column}>
                  {column.toLowerCase().includes("units")
                    ? units(row[column], text(row, "asset"), assetScales)
                    : text(row, column) || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function labelFor(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())
}

export function OrderTable({
  markets,
  assetScales,
  commandPending,
  rows,
  canCancel,
  productLine,
  onDone,
}: {
  readonly markets: Readonly<Record<string, Market>>
  readonly assetScales: Readonly<Record<string, string>>
  readonly rows: readonly RecordRow[]
  readonly canCancel: boolean
  readonly commandPending: boolean
  readonly productLine: ProductLine
  readonly onDone: (message: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("Symbol")}</th>
            <th>{t("Side / Type")}</th>
            <th>{t("Price")}</th>
            <th>{t("Average fill price")}</th>
            <th>{t("Quantity")}</th>
            <th>{t("Filled")}</th>
            <th>{t("Fees")}</th>
            <th>{t("Status")}</th>
            <th>{t("Created")}</th>
            <th>{t("Updated")}</th>
            {canCancel ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <OrderRow
              key={text(row, "orderId") || String(index)}
              row={row}
              market={markets[`${productLine}:${text(row, "instrumentId")}`]}
              scales={assetScales}
              canCancel={canCancel}
              commandPending={commandPending}
              productLine={productLine}
              onDone={onDone}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OrderRow({
  market,
  scales,
  commandPending,
  row,
  canCancel,
  productLine,
  onDone,
}: {
  readonly market: Market | undefined
  readonly scales: Readonly<Record<string, string>>
  readonly row: RecordRow
  readonly canCancel: boolean
  readonly commandPending: boolean
  readonly productLine: ProductLine
  readonly onDone: (message: string) => void
}) {
  const { confirm, dialog } = useConfirmDialog()
  const [busy, setBusy] = useState(false)
  const orderId = text(row, "orderId")
  return (
    <tr>
      <td>{text(row, "symbol") || "—"}</td>
      <td>
        {t(text(row, "side") === "BUY" ? "Buy" : "Sell")} /{" "}
        {t(text(row, "orderType") === "MARKET" ? "Market" : "Limit")}
      </td>
      <td className="mono">{text(row, "displayPrice")}</td>
      <td className="mono">{text(row, "displayAveragePrice")}</td>
      <td className="mono">{text(row, "displayQuantity")}</td>
      <td className="mono">
        {text(row, "displayFilled")} ({text(row, "fillProgress")}
        {t(")")}
      </td>
      <td className="mono">{text(row, "displayFees")}</td>
      <td>{t(statusLabels[text(row, "status")] ?? text(row, "status"))}</td>
      <td>{text(row, "displayCreatedAt")}</td>
      <td>{text(row, "displayUpdatedAt")}</td>
      {canCancel ? (
        <td>
          {productLine === "SPOT" && (
            <SpotAmendOrderButton
              row={row}
              market={market}
              scales={scales}
              disabled={commandPending || busy}
              onNotice={(message) => onDone(message)}
            />
          )}
          <Button
            tone="negative"
            loading={busy}
            disabled={commandPending || !orderId}
            onClick={() => {
              if (!orderId) return
              void confirm({
                title: t("Cancel this order?"),
                confirmLabel: t("Cancel"),
                danger: true,
              }).then((ok) => {
                if (!ok) return
                setBusy(true)
                void cancelOrder(text(row, "instrumentId"), orderId, productLine)
                  .then(
                    () => onDone(t("Order cancellation requested.")),
                    (reason: unknown) => onDone(readError(reason)),
                  )
                  .finally(() => setBusy(false))
              })
            }}
          >
            <XCircle size={14} /> {t("Cancel")}{" "}
          </Button>
          {dialog}
        </td>
      ) : null}
    </tr>
  )
}
