import { cancelTriggerOrder } from "../../api/endpoints"
import { useConfirmDialog } from "../../components/ui/ConfirmDialog"
import { Button } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { readPendingCommand } from "../../state/pendingOrders"
import { currentAccountUserId, loadSession } from "../../state/session"
import type { ProductLine } from "../../types/domain"
import { type RecordRow, readError, text } from "./ordersShared"

export function TriggerTable({
  rows,
  productLine,
  onDone,
}: {
  readonly rows: readonly RecordRow[]
  readonly productLine: ProductLine
  readonly onDone: (message: string) => void
}) {
  const { confirm, dialog } = useConfirmDialog()
  const session = loadSession()
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>{t("Symbol")}</th>
            <th>{t("Trigger")}</th>
            <th>{t("Side")}</th>
            <th>{t("Status")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={text(row, "triggerOrderId") || String(index)}>
              <td className="mono">{text(row, "triggerOrderId") || "—"}</td>
              <td>{text(row, "symbol") || "—"}</td>
              <td className="mono">{text(row, "triggerPriceTicks") || "—"}</td>
              <td>{text(row, "side") || "—"}</td>
              <td>{text(row, "status") || "—"}</td>
              <td>
                <Button
                  tone="negative"
                  disabled={
                    !session ||
                    readPendingCommand(String(currentAccountUserId(session))) !== null ||
                    text(row, "status") !== "PENDING"
                  }
                  onClick={() => {
                    if (!session) return
                    void confirm({
                      title: t("Cancel this conditional order?"),
                      confirmLabel: t("Cancel"),
                      danger: true,
                    }).then((ok) => {
                      if (!ok) return
                      void cancelTriggerOrder(
                        currentAccountUserId(session),
                        text(row, "triggerOrderId"),
                        productLine,
                        text(row, "instrumentId"),
                      ).then(
                        () => onDone(t("Trigger order cancellation requested.")),
                        (reason: unknown) => onDone(readError(reason)),
                      )
                    })
                  }}
                >
                  {" "}
                  {t("Cancel")}{" "}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {dialog}
    </div>
  )
}
