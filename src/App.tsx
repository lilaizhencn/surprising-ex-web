import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  CandlestickChart,
  ChevronDown,
  CircleDollarSign,
  Crosshair,
  Gauge,
  History,
  LineChart,
  LockKeyhole,
  Menu,
  MoonStar,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X
} from "lucide-react";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { balances, buildCandles, buildOrderBook, buildTrades, markets, openOrders as seededOpenOrders, positions } from "./mockData";
import type { Candle, OpenOrder, OrderBookLevel, OrderType, Side, TimeInForce, TradePrint } from "./types";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const precise = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
    </div>
  );
}

function KlineChart({ candles }: { candles: Candle[] }) {
  useEffect(() => {
    const container = document.querySelector<HTMLDivElement>("#kline-chart");
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8f97bb",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: "rgba(119, 134, 193, 0.10)" },
        horzLines: { color: "rgba(119, 134, 193, 0.10)" }
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.18)"
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: {
        mode: 0
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#35e6ad",
      downColor: "#ff6b9a",
      borderUpColor: "#35e6ad",
      borderDownColor: "#ff6b9a",
      wickUpColor: "#35e6ad",
      wickDownColor: "#ff6b9a"
    });
    candleSeries.setData(candles.map(({ time, open, high, low, close }) => ({ time: time as UTCTimestamp, open, high, low, close })));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "rgba(151, 121, 255, 0.35)"
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volumeSeries.setData(
      candles.map((item) => ({
        time: item.time as UTCTimestamp,
        value: item.volume,
        color: item.close >= item.open ? "rgba(53, 230, 173, 0.35)" : "rgba(255, 107, 154, 0.35)"
      }))
    );

    const markSeries = chart.addSeries(LineSeries, {
      color: "#ffd36e",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false
    });
    markSeries.setData(candles.map((item) => ({ time: item.time as UTCTimestamp, value: item.close * 0.9995 })));

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles]);

  return <div id="kline-chart" className="chart-canvas" />;
}

