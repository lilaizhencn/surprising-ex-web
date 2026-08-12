import { BarChart3, Info, RefreshCw, Settings2, XCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ApiError } from "../../api/client"
import {
  cancelOrder,
  loadCandles,
  loadLatestTrade,
  loadMarkets,
  loadOpenOrders,
  loadOrderBook,
  loadPositions,
  placeOrder,
} from "../../api/endpoints"
import { mapCandle, mapMarket } from "../../api/mappers"
import type { ApiOrder, ApiOrderBook } from "../../api/types"
import { PriceChart } from "../../components/trading/PriceChart"
import {
  Badge,
  Button,
  Field,
  Panel,
  Price,
  SearchField,
  StateView,
} from "../../components/ui/Primitives"
import { config } from "../../lib/config"
import { demoMarkets } from "../../lib/demo"
import { formatPercent } from "../../lib/format"
import { loadSession } from "../../state/session"
import {
  type Candle,
  type Market,
  type OrderSide,
  type OrderType,
  PRODUCT_LINES,
  type ProductLine,
} from "../../types/domain"

const views = [
  { key: "spot", line: PRODUCT_LINES.spot, title: "Spot Trading", symbol: "BTC/USDT", dark: false },
  {
    key: "usd-m-perpetuals",
    line: PRODUCT_LINES.usdMPerpetual,
    title: "USD-M Perpetual",
    symbol: "BTCUSDT_PERP",
    dark: true,
  },
  {
    key: "coin-m-perpetuals",
    line: PRODUCT_LINES.coinMPerpetual,
    title: "Coin-M Perpetual",
    symbol: "BTCUSD_PERP",
    dark: true,
  },
  {
    key: "delivery-futures",
    line: PRODUCT_LINES.usdMDelivery,
    title: "Delivery Futures",
    symbol: "BTCUSD Delivery",
    dark: false,
  },
  {
    key: "options",
    line: PRODUCT_LINES.option,
    title: "Options Trading",
    symbol: "BTC-64000-C",
    dark: false,
  },
] as const

type Level = readonly [string | number, string | number]

