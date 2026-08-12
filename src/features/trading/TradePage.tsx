import { BarChart3, Info, RefreshCw, Settings2, XCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ApiError } from "../../api/client"
import {
  cancelOrder,
  loadAssetScales,
  loadBalances,
  loadCandles,
  loadFundingPayments,
  loadFundingRate,
  loadIndexPrice,
  loadLatestTrade,
  loadMarkets,
  loadMarkPrice,
  loadOpenOrders,
  loadOrderBook,
  loadPositions,
  placeOrder,
} from "../../api/endpoints"
import { mapCandle, mapMarket } from "../../api/mappers"
import type {
  ApiBalance,
  ApiFundingPayment,
  ApiFundingRate,
  ApiOrder,
  ApiOrderBook,
} from "../../api/types"
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
import { useRealtime } from "../../hooks/useRealtime"
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
    key: "coin-m-delivery",
    line: PRODUCT_LINES.coinMDelivery,
    title: "Coin-M Delivery",
    symbol: "BTCUSD Coin-M Delivery",
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

const productKeyAliases: Readonly<Record<string, string>> = {
  "usd-perpetual": "usd-m-perpetuals",
  "coin-perpetual": "coin-m-perpetuals",
}

type Level = readonly [string | number, string | number]

export function TradePage({ productKey }: { readonly productKey: string }) {
  const normalizedProductKey = productKeyAliases[productKey] ?? productKey
  const view = views.find((candidate) => candidate.key === normalizedProductKey) ?? views[0]
  const session = loadSession()
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [candles, setCandles] = useState<readonly Candle[]>([])
  const [selected, setSelected] = useState<string>(view.symbol)
  const [pairSearch, setPairSearch] = useState("")
  const [book, setBook] = useState<ApiOrderBook | null>(null)
  const [latestTrade, setLatestTrade] = useState<Record<string, unknown> | null>(null)
  const [openOrders, setOpenOrders] = useState<readonly ApiOrder[]>([])
  const [balance, setBalance] = useState<ApiBalance | null>(null)
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, number>>>({})
  const [positions, setPositions] = useState<readonly Record<string, unknown>[]>([])
  const [funding, setFunding] = useState<ApiFundingRate | null>(null)
  const [markPrice, setMarkPrice] = useState<Record<string, unknown> | null>(null)
  const [indexPrice, setIndexPrice] = useState<Record<string, unknown> | null>(null)
  const [fundingPayments, setFundingPayments] = useState<readonly ApiFundingPayment[]>([])
  const [fundingPaymentsError, setFundingPaymentsError] = useState("")
  const [marketsRequestFinished, setMarketsRequestFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [side, setSide] = useState<OrderSide>("BUY")
  const [orderType, setOrderType] = useState<OrderType>("LIMIT")
  const [period, setPeriod] = useState("1h")
  const [price, setPrice] = useState("64230.50")
  const [quantity, setQuantity] = useState("")
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [submitMessage, setSubmitMessage] = useState("")
  const demo = config.demoDataEnabled && !marketsRequestFinished
  const availableMarkets = markets.length > 0 ? markets : demo ? demoMarkets : []
  const filteredMarkets = availableMarkets.filter((market) =>
    market.symbol.toLowerCase().includes(pairSearch.toLowerCase()),
  )
  const current = useMemo(
    () =>
      availableMarkets.find((market) => market.symbol === selected) ?? availableMarkets[0] ?? null,
    [availableMarkets, selected],
  )
  const realtime = useRealtime(session, current?.symbol ?? view.symbol, view.line, period)

  useEffect(() => {
    setMarketsRequestFinished(false)
    setError(null)
    void loadMarkets(view.line)
      .then((rows) => {
        setMarkets(rows.map(mapMarket))
        setMarketsRequestFinished(true)
      })
      .catch((reason: unknown) => {
        setMarketsRequestFinished(true)
        setError(readError(reason))
      })
  }, [view.line])
  useEffect(() => {
    if (!current) return
    setPrice(current.price === null ? "" : String(current.price))
    setCandles([])
    setBook(null)
    setLatestTrade(null)
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
      session ? loadBalances(view.line) : Promise.resolve([] as readonly ApiBalance[]),
      loadAssetScales(),
    ])
      .then(
        ([candleRows, bookResult, tradeResult, orderRows, positionRows, balanceRows, scales]) => {
          setCandles(candleRows.map(mapCandle))
          setBook(bookResult)
          setLatestTrade(tradeResult)
          setOpenOrders(orderRows)
          setPositions(positionRows)
          setBalance(balanceRows[0] ?? null)
          setAssetScales(scales)
        },
      )
      .catch((reason: unknown) => setError(readError(reason)))
  }, [current, period, session, view.line])

  useEffect(() => {
    if (
      !current ||
      !session ||
      view.line === PRODUCT_LINES.spot ||
      view.line === PRODUCT_LINES.option
    ) {
      setFunding(null)
      setFundingPayments([])
      setFundingPaymentsError("")
      return
    }
    void loadFundingRate(current.symbol, view.line)
      .then((value) => setFunding(value))
      .catch(() => setFunding(null))
    setFundingPaymentsError("")
    void loadFundingPayments(session.user.userId, current.symbol, view.line)
      .then((rows) => setFundingPayments(rows))
      .catch((reason: unknown) => {
        setFundingPayments([])
        setFundingPaymentsError(readError(reason))
      })
  }, [current, session, view.line])

  useEffect(() => {
    if (!current || view.line === PRODUCT_LINES.spot || view.line === PRODUCT_LINES.option) {
      setMarkPrice(null)
      setIndexPrice(null)
      return
    }
    void Promise.allSettled([
      loadMarkPrice(current.symbol, view.line),
      loadIndexPrice(current.symbol, view.line),
    ]).then(([markResult, indexResult]) => {
      setMarkPrice(markResult.status === "fulfilled" ? markResult.value : null)
      setIndexPrice(indexResult.status === "fulfilled" ? indexResult.value : null)
    })
  }, [current, view.line])

  const submit = async () => {
    if (!session) {
      setSubmitState("error")
      setSubmitMessage("请先登录后再提交订单。")
      return
    }
    const numericQuantity = Number(quantity)
    const numericPrice = Number(price)
    if (!current || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      setSubmitState("error")
      setSubmitMessage("请输入有效数量。")
      return
    }
    if (orderType !== "MARKET" && (!Number.isFinite(numericPrice) || numericPrice <= 0)) {
      setSubmitState("error")
      setSubmitMessage("限价单需要有效价格。")
      return
    }
    if (orderType === "STOP") {
      setSubmitState("error")
      setSubmitMessage("条件单需要触发价与专用风控参数，当前入口暂不提交普通订单。")
      return
    }
    const quantityScale = 10 ** current.quantityPrecision
    const quantitySteps = Math.round(numericQuantity * quantityScale)
    if (quantitySteps <= 0 || Math.abs(quantitySteps / quantityScale - numericQuantity) > 1e-9) {
      setSubmitState("error")
      setSubmitMessage(`数量最多支持 ${current.quantityPrecision} 位小数。`)
      return
    }
    const availableAmount = balanceAmount(balance, assetScales)
    const requiredAmount = side === "SELL" ? numericQuantity : numericQuantity * numericPrice
    if (
      availableAmount !== null &&
      Number.isFinite(requiredAmount) &&
      requiredAmount > availableAmount + 1e-12
    ) {
      setSubmitState("error")
      setSubmitMessage("可用余额不足，订单未提交。")
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
            orderType === "MARKET" ? 0 : Math.round(numericPrice * 10 ** current.pricePrecision),
          quantitySteps,
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
      session ? loadBalances(view.line) : Promise.resolve([] as readonly ApiBalance[]),
    ])
      .then(([bookResult, orderRows, balanceRows]) => {
        setBook(bookResult)
        setOpenOrders(orderRows)
        setBalance(balanceRows[0] ?? null)
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
              <span className="cluster">
                {view.title} · {current?.baseAsset ?? "Asset"}
                <Badge tone={realtime.state === "live" ? "positive" : "neutral"}>
                  {realtime.state === "live" ? "Realtime" : realtime.state}
                </Badge>
              </span>
              {realtime.lastEventAt ? (
                <small className="muted">Updated {formatDate(realtime.lastEventAt)}</small>
              ) : null}
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
            {view.line !== PRODUCT_LINES.spot && view.line !== PRODUCT_LINES.option ? (
              <>
                <div>
                  <small>Mark price</small>
                  <strong className="mono">
                    <Price value={numberValue(markPrice, "markPrice")} />
                  </strong>
                </div>
                <div>
                  <small>Index price</small>
                  <strong className="mono">
                    <Price value={numberValue(indexPrice, "indexPrice")} />
                  </strong>
                </div>
                <div>
                  <small>Funding rate</small>
                  <strong className="mono positive">{fundingRate(funding)}</strong>
                </div>
                <div>
                  <small>Next funding</small>
                  <strong className="mono">{fundingTime(funding)}</strong>
                </div>
              </>
            ) : null}
          </header>
          {view.line === PRODUCT_LINES.option ? <OptionDetails market={current} /> : null}
          {view.key === "delivery-futures" ? <DeliveryDetails market={current} /> : null}
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
          <PriceChart candles={candles} demo={demo} unavailable={!demo && candles.length < 2} />
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
          {view.line !== PRODUCT_LINES.spot && view.line !== PRODUCT_LINES.option ? (
            <FundingPayments rows={fundingPayments} error={fundingPaymentsError} />
          ) : null}
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
            <span className="mono">
              {session
                ? `${balanceAmount(balance, assetScales) ?? "—"} ${balance?.asset ?? current?.quoteAsset ?? ""}`
                : "Login required"}
            </span>
            <span>Est. fee</span>
            <span className="mono">{estimatedFee(current, price, quantity)}</span>
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

function OptionDetails({ market }: { readonly market: Market | null }) {
  return (
    <Panel dense className="contract-details">
      <div className="panel-heading">
        <h2>Option contract</h2>
        <Badge tone="info">Backend fields</Badge>
      </div>
      <div className="contract-detail-grid">
        <Detail label="Underlying" value={market?.underlyingSymbol ?? market?.baseAsset ?? "—"} />
        <Detail label="Expiry" value={formatDate(market?.expiryTime)} />
        <Detail label="Strike (units)" value={market?.strikePriceUnits?.toString() ?? "—"} />
        <Detail label="Call / Put" value={market?.optionType ?? "—"} />
        <Detail label="Exercise" value={market?.optionExerciseStyle ?? "—"} />
        <Detail label="Settlement" value={market?.settlementMethod ?? "—"} />
        <Detail label="Implied volatility" value="Backend pending" />
        <Detail label="Greeks" value="Backend pending" />
      </div>
      <p className="muted contract-help">
        Greeks and implied volatility are shown only when returned by the option quotation service;
        no placeholder risk values are generated in the client.
      </p>
    </Panel>
  )
}

function DeliveryDetails({ market }: { readonly market: Market | null }) {
  return (
    <Panel dense className="contract-details">
      <div className="panel-heading">
        <h2>Delivery contract</h2>
        <Badge tone="info">Backend fields</Badge>
      </div>
      <div className="contract-detail-grid">
        <Detail label="Contract value" value={market?.contractValueAsset ?? "—"} />
        <Detail label="Expiry" value={formatDate(market?.expiryTime)} />
        <Detail label="Delivery time" value={formatDate(market?.deliveryTime)} />
        <Detail label="Settlement" value={market?.settlementMethod ?? "—"} />
        <Detail label="Contract multiplier" value={ppmValue(market?.contractMultiplierPpm)} />
        <Detail label="Maintenance margin" value={ppmValue(market?.maintenanceMarginRatePpm)} />
      </div>
    </Panel>
  )
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="contract-detail">
      <small>{label}</small>
      <strong className="mono">{value}</strong>
    </div>
  )
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString()
}

function ppmValue(value: number | undefined): string {
  return value === undefined ? "—" : `${(value / 10_000).toFixed(4)}%`
}

function balanceAmount(
  balance: ApiBalance | null,
  assetScales: Readonly<Record<string, number>>,
): number | null {
  if (!balance) return null
  const direct = numericValue(balance.free)
  if (direct !== null) return direct
  const scale = assetScales[balance.asset]
  return balance.availableUnits === undefined || scale === undefined
    ? null
    : balance.availableUnits / scale
}

function estimatedFee(market: Market | null, price: string, quantity: string): string {
  const rate = market?.takerFeeRatePpm
  const priceValue = Number(price)
  const quantityValue = Number(quantity)
  if (
    rate === undefined ||
    !Number.isFinite(priceValue) ||
    !Number.isFinite(quantityValue) ||
    priceValue <= 0 ||
    quantityValue <= 0
  ) {
    return "—"
  }
  return `${((priceValue * quantityValue * rate) / 1_000_000).toFixed(8)} ${market?.quoteAsset ?? ""}`
}

function numericValue(value: string | number | undefined): number | null {
  if (value === undefined) return null
  const result = typeof value === "number" ? value : Number(value)
  return Number.isFinite(result) ? result : null
}

function numberValue(row: Record<string, unknown> | null, key: string): number | null {
  const value = row?.[key]
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function text(row: Record<string, unknown> | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "交易服务暂不可用，请稍后重试。"
}

function fundingRate(
  value: Pick<ApiFundingRate, "fundingRatePpm"> | Pick<ApiFundingPayment, "fundingRatePpm"> | null,
): string {
  const raw = value?.fundingRatePpm
  const ppm = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
  return Number.isFinite(ppm) ? `${ppm >= 0 ? "+" : ""}${(ppm / 10_000).toFixed(4)}%` : "—"
}

function fundingTime(value: ApiFundingRate | null): string {
  const raw = value?.fundingTime
  if (typeof raw !== "string" || !raw) return "—"
  const date = new Date(raw)
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString([], { hour: "2-digit", minute: "2-digit" })
}

function FundingPayments({
  rows,
  error,
}: {
  readonly rows: readonly ApiFundingPayment[]
  readonly error: string
}) {
  return (
    <Panel dense>
      <div className="panel-heading">
        <h2>Funding payment history</h2>
        <Badge tone="info">Backend records</Badge>
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
                <th>Symbol</th>
                <th>Asset</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.paymentId) || String(index)}>
                  <td>{row.symbol || "—"}</td>
                  <td>{row.asset || "—"}</td>
                  <td className="mono">{fundingRate(row)}</td>
                  <td className="mono">{String(row.amountUnits)}</td>
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
