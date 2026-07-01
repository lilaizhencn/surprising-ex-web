import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  BookOpen,
  CandlestickChart,
  ChevronDown,
  CircleDollarSign,
  Cpu,
  Crosshair,
  Download,
  Gauge,
  Gift,
  GraduationCap,
  Heart,
  HelpCircle,
  Languages,
  LineChart,
  Maximize2,
  MoonStar,
  Network,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Upload,
  UserRound,
  WalletCards,
  Zap
} from "lucide-react";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { balances, buildCandles, buildOrderBook, buildTrades, markets, openOrders as seededOpenOrders, positions as seededPositions } from "./mockData";
import type { Candle, OpenOrder, OrderBookLevel, OrderType, Side, TimeInForce, TradePrint } from "./types";
import assistantVisual from "./assets/ai-assistant-keyvisual.webp";

type Page = "futures" | "spot" | "options" | "mechanism" | "academy";
type MarginMode = "isolated" | "cross";
type AdvancedOrder = "normal" | "plan" | "conditional" | "tpsl" | "trailing";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const precise = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "gold" }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
    </div>
  );
}

function KlineChart({ candles, mode }: { candles: Candle[]; mode: string }) {
  useEffect(() => {
    const container = document.querySelector<HTMLDivElement>("#kline-chart");
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#bfc3ec",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: "rgba(97, 221, 255, 0.10)" },
        horzLines: { color: "rgba(255, 128, 196, 0.09)" }
      },
      rightPriceScale: { borderColor: "rgba(168, 186, 255, 0.18)" },
      timeScale: { borderColor: "rgba(168, 186, 255, 0.18)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#60f6d2",
      downColor: "#ff6fab",
      borderUpColor: "#60f6d2",
      borderDownColor: "#ff6fab",
      wickUpColor: "#60f6d2",
      wickDownColor: "#ff6fab"
    });
    candleSeries.setData(candles.map(({ time, open, high, low, close }) => ({ time: time as UTCTimestamp, open, high, low, close })));

    const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volumeSeries.setData(candles.map((item) => ({
      time: item.time as UTCTimestamp,
      value: item.volume,
      color: item.close >= item.open ? "rgba(96, 246, 210, 0.32)" : "rgba(255, 111, 171, 0.32)"
    })));

    const indicatorSeries = chart.addSeries(LineSeries, {
      color: mode === "OI" ? "#b58cff" : mode === "Funding" ? "#ffd36a" : "#6fd8ff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false
    });
    indicatorSeries.setData(candles.map((item, index) => ({
      time: item.time as UTCTimestamp,
      value: item.close * (0.996 + Math.sin(index / 12) * 0.002)
    })));

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, mode]);

  return <div id="kline-chart" className="chart-canvas" />;
}

function TopNavigation({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => setPage("futures")}>
        <span className="brand-mark"><Sparkles size={15} /><b>SX</b></span>
        <span><strong>Surprising EX</strong><small>Anime Cyber Derivatives</small></span>
      </button>
      <nav className="global-nav">
        <div className="contract-nav">
          <button className={page === "futures" ? "active" : ""} onClick={() => setPage("futures")}>永续合约 <ChevronDown size={14} /></button>
          <div className="contract-menu">
            <button className="active"><strong>U本位永续</strong><span>USDT 保证金，默认交易区</span></button>
            <button><strong>币本位永续</strong><span>币本位保证金，专业用户</span></button>
          </div>
        </div>
        <button className={page === "spot" ? "active" : ""} onClick={() => setPage("spot")}>现货</button>
        <button className={page === "options" ? "active" : ""} onClick={() => setPage("options")}>期权</button>
        <button className={page === "mechanism" ? "active" : ""} onClick={() => setPage("mechanism")}>合约机制</button>
        <button className={page === "academy" ? "active" : ""} onClick={() => setPage("academy")}>小白教程</button>
      </nav>
      <div className="top-actions">
        <button><Upload size={15} />充值</button>
        <button><Download size={15} />提现</button>
        <button><WalletCards size={15} />划转</button>
        <button><Bell size={15} /></button>
        <button><Languages size={15} />ZH</button>
        <button><MoonStar size={15} /></button>
        <button className="vip"><UserRound size={15} />VIP 3</button>
      </div>
    </header>
  );
}