export function TradePage({ productKey }: { readonly productKey: string }) {
  const view = views.find((candidate) => candidate.key === productKey) ?? views[0]
  const session = loadSession()
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [candles, setCandles] = useState<readonly Candle[]>([])
  const [selected, setSelected] = useState<string>(view.symbol)
  const [pairSearch, setPairSearch] = useState("")
  const [book, setBook] = useState<ApiOrderBook | null>(null)
  const [latestTrade, setLatestTrade] = useState<Record<string, unknown> | null>(null)
  const [openOrders, setOpenOrders] = useState<readonly ApiOrder[]>([])
  const [positions, setPositions] = useState<readonly Record<string, unknown>[]>([])
  const [error, setError] = useState<string | null>(null)
  const [side, setSide] = useState<OrderSide>("BUY")
  const [orderType, setOrderType] = useState<OrderType>("LIMIT")
  const [period, setPeriod] = useState("1h")
  const [price, setPrice] = useState("64230.50")
  const [quantity, setQuantity] = useState("")
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [submitMessage, setSubmitMessage] = useState("")
  const demo = config.demoDataEnabled && markets.length === 0
  const availableMarkets = markets.length > 0 ? markets : demo ? demoMarkets : []
  const filteredMarkets = availableMarkets.filter((market) =>
    market.symbol.toLowerCase().includes(pairSearch.toLowerCase()),
  )
  const current = useMemo(
    () =>
      availableMarkets.find((market) => market.symbol === selected) ?? availableMarkets[0] ?? null,
    [availableMarkets, selected],
  )

  useEffect(() => {
    setError(null)
    void loadMarkets(view.line)
      .then((rows) => setMarkets(rows.map(mapMarket)))
      .catch((reason: unknown) => setError(readError(reason)))
  }, [view.line])
  useEffect(() => {
    if (!current) return
    setPrice(current.price === null ? "" : String(current.price))
    void Promise.all([
      loadCandles(current.symbol, period, view.line),
      loadOrderBook(current.symbol, view.line),
      loadLatestTrade(current.symbol, view.line),
      session
        ? loadOpenOrders(current.symbol, view.line)
        : Promise.resolve([] as readonly ApiOrder[]),
      session && view.line !== PRODUCT_LINES.spot
        ? loadPositions(view.line)
        : Promise.resolve([] as readonly Record<string, unknown>[]),
    ])
      .then(([candleRows, bookResult, tradeResult, orderRows, positionRows]) => {
        setCandles(candleRows.map(mapCandle))
        setBook(bookResult)
        setLatestTrade(tradeResult)
        setOpenOrders(orderRows)
        setPositions(positionRows)
      })
      .catch((reason: unknown) => setError(readError(reason)))
  }, [current, period, session, view.line])

  const submit = async () => {
    if (!session) {
      setSubmitState("error")
      setSubmitMessage("请先登录后再提交订单。")
      return
    }
    if (!current || !quantity || Number(quantity) <= 0) {
      setSubmitState("error")
      setSubmitMessage("请输入有效数量。")
      return
    }
    if (orderType === "STOP") {
      setSubmitState("error")
      setSubmitMessage("条件单需要触发价与专用风控参数，当前入口暂不提交普通订单。")
      return
    }
    setSubmitState("loading")
    try {
      const clientOrderId = `web-${crypto.randomUUID()}`
      await placeOrder(
        {
          userId: session.user.userId,
          clientOrderId,
          symbol: current.symbol,
          side,
          orderType,
          timeInForce: orderType === "MARKET" ? "IOC" : "GTC",
          priceTicks:
            orderType === "MARKET" ? 0 : Math.round(Number(price) * 10 ** current.pricePrecision),
          quantitySteps: Math.round(Number(quantity) * 10 ** current.quantityPrecision),
          marginMode: "CROSS",
          positionSide: "NET",
          reduceOnly: false,
          postOnly: false,
        },
        view.line,
      )
      setSubmitState("success")
      setSubmitMessage("订单已提交，最终状态以订单查询和私有状态为准。")
      setQuantity("")
      refresh()
    } catch (reason: unknown) {
      setSubmitState("error")
      setSubmitMessage(reason instanceof ApiError ? reason.message : readError(reason))
    }
  }
  const refresh = () => {
    if (!current) return
    void Promise.all([
      loadOrderBook(current.symbol, view.line),
      loadOpenOrders(current.symbol, view.line),
    ])
      .then(([bookResult, orderRows]) => {
        setBook(bookResult)
        setOpenOrders(orderRows)
      })
      .catch((reason: unknown) => setError(readError(reason)))
  }

  return (
    <div className={`trade-page ${view.dark ? "trade-dark" : ""}`}>
      <div className="trade-shell">
        <aside className="trade-pairs">
          <SearchField value={pairSearch} onChange={setPairSearch} placeholder="Search pairs..." />
          <div className="trade-tabs">
            <button type="button" className="active">
              All
            </button>
            <button type="button">Favorites</button>
          </div>
          {filteredMarkets.slice(0, 12).map((market) => (
            <button
              type="button"
              className={`pair-row ${market.symbol === current?.symbol ? "active" : ""}`}
              key={market.symbol}
              onClick={() => setSelected(market.symbol)}
            >
              <span>☆ {market.symbol}</span>
              <span className={(market.change24h ?? 0) >= 0 ? "positive mono" : "negative mono"}>
                <Price value={market.price} />
              </span>
            </button>
          ))}
          {filteredMarkets.length === 0 ? (
            <StateView
              kind={demo ? "empty" : "error"}
              message={demo ? "No demo pair matches." : "No market pairs returned by the backend."}
            />
          ) : null}
        </aside>
        <main className="trade-main">
          <header className="trade-market-header">
            <div>
              <h1>
                {current?.symbol ?? view.symbol} <Info size={18} />
              </h1>
              <span>
                {view.title} · {current?.baseAsset ?? "Asset"}
              </span>
            </div>
            <div>
              <small>Last Price</small>
              <strong className="positive mono">
                <Price value={current?.price ?? null} />
              </strong>
            </div>
            <div>
              <small>24h Change</small>
              <strong
                className={(current?.change24h ?? 0) >= 0 ? "positive mono" : "negative mono"}
              >
                {formatPercent(current?.change24h ?? null)}
              </strong>
            </div>
            <div>
              <small>24h High</small>
              <strong className="mono">
                <Price value={current?.high24h ?? null} />
              </strong>
            </div>
            <div>
              <small>24h Low</small>
              <strong className="mono">
                <Price value={current?.low24h ?? null} />
              </strong>
            </div>
          </header>
          <div className="trade-chart-toolbar">
            {["15m", "1h", "4h", "1d"].map((value) => (
              <button
                type="button"
                className={period === value ? "active" : ""}
                key={value}
                onClick={() => setPeriod(value)}
              >
                {value}
              </button>
            ))}
            <span />
            <BarChart3 size={18} />
            <Settings2 size={18} />
            <Button tone="ghost" onClick={refresh}>
              <RefreshCw size={16} />
            </Button>
          </div>
          <PriceChart candles={candles} demo={demo} />
          <div className="trade-bottom">
            <OrderBook book={book} />
            <Panel dense>
              <div className="panel-heading">
                <h2>Recent trade</h2>
                <Badge tone="neutral">{latestTrade ? "Live snapshot" : "Waiting"}</Badge>
              </div>
              <div className="trade-list">
                <span className="mono">{text(latestTrade, "price") || "—"}</span>
                <span className="subtle">
                  {text(latestTrade, "quantity") ||
                    text(latestTrade, "qty") ||
                    "No latest trade returned"}
                </span>
              </div>
            </Panel>
          </div>
          <Panel dense>
            <div className="panel-heading">
              <h2>
                {view.line === PRODUCT_LINES.spot
                  ? "Account order state"
                  : "Positions & order state"}
              </h2>
              <Badge tone="info">Backend</Badge>
            </div>
            {positions.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Quantity</th>
                      <th>Entry</th>
                      <th>Unrealized PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position, index) => (
                      <tr key={text(position, "positionId") || String(index)}>
                        <td>{text(position, "symbol") || "—"}</td>
                        <td>{text(position, "positionSide") || text(position, "side") || "—"}</td>
                        <td className="mono">
                          {text(position, "quantity") || text(position, "quantitySteps") || "—"}
                        </td>
                        <td className="mono">{text(position, "entryPrice") || "—"}</td>
                        <td className="mono">{text(position, "unrealizedPnl") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <StateView
                kind="empty"
                message={
                  session && view.line !== PRODUCT_LINES.spot
                    ? "No open positions returned."
                    : "Positions are available for derivative product lines after login."
                }
              />
            )}
            {openOrders.length > 0 ? (
              <OpenOrders
                rows={openOrders}
                productLine={view.line}
                onDone={(value) => {
                  setSubmitMessage(value)
                  refresh()
                }}
              />
            ) : null}
          </Panel>
        </main>
        <aside className="trade-ticket">
          <div className="ticket-tabs">
            <button
              type="button"
              className={side === "BUY" ? "buy active" : "buy"}
              onClick={() => setSide("BUY")}
            >
              Buy
            </button>
            <button
              type="button"
              className={side === "SELL" ? "sell active" : "sell"}
              onClick={() => setSide("SELL")}
            >
              Sell
            </button>
          </div>
          <div className="order-type-tabs">
            {(["LIMIT", "MARKET", "STOP"] as const).map((type) => (
              <button
                type="button"
                className={orderType === type ? "active" : ""}
                key={type}
                onClick={() => setOrderType(type)}
              >
                {type === "STOP" ? "Conditional" : type}
              </button>
            ))}
          </div>
          {orderType !== "MARKET" ? (
            <Field label="Price">
              <div className="number-input">
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                />
                <span>{current?.quoteAsset ?? "USDT"}</span>
              </div>
            </Field>
          ) : null}
          <Field label="Quantity">
            <div className="number-input">
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Order quantity"
              />
              <span>{current?.baseAsset ?? "Asset"}</span>
            </div>
          </Field>
          <div className="slider-row">
            <span>0%</span>
            <input type="range" min="0" max="100" defaultValue="0" aria-label="Order percentage" />
            <span>100%</span>
          </div>
          <div className="ticket-summary">
            <span>Available</span>
            <span className="mono">{session ? "Backend balance" : "Login required"}</span>
            <span>Est. fee</span>
            <span className="mono">—</span>
          </div>
          {submitMessage ? (
            <p
              className={`form-message ${submitState === "success" ? "positive" : "negative"}`}
              role="status"
            >
              {submitMessage}
            </p>
          ) : null}
          <Button
            tone={side === "BUY" ? "positive" : "negative"}
            loading={submitState === "loading"}
            onClick={() => void submit()}
          >
            {session
              ? `${side === "BUY" ? "Buy" : "Sell"} ${current?.baseAsset ?? "Asset"}`
              : "Log in to trade"}
          </Button>
          <a className="route-link ticket-login" href="/auth/login">
            {session ? "Manage orders" : "Create an account"}
          </a>
        </aside>
      </div>
      {error && !demo ? (
        <div className="container trade-notice">
          <StateView kind="error" message={error} retry={() => window.location.reload()} />
        </div>
      ) : null}
      {demo ? (
        <div className="demo-banner trade-demo-banner">
          演示数据：未登录或行情服务不可用，价格与图表仅用于本地视觉检查。
        </div>
      ) : null}
    </div>
  )
}

