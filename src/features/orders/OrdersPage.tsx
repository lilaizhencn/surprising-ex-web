import { Download, RefreshCw, XCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  amendBatchOrders,
  amendOrder,
  cancelAlgoOrder,
  cancelAllAfter,
  cancelBatchOrders,
  cancelOpenAlgoOrders,
  cancelOpenOrders,
  cancelOpenTriggerOrders,
  cancelOrder,
  cancelTriggerOrder,
  closePosition,
  loadAccountLedger,
  loadMyTrades,
  loadOpenAlgoOrders,
  loadOrderHistory,
  loadProductLedger,
  loadTransferHistory,
  placeAlgoOrder,
  placeBatchOrders,
  placeBatchTriggerOrders,
  testOrder,
} from "../../api/endpoints"
import type { ApiAccountLedgerEntry, ApiOrder, ApiProductTransferRecord } from "../../api/types"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field, Panel, SearchField, StateView } from "../../components/ui/Primitives"
import { useRealtimeFeed } from "../../hooks/useRealtime"
import { t } from "../../i18n"
import { loadSession, useSession } from "../../state/session"
import { PRODUCT_LINES, type ProductLine } from "../../types/domain"

type RecordRow =
  | ApiOrder
  | ApiAccountLedgerEntry
  | ApiProductTransferRecord
  | Readonly<Record<string, unknown>>
type Tab =
  | "open"
  | "history"
  | "fills"
  | "ledger"
  | "product-ledger"
  | "transfers"
  | "algo"
  | "triggers"
  | "advanced"