function SideRail() {
  const items = [
    ["收藏", Star], ["行情", TrendingUp], ["现货", CircleDollarSign], ["永续合约", CandlestickChart],
    ["模拟交易", Cpu], ["策略交易", Zap], ["排行榜", Activity], ["公告", Bell],
    ["活动中心", Gift], ["邀请返佣", Heart], ["资产中心", WalletCards], ["API管理", Network], ["帮助中心", HelpCircle]
  ] as const;
  return (
    <aside className="side-rail">
      {items.map(([label, Icon], index) => (
        <button className={index === 3 ? "active" : ""} key={label}><Icon size={17} /><span>{label}</span></button>
      ))}
    </aside>
  );
}

function MarketHeader({ price, change }: { price: number; change: number }) {
  return (
    <section className="market-header">
      <div className="pair-search">
        <CandlestickChart size={18} />
        <strong>BTCUSDT 永续</strong>
        <button><Search size={15} />搜索币种</button>
      </div>
      <Metric label="最新价格" value={precise.format(price)} tone={change >= 0 ? "up" : "down"} />
      <Metric label="24H 涨跌" value={`${change > 0 ? "+" : ""}${change.toFixed(2)}%`} tone={change >= 0 ? "up" : "down"} />
      <Metric label="24H 成交量" value={`${compact(486321000)} USDT`} />
      <Metric label="指数价格" value={precise.format(price * 0.9996)} />
      <Metric label="标记价格" value={precise.format(price * 0.9998)} tone="gold" />
      <Metric label="资金费率" value="0.0108% / 05:42:18" tone="up" />
    </section>
  );
}

function OrderBook({ asks, bids, mid }: { asks: OrderBookLevel[]; bids: OrderBookLevel[]; mid: number }) {
  const maxTotal = Math.max(...asks.map((level) => level.total), ...bids.map((level) => level.total));
  const rows = (levels: OrderBookLevel[], side: "ask" | "bid") => levels.slice(0, 9).map((level) => (
    <div className={`book-row ${side} flash`} key={`${side}-${level.price}-${level.quantity}`}>
      <i style={{ width: `${(level.total / maxTotal) * 100}%` }} />
      <span>{precise.format(level.price)}</span><span>{level.quantity}</span><span>{level.total}</span>
    </div>
  ));

  return (
    <section className="panel orderbook">
      <div className="panel-title"><span><BookOpen size={16} />盘口深度</span><button>0.1 <ChevronDown size={14} /></button></div>
      <div className="book-head"><span>价格</span><span>数量</span><span>累计</span></div>
      <div className="book-side">{rows(asks, "ask")}</div>
      <div className="mid-price"><strong>{precise.format(mid)}</strong><small>价差 0.02%</small></div>
      <div className="book-side">{rows(bids, "bid")}</div>
    </section>
  );
}

