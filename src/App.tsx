import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  CandlestickChart,
  ChevronDown,
  CircleDollarSign,
  Crosshair,
  Gem,
  Gauge,
  GraduationCap,
  Heart,
  History,
  Layers,
  LineChart,
  LockKeyhole,
  Menu,
  MoonStar,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  WalletCards,
  X
} from "lucide-react";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { balances, buildCandles, buildOrderBook, buildTrades, markets, openOrders as seededOpenOrders, positions } from "./mockData";
import type { Candle, OpenOrder, OrderBookLevel, OrderType, Side, TimeInForce, TradePrint } from "./types";
import animeTraderVisual from "./assets/anime-trader-keyvisual.png";

type Page = "contracts" | "spot" | "options" | "mechanism" | "academy";
type ContractMarket = "usdt" | "coin";
type MarginMode = "isolated" | "cross";

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
        textColor: "#b9b6dc",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: "rgba(255, 143, 201, 0.10)" },
        horzLines: { color: "rgba(116, 238, 226, 0.10)" }
      },
      rightPriceScale: {
        borderColor: "rgba(255, 196, 226, 0.18)"
      },
      timeScale: {
        borderColor: "rgba(255, 196, 226, 0.18)",
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: {
        mode: 0
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#5df6cf",
      downColor: "#ff6fae",
      borderUpColor: "#5df6cf",
      borderDownColor: "#ff6fae",
      wickUpColor: "#5df6cf",
      wickDownColor: "#ff6fae"
    });
    candleSeries.setData(candles.map(({ time, open, high, low, close }) => ({ time: time as UTCTimestamp, open, high, low, close })));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "rgba(255, 143, 201, 0.36)"
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volumeSeries.setData(
      candles.map((item) => ({
        time: item.time as UTCTimestamp,
        value: item.volume,
        color: item.close >= item.open ? "rgba(93, 246, 207, 0.38)" : "rgba(255, 111, 174, 0.38)"
      }))
    );

    const markSeries = chart.addSeries(LineSeries, {
      color: "#ffe58a",
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
  const [marginMode, setMarginMode] = useState<MarginMode>("isolated");
  const [price, setPrice] = useState(markPrice.toFixed(2));
  const [size, setSize] = useState("0.10");
  const [leverage, setLeverage] = useState(20);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [percent, setPercent] = useState(25);

  useEffect(() => setPrice(markPrice.toFixed(2)), [markPrice]);

  const notional = Number(price || markPrice) * Number(size || 0);
  const margin = marginMode === "cross" ? notional / leverage * 0.92 : notional / leverage;

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
      <div className="mode-switch">
        <button className={marginMode === "isolated" ? "active" : ""} onClick={() => setMarginMode("isolated")}>逐仓</button>
        <button className={marginMode === "cross" ? "active" : ""} onClick={() => setMarginMode("cross")}>全仓</button>
      </div>
      <div className="side-switch">
        <button className={side === "buy" ? "active buy" : ""} onClick={() => setSide("buy")}>买入 / 开多</button>
        <button className={side === "sell" ? "active sell" : ""} onClick={() => setSide("sell")}>卖出 / 开空</button>
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
        <span>保证金模式 <b>{marginMode === "isolated" ? "逐仓，风险限定在单仓" : "全仓，共享账户可用余额"}</b></span>
      </div>
      <button className={`submit ${side}`} onClick={placeOrder}>{side === "buy" ? "确认买入" : "确认卖出"}</button>
    </section>
  );
}

function TopNav({ page, contractMarket, onPageChange, onContractMarketChange }: { page: Page; contractMarket: ContractMarket; onPageChange: (page: Page) => void; onContractMarketChange: (market: ContractMarket) => void }) {
  return (
    <nav className="main-nav">
      <div className="nav-item contract-nav">
        <button className={page === "contracts" ? "active" : ""} onClick={() => onPageChange("contracts")}>
          合约 <ChevronDown size={14} />
        </button>
        <div className="contract-menu">
          <button className={contractMarket === "usdt" ? "active" : ""} onClick={() => { onContractMarketChange("usdt"); onPageChange("contracts"); }}>
            <strong>U本位合约</strong>
            <span>以 USDT 计价和结算，默认交易区</span>
          </button>
          <button className={contractMarket === "coin" ? "active" : ""} onClick={() => { onContractMarketChange("coin"); onPageChange("contracts"); }}>
            <strong>币本位合约</strong>
            <span>以标的币计价，适合币本位持仓</span>
          </button>
        </div>
      </div>
      <button className={page === "spot" ? "active" : ""} onClick={() => onPageChange("spot")}>现货</button>
      <button className={page === "options" ? "active" : ""} onClick={() => onPageChange("options")}>期权</button>
      <button className={page === "mechanism" ? "active" : ""} onClick={() => onPageChange("mechanism")}>合约机制</button>
      <button className={page === "academy" ? "active" : ""} onClick={() => onPageChange("academy")}>小白教程</button>
    </nav>
  );
}