function OrderBook({ asks, bids, mid }: { asks: OrderBookLevel[]; bids: OrderBookLevel[]; mid: number }) {
  const maxTotal = Math.max(...asks.map((level) => level.total), ...bids.map((level) => level.total));
  return (
    <section className="panel orderbook">
      <div className="panel-title">
        <span><BookOpen size={16} />盘口</span>
        <button>0.1 <ChevronDown size={14} /></button>
      </div>
      <div className="book-head">
        <span>价格</span><span>数量</span><span>累计</span>
      </div>
      <div className="book-side">
        {asks.map((level) => (
          <div className="book-row ask" key={`ask-${level.price}`}>
            <i style={{ width: `${(level.total / maxTotal) * 100}%` }} />
            <span>{precise.format(level.price)}</span><span>{level.quantity}</span><span>{level.total}</span>
          </div>
        ))}
      </div>
      <div className="mid-price">
        <strong>{precise.format(mid)}</strong>
        <small>标记价格 {precise.format(mid * 0.9998)}</small>
      </div>
      <div className="book-side">
        {bids.map((level) => (
          <div className="book-row bid" key={`bid-${level.price}`}>
            <i style={{ width: `${(level.total / maxTotal) * 100}%` }} />
            <span>{precise.format(level.price)}</span><span>{level.quantity}</span><span>{level.total}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TradesTape({ trades }: { trades: TradePrint[] }) {
  return (
    <section className="panel trades-panel">
      <div className="panel-title">
        <span><Activity size={16} />实时成交</span>
        <button>合并</button>
      </div>
      <div className="book-head">
        <span>价格</span><span>数量</span><span>时间</span>
      </div>
      <div className="trades-list">
        {trades.map((trade) => (
          <div className={`trade-row ${trade.side}`} key={trade.id}>
            <span>{precise.format(trade.price)}</span>
            <span>{trade.quantity}</span>
            <span>{trade.time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TradingForm({ symbol, markPrice, onPlaceOrder }: { symbol: string; markPrice: number; onPlaceOrder: (order: OpenOrder) => void }) {
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("LIMIT");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC");
  const [price, setPrice] = useState(markPrice.toFixed(2));
  const [size, setSize] = useState("0.10");
  const [leverage, setLeverage] = useState(20);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [percent, setPercent] = useState(25);

  useEffect(() => setPrice(markPrice.toFixed(2)), [markPrice]);

  const notional = Number(price || markPrice) * Number(size || 0);
  const margin = notional / leverage;

  function placeOrder() {
    onPlaceOrder({
      id: `SX-${Math.floor(100000 + Math.random() * 899999)}`,
      symbol,
      side,
      type,
      price: Number(price || markPrice),
      size: Number(size || 0),
      filled: 0,
      reduceOnly,
      status: "NEW"
    });
  }

  return (
    <section className="panel trade-form">
      <div className="panel-title">
        <span><CircleDollarSign size={16} />下单</span>
        <button><ShieldCheck size={14} />模拟撮合</button>
      </div>
      <div className="side-switch">
        <button className={side === "buy" ? "active buy" : ""} onClick={() => setSide("buy")}>开多</button>
        <button className={side === "sell" ? "active sell" : ""} onClick={() => setSide("sell")}>开空</button>
      </div>
      <div className="segmented">
        {(["LIMIT", "MARKET", "POST_ONLY"] as OrderType[]).map((item) => (
          <button className={type === item ? "active" : ""} key={item} onClick={() => setType(item)}>{item}</button>
        ))}
      </div>
      <label className="field">
        <span>价格 USDT</span>
        <input value={price} disabled={type === "MARKET"} onChange={(event) => setPrice(event.target.value)} />
      </label>
      <label className="field">
        <span>数量 {symbol.split("-")[0]}</span>
        <input value={size} onChange={(event) => setSize(event.target.value)} />
      </label>
      <label className="field slider-field">
        <span>杠杆 {leverage}x</span>
        <input type="range" min="1" max="125" value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} />
      </label>
      <div className="percent-row">
        {[10, 25, 50, 75, 100].map((item) => (
          <button className={percent === item ? "active" : ""} key={item} onClick={() => setPercent(item)}>{item}%</button>
        ))}
      </div>
      <div className="form-row">
        <span>有效期</span>
        <select value={timeInForce} onChange={(event) => setTimeInForce(event.target.value as TimeInForce)}>
          <option>GTC</option>
          <option>IOC</option>
          <option>FOK</option>
        </select>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={reduceOnly} onChange={(event) => setReduceOnly(event.target.checked)} />
        <span>只减仓</span>
      </label>
      <div className="order-preview">
        <span>委托价值 <b>{formatCompact(notional)} USDT</b></span>
        <span>预估保证金 <b>{nf.format(margin)} USDT</b></span>
      </div>
      <button className={`submit ${side}`} onClick={placeOrder}>{side === "buy" ? "买入 / 开多" : "卖出 / 开空"}</button>
    </section>
  );
}

function App() {
  const [marketIndex, setMarketIndex] = useState(0);
  const [orders, setOrders] = useState(seededOpenOrders);
  const activeMarket = markets[marketIndex];
  const candles = useMemo(() => buildCandles(activeMarket.lastPrice), [activeMarket.lastPrice]);
  const book = useMemo(() => buildOrderBook(activeMarket.lastPrice), [activeMarket.lastPrice]);
  const trades = useMemo(() => buildTrades(activeMarket.lastPrice), [activeMarket.lastPrice]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <div>
            <strong>Surprising EX</strong>
            <small>Perpetual Futures</small>
          </div>
        </div>
        <nav>
          <button className="active">合约</button>
          <button>资产</button>
          <button>策略</button>
          <button>风控</button>
        </nav>
        <div className="top-actions">
          <button><Bell size={16} /></button>
          <button><Settings size={16} /></button>
          <button className="wallet"><WalletCards size={16} />连接钱包</button>
          <button className="menu"><Menu size={18} /></button>
        </div>
      </header>

      <section className="market-strip">
        <div className="symbol-select">
          <CandlestickChart size={20} />
          <select value={marketIndex} onChange={(event) => setMarketIndex(Number(event.target.value))}>
            {markets.map((market, index) => <option value={index} key={market.symbol}>{market.displayName}</option>)}
          </select>
        </div>
        <Metric label="最新价" value={precise.format(activeMarket.lastPrice)} tone={activeMarket.change24h >= 0 ? "up" : "down"} />
        <Metric label="24h 涨跌" value={`${activeMarket.change24h > 0 ? "+" : ""}${activeMarket.change24h}%`} tone={activeMarket.change24h >= 0 ? "up" : "down"} />
        <Metric label="24h 成交额" value={`$${formatCompact(activeMarket.volume24h)}`} />
        <Metric label="标记价格" value={precise.format(activeMarket.markPrice)} tone="neutral" />
        <Metric label="指数价格" value={precise.format(activeMarket.indexPrice)} />
        <Metric label="资金费率" value={`${activeMarket.fundingRate}% / ${activeMarket.nextFunding}`} tone={activeMarket.fundingRate >= 0 ? "up" : "down"} />
        <Metric label="持仓量" value={`${formatCompact(activeMarket.openInterest)} ${activeMarket.baseAsset}`} />
      </section>

      <section className="workspace">
        <div className="left-stack">
          <section className="chart-panel panel">
            <div className="chart-toolbar">
              <div className="tabs">
                <button className="active"><LineChart size={14} />K线</button>
                <button>深度图</button>
                <button>资金费率</button>
              </div>
              <div className="intervals">
                {["1m", "5m", "15m", "1H", "4H", "1D"].map((item) => <button className={item === "1m" ? "active" : ""} key={item}>{item}</button>)}
              </div>
              <div className="chart-tools">
                <button><Crosshair size={15} /></button>
                <button><MoonStar size={15} /></button>
              </div>
            </div>
            <KlineChart candles={candles} />
          </section>
          <section className="panel account-panel">
            <div className="panel-title">
              <span><History size={16} />账户与仓位</span>
              <button><LockKeyhole size={14} />UID 10001</button>
            </div>
            <div className="account-grid">
              {balances.map((balance) => (
                <div className="balance-tile" key={balance.asset}>
                  <span>{balance.asset} 钱包</span>
                  <strong>{nf.format(balance.wallet)}</strong>
                  <small>可用 {nf.format(balance.available)} / 未实现 {nf.format(balance.unrealizedPnl)}</small>
                </div>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>合约</th><th>方向</th><th>数量</th><th>开仓价</th><th>标记价</th><th>未实现盈亏</th><th>强平价</th></tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr key={`${position.symbol}-${position.side}`}>
                      <td>{position.symbol}</td>
                      <td className={position.side === "LONG" ? "tone-up" : "tone-down"}>{position.side}</td>
                      <td>{position.size}</td>
                      <td>{precise.format(position.entryPrice)}</td>
                      <td>{precise.format(position.markPrice)}</td>
                      <td className="tone-up">{nf.format(position.pnl)} USDT / {position.roe}%</td>
                      <td>{precise.format(position.liquidationPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="middle-stack">
          <OrderBook asks={book.asks} bids={book.bids} mid={activeMarket.lastPrice} />
          <TradesTape trades={trades} />
        </div>

        <div className="right-stack">
          <TradingForm symbol={activeMarket.symbol} markPrice={activeMarket.markPrice} onPlaceOrder={(order) => setOrders((current) => [order, ...current])} />
          <section className="panel risk-card">
            <div className="panel-title">
              <span><Gauge size={16} />风险摘要</span>
              <button>逐仓</button>
            </div>
            <div className="risk-meter">
              <span style={{ width: "38%" }} />
            </div>
            <div className="risk-lines">
              <span>保证金率 <b>38%</b></span>
              <span>维持保证金 <b>812.14 USDT</b></span>
              <span>保险基金覆盖 <b className="tone-up">充足</b></span>
            </div>
          </section>
        </div>
      </section>

      <section className="panel orders-dock">
        <div className="panel-title">
          <span><X size={16} />当前委托</span>
          <button>全部撤单</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>订单号</th><th>合约</th><th>方向</th><th>类型</th><th>价格</th><th>数量</th><th>已成交</th><th>只减仓</th><th>状态</th></tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.id}</td>
                  <td>{order.symbol}</td>
                  <td className={order.side === "buy" ? "tone-up" : "tone-down"}>{order.side === "buy" ? "买入" : "卖出"}</td>
                  <td>{order.type}</td>
                  <td>{precise.format(order.price)}</td>
                  <td>{order.size}</td>
                  <td>{order.filled}</td>
                  <td>{order.reduceOnly ? "是" : "否"}</td>
                  <td>{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default App;