function TradesTape({ trades }: { trades: TradePrint[] }) {
  return (
    <section className="panel trades-panel">
      <div className="panel-title"><span><Activity size={16} />最新成交</span><button>实时</button></div>
      <div className="book-head"><span>价格</span><span>数量</span><span>时间</span></div>
      <div className="trades-list">
        {trades.slice(0, 14).map((trade) => (
          <div className={`trade-row ${trade.side} flash`} key={trade.id}>
            <span>{precise.format(trade.price)}</span><span>{trade.quantity}</span><span>{trade.time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrderTicket({ price, onOrder }: { price: number; onOrder: (order: OpenOrder) => void }) {
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("LIMIT");
  const [advanced, setAdvanced] = useState<AdvancedOrder>("normal");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC");
  const [marginMode, setMarginMode] = useState<MarginMode>("isolated");
  const [orderPrice, setOrderPrice] = useState(price.toFixed(2));
  const [size, setSize] = useState("0.12");
  const [leverage, setLeverage] = useState(20);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpsl, setTpsl] = useState(true);
  const [toast, setToast] = useState("AI 风控已根据 20x 杠杆更新预估强平价");

  useEffect(() => setOrderPrice(price.toFixed(2)), [price]);

  const notional = Number(orderPrice || price) * Number(size || 0);
  const margin = notional / leverage * (marginMode === "cross" ? 0.92 : 1);
  const fee = notional * 0.0004;
  const liq = side === "buy" ? Number(orderPrice || price) * (1 - 0.78 / leverage) : Number(orderPrice || price) * (1 + 0.78 / leverage);
  const risk = leverage > 80 ? "high" : leverage > 35 ? "mid" : "low";

  function submitOrder() {
    onOrder({
      id: `SX-${Math.floor(100000 + Math.random() * 899999)}`,
      symbol: "BTC-USDT-PERP",
      side,
      type,
      price: Number(orderPrice || price),
      size: Number(size || 0),
      filled: 0,
      reduceOnly,
      status: "NEW"
    });
    setToast(`${side === "buy" ? "买入" : "卖出"}委托已进入模拟撮合队列`);
  }

  return (
    <section className="panel order-ticket">
      <div className="panel-title"><span><CircleDollarSign size={16} />智能下单</span><button><ShieldCheck size={14} />AI Guard</button></div>
      {toast && <div className="toast"><Sparkles size={14} />{toast}<button onClick={() => setToast("")}>知道了</button></div>}
      <div className="mode-switch"><button className={marginMode === "isolated" ? "active" : ""} onClick={() => setMarginMode("isolated")}>逐仓</button><button className={marginMode === "cross" ? "active" : ""} onClick={() => setMarginMode("cross")}>全仓</button></div>
      <div className="side-switch"><button className={side === "buy" ? "active buy" : ""} onClick={() => setSide("buy")}>买入 / 开多</button><button className={side === "sell" ? "active sell" : ""} onClick={() => setSide("sell")}>卖出 / 开空</button></div>
      <label className="field">
        <span>下单类型</span>
        <select value={type} onChange={(event) => setType(event.target.value as OrderType)}>
          <option value="LIMIT">LIMIT</option>
          <option value="MARKET">MARKET</option>
          <option value="POST_ONLY">POST_ONLY</option>
        </select>
      </label>
      <div className="segmented small">{(["normal", "plan", "conditional", "tpsl", "trailing"] as AdvancedOrder[]).map((item) => <button className={advanced === item ? "active" : ""} key={item} onClick={() => setAdvanced(item)}>{({ normal: "普通", plan: "计划", conditional: "条件", tpsl: "止盈止损", trailing: "追踪" } as Record<AdvancedOrder, string>)[item]}</button>)}</div>
      <label className="field"><span>价格 USDT</span><input disabled={type === "MARKET"} value={orderPrice} onChange={(event) => setOrderPrice(event.target.value)} /></label>
      <label className="field"><span>数量 BTC</span><input value={size} onChange={(event) => setSize(event.target.value)} /></label>
      <label className="field slider-field"><span>杠杆 {leverage}x <b className={`risk-${risk}`}>风险 {risk === "low" ? "低" : risk === "mid" ? "中" : "高"}</b></span><input type="range" min="1" max="125" value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} /></label>
      <div className="percent-row">{[25, 50, 75, 100].map((item) => <button key={item} onClick={() => setSize((0.003 * item).toFixed(3))}>{item}%</button>)}</div>
      <div className="form-grid"><select value={timeInForce} onChange={(event) => setTimeInForce(event.target.value as TimeInForce)}><option>GTC</option><option>IOC</option><option>FOK</option></select><label><input type="checkbox" checked={reduceOnly} onChange={(event) => setReduceOnly(event.target.checked)} />只减仓</label><label><input type="checkbox" checked={tpsl} onChange={(event) => setTpsl(event.target.checked)} />止盈止损</label></div>
      {tpsl && <div className="tpsl-grid"><input placeholder="止盈价" defaultValue={(price * 1.018).toFixed(2)} /><input placeholder="止损价" defaultValue={(price * 0.986).toFixed(2)} /></div>}
      <div className="order-preview">
        <span>委托价值 <b>{compact(notional)} USDT</b></span>
        <span>预估保证金 <b>{nf.format(margin)} USDT</b></span>
        <span>手续费 <b>{nf.format(fee)} USDT</b></span>
        <span>预计强平价 <b>{precise.format(liq)}</b></span>
        <span>保证金率 <b>{(100 / leverage).toFixed(2)}%</b></span>
      </div>
      <div className="ticket-actions"><button>一键反向</button><button className={`submit ${side}`} onClick={submitOrder}>确认下单</button></div>
    </section>
  );
}

function ChartWorkstation({ candles, indicator, setIndicator }: { candles: Candle[]; indicator: string; setIndicator: (value: string) => void }) {
  const [view, setView] = useState("K线");
  const tools = ["MA", "EMA", "BOLL", "MACD", "RSI", "KDJ", "ATR", "VWAP", "斐波那契"];
  return (
    <section className="panel chart-panel">
      <div className="chart-toolbar">
        <div className="tabs">{["K线", "分时", "深度图", "爆仓热力图", "市场情绪"].map((item) => <button className={view === item ? "active" : ""} onClick={() => setView(item)} key={item}>{item}</button>)}</div>
        <div className="intervals">{["1m", "5m", "15m", "1H", "4H", "1D", "1W"].map((item) => <button className={item === "1m" ? "active" : ""} key={item}>{item}</button>)}</div>
        <div className="chart-icons"><button><Crosshair size={15} /></button><button><Maximize2 size={15} /></button><button><MoonStar size={15} /></button></div>
      </div>
      <div className="indicator-strip">{tools.map((item) => <button className={indicator === item ? "active" : ""} key={item} onClick={() => setIndicator(item)}>{item}</button>)}</div>
      <KlineChart candles={candles} mode={indicator} />
    </section>
  );
}

function PositionsDock({ price, orders }: { price: number; orders: OpenOrder[] }) {
  const [tab, setTab] = useState("持仓");
  const pnl = (price - seededPositions[0].entryPrice) * seededPositions[0].size;
  return (
    <section className="panel bottom-dock">
      <div className="dock-tabs">{["持仓", "当前委托", "历史成交", "历史订单", "资金流水", "资金费率历史"].map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}<button>导出 CSV</button></div>
      {tab === "持仓" && (
        <div className="table-wrap"><table><thead><tr><th>合约</th><th>方向</th><th>数量</th><th>开仓价</th><th>标记价</th><th>未实现盈亏</th><th>ROE</th><th>保证金</th><th>杠杆</th><th>爆仓价</th><th>操作</th></tr></thead><tbody>
          {seededPositions.map((pos, index) => <tr key={pos.symbol + pos.side}><td>{pos.symbol}</td><td className={pos.side === "LONG" ? "tone-up" : "tone-down"}>{pos.side}</td><td>{pos.size}</td><td>{precise.format(pos.entryPrice)}</td><td>{precise.format(index === 0 ? price : pos.markPrice)}</td><td className={pnl >= 0 ? "tone-up" : "tone-down"}>{nf.format(index === 0 ? pnl : pos.pnl)} USDT</td><td>{index === 0 ? (pnl / pos.margin * 100).toFixed(2) : pos.roe}%</td><td>{nf.format(pos.margin)}</td><td>20x</td><td>{precise.format(pos.liquidationPrice)}</td><td><button>止盈止损</button><button>一键平仓</button></td></tr>)}
        </tbody></table></div>
      )}
      {tab !== "持仓" && (
        <div className="table-wrap"><table><thead><tr><th>订单号</th><th>合约</th><th>方向</th><th>类型</th><th>委托价</th><th>数量</th><th>成交</th><th>手续费</th><th>状态</th><th>操作</th></tr></thead><tbody>
          {orders.map((order) => <tr key={order.id}><td>{order.id}</td><td>{order.symbol}</td><td className={order.side === "buy" ? "tone-up" : "tone-down"}>{order.side === "buy" ? "买入" : "卖出"}</td><td>{order.type}</td><td>{precise.format(order.price)}</td><td>{order.size}</td><td>{order.filled}</td><td>{nf.format(order.price * order.size * 0.0004)}</td><td>{order.status}</td><td><button>修改</button><button>撤单</button></td></tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}

function AccountSummary() {
  const rows = [
    ["账户总资产", "48,250.42"], ["可用余额", "37,212.66"], ["保证金", "11,037.76"], ["未实现盈亏", "+1,842.28"]
  ];
  return (
    <section className="panel account-summary">
      <div className="panel-title"><span><WalletCards size={16} />账户资产</span><button>划转</button></div>
      <div className="account-summary-grid">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>USDT</small></div>)}</div>
    </section>
  );
}

function Assistant() {
  const [open, setOpen] = useState(false);
  const prompts = ["解释当前资金费率", "帮我计算强平风险", "新手用逐仓还是全仓？", "推荐止盈止损思路"];
  return (
    <aside className={`ai-assistant ${open ? "open" : ""}`}>
      <button className="assistant-avatar" onClick={() => setOpen((value) => !value)}>
        <img src={assistantVisual} alt="Surprising EX AI assistant" />
        <span><Bot size={16} />AI</span>
      </button>
      {open && <div className="assistant-panel"><strong>Seraphina 智能交易助手</strong><p>我可以解释资金费率、逐仓全仓、爆仓原因，并根据你的仓位给出风险提示。</p>{prompts.map((item) => <button key={item}>{item}</button>)}</div>}
    </aside>
  );
}

function FuturesPage() {
  const [price, setPrice] = useState(markets[0].lastPrice);
  const [change, setChange] = useState(markets[0].change24h);
  const [book, setBook] = useState(buildOrderBook(markets[0].lastPrice));
  const [trades, setTrades] = useState(buildTrades(markets[0].lastPrice));
  const [orders, setOrders] = useState(seededOpenOrders);
  const [indicator, setIndicator] = useState("EMA");
  const candles = useMemo(() => buildCandles(price), [Math.round(price / 100)]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPrice((current) => {
        const next = current + (Math.random() - 0.47) * 72;
        setBook(buildOrderBook(next));
        setTrades(buildTrades(next));
        setChange(2.4 + Math.sin(Date.now() / 15000) * 0.8);
        return next;
      });
    }, 2200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <MarketHeader price={price} change={change} />
      <section className="trade-grid">
        <div className="left-trade-stack">
          <div className="center-stack"><ChartWorkstation candles={candles} indicator={indicator} setIndicator={setIndicator} /></div>
          <div className="market-stack"><OrderBook asks={book.asks} bids={book.bids} mid={price} /><TradesTape trades={trades} /></div>
        </div>
        <div className="right-trade-stack"><AccountSummary /><OrderTicket price={price} onOrder={(order) => setOrders((current) => [order, ...current])} /></div>
      </section>
      <PositionsDock price={price} orders={orders} />
    </>
  );
}

function ContentPage({ page }: { page: Page }) {
  const isAcademy = page === "academy";
  const items = isAcademy
    ? [["永续合约是什么", "没有到期日，通过资金费率让合约价格围绕指数价运行。"], ["逐仓与全仓", "逐仓限制单仓风险，全仓共享账户保证金。新手优先逐仓低杠杆。"], ["标记价格", "强平通常看标记价格，避免短时插针导致异常风险。"], ["只减仓", "只会减少现有仓位，不会反向开仓，是风控必备开关。"]]
    : [["合约配置", "Instrument 服务维护 symbol、精度、状态、风险限额和杠杆规则。"], ["价格链路", "Index Price 聚合外部报价，Mark Price 负责风控和 PnL。"], ["撮合链路", "Order 服务接收委托，Matching 服务按 symbol 分区撮合。"], ["风控安全网", "Risk、Liquidation、Insurance、ADL 共同处理强平、穿仓和自动减仓。"]];
  return (
    <section className="content-page">
      <div className="page-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(13,8,24,.95), rgba(13,8,24,.48)), url(${assistantVisual})` }}>
        <span className="eyebrow">{isAcademy ? <GraduationCap size={15} /> : <Network size={15} />}{isAcademy ? "小白合约教程" : "平台合约运行机制"}</span>
        <h1>{isAcademy ? "先学会活下来，再追求收益" : "从下单到风控的永续合约生命线"}</h1>
        <p>{isAcademy ? "把新手最容易踩坑的地方做成可扫读课程。" : "按照后端微服务设计整理，让用户理解真实交易链路。"}</p>
      </div>
      <div className="learn-grid">{items.map(([title, body]) => <article className="panel learn-card" key={title}><h2>{title}</h2><p>{body}</p></article>)}</div>
    </section>
  );
}

function Placeholder({ label }: { label: string }) {
  return <section className="content-page"><div className="page-hero"><span className="eyebrow"><Sparkles size={15} />产品矩阵</span><h1>{label}</h1><p>页面入口已预留，当前主产品为 U 本位永续合约。后续可复用行情、账户、资产和 AI 助手能力。</p></div></section>;
}

function App() {
  const [page, setPage] = useState<Page>("futures");
  return (
    <main className="app-shell">
      <div className="ambient"><i /><i /><i /></div>
      <TopNavigation page={page} setPage={setPage} />
      <div className="layout-shell">
        <SideRail />
        <div className="main-surface">
          {page === "futures" && <FuturesPage />}
          {page === "spot" && <Placeholder label="现货交易" />}
          {page === "options" && <Placeholder label="期权交易" />}
          {(page === "mechanism" || page === "academy") && <ContentPage page={page} />}
        </div>
      </div>
      <Assistant />
    </main>
  );
}

export default App;