function ContractTradingPage({ contractMarket }: { contractMarket: ContractMarket }) {
  const [marketIndex, setMarketIndex] = useState(0);
  const [orders, setOrders] = useState(seededOpenOrders);
  const activeMarket = markets[marketIndex];
  const candles = useMemo(() => buildCandles(activeMarket.lastPrice), [activeMarket.lastPrice]);
  const book = useMemo(() => buildOrderBook(activeMarket.lastPrice), [activeMarket.lastPrice]);
  const trades = useMemo(() => buildTrades(activeMarket.lastPrice), [activeMarket.lastPrice]);

  return (
    <>
      <section className="kawaii-banner">
        <div className="banner-copy">
          <span className="eyebrow"><WandSparkles size={15} />{contractMarket === "usdt" ? "U本位永续 · 默认交易区" : "币本位永续 · 即将开放更多标的"}</span>
          <h1>Surprising EX 合约交易工作台</h1>
          <p>甜酷二次元风格的专业交易界面，保留盘口、K线、资金费率、持仓风控和模拟委托，让上线后能平滑接入真实后端。</p>
        </div>
        <img src={animeTraderVisual} alt="Surprising EX anime trading visual" />
      </section>

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
    </>
  );
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="content-page placeholder-page">
      <div className="page-hero">
        <span className="eyebrow"><Sparkles size={15} />产品规划</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="empty-state panel">
        <Gem size={34} />
        <strong>当前主推永续合约</strong>
        <span>页面路由和菜单已经预留，后续接入现货或期权后，可以复用当前的行情、账户和风控组件体系。</span>
      </div>
    </section>
  );
}

function MechanismPage() {
  const cards = [
    ["合约配置", "Instrument 服务维护 symbol、合约类型、状态、价格精度、数量精度、风险限额和杠杆规则。前端会从 /api/v1/instruments/list 拉取可交易标的。"],
    ["指数价与标记价", "Index Price 聚合外部现货报价，Mark Price 结合基差窗口计算标记价格，用于未实现盈亏、强平触发和前端风险提示。"],
    ["订单链路", "Order 服务接收下单、撤单、查询开放委托；Matching 服务按 symbol 分区撮合并生成成交、盘口快照和深度事件。"],
    ["K线与实时频道", "Candlestick 服务消费成交事件聚合 K线；WebSocket 支持 candles、trades、depth、mark、funding、orders、positions 等频道。"],
    ["保证金与仓位", "Account 服务维护余额、仓位、手续费、PnL 结算和只减仓订单修剪，前端下单区已预留逐仓/全仓模式。"],
    ["强平、保险基金、ADL", "Risk、Liquidation、Insurance、ADL 模块负责风险检查、强平订单、穿仓覆盖和自动减仓队列，是生产级永续系统的安全网。"]
  ];

  return (
    <section className="content-page">
      <div className="page-hero mechanism-hero">
        <span className="eyebrow"><Network size={15} />平台合约运行机制</span>
        <h1>从下单到风控的永续合约生命线</h1>
        <p>内容按照后端微服务设计整理，方便用户理解 Surprising EX 如何处理合约配置、行情、撮合、账户、强平和实时推送。</p>
      </div>
      <div className="mechanism-grid">
        {cards.map(([title, body]) => (
          <article className="learn-card panel" key={title}>
            <span className="card-icon"><Layers size={18} /></span>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AcademyPage() {
  const lessons = [
    ["1. 永续合约是什么", "它没有到期日，价格围绕指数价运行，通过资金费率让多空双方周期性支付费用，使合约价格贴近现货价格。"],
    ["2. U本位和币本位", "U本位用 USDT 做保证金和结算，更适合新手理解收益；币本位用标的币结算，适合已有币本位资产的人。"],
    ["3. 逐仓和全仓", "逐仓把风险限定在单个仓位，全仓会共享账户可用余额。新手建议先用逐仓和低杠杆练习。"],
    ["4. 标记价格很重要", "强平通常参考标记价格而不是最新成交价，这可以减少盘口短时插针造成的异常强平。"],
    ["5. 只减仓和止损", "只减仓订单只会减少现有仓位，不会反向开仓。新手每次开仓前都应该先想好止损位置。"],
    ["6. 资金费率", "资金费率为正时，多头通常付给空头；为负时，空头通常付给多头。持仓跨资金费率时间点前要看清费率。"]
  ];

  return (
    <section className="content-page">
      <div className="page-hero academy-hero">
        <span className="eyebrow"><GraduationCap size={15} />小白合约教程</span>
        <h1>先学会活下来，再追求收益</h1>
        <p>面向第一次接触永续合约的用户，把高频踩坑点做成可扫读的课程卡片。</p>
      </div>
      <div className="lesson-list">
        {lessons.map(([title, body]) => (
          <article className="lesson panel" key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function App() {
  const [page, setPage] = useState<Page>("contracts");
  const [contractMarket, setContractMarket] = useState<ContractMarket>("usdt");

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("contracts")} aria-label="Surprising EX 首页">
          <span className="brand-mark"><Heart size={13} /><span>SX</span></span>
          <div>
            <strong>Surprising EX</strong>
            <small>Kawaii Futures</small>
          </div>
        </button>
        <TopNav page={page} contractMarket={contractMarket} onPageChange={setPage} onContractMarketChange={setContractMarket} />
        <div className="top-actions">
          <button><Bell size={16} /></button>
          <button><Settings size={16} /></button>
          <button className="wallet"><WalletCards size={16} />连接钱包</button>
          <button className="menu"><Menu size={18} /></button>
        </div>
      </header>

      {page === "contracts" && <ContractTradingPage contractMarket={contractMarket} />}
      {page === "spot" && <PlaceholderPage title="现货交易" description="现货页面已在导航中预留，当前产品阶段主交易入口仍是永续合约。" />}
      {page === "options" && <PlaceholderPage title="期权交易" description="期权页面已在导航中预留，后续可以加入期权链、波动率、希腊值和组合保证金。" />}
      {page === "mechanism" && <MechanismPage />}
      {page === "academy" && <AcademyPage />}
    </main>
  );
}

export default App;