function OrderBook({ book }: { readonly book: ApiOrderBook | null }) {
  const bids = book?.bids ?? []
  const asks = book?.asks ?? []
  return (
    <Panel dense>
      <div className="panel-heading">
        <h2>Order book</h2>
        <Badge tone="info">{book ? "Live snapshot" : "Waiting"}</Badge>
      </div>
      {bids.length === 0 && asks.length === 0 ? (
        <StateView kind="empty" message="Order book data is not available." />
      ) : (
        <div className="order-book">
          <span>Price</span>
          <span>Amount</span>
          <span>Total</span>
          {asks
            .slice(0, 5)
            .reverse()
            .map((level, index) => (
              <LevelRow key={`ask-${index}`} level={level} tone="negative" />
            ))}
          {bids.slice(0, 5).map((level, index) => (
            <LevelRow key={`bid-${index}`} level={level} tone="positive" />
          ))}
        </div>
      )}
    </Panel>
  )
}
function LevelRow({
  level,
  tone,
}: {
  readonly level: Level
  readonly tone: "positive" | "negative"
}) {
  const price = String(level[0])
  const amount = String(level[1])
  const total = Number(price) * Number(amount)
  return (
    <>
      <strong className={`${tone} mono`}>{price}</strong>
      <span className="mono">{amount}</span>
      <span className="mono">{Number.isFinite(total) ? total.toFixed(2) : "—"}</span>
    </>
  )
}
function OpenOrders({
  rows,
  productLine,
  onDone,
}: {
  readonly rows: readonly ApiOrder[]
  readonly productLine: ProductLine
  readonly onDone: (message: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Open order</th>
            <th>Side</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <OpenOrderRow
              key={String(row.orderId ?? index)}
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
function OpenOrderRow({
  row,
  productLine,
  onDone,
}: {
  readonly row: ApiOrder
  readonly productLine: ProductLine
  readonly onDone: (message: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const id = row.orderId === undefined ? "" : String(row.orderId)
  return (
    <tr>
      <td className="mono">{id || "—"}</td>
      <td>{row.side || "—"}</td>
      <td>{row.status || "—"}</td>
      <td>
        <Button
          tone="negative"
          loading={loading}
          disabled={!id || !row.symbol}
          onClick={() => {
            if (!id || !row.symbol || !window.confirm("Cancel this order?")) return
            setLoading(true)
            void cancelOrder(row.symbol, id, productLine)
              .then(
                () => onDone("撤单请求已发送。"),
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        >
          <XCircle size={14} /> Cancel
        </Button>
      </td>
    </tr>
  )
}
function text(row: Record<string, unknown> | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "交易服务暂不可用，请稍后重试。"
}
