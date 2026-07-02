import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  CandlestickChart,
  CircleDollarSign,
  FileText,
  Flame,
  Info,
  Layers3,
  LogOut,
  MoonStar,
  Radio,
  Search,
  Sparkles,
  Star,
  Sun,
  TableProperties,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type AutoscaleInfo,
  type IChartApi,
  type UTCTimestamp
} from "lightweight-charts";
import { cancelOrder, loadBalances, loadCandles, loadInstrumentConfig, loadMarkets, loadMarkPrice, loadOpenOrders, loadOrderBook, loadPositions, login, placeOrder, register } from "./api/surprising";
import { compact, displayPpm, displayPrice, displayUnits } from "./config";
import { fallbackTrades } from "./mockData";
import { loadSession, saveSession } from "./api/client";
import { useRealtime } from "./hooks/useRealtime";
import type { AuthSession, Balance, CandlePoint, MarginMode, Market, OpenOrder, OrderBookLevel, OrderSide, OrderType, PlaceOrderDraft, Position, ProductAccountType, ProductMode, TimeInForce, TradePrint, TradeRecord, WsEnvelope } from "./types";
import "./styles.css";

type AuthMode = "login" | "register";
type Page = "trade" | "rules";
type ThemeMode = "dark" | "light";
type PickedPrice = { value: number; nonce: number };
const KLINE_PERIODS = ["1m", "5m", "15m", "1h"] as const;
const KLINE_VISIBLE_BARS = 48;
const ORDER_BOOK_SIDE_ROWS = 6;
const ORDER_BOOK_PRECISIONS = [0.1, 1, 10, 50, 100] as const;
const TRADE_TAPE_ROWS = 15;
const PRICE_UNIT_SCALE = 100_000_000;

