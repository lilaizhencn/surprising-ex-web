import { useState } from "react"
import {
  amendBatchOrders,
  amendOrder,
  cancelAlgoOrder,
  cancelBatchOrders,
  closePosition,
  placeAlgoOrder,
  placeBatchOrders,
  placeBatchTriggerOrders,
  testOrder,
} from "../../api/endpoints"
import { useConfirmDialog } from "../../components/ui/ConfirmDialog"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { currentAccountUserId, loadSession } from "../../state/session"
import type { ProductLine } from "../../types/domain"
import { type RecordRow, readError, text } from "./ordersShared"

export function AdvancedTradingActions({
  session,
  productLine,
  instrumentId,
  symbol,
  onDone,
}: {
  readonly session: NonNullable<ReturnType<typeof loadSession>>
  readonly productLine: ProductLine
  readonly instrumentId: string
  readonly symbol: string
  readonly onDone: (message: string) => void
}) {
  const [orderId, setOrderId] = useState("")
  const [batchOrderIds, setBatchOrderIds] = useState("")
  const [priceTicks, setPriceTicks] = useState("0")
  const [quantitySteps, setQuantitySteps] = useState("1")
  const [side, setSide] = useState<"BUY" | "SELL">("BUY")
  const [algoType, setAlgoType] = useState<"TWAP" | "ICEBERG">("TWAP")
  const [triggerPriceTicks, setTriggerPriceTicks] = useState("0")
  const [busy, setBusy] = useState(false)

  const amendPayload = () => {
    const key = `web-amend-${crypto.randomUUID()}`
    return {
      userId: currentAccountUserId(session),
      orderId: toLong(orderId),
      instrumentId,
      newClientOrderId: key,
      clientRequestId: key,
      priceTicks: toLong(priceTicks),
      quantitySteps: toLong(quantitySteps),
    }
  }
  const baseOrder = () => ({
    userId: currentAccountUserId(session),
    clientOrderId: `web-advanced-${crypto.randomUUID()}`,
    instrumentId: instrumentId.trim(),
    side,
    orderType: "LIMIT",
    timeInForce: "GTC",
    priceTicks: toLong(priceTicks),
    quantitySteps: toLong(quantitySteps),
    marginMode: "CROSS",
    positionSide: "NET",
    reduceOnly: false,
    postOnly: false,
  })
  const run = async (operation: () => Promise<unknown>, success: string) => {
    if (!instrumentId.trim()) {
      onDone(t("Select a trading pair before performing advanced trading actions."))
      return
    }
    setBusy(true)
    try {
      const result = await operation()
      if (String(loadSession()?.user.userId ?? "") !== String(session.user.userId)) return
      onDone(
        result &&
          typeof result === "object" &&
          "message" in result &&
          typeof result.message === "string"
          ? result.message
          : success,
      )
    } catch (reason: unknown) {
      onDone(readError(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="advanced-trading-actions">
      <p className="muted">{t("These actions use integer price ticks and quantity steps.")}</p>
      <div className="grid-2">
        <Field label={t("Symbol")}>
          <input value={symbol} readOnly aria-label={t("Symbol")} />
        </Field>
        <Field label={t("Side")}>
          <DropdownSelect
            value={side}
            onChange={(event) => setSide(event.target.value === "SELL" ? "SELL" : "BUY")}
          >
            <option value="BUY">{t("BUY")}</option>
            <option value="SELL">{t("SELL")}</option>
          </DropdownSelect>
        </Field>
        <Field label={t("Price ticks (integer)")}>
          <input
            value={priceTicks}
            onChange={(event) => setPriceTicks(event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label={t("Quantity steps (integer)")}>
          <input
            value={quantitySteps}
            onChange={(event) => setQuantitySteps(event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label={t("Order ID for amend (integer)")}>
          <input
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label={t("Order IDs for batch cancel (comma separated, up to 50)")}>
          <input
            value={batchOrderIds}
            onChange={(event) => setBatchOrderIds(event.target.value)}
            placeholder="1001,1002"
            inputMode="numeric"
          />
        </Field>
      </div>
      <div className="history-actions">
        <Button
          tone="outline"
          loading={busy}
          onClick={() =>
            void run(() => testOrder(baseOrder(), productLine), t("Test order validation passed."))
          }
        >
          {" "}
          {t("Test order")}{" "}
        </Button>
        <Button
          tone="outline"
          loading={busy}
          onClick={() =>
            void run(
              () => placeBatchOrders({ orders: [baseOrder()] }, productLine),
              t("Batch order submitted."),
            )
          }
        >
          {" "}
          {t("Place batch order")}{" "}
        </Button>
        <Button
          tone="outline"
          disabled={!orderId}
          loading={busy}
          onClick={() =>
            void run(() => amendOrder(amendPayload(), productLine), t("Order amendment submitted."))
          }
        >
          {" "}
          {t("Amend order")}{" "}
        </Button>
        <Button
          tone="outline"
          disabled={!orderId}
          loading={busy}
          onClick={() =>
            void run(
              () =>
                amendBatchOrders(
                  {
                    orders: [
                      {
                        ...baseOrder(),
                        orderId: toLong(orderId),
                        newClientOrderId: `web-batch-amend-${crypto.randomUUID()}`,
                      },
                    ],
                  },
                  productLine,
                ),
              t("Batch order amendment submitted."),
            )
          }
        >
          {" "}
          {t("Amend batch")}{" "}
        </Button>
        <Button
          tone="negative"
          disabled={!batchOrderIds.trim()}
          loading={busy}
          onClick={() =>
            void run(
              () =>
                cancelBatchOrders(
                  {
                    orders: batchOrderIds
                      .split(/[\s,]+/)
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .map((value) => ({
                        userId: currentAccountUserId(session),
                        orderId: toLong(value),
                      })),
                  },
                  productLine,
                ),
              t("Batch cancellation requested."),
            )
          }
        >
          {" "}
          {t("Cancel batch")}{" "}
        </Button>
        <Button
          tone="negative"
          loading={busy}
          onClick={() =>
            void run(
              () =>
                closePosition(
                  {
                    userId: currentAccountUserId(session),
                    clientOrderId: `web-close-${crypto.randomUUID()}`,
                    instrumentId: instrumentId.trim(),
                    marginMode: "CROSS",
                    positionSide: "NET",
                  },
                  productLine,
                ),
              t("Position close requested."),
            )
          }
        >
          {" "}
          {t("Close position")}{" "}
        </Button>
      </div>
      <div className="grid-2">
        <Field label={t("Algo type")}>
          <DropdownSelect
            value={algoType}
            onChange={(event) => setAlgoType(event.target.value === "ICEBERG" ? "ICEBERG" : "TWAP")}
          >
            <option value="TWAP">TWAP</option>
            <option value="ICEBERG">ICEBERG</option>
          </DropdownSelect>
        </Field>
        <Field label={t("Trigger price ticks")}>
          <input
            value={triggerPriceTicks}
            onChange={(event) => setTriggerPriceTicks(event.target.value)}
            inputMode="numeric"
          />
        </Field>
      </div>
      <div className="history-actions">
        <Button
          tone="outline"
          loading={busy}
          onClick={() =>
            void run(
              () =>
                placeAlgoOrder(
                  {
                    userId: currentAccountUserId(session),
                    clientAlgoOrderId: `web-algo-${crypto.randomUUID()}`,
                    instrumentId: instrumentId.trim(),
                    algoType,
                    side,
                    priceTicks: toLong(priceTicks),
                    quantitySteps: toLong(quantitySteps),
                    childQuantitySteps: toLong(quantitySteps),
                    ...(algoType === "TWAP" ? { intervalSeconds: 60 } : {}),
                    durationSeconds: 600,
                    marginMode: "CROSS",
                    positionSide: "NET",
                    reduceOnly: false,
                    startAt: new Date().toISOString(),
                  },
                  productLine,
                ),
              t("Algo order submitted."),
            )
          }
        >
          {" "}
          {t("Place algo order")}{" "}
        </Button>
        <Button
          tone="outline"
          loading={busy}
          onClick={() =>
            void run(
              () =>
                placeBatchTriggerOrders(
                  {
                    orders: [
                      {
                        ...baseOrder(),
                        clientTriggerOrderId: `web-trigger-batch-${crypto.randomUUID()}`,
                        triggerType: "STOP_LOSS",
                        triggerPriceTicks: toLong(triggerPriceTicks),
                        activationPriceTicks: null,
                        callbackRatePpm: null,
                        expiresAt: null,
                      },
                    ],
                  },
                  productLine,
                ),
              t("Batch trigger orders submitted."),
            )
          }
        >
          {" "}
          {t("Place trigger batch")}{" "}
        </Button>
      </div>
    </div>
  )
}

function toLong(value: string): string {
  const normalized = value.trim()
  return /^\d+$/.test(normalized) ? normalized : "0"
}

export function AlgoTable({
  rows,
  productLine,
  onDone,
}: {
  readonly rows: readonly RecordRow[]
  readonly productLine: ProductLine
  readonly onDone: (message: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>{t("Symbol")}</th>
            <th>{t("Type")}</th>
            <th>{t("Side")}</th>
            <th>{t("Status")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <AlgoRow
              key={text(row, "algoOrderId") || String(index)}
              row={row}
              productLine={productLine}
              onDone={onDone}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AlgoRow({
  row,
  productLine,
  onDone,
}: {
  readonly row: RecordRow
  readonly productLine: ProductLine
  readonly onDone: (message: string) => void
}) {
  const { confirm, dialog } = useConfirmDialog()
  const [loading, setLoading] = useState(false)
  const id = text(row, "algoOrderId")
  return (
    <tr>
      <td className="mono">{id || "—"}</td>
      <td>{text(row, "symbol") || "—"}</td>
      <td>{text(row, "algoType") || "—"}</td>
      <td>{text(row, "side") || "—"}</td>
      <td>{text(row, "status") || "—"}</td>
      <td>
        <Button
          tone="negative"
          loading={loading}
          disabled={!id}
          onClick={() => {
            if (!id) return
            const session = loadSession()
            if (!session) return
            void confirm({
              title: t("Cancel this algorithmic order?"),
              confirmLabel: t("Cancel"),
              danger: true,
            }).then((ok) => {
              if (!ok) return
              setLoading(true)
              void cancelAlgoOrder(
                { userId: currentAccountUserId(session), algoOrderId: id },
                productLine,
              )
                .then(
                  () => onDone(t("Algo order cancellation requested.")),
                  (reason: unknown) => onDone(readError(reason)),
                )
                .finally(() => setLoading(false))
            })
          }}
        >
          {" "}
          {t("Cancel")}{" "}
        </Button>
        {dialog}
      </td>
    </tr>
  )
}