export function OrdersPage() {
  const session = useSession()
  const [tab, setTab] = useState<Tab>("open")
  const [productLine, setProductLine] = useState<ProductLine>(PRODUCT_LINES.spot)
  const [symbol, setSymbol] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("ALL")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [rows, setRows] = useState<readonly RecordRow[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState("")
  const [countdown, setCountdown] = useState("0")
  const realtime = useRealtimeFeed(session, [])
  const privateView = realtime.views[productLine]

  const load = () => {
    if (!session) return
    setError("")
    if (tab === "open" || tab === "triggers") {
      realtime.refresh()
      setLoading(false)
      return
    }
    setLoading(true)
    const task =
      tab === "history"
        ? loadOrderHistory(symbol, productLine, dateValue(from), dateValue(to))
        : tab === "fills"
          ? session
            ? loadMyTrades(session.user.userId, symbol, productLine)
            : Promise.resolve([])
          : tab === "ledger"
            ? loadAccountLedger(symbol)
            : tab === "product-ledger"
              ? loadProductLedger(productLine, symbol)
              : tab === "transfers"
                ? loadTransferHistory(productLine, symbol)
                : tab === "algo"
                  ? loadOpenAlgoOrders(session.user.userId, symbol, productLine)
                  : Promise.resolve([])
    void task
      .then(
        (result) => setRows(result),
        (reason: unknown) => setError(readError(reason)),
      )
      .finally(() => setLoading(false))
  }
  useEffect(load, [productLine, session, tab])
  const liveRows: readonly RecordRow[] =
    tab === "open"
      ? (privateView?.rows("order") ?? [])
          .filter((r) => r["status"] === "OPEN")
          .map((r) => ({
            ...r,
            status: Number(r["executedQuantitySteps"]) > 0 ? "PARTIALLY_FILLED" : "ACCEPTED",
          }))
      : tab === "triggers"
        ? (privateView?.rows("trigger") ?? []).filter((r) =>
            ["PENDING", "TRIGGERING"].includes(String(r["status"])),
          )
        : rows
  const filtered = useMemo(
    () =>
      liveRows.filter(
        (row) =>
          JSON.stringify(row).toLowerCase().includes(search.toLowerCase()) &&
          (!symbol || text(row, "symbol") === symbol) &&
          (status === "ALL" || text(row, "status").toUpperCase() === status),
      ),
    [liveRows, search, status, symbol],
  )
  const displayRows = filtered
  const snapshotPending = (tab === "open" || tab === "triggers") && !privateView?.ready()
  const runBulkAction = async (operation: () => Promise<unknown>, success: string) => {
    setLoading(true)
    setActionMessage("")
    try {
      await operation()
      setActionMessage(success)
      load()
    } catch (reason: unknown) {
      setActionMessage(readError(reason))
    } finally {
      setLoading(false)
    }
  }
  if (!session)
    return (
      <div className="account-content">
        <div className="page-heading">
          <div>
            <h1>{t("Transaction History")}</h1>
            <p>{t("Review orders, fills, ledger entries and internal transfers.")}</p>
          </div>
        </div>
        <Panel>
          <StateView kind="error" message="Sign in to view orders and fills." />
          <a className="route-link" href="/auth/login">
            {" "}
            {t("Go to login")}{" "}
          </a>
        </Panel>
      </div>
    )
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>{t("Transaction History")}</h1>
          <p>{t("Live order state is read from the product-specific trading gateway.")}</p>
        </div>
        <Button
          tone="outline"
          disabled={displayRows.length === 0}
          onClick={() => downloadCsv(displayRows, tab)}
        >
          <Download size={16} /> {t("Export")}{" "}
        </Button>
      </div>
      {actionMessage ? (
        <div className="form-message" role="status">
          {actionMessage}
        </div>
      ) : null}
      <div className="history-actions">
        <Button
          tone="negative"
          disabled={tab !== "open" || loading || !session}
          onClick={() => {
            if (!session || !window.confirm("Cancel all open orders for this product line?")) return
            void runBulkAction(
              () =>
                cancelOpenOrders(
                  { userId: session.user.userId, symbol: symbol || null, limit: 1000 },
                  productLine,
                ),
              t("Batch cancellation requested."),
            )
          }}
        >
          {" "}
          {t("Cancel all open")}{" "}
        </Button>
        <div className="inline-form">
          <input
            value={countdown}
            onChange={(event) => setCountdown(event.target.value)}
            inputMode="numeric"
            aria-label={t("Cancel all after milliseconds")}
          />
          <Button
            tone="outline"
            disabled={!session || tab !== "open"}
            onClick={() => {
              if (!session) return
              const countdownMs = Math.max(0, Math.min(120000, Number(countdown) || 0))
              void runBulkAction(
                () =>
                  cancelAllAfter(
                    { userId: session.user.userId, symbol: symbol || null, countdownMs },
                    productLine,
                  ),
                `${t("Cancel timer set (ms)")}: ${countdownMs}`,
              )
            }}
          >
            {" "}
            {t("Set cancel timer")}{" "}
          </Button>
        </div>
        <Button
          tone="outline"
          disabled={!session || tab !== "algo"}
          onClick={() => {
            if (!session) return
            void runBulkAction(
              () =>
                cancelOpenAlgoOrders(
                  { userId: session.user.userId, symbol: symbol || null, limit: 1000 },
                  productLine,
                ),
              t("Algo order batch cancellation requested."),
            )
          }}
        >
          {" "}
          {t("Cancel open algo")}{" "}
        </Button>
        <Button
          tone="outline"
          disabled={!session || tab !== "triggers"}
          onClick={() => {
            if (!session) return
            void runBulkAction(
              () =>
                cancelOpenTriggerOrders(
                  { userId: session.user.userId, symbol: symbol || null, limit: 1000 },
                  productLine,
                ),
              t("Trigger order batch cancellation requested."),
            )
          }}
        >
          {" "}
          {t("Cancel open triggers")}{" "}
        </Button>
      </div>
      <div className="history-toolbar">
        <SearchField value={search} onChange={setSearch} placeholder={t("Search symbol or ID")} />
        <DropdownSelect
          value={productLine}
          onChange={(event) => setProductLine(event.target.value as ProductLine)}
          aria-label={t("Product line")}
        >
          <option value={PRODUCT_LINES.spot}>{t("Spot")}</option>
          <option value={PRODUCT_LINES.usdMPerpetual}>{t("USD-M perpetual")}</option>
          <option value={PRODUCT_LINES.coinMPerpetual}>{t("Coin-M perpetual")}</option>
          <option value={PRODUCT_LINES.usdMDelivery}>{t("USD-M delivery")}</option>
          <option value={PRODUCT_LINES.coinMDelivery}>{t("Coin-M delivery")}</option>
          <option value={PRODUCT_LINES.option}>{t("Options")}</option>
        </DropdownSelect>
        <input
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          placeholder={
            tab === "ledger" || tab === "product-ledger" || tab === "transfers"
              ? "Asset (optional)"
              : "Symbol (optional)"
          }
          aria-label={
            tab === "ledger" || tab === "product-ledger" || tab === "transfers"
              ? "Asset filter"
              : "Symbol filter"
          }
        />
        <Button tone="outline" onClick={load}>
          <RefreshCw size={16} /> {t("Refresh")}{" "}
        </Button>
        <DropdownSelect
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label={t("Order status")}
        >
          <option value="ALL">{t("All statuses")}</option>
          <option value="NEW">{t("New")}</option>
          <option value="PARTIALLY_FILLED">{t("Partially filled")}</option>
          <option value="FILLED">{t("Filled")}</option>
          <option value="CANCELED">{t("Canceled")}</option>
        </DropdownSelect>
        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-label={t("From date")}
        />
        <input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          aria-label={t("To date")}
        />
      </div>
      <div className="segment-control history-tabs">
        <button
          type="button"
          className={tab === "open" ? "active" : ""}
          onClick={() => setTab("open")}
        >
          {" "}
          {t("Open orders")}{" "}
        </button>
        <button
          type="button"
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          {" "}
          {t("Order history")}{" "}
        </button>
        <button
          type="button"
          className={tab === "fills" ? "active" : ""}
          onClick={() => setTab("fills")}
        >
          {" "}
          {t("Fills")}{" "}
        </button>
        <button
          type="button"
          className={tab === "ledger" ? "active" : ""}
          onClick={() => setTab("ledger")}
        >
          {" "}
          {t("Account ledger")}{" "}
        </button>
        <button
          type="button"
          className={tab === "product-ledger" ? "active" : ""}
          onClick={() => setTab("product-ledger")}
        >
          {" "}
          {t("Product ledger")}{" "}
        </button>
        <button
          type="button"
          className={tab === "transfers" ? "active" : ""}
          onClick={() => setTab("transfers")}
        >
          {" "}
          {t("Transfers")}{" "}
        </button>
        <button
          type="button"
          className={tab === "algo" ? "active" : ""}
          onClick={() => setTab("algo")}
        >
          {" "}
          {t("Algo orders")}{" "}
        </button>
        <button
          type="button"
          className={tab === "triggers" ? "active" : ""}
          onClick={() => setTab("triggers")}
        >
          {" "}
          {t("Conditional orders")}{" "}
        </button>
        <button
          type="button"
          className={tab === "advanced" ? "active" : ""}
          onClick={() => setTab("advanced")}
        >
          {" "}
          {t("Advanced actions")}{" "}
        </button>
      </div>
      <Panel>
        {tab === "advanced" ? (
          <AdvancedTradingActions
            session={session}
            productLine={productLine}
            symbol={symbol}
            onDone={(value) => setActionMessage(value)}
          />
        ) : error ? (
          <StateView kind="error" message={error} retry={load} />
        ) : loading || snapshotPending ? (
          <StateView kind="loading" message="Loading order state" />
        ) : displayRows.length === 0 ? (
          <StateView
            kind="empty"
            message={
              tab === "open"
                ? "No open orders returned by the trading service."
                : tab === "history"
                  ? "No historical orders returned by the trading service."
                  : tab === "fills"
                    ? "No private trade fills returned by the trading service."
                    : tab === "ledger"
                      ? "No account ledger entries returned by the account service."
                      : tab === "product-ledger"
                        ? "No product ledger entries returned by the account service."
                        : tab === "transfers"
                          ? "No transfer records returned by the account service."
                          : tab === "algo"
                            ? "No open algorithmic orders returned by the trading service."
                            : "No open conditional orders returned by the trading service."
            }
          />
        ) : tab === "ledger" || tab === "product-ledger" || tab === "transfers" ? (
          <RecordTable rows={displayRows} mode={tab} />
        ) : tab === "fills" ? (
          <RecordTable rows={displayRows} mode="fills" />
        ) : tab === "algo" ? (
          <AlgoTable
            rows={displayRows}
            productLine={productLine}
            onDone={(message) => {
              setActionMessage(message)
              load()
            }}
          />
        ) : tab === "triggers" ? (
          <TriggerTable
            rows={displayRows}
            productLine={productLine}
            onDone={(value) => {
              setActionMessage(value)
              load()
            }}
          />
        ) : (
          <OrderTable
            rows={displayRows}
            canCancel={tab === "open"}
            productLine={productLine}
            onDone={(message) => {
              setActionMessage(message)
              load()
            }}
          />
        )}
      </Panel>
    </div>
  )
}

