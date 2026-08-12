import { BarChart3, Info, Settings2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ApiError } from "../../api/client"
import { loadCandles, loadMarkets, placeOrder } from "../../api/endpoints"
import { mapCandle, mapMarket } from "../../api/mappers"
import { PriceChart } from "../../components/trading/PriceChart"
import { Badge, Button, Field, Panel, Price, StateView } from "../../components/ui/Primitives"
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

export function TradePage({ productKey }: { readonly productKey: string }) {
  const view = views.find((candidate) => candidate.key === productKey) ?? views[0]
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [candles, setCandles] = useState<readonly Candle[]>([])
  const [selected, setSelected] = useState<string>(view.symbol)
  const [error, setError] = useState<string | null>(null)
  const [side, setSide] = useState<OrderSide>("BUY")
  const [orderType, setOrderType] = useState<OrderType>("LIMIT")
  const [price, setPrice] = useState("64230.50")
  const [quantity, setQuantity] = useState("")
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [submitMessage, setSubmitMessage] = useState("")
  const session = loadSession()
  const demo = config.demoDataEnabled && markets.length === 0
  const availableMarkets = markets.length > 0 ? markets : demoMarkets
  const current = useMemo(
    () =>
      availableMarkets.find((market) => market.symbol === selected) ?? availableMarkets[0] ?? null,
    [availableMarkets, selected],
  )

  useEffect(() => {
    setError(null)
    void loadMarkets(view.line)
      .then((rows) => setMarkets(rows.map(mapMarket)))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "交易对服务暂不可用"),
      )
  }, [view.line])
  useEffect(() => {
    if (!current) return
    void loadCandles(current.symbol, "1h", view.line)
      .then((rows) => setCandles(rows.map(mapCandle)))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "K 线服务暂不可用"),
      )
  }, [current, view.line])

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
    setSubmitState("loading")
    try {
      const clientOrderId = `web-${Date.now()}`
      await placeOrder(
        {
          symbol: current.symbol,
          side,
          type: orderType,
          priceTicks: Number(price),
          quantitySteps: Number(quantity),
          clientOrderId,
        },
        view.line,
      )
      setSubmitState("success")
      setSubmitMessage("订单已提交，最终状态以订单查询和私有推送为准。")
      setQuantity("")
    } catch (reason: unknown) {
      setSubmitState("error")
      setSubmitMessage(
        reason instanceof ApiError ? reason.message : "订单提交失败，请重试或检查订单状态。",
      )
    }
  }
  return (
    <div className={`trade-page ${view.dark ? "trade-dark" : ""}`}>
      <div className="trade-shell">
        <aside className="trade-pairs">
          <div className="trade-search">
            <input placeholder="Search pairs..." aria-label="Search pairs" />
          </div>
          <div className="trade-tabs">
            <button type="button" className="active">
              USDT
            </button>
            <button type="button">USDC</button>
            <button type="button">BTC</button>
          </div>
          {availableMarkets.slice(0, 6).map((market) => (
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
        </aside>
        <main className="trade-main">
          <header className="trade-market-header">
            <div>
              <h1>
                {current?.symbol ?? view.symbol} <Info size={18} />
              </h1>
              <span>{current?.baseAsset ?? "Bitcoin"}</span>
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
            <button type="button" className="active">
              15m
            </button>
            <button type="button" className="active">
              1h
            </button>
            <button type="button">4h</button>
            <button type="button">1D</button>
            <span />
            <BarChart3 size={18} />
            <Settings2 size={18} />
          </div>
          <PriceChart candles={candles} demo={demo} />
          <div className="trade-bottom">
            <Panel dense>
              <div className="panel-heading">
                <h2>Order book</h2>
                <Badge tone="info">Snapshot</Badge>
              </div>
              <div className="order-book">
                <span>Price (USDT)</span>
                <span>Amount (BTC)</span>
                <span>Total</span>
                <strong className="negative mono">64,245.50</strong>
                <span className="mono">0.120</span>
                <span className="mono">7,709</span>
                <strong className="negative mono">64,250.00</strong>
                <span className="mono">0.052</span>
                <span className="mono">3,341</span>
                <strong className="positive mono">64,230.50</strong>
                <span className="mono">0.100</span>
                <span className="mono">6,423</span>
              </div>
            </Panel>
            <Panel dense>
              <div className="panel-heading">
                <h2>Recent trades</h2>
                <Badge tone="neutral">Waiting</Badge>
              </div>
              <div className="trade-list">
                <span>—</span>
                <span className="subtle">No live trades yet</span>
              </div>
            </Panel>
          </div>
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
                {type}
              </button>
            ))}
          </div>
          <Field label="Price">
            <div className="number-input">
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
              />
              <span>USDT</span>
            </div>
          </Field>
          <Field label="Quantity">
            <div className="number-input">
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Order quantity"
              />
              <span>{current?.baseAsset ?? "BTC"}</span>
            </div>
          </Field>
          <div className="slider-row">
            <span>0%</span>
            <input type="range" min="0" max="100" defaultValue="0" aria-label="Order percentage" />
            <span>100%</span>
          </div>
          <div className="ticket-summary">
            <span>Available</span>
            <span className="mono">{session ? "—" : "Login required"}</span>
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
          <StateView kind="error" message={error} />
        </div>
      ) : null}
      {demo ? (
        <div className="demo-banner trade-demo-banner">
          演示数据：行情和盘口未连接，交易提交仍需要真实登录和后端响应。
        </div>
      ) : null}
    </div>
  )
}
