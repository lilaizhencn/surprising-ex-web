import { Download, Filter, RefreshCw, XCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { cancelOrder, loadOpenOrders, loadOrderHistory } from "../../api/endpoints"
import { Button, Panel, SearchField, StateView } from "../../components/ui/Primitives"
import { loadSession } from "../../state/session"
import { PRODUCT_LINES, type ProductLine } from "../../types/domain"

type RecordRow = Readonly<Record<string, unknown>>
type Tab = "open" | "history"

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
      tab === "open" ? loadOpenOrders(symbol, productLine) : loadOrderHistory(symbol, productLine)
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
          onClick={() =>
            window.alert("Export is available after selecting and validating a backend result set.")
          }
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
          placeholder="Symbol (optional)"
          aria-label="Symbol filter"
        />
        <Button tone="outline" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </Button>
        <Button tone="outline">
          <Filter size={16} /> Filters
        </Button>
      </div>
      <div className="segment-control">
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
                : "No historical orders returned by the trading service."
            }
          />
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