function TriggerTable({
  rows,
  productLine,
  onDone,
}: {
  readonly rows: readonly RecordRow[]
  readonly productLine: ProductLine
  readonly onDone: (message: string) => void
}) {
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
                  disabled={!session || text(row, "status") !== "PENDING"}
                  onClick={() => {
                    if (!session || !window.confirm("Cancel this conditional order?")) return
                    void cancelTriggerOrder(
                      session.user.userId,
                      text(row, "triggerOrderId"),
                      productLine,
                    ).then(
                      () => onDone(t("Trigger order cancellation requested.")),
                      (reason: unknown) => onDone(readError(reason)),
                    )
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
    </div>
  )
}

function AdvancedTradingActions({
  session,
  productLine,
  symbol,
  onDone,
}: {
  readonly session: NonNullable<ReturnType<typeof loadSession>>
  readonly productLine: ProductLine
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

  const baseOrder = () => ({
    userId: session.user.userId,
    clientOrderId: `web-advanced-${crypto.randomUUID()}`,
    symbol: symbol.trim(),
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
    if (!symbol.trim()) {
      onDone(t("Enter a symbol before performing advanced trading actions."))
      return
    }
    setBusy(true)
    try {
      await operation()
      onDone(success)
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
          <input value={symbol} readOnly aria-label={t("Advanced symbol")} />
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
        <Field label={t("Order IDs for batch cancel (integers)")}>
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
            void run(
              () =>
                amendOrder(
                  {
                    ...baseOrder(),
                    orderId: toLong(orderId),
                    newClientOrderId: `web-amend-${crypto.randomUUID()}`,
                  },
                  productLine,
                ),
              t("Order amendment submitted."),
            )
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
                        userId: session.user.userId,
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
                    userId: session.user.userId,
                    clientOrderId: `web-close-${crypto.randomUUID()}`,
                    symbol: symbol.trim(),
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
                    ...baseOrder(),
                    clientAlgoOrderId: `web-algo-${crypto.randomUUID()}`,
                    algoType,
                    childQuantitySteps: toLong(quantitySteps),
                    intervalSeconds: 60,
                    durationSeconds: 600,
                    timeInForce: "GTC",
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

function AlgoTable({
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
            if (!id || !window.confirm("Cancel this algorithmic order?")) return
            const session = loadSession()
            if (!session) return
            setLoading(true)
            void cancelAlgoOrder({ userId: session.user.userId, algoOrderId: id }, productLine)
              .then(
                () => onDone(t("Algo order cancellation requested.")),
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        >
          {" "}
          {t("Cancel")}{" "}
        </Button>
      </td>
    </tr>
  )
}

function RecordTable({
  rows,
  mode,
}: {
  readonly rows: readonly RecordRow[]
  readonly mode: "ledger" | "product-ledger" | "transfers" | "fills"
}) {
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
                  {text(row, column) || "—"}
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

function OrderTable({
  rows,
  canCancel,
  productLine,
  onDone,
}: {
  readonly rows: readonly RecordRow[]
  readonly canCancel: boolean
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
            <th>{t("Quantity")}</th>
            <th>{t("Filled")}</th>
            <th>{t("Status")}</th>
            <th>{t("Time")}</th>
            {canCancel ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <OrderRow
              key={text(row, "orderId") || String(index)}
              row={row}
              canCancel={canCancel}
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
  row,
  canCancel,
  productLine,
  onDone,
}: {
  readonly row: RecordRow
  readonly canCancel: boolean
  readonly productLine: ProductLine
  readonly onDone: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const orderId = text(row, "orderId")
  return (
    <tr>
      <td>{text(row, "symbol") || "—"}</td>
      <td>
        {text(row, "side") || "—"} / {text(row, "type") || "—"}
      </td>
      <td className="mono">{orderPrice(row)}</td>
      <td className="mono">{orderQuantity(row, "quantitySteps", "origQty", "quantity")}</td>
      <td className="mono">{orderQuantity(row, "executedQuantitySteps", "executedQty")}</td>
      <td>{text(row, "status") || "—"}</td>
      <td>{text(row, "time") || text(row, "updateTime") || "—"}</td>
      {canCancel ? (
        <td>
          <Button
            tone="negative"
            loading={busy}
            disabled={!orderId}
            onClick={() => {
              if (!orderId || !window.confirm("Cancel this order?")) return
              setBusy(true)
              void cancelOrder(text(row, "symbol"), orderId, productLine)
                .then(
                  () => onDone(t("Order cancellation requested.")),
                  (reason: unknown) => onDone(readError(reason)),
                )
                .finally(() => setBusy(false))
            }}
          >
            <XCircle size={14} /> {t("Cancel")}{" "}
          </Button>
        </td>
      ) : null}
    </tr>
  )
}
function text(row: RecordRow | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function readError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : t("Order service unavailable. Please retry later.")
}

function dateValue(value: string): number | undefined {
  if (!value) return undefined
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(parsed) ? parsed : undefined
}

function orderPrice(row: RecordRow): string {
  const direct = text(row, "price")
  if (direct) return direct
  const ticks = text(row, "priceTicks")
  return ticks ? `ticks ${ticks}` : "—"
}

function orderQuantity(row: RecordRow, primary: string, ...fallbacks: string[]): string {
  const value = text(row, primary)
  if (value) return primary.endsWith("Steps") ? `steps ${value}` : value
  for (const key of fallbacks) {
    const fallback = text(row, key)
    if (fallback) return fallback
  }
  return "—"
}

function downloadCsv(rows: readonly RecordRow[], tab: Tab): void {
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
