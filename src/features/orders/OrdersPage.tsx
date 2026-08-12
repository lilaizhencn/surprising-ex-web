import { Download, Filter, RefreshCw, XCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  cancelOrder,
  loadAccountLedger,
  loadOpenOrders,
  loadOrderHistory,
  loadTransferHistory,
} from "../../api/endpoints"
import type { ApiAccountLedgerEntry, ApiOrder, ApiProductTransferRecord } from "../../api/types"
import { Button, Panel, SearchField, StateView } from "../../components/ui/Primitives"
import { loadSession } from "../../state/session"
import { PRODUCT_LINES, type ProductLine } from "../../types/domain"

type RecordRow = ApiOrder | ApiAccountLedgerEntry | ApiProductTransferRecord
type Tab = "open" | "history" | "ledger" | "transfers"

export function OrdersPage() {
  const session = loadSession()
  const [tab, setTab] = useState<Tab>("open")
  const [productLine, setProductLine] = useState<ProductLine>(PRODUCT_LINES.spot)
  const [symbol, setSymbol] = useState("")
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<readonly RecordRow[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!session) return
    setLoading(true)
    setError("")
    const task =
      tab === "open"
        ? loadOpenOrders(symbol, productLine)
        : tab === "history"
          ? loadOrderHistory(symbol, productLine)
          : tab === "ledger"
            ? loadAccountLedger(symbol)
            : loadTransferHistory(productLine, symbol)
    void task
      .then(
        (result) => setRows(result),
        (reason: unknown) => setError(readError(reason)),
      )
      .finally(() => setLoading(false))
  }
  useEffect(load, [productLine, session, tab])
  const filtered = useMemo(
    () => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())),
    [rows, search],
  )
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
          disabled={filtered.length === 0}
          onClick={() => downloadCsv(filtered, tab)}
        >
          <Download size={16} /> Export
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
          <option value={PRODUCT_LINES.usdMDelivery}>Delivery</option>
          <option value={PRODUCT_LINES.option}>Options</option>
        </select>
        <input
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          placeholder={
            tab === "ledger" || tab === "transfers" ? "Asset (optional)" : "Symbol (optional)"
          }
          aria-label={tab === "ledger" || tab === "transfers" ? "Asset filter" : "Symbol filter"}
        />
        <Button tone="outline" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </Button>
        <Button tone="outline">
          <Filter size={16} /> Filters
        </Button>
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
          className={tab === "ledger" ? "active" : ""}
          onClick={() => setTab("ledger")}
        >
          Account ledger
        </button>
        <button
          type="button"
          className={tab === "transfers" ? "active" : ""}
          onClick={() => setTab("transfers")}
        >
          Transfers
        </button>
      </div>
      <Panel>
        {error ? (
          <StateView kind="error" message={error} retry={load} />
        ) : loading ? (
          <StateView kind="loading" message="Loading order state" />
        ) : filtered.length === 0 ? (
          <StateView
            kind="empty"
            message={
              tab === "open"
                ? "No open orders returned by the trading service."
                : tab === "history"
                  ? "No historical orders returned by the trading service."
                  : tab === "ledger"
                    ? "No account ledger entries returned by the account service."
                    : "No transfer records returned by the account service."
            }
          />
        ) : tab === "ledger" || tab === "transfers" ? (
          <RecordTable rows={filtered} mode={tab} />
        ) : (
          <OrderTable
            rows={filtered}
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

function RecordTable({
  rows,
  mode,
}: {
  readonly rows: readonly RecordRow[]
  readonly mode: "ledger" | "transfers"
}) {
  const columns =
    mode === "ledger"
      ? ["asset", "referenceType", "amountUnits", "balanceAfterUnits", "createdAt"]
      : ["asset", "sourceAccountType", "targetAccountType", "amountUnits", "status", "createdAt"]
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
      <td className="mono">{text(row, "price") || "—"}</td>
      <td className="mono">{text(row, "origQty") || text(row, "quantity") || "—"}</td>
      <td className="mono">{text(row, "executedQty") || "—"}</td>
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
