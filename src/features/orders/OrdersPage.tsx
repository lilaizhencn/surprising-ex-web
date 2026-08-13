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
  loadOpenOrders,
  loadOpenTriggerOrders,
  loadOrderHistory,
  loadProductLedger,
  loadTransferHistory,
  placeAlgoOrder,
  placeBatchOrders,
  placeBatchTriggerOrders,
  testOrder,
} from "../../api/endpoints"
import type { ApiAccountLedgerEntry, ApiOrder, ApiProductTransferRecord } from "../../api/types"
import { Button, Field, Panel, SearchField, StateView } from "../../components/ui/Primitives"
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

  const load = () => {
    if (!session) return
    setLoading(true)
    setError("")
    const task =
      tab === "open"
        ? loadOpenOrders(symbol, productLine)
        : tab === "history"
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
                    : tab === "triggers"
                      ? loadOpenTriggerOrders(session.user.userId, symbol, productLine)
                      : Promise.resolve([])
    void task
      .then(
        (result) => setRows(result),
        (reason: unknown) => setError(readError(reason)),
      )
      .finally(() => setLoading(false))
  }
  useEffect(load, [productLine, session, tab])
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          JSON.stringify(row).toLowerCase().includes(search.toLowerCase()) &&
          (status === "ALL" || text(row, "status").toUpperCase() === status),
      ),
    [rows, search, status],
  )
  const displayRows = filtered
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
            <h1>Transaction History</h1>
            <p>Review orders, fills, ledger entries and internal transfers.</p>
          </div>
        </div>
        <Panel>
          <StateView kind="error" message="Sign in to view orders and fills." />
          <a className="route-link" href="/auth/login">
            Go to login
          </a>
        </Panel>
      </div>
    )
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>Transaction History</h1>
          <p>Live order state is read from the product-specific trading gateway.</p>
        </div>
        <Button
          tone="outline"
          disabled={displayRows.length === 0}
          onClick={() => downloadCsv(displayRows, tab)}
        >
          <Download size={16} /> Export
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
              "批量撤单请求已发送。",
            )
          }}
        >
          Cancel all open
        </Button>
        <div className="inline-form">
          <input
            value={countdown}
            onChange={(event) => setCountdown(event.target.value)}
            inputMode="numeric"
            aria-label="Cancel all after milliseconds"
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
                `自动撤单计时已设置为 ${countdownMs}ms。`,
              )
            }}
          >
            Set cancel timer
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
              "算法单批量撤销请求已发送。",
            )
          }}
        >
          Cancel open algo
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
              "条件单批量撤销请求已发送。",
            )
          }}
        >
          Cancel open triggers
        </Button>
      </div>
      <div className="history-toolbar">
        <SearchField value={search} onChange={setSearch} placeholder="Search symbol or ID" />
        <select
          value={productLine}
          onChange={(event) => setProductLine(event.target.value as ProductLine)}
          aria-label="Product line"
        >
          <option value={PRODUCT_LINES.spot}>Spot</option>
          <option value={PRODUCT_LINES.usdMPerpetual}>USD-M perpetual</option>
          <option value={PRODUCT_LINES.coinMPerpetual}>Coin-M perpetual</option>
          <option value={PRODUCT_LINES.usdMDelivery}>USD-M delivery</option>
          <option value={PRODUCT_LINES.coinMDelivery}>Coin-M delivery</option>
          <option value={PRODUCT_LINES.option}>Options</option>
        </select>
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
          <RefreshCw size={16} /> Refresh
        </Button>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Order status"
        >
          <option value="ALL">All statuses</option>
          <option value="NEW">New</option>
          <option value="PARTIALLY_FILLED">Partially filled</option>
          <option value="FILLED">Filled</option>
          <option value="CANCELED">Canceled</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="From date"
        />
        <input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          aria-label="To date"
        />
      </div>
      <div className="segment-control history-tabs">
        <button
          type="button"
          className={tab === "open" ? "active" : ""}
          onClick={() => setTab("open")}
        >
          Open orders
        </button>
        <button
          type="button"
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          Order history
        </button>
        <button
          type="button"
          className={tab === "fills" ? "active" : ""}
          onClick={() => setTab("fills")}
        >
          Fills
        </button>
        <button
          type="button"
          className={tab === "ledger" ? "active" : ""}
          onClick={() => setTab("ledger")}
        >
          Account ledger
        </button>
        <button
          type="button"
          className={tab === "product-ledger" ? "active" : ""}
          onClick={() => setTab("product-ledger")}
        >
          Product ledger
        </button>
        <button
          type="button"
          className={tab === "transfers" ? "active" : ""}
          onClick={() => setTab("transfers")}
        >
          Transfers
        </button>
        <button
          type="button"
          className={tab === "algo" ? "active" : ""}
          onClick={() => setTab("algo")}
        >
          Algo orders
        </button>
        <button
          type="button"
          className={tab === "triggers" ? "active" : ""}
          onClick={() => setTab("triggers")}
        >
          Conditional orders
        </button>
        <button
          type="button"
          className={tab === "advanced" ? "active" : ""}
          onClick={() => setTab("advanced")}
        >
          Advanced actions
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
        ) : loading ? (
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
              setError(message)
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
            <th>Symbol</th>
            <th>Trigger</th>
            <th>Side</th>
            <th>Status</th>
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
                      () => onDone("条件单撤销请求已发送。"),
                      (reason: unknown) => onDone(readError(reason)),
                    )
                  }}
                >
                  Cancel
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
      onDone("请输入 symbol 后再执行高级交易操作。")
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
      <p className="muted">这些操作直接调用交易服务，所有数量和价格均使用后端整数单位。</p>
      <div className="grid-2">
        <Field label="Symbol">
          <input value={symbol} readOnly aria-label="Advanced symbol" />
        </Field>
        <Field label="Side">
          <select
            value={side}
            onChange={(event) => setSide(event.target.value === "SELL" ? "SELL" : "BUY")}
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </Field>
        <Field label="Price ticks (integer)">
          <input
            value={priceTicks}
            onChange={(event) => setPriceTicks(event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Quantity steps (integer)">
          <input
            value={quantitySteps}
            onChange={(event) => setQuantitySteps(event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Order ID for amend (integer)">
          <input
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Order IDs for batch cancel (integers)">
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
          onClick={() => void run(() => testOrder(baseOrder(), productLine), "测试单校验通过。")}
        >
          Test order
        </Button>
        <Button
          tone="outline"
          loading={busy}
          onClick={() =>
            void run(
              () => placeBatchOrders({ orders: [baseOrder()] }, productLine),
              "批量下单请求已发送。",
            )
          }
        >
          Place batch order
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
              "改单请求已发送。",
            )
          }
        >
          Amend order
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
              "批量改单请求已发送。",
            )
          }
        >
          Amend batch
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
              "批量撤单请求已发送。",
            )
          }
        >
          Cancel batch
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
              "平仓请求已发送。",
            )
          }
        >
          Close position
        </Button>
      </div>
      <div className="grid-2">
        <Field label="Algo type">
          <select
            value={algoType}
            onChange={(event) => setAlgoType(event.target.value === "ICEBERG" ? "ICEBERG" : "TWAP")}
          >
            <option value="TWAP">TWAP</option>
            <option value="ICEBERG">ICEBERG</option>
          </select>
        </Field>
        <Field label="Trigger price ticks">
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
              "算法单请求已发送。",
            )
          }
        >
          Place algo order
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
              "批量条件单请求已发送。",
            )
          }
        >
          Place trigger batch
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
            <th>Symbol</th>
            <th>Type</th>
            <th>Side</th>
            <th>Status</th>
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
                () => onDone("算法单撤销请求已发送。"),
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        >
          Cancel
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
            <th>Symbol</th>
            <th>Side / Type</th>
            <th>Price</th>
            <th>Quantity</th>
            <th>Filled</th>
            <th>Status</th>
            <th>Time</th>
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
                  () => onDone("订单撤单请求已发送。"),
                  (reason: unknown) => onDone(readError(reason)),
                )
                .finally(() => setBusy(false))
            }}
          >
            <XCircle size={14} /> Cancel
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
  return reason instanceof Error ? reason.message : "订单服务暂不可用，请稍后重试。"
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