const PRIVATE_CHANNELS = new Set(["orders", "positions", "positionRisk", "accountRisk", "matches"]);
const THEME_KEY = "surprising-ex.theme";
const PRODUCT_META: Record<ProductMode, { label: string; shortLabel: string; accountType: ProductAccountType }> = {
  linear: { label: "U本位合约", shortLabel: "U本位", accountType: "USDT_PERPETUAL" },
  inverse: { label: "币本位合约", shortLabel: "币本位", accountType: "COIN_PERPETUAL" },
  spot: { label: "现货", shortLabel: "现货", accountType: "SPOT" }
};

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [markets, setMarkets] = useState<Market[]>([]);
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [notice, setNotice] = useState("连接后端中，若服务未启动会进入离线演示数据。");
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [page, setPage] = useState<Page>("trade");
  const [productMode, setProductMode] = useState<ProductMode>("linear");
  const [klinePeriod, setKlinePeriod] = useState<string>("1m");
  const [theme, setTheme] = useState<ThemeMode>(() => localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [instrumentInfoOpen, setInstrumentInfoOpen] = useState(false);
  const [pickedPrice, setPickedPrice] = useState<PickedPrice | null>(null);
  const processedPrivateEventKeysRef = useRef<Set<string>>(new Set());
  const processedPublicEventKeysRef = useRef<Set<string>>(new Set());
  const marketDataRequestRef = useRef(0);

  const visibleMarkets = useMemo(
    () => markets.filter((market) => marketProduct(market) === productMode),
    [markets, productMode]
  );

  const selectedMarket = useMemo(
    () => markets.find((market) => market.symbol === symbol) ?? visibleMarkets[0] ?? markets[0],
    [markets, symbol, visibleMarkets]
  );
  const activeProductMode = selectedMarket ? marketProduct(selectedMarket) : productMode;
  const realtime = useRealtime(session, symbol, activeProductMode, klinePeriod);

  const tradeRecords = useMemo(
    () => buildTradeRecords(realtime.events, session?.user.userId, symbol, selectedMarket?.lastPriceTicks ?? 65000),
    [realtime.events, selectedMarket?.lastPriceTicks, session?.user.userId, symbol]
  );

  useEffect(() => {
    void loadMarkets().then((items) => {
      setMarkets(items);
      if (items[0]) setSymbol((current) => items.some((item) => item.symbol === current) ? current : items[0].symbol);
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!visibleMarkets.length) return;
    if (!visibleMarkets.some((market) => market.symbol === symbol)) {
      setSymbol(visibleMarkets[0].symbol);
    }
  }, [symbol, visibleMarkets]);

  useEffect(() => {
    let alive = true;
    void loadInstrumentConfig(symbol).then((instrument) => {
      if (!alive || !instrument?.symbol) return;
      setMarkets((current) => {
        const exists = current.some((market) => market.symbol === instrument.symbol);
        if (!exists) return [instrument, ...current];
        return current.map((market) => market.symbol === instrument.symbol ? {
          ...market,
          ...instrument,
          nextFundingTime: instrument.nextFundingTime ?? market.nextFundingTime,
          timeUntilFundingSeconds: instrument.timeUntilFundingSeconds ?? market.timeUntilFundingSeconds
        } : market);
      });
    });
    return () => {
      alive = false;
    };
  }, [symbol]);

  useEffect(() => {
    void refreshMarketData();
  }, [klinePeriod, symbol]);

  useEffect(() => {
    if (session) void refreshPrivateData(session);
  }, [markets, productMode, session, symbol]);

  useEffect(() => {
    if (!session) return;
    const privateEvents = nextRealtimeEvents(
      realtime.events,
      processedPrivateEventKeysRef,
      (event) => Boolean(event.channel && PRIVATE_CHANNELS.has(event.channel))
    );
    if (!privateEvents.length) return;
    const timer = window.setTimeout(() => void refreshPrivateData(session), 250);
    return () => window.clearTimeout(timer);
  }, [productMode, realtime.events, session, symbol]);

  useEffect(() => {
    const events = nextRealtimeEvents(
      realtime.events,
      processedPublicEventKeysRef,
      (event) => Boolean(event.channel && event.op === "event" && !PRIVATE_CHANNELS.has(event.channel))
    );
    if (!events.length) return;

    for (const event of events) {
      const data = asRecord(event.data);
      if (!data) continue;
      const eventSymbol = String(data.symbol ?? event.symbol ?? "");
      if (eventSymbol && eventSymbol !== symbol) continue;
      const targetSymbol = eventSymbol || symbol;

      if (event.channel === "depth") {
        const updateType = String(data.updateType ?? "SNAPSHOT").toUpperCase();
        const depth = asNumber(data.depth) || 40;
        setBids((current) => applyDepthUpdate(current, data.bids, "bid", updateType, depth));
        setAsks((current) => applyDepthUpdate(current, data.asks, "ask", updateType, depth));
        continue;
      }

      if (event.channel === "candles" && String(data.period ?? event.period ?? "1m") === klinePeriod) {
        const candle = toCandlePoint(data);
        if (candle) {
          setCandles((current) => upsertCandle(current, candle));
        }
        continue;
      }

      if (event.channel === "trades") {
        const lastPriceTicks = priceTicksFromPayload(data, selectedMarket, "priceTicks", "price");
        if (lastPriceTicks > 0) {
          patchMarket(targetSymbol, { lastPriceTicks });
        }
        continue;
      }

      if (event.channel === "index") {
        const indexPriceTicks = priceTicksFromPayload(data, selectedMarket, "indexPriceTicks", "indexPrice", "indexPriceUnits");
        if (indexPriceTicks > 0) {
          patchMarket(targetSymbol, { indexPriceTicks });
        }
        continue;
      }

      if (event.channel === "mark") {
        const markPriceTicks = priceTicksFromPayload(data, selectedMarket, "markPriceTicks", "markPrice", "markPriceUnits");
        const indexPriceTicks = priceTicksFromPayload(data, selectedMarket, "indexPriceTicks", "indexPrice", "indexPriceUnits");
        const fundingRatePpm = asRatePpm(data.fundingRatePpm ?? data.fundingRate);
        patchMarket(targetSymbol, {
          ...(markPriceTicks > 0 ? { markPriceTicks } : {}),
          ...(indexPriceTicks > 0 ? { indexPriceTicks } : {}),
          ...(fundingRatePpm !== undefined ? { fundingRatePpm } : {}),
          ...fundingTimingPatch(data)
        });
        continue;
      }

      if (event.channel === "funding") {
        const fundingRatePpm = asRatePpm(data.fundingRatePpm ?? data.fundingRate);
        patchMarket(targetSymbol, {
          ...(fundingRatePpm !== undefined ? { fundingRatePpm } : {}),
          ...fundingTimingPatch(data)
        });
      }
    }
  }, [klinePeriod, realtime.events, selectedMarket, symbol]);

  function patchMarket(targetSymbol: string, patch: Partial<Market>) {
    if (!targetSymbol) return;
    setMarkets((current) => current.map((market) => market.symbol === targetSymbol ? { ...market, ...patch } : market));
  }

  function persistSession(next: AuthSession | null) {
    setSession(next);
    saveSession(next);
    if (next) {
      setAuthMode(null);
      setPage("trade");
      return;
    }
    setBalances([]);
    setPositions([]);
    setOrders([]);
  }

  function pickOrderPrice(priceTicks: number) {
    if (!Number.isFinite(priceTicks) || priceTicks <= 0) return;
    setPickedPrice({ value: priceTicks, nonce: Date.now() });
  }

  async function refreshMarketData(targetSymbol = symbol, targetPeriod = klinePeriod) {
    const requestId = marketDataRequestRef.current + 1;
    marketDataRequestRef.current = requestId;
    const targetMarket = markets.find((market) => market.symbol === targetSymbol);
    const shouldLoadMarkPrice = targetMarket ? marketProduct(targetMarket) !== "spot" : productMode !== "spot";
    setLoading(true);
    try {
      const [nextCandles, book, markPrice] = await Promise.all([
        loadCandles(targetSymbol, targetPeriod),
        loadOrderBook(targetSymbol),
        shouldLoadMarkPrice ? loadMarkPrice(targetSymbol, targetMarket) : Promise.resolve(null)
      ]);
      if (requestId !== marketDataRequestRef.current) return;
      setCandles(nextCandles);
      setBids(book.bids);
      setAsks(book.asks);
      if (markPrice) patchMarket(targetSymbol, markPrice);
    } catch (error) {
      if (requestId !== marketDataRequestRef.current) return;
      setNotice(error instanceof Error ? error.message : "行情同步失败");
    } finally {
      if (requestId === marketDataRequestRef.current) {
        setLoading(false);
      }
    }
  }

  async function refreshPrivateData(active = session) {
    if (!active) return;
    try {
      const accountType = PRODUCT_META[productMode].accountType;
      const [nextBalances, nextPositions, nextOrders] = await Promise.all([
        loadBalances(active, accountType),
        productMode === "spot" ? Promise.resolve([]) : loadPositions(active),
        loadOpenOrders(active, symbol)
      ]);
      setBalances(nextBalances);
      setPositions(filterPositionsByProduct(nextPositions, markets, productMode));
      setOrders(nextOrders);
      setNotice(`${PRODUCT_META[productMode].label}资产、${productMode === "spot" ? "委托" : "持仓和委托"}已从 gateway 同步。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "私有数据同步失败");
    }
  }

  async function submitOrder(draft: PlaceOrderDraft) {
    if (!session) {
      setNotice("请先登录后再下单。");
      setAuthMode("login");
      return;
    }
    try {
      const order = await placeOrder(session, draft);
      setOrders((current) => [order, ...current.filter((item) => item.orderId !== order.orderId)]);
      setNotice(`订单已提交：${order.orderId}`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error ? `下单失败：${error.message}` : "下单失败");
    }
  }

  async function submitCancel(order: OpenOrder) {
    if (!session) return;
    try {
      const canceled = await cancelOrder(session, order);
      setOrders((current) => current.map((item) => item.orderId === canceled.orderId ? canceled : item));
      setNotice(`撤单请求已提交：${order.orderId}`);
    } catch (error) {
      setNotice(error instanceof Error ? `撤单失败：${error.message}` : "撤单失败");
    }
  }

  if (authMode) {
    return (
      <AuthScreen
        key={authMode}
        initialMode={authMode}
        onAuthenticated={persistSession}
        onBack={() => setAuthMode(null)}
      />
    );
  }

  return (
    <main className="app-shell">
      <Topbar
        session={session}
        page={page}
        productMode={productMode}
        theme={theme}
        onPageChange={setPage}
        onProductModeChange={setProductMode}
        onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        onLogin={() => setAuthMode("login")}
        onRegister={() => setAuthMode("register")}
        onLogout={() => persistSession(null)}
      />

      {page === "rules" ? (
        <TradingRulesPage
          markets={markets}
          selectedMarket={selectedMarket}
          onOpenMarket={(market) => {
            setProductMode(marketProduct(market));
            setSymbol(market.symbol);
            setPage("trade");
          }}
        />
      ) : (
        <div className="terminal-grid">
          <MarketRail productMode={productMode} markets={visibleMarkets} symbol={symbol} onSelect={setSymbol} />
          <section className="workspace">
            <MarketHeader market={selectedMarket} loading={loading} nowMs={nowMs} onInfo={() => setInstrumentInfoOpen(true)} />
            <div className="main-grid">
              <section className="chart-panel panel">
                <div className="panel-title">
                  <span><CandlestickChart size={16} />K线</span>
                  <div className="segmented">
                    {KLINE_PERIODS.map((period) => (
                      <button
                        className={period === klinePeriod ? "active" : ""}
                        key={period}
                        type="button"
                        onClick={() => setKlinePeriod(period)}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>
                <KlineChart candles={candles} />
              </section>
              <OrderBook asks={asks} bids={bids} market={selectedMarket} mid={selectedMarket?.lastPriceTicks ?? 0} onPickPrice={pickOrderPrice} />
            </div>
            <BottomDeck
              productMode={productMode}
              balances={balances}
              positions={positions}
              orders={orders}
              trades={tradeRecords}
              market={selectedMarket}
              markets={markets}
              onCancel={submitCancel}
            />
          </section>
          <aside className="right-stack">
            <TradesTape events={realtime.events} symbol={symbol} market={selectedMarket} mid={selectedMarket?.lastPriceTicks ?? 65000} onPickPrice={pickOrderPrice} />
            <OrderTicket productMode={productMode} symbol={symbol} market={selectedMarket} pricePreset={pickedPrice} onSubmit={submitOrder} />
          </aside>
        </div>
      )}

      {instrumentInfoOpen && selectedMarket && (
        <ContractInfoDialog market={selectedMarket} onClose={() => setInstrumentInfoOpen(false)} />
      )}
      {notice && <div className="toast"><Radio size={15} />{notice}</div>}
    </main>
  );
}

function AuthScreen({
  initialMode,
  onAuthenticated,
  onBack
}: {
  initialMode: AuthMode;
  onAuthenticated: (session: AuthSession) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const session = mode === "login" ? await login(username, password) : await register(username, password);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "认证失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <button className="auth-logo" onClick={onBack}>
          <span><Sparkles size={25} /></span>
          <strong>Surprising EX</strong>
        </button>
        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>登录</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>注册</button>
        </div>
        <label>
          用户名
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3-32位字母数字下划线" />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="至少8位" />
        </label>
        <p className="hint">当前注册只需要用户名和密码；邮箱字段已在后端保留，后期可开启邮箱验证。</p>
        {error && <p className="error">{error}</p>}
        <button className="primary-button" disabled={busy} onClick={submit}>
          {busy ? "处理中..." : mode === "login" ? "进入交易舱" : "创建账户"}
        </button>
        <button className="ghost-button" onClick={onBack}>返回行情</button>
      </section>
    </main>
  );
}

function Topbar({
  session,
  page,
  productMode,
  theme,
  onPageChange,
  onProductModeChange,
  onThemeToggle,
  onLogin,
  onRegister,
  onLogout
}: {
  session: AuthSession | null;
  page: Page;
  productMode: ProductMode;
  theme: ThemeMode;
  onPageChange: (page: Page) => void;
  onProductModeChange: (mode: ProductMode) => void;
  onThemeToggle: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onPageChange("trade")}><Sparkles size={18} /><strong>Surprising EX</strong></button>
      <nav>
        <button className={page === "trade" && productMode === "linear" ? "active" : ""} onClick={() => { onProductModeChange("linear"); onPageChange("trade"); }}><CircleDollarSign size={15} />U本位</button>
        <button className={page === "trade" && productMode === "inverse" ? "active" : ""} onClick={() => { onProductModeChange("inverse"); onPageChange("trade"); }}><Layers3 size={15} />币本位</button>
        <button className={page === "trade" && productMode === "spot" ? "active" : ""} onClick={() => { onProductModeChange("spot"); onPageChange("trade"); }}><WalletCards size={15} />现货</button>
        <button className={page === "rules" ? "active" : ""} onClick={() => onPageChange("rules")}><FileText size={15} />交易规则</button>
      </nav>
      <div className="top-actions">
        <button><Bell size={16} /></button>
        <button onClick={onThemeToggle} aria-label="切换明暗主题">{theme === "dark" ? <Sun size={16} /> : <MoonStar size={16} />}</button>
        {session ? (
          <>
            <button className="user-pill">{session.user.username}</button>
            <button className="logout-button" onClick={onLogout}><LogOut size={16} />退出</button>
          </>
        ) : (
          <>
            <button className="auth-entry" onClick={onLogin}>登录</button>
            <button className="auth-entry primary" onClick={onRegister}>注册</button>
          </>
        )}
      </div>
    </header>
  );
}

function MarketRail({ productMode, markets, symbol, onSelect }: { productMode: ProductMode; markets: Market[]; symbol: string; onSelect: (symbol: string) => void }) {
  return (
    <aside className="market-rail">
      <div className="rail-search"><Search size={14} /><span>搜索{PRODUCT_META[productMode].shortLabel}</span></div>
      {markets.length === 0 && <p className="empty rail-empty">暂无{PRODUCT_META[productMode].label}市场</p>}
      {markets.map((market) => (
        <button className={market.symbol === symbol ? "active" : ""} key={market.symbol} title={`${market.symbol} ${market.displayName}`} onClick={() => onSelect(market.symbol)}>
          <span><Star size={13} />{market.symbol}</span>
          <strong>{displayMarketPrice(market, market.lastPriceTicks)}</strong>
          <small className={market.change24hPpm >= 0 ? "up" : "down"}>{displayPpm(market.change24hPpm)}</small>
          <em>{PRODUCT_META[marketProduct(market)].shortLabel} · {marketProduct(market) === "spot" ? market.quoteAsset : `${market.settleAsset ?? market.quoteAsset} · ${market.maxLeverage}x`}</em>
        </button>
      ))}
    </aside>
  );
}

function MarketHeader({ market, loading, nowMs, onInfo }: { market?: Market; loading: boolean; nowMs: number; onInfo: () => void }) {
  if (!market) return null;
  const product = marketProduct(market);
  const isSpot = product === "spot";
  const fundingTone = market.fundingRatePpm >= 0 ? "up" : "down";
  return (
    <section className={loading ? "market-header syncing" : "market-header"}>
      <div className="pair-title" title={`${market.symbol} ${market.displayName}`}>
        <Flame size={16} />
        <strong>{market.displayName}</strong>
        <span>{isSpot ? PRODUCT_META[product].shortLabel : `${market.maxLeverage}x`}</span>
        <button className="mini-icon-button" onClick={onInfo} aria-label="产品配置"><Info size={14} /></button>
      </div>
      <Metric label="最新" value={priceWithQuote(market, market.lastPriceTicks, market.quoteAsset)} tone={market.change24hPpm >= 0 ? "up" : "down"} />
      <Metric label="24H" value={displayPpm(market.change24hPpm)} tone={market.change24hPpm >= 0 ? "up" : "down"} />
      {isSpot ? (
        <>
          <Metric label="基础资产" value={market.baseAsset} tone="gold" />
          <Metric label="计价资产" value={market.quoteAsset} />
          <Metric label="数量step" value={String(market.quantityStepUnits ?? "-")} />
        </>
      ) : (
        <>
          <Metric label="标记" value={priceWithQuote(market, market.markPriceTicks, market.quoteAsset)} tone="gold" />
          <Metric label="指数" value={priceWithQuote(market, market.indexPriceTicks, market.quoteAsset)} />
          <Metric label="资金费率" value={displayPpm(market.fundingRatePpm, 4)} tone={fundingTone} />
          <Metric label="结算倒计时" value={formatFundingCountdown(market, nowMs)} tone="gold" />
        </>
      )}
      <Metric label="24H量" value={compact(market.volume24hUnits)} />
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "gold" }) {
  return <div className="metric"><span>{label}</span><strong className={tone ? `tone-${tone}` : ""}>{value}</strong></div>;
}

function priceWithQuote(market: Market | undefined, priceTicks: number, quoteAsset?: string): string {
  return `${displayMarketPrice(market, priceTicks)} ${quoteAsset ?? ""}`.trim();
}

function displayMarketPrice(market: Market | undefined, priceTicks: number): string {
  return displayPrice(priceFromTicks(market, priceTicks));
}

function priceFromTicks(market: Market | undefined, priceTicks: number): number {
  if (!Number.isFinite(priceTicks)) return 0;
  const tickUnits = market?.priceTickUnits;
  if (!tickUnits || tickUnits === 1) return priceTicks;
  return priceTicks * tickUnits / PRICE_UNIT_SCALE;
}

function priceToTicks(market: Market | undefined, price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const tickUnits = market?.priceTickUnits;
  if (!tickUnits || tickUnits === 1) return price;
  return Math.round(price * PRICE_UNIT_SCALE / tickUnits);
}

function priceUnitsToTicks(market: Market | undefined, priceUnits: number): number {
  if (!Number.isFinite(priceUnits) || priceUnits <= 0) return 0;
  const tickUnits = market?.priceTickUnits;
  if (!tickUnits || tickUnits <= 0 || tickUnits === 1) return priceUnits / PRICE_UNIT_SCALE;
  return Math.round(priceUnits / tickUnits);
}

function priceTicksFromPayload(
  data: Record<string, unknown>,
  market: Market | undefined,
  tickField: string,
  priceField: string,
  unitsField?: string
): number {
  const ticks = asOptionalNumber(data[tickField]);
  if (ticks !== undefined && ticks > 0) return ticks;
  const units = unitsField ? asOptionalNumber(data[unitsField]) : undefined;
  if (units !== undefined && units > 0) return priceUnitsToTicks(market, units);
  const price = asOptionalNumber(data[priceField]);
  return price === undefined ? 0 : priceToTicks(market, price);
}

function marketForSymbol(markets: Market[], symbol: string, fallback?: Market): Market | undefined {
  return markets.find((market) => market.symbol === symbol) ?? (fallback?.symbol === symbol ? fallback : undefined);
}

function nextRealtimeEvents(
  events: WsEnvelope[],
  processedRef: { current: Set<string> },
  predicate: (event: WsEnvelope) => boolean
): WsEnvelope[] {
  const next: WsEnvelope[] = [];
  for (const event of [...events].reverse()) {
    if (!predicate(event)) continue;
    const key = realtimeEventKey(event);
    if (processedRef.current.has(key)) continue;
    processedRef.current.add(key);
    next.push(event);
  }
  if (processedRef.current.size > 400) {
    processedRef.current = new Set([...processedRef.current].slice(-240));
  }
  return next;
}

function realtimeEventKey(event: WsEnvelope): string {
  const data = asRecord(event.data);
  const symbol = String(data?.symbol ?? event.symbol ?? "");
  const period = String(data?.period ?? event.period ?? "");
  const dataKey = String(
    data?.tradeId ??
    data?.eventId ??
    data?.sequence ??
    data?.lastSequence ??
    data?.openTime ??
    data?.orderId ??
    data?.positionId ??
    ""
  );
  return [
    event.op ?? "",
    event.channel ?? "",
    symbol,
    period,
    event.eventTime ?? "",
    event.id ?? "",
    dataKey
  ].join(":");
}

function KlineChart({ candles }: { candles: CandlePoint[] }) {
  useEffect(() => {
    const element = document.getElementById("kline-chart");
    if (!element || !candles.length) return;
    const visiblePriceRange = candlePriceRange(candles.slice(-KLINE_VISIBLE_BARS));
    const chart: IChartApi = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#d7ddff",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: "rgba(127, 246, 255, 0.08)" },
        horzLines: { color: "rgba(255, 122, 210, 0.08)" }
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,.12)",
        scaleMargins: { top: 0.04, bottom: 0.18 }
      }
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#45f5c8",
      downColor: "#ff5f9e",
      borderUpColor: "#45f5c8",
      borderDownColor: "#ff5f9e",
      wickUpColor: "#45f5c8",
      wickDownColor: "#ff5f9e",
      autoscaleInfoProvider: (baseImplementation: () => AutoscaleInfo | null) => {
        const base = baseImplementation();
        if (!visiblePriceRange) return base;
        const rawRange = visiblePriceRange.max - visiblePriceRange.min;
        const targetRange = Math.max(rawRange, visiblePriceRange.center * 0.00003, 1);
        const padding = Math.max(targetRange * 0.12, 0.1);
        return {
          priceRange: {
            minValue: visiblePriceRange.center - targetRange / 2 - padding,
            maxValue: visiblePriceRange.center + targetRange / 2 + padding
          },
          margins: { above: 8, below: 8 }
        };
      }
    });
    candleSeries.setData(candles.map((item) => ({
      time: item.time as UTCTimestamp,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close
    })));
    const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeries.setData(candles.map((item) => ({
      time: item.time as UTCTimestamp,
      value: item.volume,
      color: item.close >= item.open ? "rgba(69,245,200,.28)" : "rgba(255,95,158,.28)"
    })));
    if (candles.length > KLINE_VISIBLE_BARS) {
      chart.timeScale().setVisibleLogicalRange({ from: candles.length - KLINE_VISIBLE_BARS, to: candles.length + 3 });
    } else {
      chart.timeScale().fitContent();
    }
    return () => chart.remove();
  }, [candles]);
  return <div id="kline-chart" className="chart-canvas" />;
}

function candlePriceRange(candles: CandlePoint[]): { min: number; max: number; center: number } | null {
  const values = candles.flatMap((item) => [item.open, item.high, item.low, item.close])
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, center: (min + max) / 2 };
}

function OrderBook({ asks, bids, market, mid, onPickPrice }: { asks: OrderBookLevel[]; bids: OrderBookLevel[]; market?: Market; mid: number; onPickPrice: (priceTicks: number) => void }) {
  const [precision, setPrecision] = useState<number>(ORDER_BOOK_PRECISIONS[0]);
  const groupedAsks = useMemo(() => groupOrderBookLevels(asks, "ask", precision, ORDER_BOOK_SIDE_ROWS), [asks, precision]);
  const groupedBids = useMemo(() => groupOrderBookLevels(bids, "bid", precision, ORDER_BOOK_SIDE_ROWS), [bids, precision]);
  const max = Math.max(1, ...groupedAsks.map((item) => item.totalSteps), ...groupedBids.map((item) => item.totalSteps));
  const nextPrecision = () => {
    setPrecision((current) => {
      const index = ORDER_BOOK_PRECISIONS.findIndex((item) => item === current);
      return ORDER_BOOK_PRECISIONS[(index + 1) % ORDER_BOOK_PRECISIONS.length];
    });
  };
  return (
    <section className="panel orderbook">
      <div className="panel-title">
        <span><BookOpen size={16} />盘口</span>
        <button type="button" onClick={nextPrecision} title="切换盘口精度">{formatPrecision(market, precision)}</button>
      </div>
      <div className="book-head"><span>价格</span><span>数量</span><span>累计</span></div>
      {[...groupedAsks].reverse().map((level) => <BookRow key={`a-${level.priceTicks}`} level={level} market={market} max={max} side="ask" onPickPrice={onPickPrice} />)}
      <button className="mid-price" onClick={() => onPickPrice(mid)}><strong>{displayMarketPrice(market, mid)}</strong></button>
      {groupedBids.map((level) => <BookRow key={`b-${level.priceTicks}`} level={level} market={market} max={max} side="bid" onPickPrice={onPickPrice} />)}
    </section>
  );
}

function BookRow({ level, market, max, side, onPickPrice }: { level: OrderBookLevel; market?: Market; max: number; side: "bid" | "ask"; onPickPrice: (priceTicks: number) => void }) {
  return (
    <button className={`book-row ${side}`} onClick={() => onPickPrice(level.priceTicks)}>
      <i style={{ width: `${(level.totalSteps / max) * 100}%` }} />
      <span>{displayMarketPrice(market, level.priceTicks)}</span>
      <span>{level.quantitySteps}</span>
      <span>{level.totalSteps}</span>
    </button>
  );
}

function OrderTicket({ productMode, symbol, market, pricePreset, onSubmit }: { productMode: ProductMode; symbol: string; market?: Market; pricePreset: PickedPrice | null; onSubmit: (draft: PlaceOrderDraft) => void }) {
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC");
  const [marginMode, setMarginMode] = useState<MarginMode>("CROSS");
  const [priceTicks, setPriceTicks] = useState("65000");
  const [quantitySteps, setQuantitySteps] = useState("1");
  const [leverage, setLeverage] = useState(10);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);

  useEffect(() => {
    if (market?.lastPriceTicks) setPriceTicks(String(market.lastPriceTicks));
    setLeverage((current) => Math.min(current, market?.maxLeverage ?? current));
  }, [market?.lastPriceTicks, market?.maxLeverage]);

  useEffect(() => {
    if (pricePreset) setPriceTicks(String(pricePreset.value));
  }, [pricePreset]);

  const isSpot = productMode === "spot";
  const priceNumber = Number(priceTicks || 0);
  const quantityNumber = Number(quantitySteps || 0);
  const notional = estimateNotional(market, priceNumber, quantityNumber);
  const margin = isSpot ? 0 : notional / leverage;
  const orderTypes = useMemo<OrderType[]>(
    () => market?.supportedOrderTypes?.filter((item): item is OrderType => item === "LIMIT" || item === "MARKET") ?? ["LIMIT", "MARKET"],
    [market?.supportedOrderTypes]
  );
  const tifOptions = useMemo<TimeInForce[]>(
    () => market?.supportedTimeInForce?.filter((item): item is TimeInForce => item === "GTC" || item === "IOC" || item === "FOK" || item === "GTX") ?? ["GTC", "IOC", "FOK", "GTX"],
    [market?.supportedTimeInForce]
  );

  useEffect(() => {
    if (!orderTypes.includes(orderType)) setOrderType(orderTypes[0] ?? "LIMIT");
  }, [orderType, orderTypes]);

  useEffect(() => {
    if (!tifOptions.includes(timeInForce)) setTimeInForce(tifOptions[0] ?? "GTC");
  }, [tifOptions, timeInForce]);

  return (
    <section className="panel ticket">
      <div className="panel-title"><span><CircleDollarSign size={16} />{PRODUCT_META[productMode].shortLabel}下单</span><button>{isSpot ? market?.quoteAsset ?? "SPOT" : `${leverage}x`}</button></div>
      <div className="side-switch">
        <button className={side === "BUY" ? "buy active" : "buy"} onClick={() => setSide("BUY")}>{isSpot ? "买入" : "开多 / 买入"}</button>
        <button className={side === "SELL" ? "sell active" : "sell"} onClick={() => setSide("SELL")}>{isSpot ? "卖出" : "开空 / 卖出"}</button>
      </div>
      <div className={isSpot ? "order-select-row two" : "order-select-row"}>
        <label className="compact-select">类型
          <select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)}>
            {orderTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {!isSpot && (
          <label className="compact-select">模式
            <select value={marginMode} onChange={(event) => setMarginMode(event.target.value as MarginMode)}>
              {(["CROSS", "ISOLATED"] as MarginMode[]).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        )}
        <label className="compact-select">时效
          <select value={timeInForce} onChange={(event) => setTimeInForce(event.target.value as TimeInForce)}>
            {tifOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <label>价格 ticks<input disabled={orderType === "MARKET"} value={priceTicks} onChange={(event) => setPriceTicks(event.target.value)} /></label>
      <label>数量 steps<input value={quantitySteps} onChange={(event) => setQuantitySteps(event.target.value)} /></label>
      {!isSpot && <label>杠杆 <span>{leverage}x</span><input type="range" min="1" max={market?.maxLeverage ?? 100} value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} /></label>}
      {!isSpot && <label className="check"><input disabled={market?.reduceOnlyEnabled === false} type="checkbox" checked={reduceOnly} onChange={(event) => setReduceOnly(event.target.checked)} />Reduce-only</label>}
      <label className="check"><input disabled={market?.postOnlyEnabled === false || orderType === "MARKET"} type="checkbox" checked={postOnly && orderType !== "MARKET"} onChange={(event) => setPostOnly(event.target.checked)} />Post-only</label>
      <div className="order-preview">
        <span>{marketProduct(market) === "inverse" ? "合约面值" : "预估成交额"} {displayPrice(notional)} {marketProduct(market) === "inverse" ? market?.quoteAsset : market?.quoteAsset}</span>
        <span>{isSpot ? `扣减资产 ${side === "BUY" ? market?.quoteAsset ?? "-" : market?.baseAsset ?? "-"}` : `预估保证金 ${displayPrice(margin)} ${market?.settleAsset ?? ""}`}</span>
        <span>单笔限制 {market?.minQuantitySteps ?? "-"} - {market?.maxQuantitySteps ?? "-"} steps</span>
      </div>
      <button className={`submit-order ${side === "BUY" ? "buy" : "sell"}`} onClick={() => onSubmit({
        symbol,
        side,
        orderType,
        timeInForce,
        priceTicks: priceNumber,
        quantitySteps: quantityNumber,
        marginMode: isSpot ? "CROSS" : marginMode,
        reduceOnly: isSpot ? false : reduceOnly,
        postOnly: orderType === "MARKET" ? false : postOnly
      })}>{side === "BUY" ? "确认买入" : "确认卖出"}</button>
    </section>
  );
}

function BottomDeck({ productMode, balances, positions, orders, trades, market, markets, onCancel }: {
  productMode: ProductMode;
  balances: Balance[];
  positions: Position[];
  orders: OpenOrder[];
  trades: TradeRecord[];
  market?: Market;
  markets: Market[];
  onCancel: (order: OpenOrder) => void;
}) {
  const equity = balances.reduce((sum, item) => sum + item.equityUnits, 0);
  const available = balances.reduce((sum, item) => sum + item.availableUnits, 0);
  const locked = balances.reduce((sum, item) => sum + item.lockedUnits, 0);
  const pnl = positions.reduce((sum, item) => sum + item.unrealizedPnlUnits, 0);
  const marginRatio = Math.max(0, ...positions.map((item) => item.marginRatioPpm));
  const isSpot = productMode === "spot";

  return (
    <section className="bottom-deck panel">
      <div className="panel-title"><span><WalletCards size={16} />{PRODUCT_META[productMode].label}账户</span></div>
      <div className="account-summary">
        <Metric label="总权益" value={displayUnits(equity)} />
        <Metric label="可用" value={displayUnits(available)} />
        <Metric label="冻结" value={displayUnits(locked)} />
        {isSpot ? (
          <>
            <Metric label="资产数" value={String(balances.length)} />
            <Metric label="账户类型" value={PRODUCT_META[productMode].accountType} tone="gold" />
          </>
        ) : (
          <>
            <Metric label="未实现盈亏" value={displayUnits(pnl)} tone={pnl >= 0 ? "up" : "down"} />
            <Metric label="最高保证金率" value={displayPpm(marginRatio)} tone={marginRatio > 800000 ? "down" : "up"} />
          </>
        )}
      </div>
      <div className="deck-grid">
        <AccountTable title="产品资产" icon={<WalletCards size={15} />}>
          <div className="asset-row table-head">
            <span>资产</span><span>可用</span><span>冻结</span><span>权益</span>
          </div>
          {balances.length === 0 ? <p className="empty">暂无资产</p> : balances.map((item) => (
            <div className="asset-row" key={`${item.accountType ?? PRODUCT_META[productMode].accountType}-${item.asset}`}>
              <strong>{item.asset}</strong>
              <span>{displayUnits(item.availableUnits)}</span>
              <span>{displayUnits(item.lockedUnits)}</span>
              <span>{displayUnits(item.equityUnits)}</span>
            </div>
          ))}
        </AccountTable>
        {!isSpot && (
          <AccountTable title="持仓 / 风险" icon={<TrendingUp size={15} />}>
            <div className="position-row table-head">
              <span>市场</span><span>方向数量</span><span>入场/标记</span><span>浮盈亏</span><span>维持保证金</span><span>保证金率</span><span>状态</span>
            </div>
            {positions.length === 0 ? <p className="empty">暂无持仓</p> : positions.map((item) => (
              <div className="position-row" key={`${item.symbol}-${item.marginMode}`}>
                <strong>{item.symbol}</strong>
                <span className={item.signedQuantitySteps >= 0 ? "up" : "down"}>{item.signedQuantitySteps >= 0 ? "LONG" : "SHORT"} {Math.abs(item.signedQuantitySteps)}</span>
                <span>{displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.entryPriceTicks)} / {displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.markPriceTicks || market?.markPriceTicks || 0)}</span>
                <span className={item.unrealizedPnlUnits >= 0 ? "up" : "down"}>{displayUnits(item.unrealizedPnlUnits)}</span>
                <span>{displayUnits(item.maintenanceMarginUnits)}</span>
                <span>{displayPpm(item.marginRatioPpm)}</span>
                <span>{item.status}</span>
              </div>
            ))}
          </AccountTable>
        )}
        <AccountTable title="当前委托" icon={<TableProperties size={15} />}>
          <div className="order-row table-head">
            <span>市场</span><span>方向</span><span>类型</span><span>价格</span><span>成交/剩余</span><span>模式</span><span>状态</span><span></span>
          </div>
          {orders.length === 0 ? <p className="empty">暂无委托</p> : orders.map((item) => (
            <div className="order-row" key={item.orderId}>
              <strong>{item.symbol}</strong>
              <span className={item.side === "BUY" ? "up" : "down"}>{item.side}</span>
              <span>{item.orderType}</span>
              <span>{displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.priceTicks)}</span>
              <span>{item.executedQuantitySteps}/{item.remainingQuantitySteps}</span>
              <span>{item.marginMode}</span>
              <span>{item.status}</span>
              <button onClick={() => onCancel(item)}>撤单</button>
            </div>
          ))}
        </AccountTable>
        <AccountTable title="成交记录" icon={<Activity size={15} />}>
          <div className="trade-history-row table-head">
            <span>市场</span><span>角色</span><span>方向</span><span>价格</span><span>数量</span><span>时间</span><span>Trace</span>
          </div>
          {trades.slice(0, 14).map((item) => (
            <div className="trade-history-row" key={item.id}>
              <strong>{item.symbol}</strong>
              <span>{item.role}</span>
              <span className={item.side === "BUY" ? "up" : "down"}>{item.side}</span>
              <span>{displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.priceTicks)}</span>
              <span>{item.quantitySteps}</span>
              <span>{item.time}</span>
              <span>{item.traceId ? item.traceId.slice(0, 8) : "-"}</span>
            </div>
          ))}
        </AccountTable>
      </div>
    </section>
  );
}

function AccountTable({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="account-table">
      <h3>{icon}{title}</h3>
      {children}
    </div>
  );
}

function TradesTape({ events, symbol, market, mid, onPickPrice }: { events: WsEnvelope[]; symbol: string; market?: Market; mid: number; onPickPrice: (priceTicks: number) => void }) {
  const [trades, setTrades] = useState<TradePrint[]>(() => fallbackTrades(symbol, mid).slice(0, TRADE_TAPE_ROWS));

  useEffect(() => {
    setTrades(fallbackTrades(symbol, mid).slice(0, TRADE_TAPE_ROWS));
  }, [symbol]);

  useEffect(() => {
    const liveTrades = buildPublicTrades(events, symbol, mid, false);
    if (!liveTrades.length) return;
    setTrades((current) => mergeTradeTape(liveTrades, current));
  }, [events, mid, symbol]);

  return (
    <section className="panel trades">
      <div className="panel-title"><span><Activity size={16} />最新成交</span><button>WS</button></div>
      <div className="trades-list">
        {trades.map((item) => (
          <button className={`trade-row ${item.side === "BUY" ? "bid" : "ask"}`} key={item.id} onClick={() => onPickPrice(item.priceTicks)}>
            <span>{displayMarketPrice(market, item.priceTicks)}</span>
            <span>{item.quantitySteps}</span>
            <span>{item.time}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ContractInfoDialog({ market, onClose }: { market: Market; onClose: () => void }) {
  const product = marketProduct(market);
  const isSpot = product === "spot";
  const items: Array<[string, ReactNode]> = [
    ["产品类型", PRODUCT_META[product].label],
    ["后端类型", `${market.instrumentType ?? "PERPETUAL"} / ${market.contractType ?? "LINEAR_PERPETUAL"}`],
    ["基础/计价", `${market.baseAsset} / ${market.quoteAsset}`],
    [isSpot ? "现货账户" : "结算资产", isSpot ? PRODUCT_META.spot.accountType : market.settleAsset ?? market.quoteAsset],
    ["价格 tick", market.priceTickUnits ?? "-"],
    ["数量 step", market.quantityStepUnits ?? "-"],
    ["最小/最大数量", `${market.minQuantitySteps ?? "-"} / ${market.maxQuantitySteps ?? "-"}`],
    ["最小/最大名义价值", `${formatUnitsOrDash(market.minNotionalUnits)} / ${formatUnitsOrDash(market.maxNotionalUnits)}`],
    ["Maker/Taker", `${displayOptionalPpm(market.makerFeeRatePpm, 4)} / ${displayOptionalPpm(market.takerFeeRatePpm, 4)}`],
    ["状态/版本", `${market.status ?? "TRADING"} / v${market.version ?? "-"}`],
    ...(isSpot ? [] : [
      ["最大杠杆", `${market.maxLeverage}x`],
      ["起始/维持保证金率", `${displayOptionalPpm(market.initialMarginRatePpm)} / ${displayOptionalPpm(market.maintenanceMarginRatePpm)}`],
      ["资金费率周期", `${market.fundingIntervalHours ?? "-"} 小时`],
      ["指数有效源数", market.minValidIndexSources ?? "-"],
    ] as Array<[string, ReactNode]>)
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-title"><span><Info size={16} />{market.symbol} 产品配置</span><button onClick={onClose}>关闭</button></div>
        <div className="config-grid">
          {items.map(([label, value]) => (
            <div className="config-item" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="config-section">
          <h3>订单能力</h3>
          <p>{(market.supportedOrderTypes ?? ["LIMIT", "MARKET"]).join(" / ")} · {(market.supportedTimeInForce ?? ["GTC", "IOC", "FOK", "GTX"]).join(" / ")}</p>
          <p>Post-only: {market.postOnlyEnabled === false ? "关闭" : "开启"} · {isSpot ? "现货无 Reduce-only" : `Reduce-only: ${market.reduceOnlyEnabled === false ? "关闭" : "开启"}`} · Market: {market.marketOrderEnabled === false ? "关闭" : "开启"}</p>
        </div>
        {!isSpot && (
          <div className="config-section">
            <h3>指数价格来源</h3>
            {market.indexSources?.length ? market.indexSources.map((source, index) => (
              <p key={`${source.exchangeCode}-${index}`}>{source.exchangeCode ?? "-"} {source.sourceSymbol ?? ""} 权重 {displayOptionalPpm(source.weightPpm)}</p>
            )) : <p>后端未返回指数源明细。</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function TradingRulesPage({ markets, selectedMarket, onOpenMarket }: { markets: Market[]; selectedMarket?: Market; onOpenMarket: (market: Market) => void }) {
  return (
    <section className="rules-page">
      <div className="rules-hero">
        <div>
          <span className="eyebrow"><FileText size={15} />Backend instrument rules</span>
          <h1>交易规则</h1>
          <p>页面展示的数据来自 instrument 当前版本。现货、U本位和币本位共享同一套 symbol 规则、订单能力、数量边界、费率和风控配置入口。</p>
        </div>
        <div className="rules-current">
          <strong>{selectedMarket?.symbol ?? "选择市场"}</strong>
          <span>{selectedMarket ? `${PRODUCT_META[marketProduct(selectedMarket)].label} · ${selectedMarket.settleAsset ?? selectedMarket.quoteAsset}` : "选择产品"} </span>
          <button onClick={() => selectedMarket && onOpenMarket(selectedMarket)}>打开交易</button>
        </div>
      </div>
      <div className="rules-grid">
        <RuleCard title="产品设计" icon={<Layers3 size={16} />}>
          <p>当前系统采用 instrument 版本化配置，交易、撮合、账户、风险、资金费率、K线、指数/标记价格都读取同一份规则快照。</p>
          <p>U本位、币本位和现货都由后端 `instrumentType` 与 `contractType` 区分，前端不维护独立交易对清单。</p>
        </RuleCard>
        <RuleCard title="关键指标" icon={<TrendingUp size={16} />}>
          <p>合约产品展示标记价格、指数价格和资金费率；现货产品展示基础资产、计价资产、盘口和成交。</p>
          <p>资产、持仓、权益、保证金率和风险状态由后端 account/risk 推送或查询，前端只展示，不自行结算。</p>
        </RuleCard>
        <RuleCard title="下单保护" icon={<TableProperties size={16} />}>
          <p>订单入口按最小数量、最大数量、最小/最大名义价值、最大杠杆、reduce-only、post-only、价格保护和持仓限额校验。</p>
          <p>撮合结果带 traceId，成交用 symbol + tradeId 幂等，WebSocket 至少一次投递，前端按事件版本刷新账户数据。</p>
        </RuleCard>
      </div>
      <div className="rules-table panel">
        <div className="panel-title"><span><BookOpen size={16} />产品参数</span><button>{markets.length} symbols</button></div>
        <div className="rules-row table-head">
          <span>市场</span><span>产品</span><span>后端类型</span><span>账户/结算</span><span>杠杆</span><span>数量范围</span><span>名义价值</span><span>费率</span><span>状态</span>
        </div>
        {markets.map((market) => (
          <button className="rules-row" key={market.symbol} onClick={() => onOpenMarket(market)}>
            <strong>{market.symbol}</strong>
            <span>{PRODUCT_META[marketProduct(market)].shortLabel}</span>
            <span>{market.contractType ?? "LINEAR_PERPETUAL"}</span>
            <span>{marketProduct(market) === "spot" ? PRODUCT_META.spot.accountType : market.settleAsset ?? market.quoteAsset}</span>
            <span>{marketProduct(market) === "spot" ? "-" : `${market.maxLeverage}x`}</span>
            <span>{market.minQuantitySteps ?? "-"} - {market.maxQuantitySteps ?? "-"}</span>
            <span>{formatUnitsOrDash(market.minNotionalUnits)} - {formatUnitsOrDash(market.maxNotionalUnits)}</span>
            <span>{displayOptionalPpm(market.makerFeeRatePpm, 4)} / {displayOptionalPpm(market.takerFeeRatePpm, 4)}</span>
            <span>{market.status ?? "TRADING"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RuleCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <article className="rule-card">
      <h3>{icon}{title}</h3>
      {children}
    </article>
  );
}

function marketProduct(market?: Market): ProductMode {
  if (!market) return "linear";
  if (market.instrumentType === "SPOT" || market.contractType === "SPOT") return "spot";
  if (
    market.contractType === "INVERSE_PERPETUAL" ||
    market.contractType === "INVERSE" ||
    (market.settleAsset && market.settleAsset === market.baseAsset)
  ) {
    return "inverse";
  }
  return "linear";
}

function filterPositionsByProduct(positions: Position[], markets: Market[], productMode: ProductMode): Position[] {
  if (productMode === "spot") return [];
  const productSymbols = new Set(markets.filter((market) => marketProduct(market) === productMode).map((market) => market.symbol));
  if (!productSymbols.size) return positions;
  return positions.filter((position) => productSymbols.has(position.symbol));
}

function estimateNotional(market: Market | undefined, priceTicks: number, quantitySteps: number): number {
  if (!Number.isFinite(priceTicks) || !Number.isFinite(quantitySteps)) return 0;
  if (marketProduct(market) === "inverse") {
    return quantitySteps * (market?.notionalMultiplierUnits ?? 1);
  }
  return priceTicks * quantitySteps * (market?.notionalMultiplierUnits ?? 1);
}

function buildPublicTrades(events: WsEnvelope[], symbol: string, mid: number, includeFallback = true): TradePrint[] {
  const liveTrades = events
    .filter((event) => event.channel === "trades" && (!event.symbol || event.symbol === symbol))
    .map((event, index) => toTradePrint(event, index, "PUBLIC"))
    .filter((item): item is TradeRecord => Boolean(item))
    .filter((item) => !item.symbol || item.symbol === symbol)
    .slice(0, TRADE_TAPE_ROWS);
  if (liveTrades.length || !includeFallback) return liveTrades;
  return fallbackTrades(symbol, mid);
}

function mergeTradeTape(incoming: TradePrint[], current: TradePrint[]): TradePrint[] {
  const seen = new Set<string>();
  const next: TradePrint[] = [];
  for (const item of [...incoming, ...current]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
    if (next.length >= TRADE_TAPE_ROWS) break;
  }
  const unchanged = next.length === current.length && next.every((item, index) => item.id === current[index]?.id);
  return unchanged ? current : next;
}

function buildTradeRecords(events: WsEnvelope[], userId: number | undefined, symbol: string, mid: number): TradeRecord[] {
  const records = events
    .filter((event) => event.channel === "matches" && (!event.symbol || event.symbol === symbol))
    .map((event, index) => toTradePrint(event, index, userRole(event.data, userId)))
    .filter((item): item is TradeRecord => Boolean(item))
    .slice(0, 30);
  if (records.length) return records;
  return fallbackTrades(symbol, mid).slice(0, 8).map((item) => ({ ...item, role: "PUBLIC" }));
}

function toTradePrint(event: WsEnvelope, index: number, role: TradeRecord["role"]): TradeRecord | null {
  const data = asRecord(event.data);
  if (!data) return null;
  const priceTicks = asNumber(data.priceTicks ?? data.price ?? data.closePrice);
  const quantitySteps = asNumber(data.quantitySteps ?? data.quantity ?? data.baseVolume);
  if (!priceTicks || !quantitySteps) return null;
  const takerSide = String(data.takerSide ?? data.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const symbol = String(data.symbol ?? event.symbol ?? "");
  const tradeKey = data.tradeId ?? data.eventId ?? data.id ?? event.id ?? `${data.tradeTime ?? event.eventTime ?? index}-${priceTicks}-${quantitySteps}-${takerSide}`;
  return {
    id: `${event.channel ?? "ws"}-${symbol}-${String(tradeKey)}`,
    symbol,
    side: takerSide,
    priceTicks,
    quantitySteps,
    time: formatTime(String(data.tradeTime ?? data.eventTime ?? event.eventTime ?? new Date().toISOString())),
    role,
    orderId: asNumber(data.takerOrderId ?? data.makerOrderId),
    traceId: typeof data.traceId === "string" ? data.traceId : undefined
  };
}

function userRole(data: unknown, userId: number | undefined): TradeRecord["role"] {
  const record = asRecord(data);
  if (!record || !userId) return "PUBLIC";
  if (asNumber(record.takerUserId) === userId) return "TAKER";
  if (asNumber(record.makerUserId) === userId) return "MAKER";
  return "PUBLIC";
}

function applyDepthUpdate(
  current: OrderBookLevel[],
  rawLevels: unknown,
  side: "bid" | "ask",
  updateType: string,
  depth: number
): OrderBookLevel[] {
  const incoming = asBookLevels(rawLevels);
  if (!incoming.length) return current;
  if (updateType === "SNAPSHOT" || !current.length) {
    return withDepthTotals(incoming, side, depth);
  }
  const levels = new Map<number, OrderBookLevel>();
  for (const level of current) {
    levels.set(level.priceTicks, { ...level, totalSteps: 0 });
  }
  for (const level of incoming) {
    if (level.quantitySteps <= 0) {
      levels.delete(level.priceTicks);
    } else {
      levels.set(level.priceTicks, { ...level, totalSteps: 0 });
    }
  }
  return withDepthTotals([...levels.values()], side, depth);
}

function asBookLevels(value: unknown): OrderBookLevel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const priceTicks = asNumber(record.priceTicks);
      const quantitySteps = asNumber(record.quantitySteps);
      if (!priceTicks) return null;
      return {
        priceTicks,
        quantitySteps,
        orderCount: asNumber(record.orderCount),
        totalSteps: 0
      };
    })
    .filter((item): item is OrderBookLevel => Boolean(item));
}

function withDepthTotals(levels: OrderBookLevel[], side: "bid" | "ask", depth: number): OrderBookLevel[] {
  const sorted = [...levels]
    .sort((left, right) => side === "bid" ? right.priceTicks - left.priceTicks : left.priceTicks - right.priceTicks)
    .slice(0, depth);
  let totalSteps = 0;
  return sorted.map((level) => {
    totalSteps += Math.max(0, level.quantitySteps);
    return { ...level, totalSteps };
  });
}

function groupOrderBookLevels(levels: OrderBookLevel[], side: "bid" | "ask", precision: number, depth: number): OrderBookLevel[] {
  if (precision <= 0) return withDepthTotals(levels, side, depth);
  const grouped = new Map<number, OrderBookLevel>();
  for (const level of levels) {
    const bucket = side === "bid"
      ? Math.floor(level.priceTicks / precision) * precision
      : Math.ceil(level.priceTicks / precision) * precision;
    const priceTicks = Number(bucket.toFixed(8));
    const current = grouped.get(priceTicks);
    grouped.set(priceTicks, {
      priceTicks,
      quantitySteps: (current?.quantitySteps ?? 0) + Math.max(0, level.quantitySteps),
      orderCount: (current?.orderCount ?? 0) + Math.max(0, level.orderCount),
      totalSteps: 0
    });
  }
  return withDepthTotals([...grouped.values()], side, depth);
}

function formatPrecision(market: Market | undefined, value: number): string {
  return displayMarketPrice(market, value);
}

function toCandlePoint(data: Record<string, unknown>): CandlePoint | null {
  const openTime = data.openTime ?? data.time;
  const time = typeof openTime === "number"
    ? openTime
    : Math.floor(new Date(String(openTime ?? "")).getTime() / 1000);
  if (!Number.isFinite(time) || time <= 0) return null;
  const open = asNumber(data.openPrice ?? data.open);
  const high = asNumber(data.highPrice ?? data.high);
  const low = asNumber(data.lowPrice ?? data.low);
  const close = asNumber(data.closePrice ?? data.close);
  if (!open || !high || !low || !close) return null;
  return {
    time,
    open,
    high,
    low,
    close,
    volume: asNumber(data.baseVolume ?? data.volume)
  };
}

function upsertCandle(current: CandlePoint[], candle: CandlePoint): CandlePoint[] {
  const index = current.findIndex((item) => item.time === candle.time);
  const next = index >= 0
    ? current.map((item, itemIndex) => itemIndex === index ? candle : item)
    : [...current, candle];
  return next.sort((left, right) => left.time - right.time).slice(-260);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function asRatePpm(value: unknown): number | undefined {
  const number = asOptionalNumber(value);
  if (number === undefined) return undefined;
  return Math.abs(number) <= 1 ? Math.round(number * 1_000_000) : Math.round(number);
}

function fundingTimingPatch(data: Record<string, unknown>): Partial<Market> {
  const timeUntilFundingSeconds = asOptionalNumber(
    data.timeUntilFundingSeconds ??
    data.timeUntilFunding ??
    data.secondsUntilFunding ??
    data.fundingCountdownSeconds ??
    data.timeUntilSettlementSeconds ??
    data.secondsUntilSettlement
  );
  const nextFundingTime = asTimeString(
    data.nextFundingTime ??
    data.fundingTime ??
    data.nextSettlementTime ??
    data.settlementTime ??
    data.settleTime
  ) ?? (timeUntilFundingSeconds !== undefined && timeUntilFundingSeconds >= 0
    ? new Date(Date.now() + timeUntilFundingSeconds * 1000).toISOString()
    : undefined);
  const fundingIntervalHours = asOptionalNumber(data.fundingIntervalHours ?? data.intervalHours);
  return {
    ...(fundingIntervalHours !== undefined && fundingIntervalHours > 0 ? { fundingIntervalHours } : {}),
    ...(nextFundingTime ? { nextFundingTime } : {}),
    ...(timeUntilFundingSeconds !== undefined && timeUntilFundingSeconds >= 0 ? { timeUntilFundingSeconds } : {})
  };
}

function asTimeString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return epochToIso(value);
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return epochToIso(Number(trimmed));
  const timestamp = Date.parse(trimmed);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function epochToIso(value: number): string | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
  return new Date(milliseconds).toISOString();
}

function formatFundingCountdown(market: Market, nowMs: number): string {
  const explicitTime = market.nextFundingTime ? Date.parse(market.nextFundingTime) : Number.NaN;
  const targetMs = Number.isNaN(explicitTime)
    ? nextFundingBoundaryMs(nowMs, market.fundingIntervalHours ?? 8)
    : explicitTime;
  const remainingSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  return formatDuration(remainingSeconds);
}

function nextFundingBoundaryMs(nowMs: number, intervalHours: number): number {
  const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
  const remainder = nowMs % intervalMs;
  return nowMs + (remainder === 0 ? intervalMs : intervalMs - remainder);
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

function formatUnitsOrDash(value?: number): string {
  return typeof value === "number" ? displayUnits(value) : "-";
}

function displayOptionalPpm(value?: number, decimals = 2): string {
  return typeof value === "number" ? displayPpm(value, decimals) : "-";
}
