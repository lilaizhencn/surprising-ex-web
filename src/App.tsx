import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  CandlestickChart,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CircleDollarSign,
  Coins,
  Copy,
  Download,
  Eye,
  FileText,
  Flame,
  Globe2,
  HelpCircle,
  Info,
  Layers3,
  LogOut,
  MoonStar,
  Plus,
  Radio,
  Search,
  Sparkles,
  Star,
  Sun,
  TableProperties,
  TrendingUp,
  Trash2,
  Upload,
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
import { cancelAlgoOrder, cancelOrder, cancelTriggerOrder, loadBalances, loadCandles, loadInstrumentConfig, loadMarkets, loadMarkPrice, loadOpenAlgoOrders, loadOpenOrders, loadOpenTriggerOrders, loadOrderBook, loadPositionMode, loadPositions, login, placeAlgoOrder, placeOrder, placeTriggerOrder, register, updatePositionMode } from "./api/surprising";
import { compact, displayPpm, displayPrice, displayUnits } from "./config";
import { fallbackTrades } from "./mockData";
import { loadSession, saveSession } from "./api/client";
import { useRealtime } from "./hooks/useRealtime";
import type { AlgoOrder, AlgoOrderType, AuthSession, Balance, CandlePoint, MarginMode, Market, OpenOrder, OpenTriggerOrder, OrderBookLevel, OrderSide, OrderType, PlaceAlgoOrderDraft, PlaceOrderDraft, PlaceTriggerOrderDraft, Position, PositionMode, PositionSide, ProductAccountType, ProductLine, ProductMode, TimeInForce, TradePrint, TradeRecord, TriggerOrderType, TriggerPriceType, WsEnvelope } from "./types";
import "./styles.css";

type AuthMode = "login" | "register";
type Page = "trade" | "rules" | "assets" | "recharge" | "withdraw";
type ThemeMode = "dark" | "light";
type PickedPrice = { value: number; nonce: number };
type TriggerCloseTarget = "LONG" | "SHORT";
type TriggerLevelInput = {
  id: string;
  triggerType: TriggerOrderType;
  triggerPriceType: TriggerPriceType;
  closeTarget: TriggerCloseTarget;
  triggerPriceTicks: string;
  activationPriceTicks: string;
  callbackRatePpm: string;
  quantitySteps: string;
};
const KLINE_PERIODS = ["1m", "5m", "15m", "1h"] as const;
const KLINE_VISIBLE_BARS = 48;
const ORDER_BOOK_SIDE_ROWS = 6;
const ORDER_BOOK_PRECISIONS = [0.1, 1, 10, 50, 100] as const;
const TRADE_TAPE_ROWS = 15;
const PRICE_UNIT_SCALE = 100_000_000;

const PRIVATE_CHANNELS = new Set(["orders", "positions", "positionRisk", "accountRisk", "matches", "executionReports"]);
const THEME_KEY = "surprising-ex.theme";
const PRODUCT_META: Record<ProductMode, { label: string; shortLabel: string; accountType: ProductAccountType; productLine: ProductLine }> = {
  linear: { label: "U本位永续", shortLabel: "U本位永续", accountType: "USDT_PERPETUAL", productLine: "LINEAR_PERPETUAL" },
  inverse: { label: "币本位永续", shortLabel: "币本位永续", accountType: "COIN_PERPETUAL", productLine: "INVERSE_PERPETUAL" },
  linearDelivery: { label: "U本位交割", shortLabel: "U本位交割", accountType: "USDT_DELIVERY", productLine: "LINEAR_DELIVERY" },
  inverseDelivery: { label: "币本位交割", shortLabel: "币本位交割", accountType: "COIN_DELIVERY", productLine: "INVERSE_DELIVERY" },
  option: { label: "期权", shortLabel: "期权", accountType: "OPTION", productLine: "OPTION" },
  spot: { label: "现货", shortLabel: "现货", accountType: "SPOT", productLine: "SPOT" }
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
  const [algoOrders, setAlgoOrders] = useState<AlgoOrder[]>([]);
  const [triggerOrders, setTriggerOrders] = useState<OpenTriggerOrder[]>([]);
  const [positionMode, setPositionMode] = useState<PositionMode>("ONE_WAY");
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
    () => visibleMarkets.find((market) => market.symbol === symbol)
      ?? visibleMarkets[0]
      ?? markets.find((market) => market.symbol === symbol)
      ?? markets[0],
    [markets, symbol, visibleMarkets]
  );
  const activeProductMode = selectedMarket ? marketProduct(selectedMarket) : productMode;
  const activeProductLine = PRODUCT_META[activeProductMode].productLine;
  const realtime = useRealtime(session, symbol, activeProductMode, klinePeriod);

  const tradeRecords = useMemo(
    () => buildTradeRecords(
      realtime.events,
      session?.user.userId,
      symbol,
      activeProductLine,
      selectedMarket?.lastPriceTicks ?? 65000
    ),
    [activeProductLine, realtime.events, selectedMarket?.lastPriceTicks, session?.user.userId, symbol]
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
      if (marketProduct(instrument) !== activeProductMode) return;
      setMarkets((current) => {
        const instrumentProductMode = marketProduct(instrument);
        const exists = current.some((market) =>
          market.symbol === instrument.symbol && marketProduct(market) === instrumentProductMode
        );
        if (!exists) return [instrument, ...current];
        return current.map((market) => market.symbol === instrument.symbol && marketProduct(market) === instrumentProductMode ? {
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
  }, [activeProductMode, symbol]);

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
      (event) => Boolean(event.channel && PRIVATE_CHANNELS.has(event.channel) && matchesProductLine(event, activeProductLine))
    );
    if (!privateEvents.length) return;
    const timer = window.setTimeout(() => void refreshPrivateData(session), 250);
    return () => window.clearTimeout(timer);
  }, [activeProductLine, productMode, realtime.events, session, symbol]);

  useEffect(() => {
    const events = nextRealtimeEvents(
      realtime.events,
      processedPublicEventKeysRef,
      (event) => Boolean(event.channel && event.op === "event" && !PRIVATE_CHANNELS.has(event.channel)
        && matchesProductLine(event, activeProductLine))
    );
    if (!events.length) return;

    for (const event of events) {
      const data = asRecord(event.data);
      if (!data) continue;
      const eventSymbol = String(data.symbol ?? event.symbol ?? "");
      if (eventSymbol && eventSymbol !== symbol) continue;
      if (!matchesProductLine(event, activeProductLine)) continue;
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
  }, [activeProductLine, klinePeriod, realtime.events, selectedMarket, symbol]);

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
    setAlgoOrders([]);
    setTriggerOrders([]);
    setPositionMode("ONE_WAY");
  }

  function pickOrderPrice(priceTicks: number) {
    if (!Number.isFinite(priceTicks) || priceTicks <= 0) return;
    setPickedPrice({ value: priceTicks, nonce: Date.now() });
  }

  async function refreshMarketData(targetSymbol = symbol, targetPeriod = klinePeriod) {
    const requestId = marketDataRequestRef.current + 1;
    marketDataRequestRef.current = requestId;
    const targetMarket = markets.find((market) => market.symbol === targetSymbol);
    const productLine = productLineForMarket(targetMarket, productMode);
    const shouldLoadMarkPrice = targetMarket ? marketProduct(targetMarket) !== "spot" : productMode !== "spot";
    setLoading(true);
    try {
      const [nextCandles, book, markPrice] = await Promise.all([
        loadCandles(targetSymbol, targetPeriod, productLine),
        loadOrderBook(targetSymbol, productLine),
        shouldLoadMarkPrice ? loadMarkPrice(targetSymbol, targetMarket, productLine) : Promise.resolve(null)
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
      const productLine = PRODUCT_META[productMode].productLine;
      const [nextBalances, nextPositions, nextOrders, nextAlgoOrders, nextTriggerOrders, nextPositionMode] = await Promise.all([
        loadBalances(active, accountType, productLine),
        productMode === "spot" ? Promise.resolve([]) : loadPositions(active, productLine),
        loadOpenOrders(active, symbol, productLine),
        productMode === "spot" ? Promise.resolve([]) : loadOpenAlgoOrders(active, symbol, productLine),
        productMode === "spot" ? Promise.resolve([]) : loadOpenTriggerOrders(active, symbol, productLine),
        productMode === "spot" ? Promise.resolve<PositionMode>("ONE_WAY") : loadPositionMode(active, productLine)
      ]);
      setBalances(nextBalances);
      setPositions(filterPositionsByProduct(nextPositions, markets, productMode));
      setOrders(nextOrders);
      setAlgoOrders(nextAlgoOrders);
      setTriggerOrders(nextTriggerOrders);
      setPositionMode(nextPositionMode);
      setNotice(`${PRODUCT_META[productMode].label}资产、${productMode === "spot" ? "委托" : "持仓和委托"}已从 gateway 同步。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "私有数据同步失败");
    }
  }

  async function changePositionMode(nextMode: PositionMode) {
    if (!session) {
      setNotice("请先登录后再切换持仓模式。");
      setAuthMode("login");
      return;
    }
    if (nextMode === positionMode) return;
    try {
      const savedMode = await updatePositionMode(session, nextMode, PRODUCT_META[productMode].productLine);
      setPositionMode(savedMode);
      setNotice(`持仓模式已切换为${positionModeLabel(savedMode)}。`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error ? `切换持仓模式失败：${error.message}` : "切换持仓模式失败");
    }
  }

  async function submitOrder(draft: PlaceOrderDraft) {
    if (!session) {
      setNotice("请先登录后再下单。");
      setAuthMode("login");
      return;
    }
    try {
      const order = await placeOrder(session, draft, productLineForSymbol(draft.symbol, markets, productMode));
      setOrders((current) => [order, ...current.filter((item) => item.orderId !== order.orderId)]);
      setNotice(`订单已提交：${order.orderId}`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error ? `下单失败：${error.message}` : "下单失败");
    }
  }

  async function submitTriggerOrders(drafts: PlaceTriggerOrderDraft[]) {
    if (!session) {
      setNotice("请先登录后再提交止盈止损。");
      setAuthMode("login");
      return;
    }
    const validDrafts = drafts.filter((draft) => {
      if (draft.quantitySteps <= 0) return false;
      if (draft.triggerType === "TRAILING_STOP") {
        return draft.triggerPriceTicks >= 0
          && (draft.activationPriceTicks === undefined || draft.activationPriceTicks >= 0)
          && draft.callbackRatePpm !== undefined
          && draft.callbackRatePpm >= 1_000
          && draft.callbackRatePpm <= 100_000;
      }
      return draft.triggerPriceTicks > 0;
    });
    if (!validDrafts.length) {
      setNotice("条件单参数无效。");
      return;
    }
    try {
      const productLine = productLineForSymbol(validDrafts[0]?.symbol ?? symbol, markets, productMode);
      const created: OpenTriggerOrder[] = [];
      for (const draft of validDrafts) {
        created.push(await placeTriggerOrder(session, draft, productLine));
      }
      setTriggerOrders((current) => [
        ...created,
        ...current.filter((item) => !created.some((createdItem) => createdItem.triggerOrderId === item.triggerOrderId))
      ]);
      setNotice(`止盈止损已提交：${created.length}档`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error ? `止盈止损提交失败：${error.message}` : "止盈止损提交失败");
    }
  }

  async function submitAlgoOrder(draft: PlaceAlgoOrderDraft) {
    if (!session) {
      setNotice("请先登录后再提交算法单。");
      setAuthMode("login");
      return;
    }
    try {
      const order = await placeAlgoOrder(session, draft, productLineForSymbol(draft.symbol, markets, productMode));
      setAlgoOrders((current) => [order, ...current.filter((item) => item.algoOrderId !== order.algoOrderId)]);
      setNotice(`算法单已提交：${order.algoOrderId}`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error ? `算法单提交失败：${error.message}` : "算法单提交失败");
    }
  }

  async function submitCancel(order: OpenOrder) {
    if (!session) return;
    try {
      const canceled = await cancelOrder(session, order, productLineForSymbol(order.symbol, markets, productMode));
      setOrders((current) => current.map((item) => item.orderId === canceled.orderId ? canceled : item));
      setNotice(`撤单请求已提交：${order.orderId}`);
    } catch (error) {
      setNotice(error instanceof Error ? `撤单失败：${error.message}` : "撤单失败");
    }
  }

  async function submitTriggerCancel(order: OpenTriggerOrder) {
    if (!session) return;
    try {
      const canceled = await cancelTriggerOrder(session, order, productLineForSymbol(order.symbol, markets, productMode));
      setTriggerOrders((current) => current.filter((item) => item.triggerOrderId !== canceled.triggerOrderId));
      setNotice(`条件单撤销已提交：${order.triggerOrderId}`);
    } catch (error) {
      setNotice(error instanceof Error ? `条件单撤销失败：${error.message}` : "条件单撤销失败");
    }
  }

  async function submitAlgoCancel(order: AlgoOrder) {
    if (!session) return;
    try {
      const canceled = await cancelAlgoOrder(session, order, productLineForSymbol(order.symbol, markets, productMode));
      setAlgoOrders((current) => current.map((item) => item.algoOrderId === canceled.algoOrderId ? canceled : item));
      setNotice(`算法单取消已提交：${order.algoOrderId}`);
    } catch (error) {
      setNotice(error instanceof Error ? `算法单取消失败：${error.message}` : "算法单取消失败");
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
      ) : page === "assets" ? (
        <AssetsPage
          balances={balances}
          session={session}
          onDeposit={() => setPage("recharge")}
          onWithdraw={() => setPage("withdraw")}
        />
      ) : page === "recharge" ? (
        <FundingFlowPage
          mode="deposit"
          balances={balances}
          onBack={() => setPage("assets")}
          onShowAsset={() => setPage("assets")}
        />
      ) : page === "withdraw" ? (
        <FundingFlowPage
          mode="withdraw"
          balances={balances}
          onBack={() => setPage("assets")}
          onShowAsset={() => setPage("assets")}
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
              positionMode={positionMode}
              balances={balances}
              positions={positions}
              orders={orders}
              algoOrders={algoOrders}
              triggerOrders={triggerOrders}
              trades={tradeRecords}
              market={selectedMarket}
              markets={markets}
              onPositionModeChange={changePositionMode}
              onCancel={submitCancel}
              onCancelAlgo={submitAlgoCancel}
              onCancelTrigger={submitTriggerCancel}
            />
          </section>
          <aside className="right-stack">
            <TradesTape events={realtime.events} symbol={symbol} productLine={activeProductLine}
              market={selectedMarket} mid={selectedMarket?.lastPriceTicks ?? 65000} onPickPrice={pickOrderPrice} />
            <OrderTicket productMode={productMode} positionMode={positionMode} symbol={symbol} market={selectedMarket} pricePreset={pickedPrice} onSubmit={submitOrder} onSubmitAlgo={submitAlgoOrder} onSubmitTriggers={submitTriggerOrders} />
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

function AssetsPage({
  balances,
  session,
  onDeposit,
  onWithdraw
}: {
  balances: Balance[];
  session: AuthSession | null;
  onDeposit: () => void;
  onWithdraw: () => void;
}) {
  const assets = fundingAssets(balances);
  const total = assets.reduce((sum, item) => sum + unitsToNumber(item.equityUnits), 0);
  const totalCny = total * 7.18;
  const fundingValue = assets.filter((item) => item.accountType !== "USDT_PERPETUAL" && item.accountType !== "COIN_PERPETUAL")
    .reduce((sum, item) => sum + unitsToNumber(item.equityUnits), 0);
  const tradeValue = Math.max(0, total - fundingValue);
  const todayPnl = -totalCny * 0.0144;
  const ledger = [
    { title: "提币 USDT", time: "2026年6月21日 下午02:34", amount: "-99.061119 USDT", tone: "muted" },
    { title: "从交易账户转入 USDT", time: "2026年6月21日 下午02:33", amount: "99.061119 USDT", tone: "up" },
    { title: "提币 USDT", time: "2026年6月19日 下午09:13", amount: "-36.442173 USDT", tone: "muted" },
    { title: "从交易账户转入 USDT", time: "2026年6月19日 下午09:13", amount: "36.442173 USDT", tone: "up" }
  ];

  return (
    <section className="asset-page">
      <AssetTabs active="资产总览" />
      <div className="asset-layout">
        <div className="asset-main">
          <section className="asset-summary-card">
            <div>
              <p className="asset-label">总资产估值 <Eye size={15} /></p>
              <h1>{currencyCny(totalCny)} <span>CNY <ChevronDown size={13} /></span></h1>
              <p className="asset-loss">今日收益 {currencyCny(todayPnl)} (-1.44%)</p>
              <div className="asset-actions">
                <button className="active" onClick={onDeposit}>充币</button>
                <button onClick={onWithdraw}>提币</button>
                <button>资金划转</button>
                <button>赚币</button>
              </div>
            </div>
            <MiniAssetChart />
            <ChevronDown className="asset-card-chevron" size={24} />
          </section>

          <section className="asset-portfolio-card">
            <h2>资产组合</h2>
            <div className="portfolio-cards">
              <PortfolioBox icon={<WalletCards size={18} />} title="资金账户" value={currencyCny(fundingValue * 7.18)} />
              <PortfolioBox icon={<Activity size={18} />} title="交易账户" value={currencyCny(tradeValue * 7.18)} />
              <PortfolioBox icon={<Coins size={18} />} title="赚币" value="¥0" />
            </div>
            <div className="asset-table-toolbar">
              <div className="asset-search"><Search size={16} />搜索</div>
              <button><TableProperties size={16} /></button>
            </div>
            <h3>代币</h3>
            <div className="pc-asset-row pc-asset-head"><span>名称</span><span>数量</span><span>估值/现货收益</span></div>
            {assets.map((asset) => {
              const amount = unitsToNumber(asset.equityUnits);
              const value = amount * 7.18;
              const gain = value * (asset.asset === "ETH" ? -0.3679 : asset.asset === "BTC" ? 0.3239 : 1.2366);
              return (
                <div className="pc-asset-row" key={`${asset.accountType}-${asset.asset}`}>
                  <span className="pc-asset-name"><AssetIcon symbol={asset.asset} /><strong>{asset.asset}</strong><small>{assetName(asset.asset)}</small></span>
                  <span>{displayUnits(asset.equityUnits, 8)}</span>
                  <span><strong>{currencyCny(value)}</strong><small className={gain >= 0 ? "up" : "down"}>{gain >= 0 ? "+" : ""}{currencyCny(gain)} ({gain >= 0 ? "+" : ""}{(gain / Math.max(value, 1) * 100).toFixed(2)}%)</small></span>
                </div>
              );
            })}
            {!session && <p className="asset-login-note">登录后可同步真实资产和资金记录。</p>}
          </section>
        </div>

        <aside className="recent-ledger-card">
          <div className="ledger-title"><h3>近期资金账单</h3><button>查看更多 <ChevronDown size={13} /></button></div>
          {ledger.map((item) => (
            <div className="ledger-item" key={`${item.title}-${item.time}`}>
              <div><strong>{item.title}</strong><small>{item.time}</small></div>
              <span className={item.tone === "up" ? "up" : ""}>{item.amount}</span>
            </div>
          ))}
        </aside>
      </div>
      <SupportBubble />
    </section>
  );
}

function FundingFlowPage({
  mode,
  balances,
  onBack,
  onShowAsset
}: {
  mode: "deposit" | "withdraw";
  balances: Balance[];
  onBack: () => void;
  onShowAsset: () => void;
}) {
  const assets = fundingAssets(balances);
  const [asset, setAsset] = useState(() => assets[0]?.asset ?? "USDT");
  const [network, setNetwork] = useState(() => fundingNetworks(assets[0]?.asset ?? "USDT")[0]);
  const [showDetails, setShowDetails] = useState(false);
  const networks = fundingNetworks(asset);
  const selectedNetwork = networks.includes(network) ? network : networks[0];
  const title = mode === "deposit" ? "充币" : "提币";
  const address = demoFundingAddress(asset, selectedNetwork);

  useEffect(() => {
    const nextNetwork = fundingNetworks(asset)[0];
    setNetwork(nextNetwork);
    setShowDetails(false);
  }, [asset]);

  return (
    <section className="funding-page">
      <AssetTabs active="资金账户" />
      <div className="funding-layout">
        <div className="funding-main">
          <button className="funding-back" onClick={onBack}>资产总览</button>
          <h1>{title}</h1>
          <div className={showDetails ? "funding-steps completed" : "funding-steps"}>
            <FundingStep index={1} done={showDetails} label="选择币种">
              <button className="funding-select" onClick={() => setShowDetails(false)}>
                <AssetIcon symbol={asset} /><span>{asset}</span><ChevronDown size={16} />
              </button>
              {!showDetails && (
                <div className="funding-picker">
                  {assets.slice(0, 8).map((item) => (
                    <button className={item.asset === asset ? "active" : ""} key={item.asset} onClick={() => setAsset(item.asset)}>
                      <AssetIcon symbol={item.asset} /><span>{item.asset}</span><small>{assetName(item.asset)}</small>
                    </button>
                  ))}
                </div>
              )}
            </FundingStep>

            <FundingStep index={2} done={showDetails} label="选择网络">
              <button className="funding-select" onClick={() => setShowDetails(false)}>
                <AssetIcon symbol={chainSymbol(selectedNetwork)} /><span>{networkLabel(selectedNetwork, asset)}</span><ChevronDown size={16} />
              </button>
              {!showDetails && (
                <div className="funding-picker network-picker">
                  {networks.map((item) => (
                    <button className={item === selectedNetwork ? "active" : ""} key={item} onClick={() => setNetwork(item)}>
                      <AssetIcon symbol={chainSymbol(item)} /><span>{networkLabel(item, asset)}</span><small>到账约 {networkEtaPc(item)} · 最小 {minimumAmount(asset)}</small>
                    </button>
                  ))}
                </div>
              )}
            </FundingStep>

            <FundingStep index={3} active={showDetails} label={`${title}详情`}>
              {showDetails ? (
                mode === "deposit" ? (
                  <div className="funding-detail">
                    <div className="pc-qr"><QrPattern /><AssetIcon symbol={asset} /></div>
                    <div className="funding-address">
                      <small>地址 〉</small>
                      <strong>{address}</strong>
                      <button><Copy size={16} /></button>
                      <span>切换至 0x 地址 ⇄</span>
                    </div>
                  </div>
                ) : (
                  <div className="withdraw-detail">
                    <label>提币地址<input placeholder="请输入或粘贴地址" /></label>
                    <label>提币数量<input placeholder={`最小 ${minimumAmount(asset)}`} /></label>
                  </div>
                )
              ) : (
                <button className="primary-flow-button" onClick={() => setShowDetails(true)}>继续</button>
              )}
            </FundingStep>
          </div>

          {showDetails && (
            <div className="funding-info-grid">
              <InfoPair label={`最小${title}金额`} value={minimumAmount(asset)} />
              <InfoPair label={`${title}账户`} value="资金账户" />
              <InfoPair label={`${title}到账时间`} value={networkEtaPc(selectedNetwork)} />
              <InfoPair label={mode === "deposit" ? "可提币时间" : "手续费"} value={mode === "deposit" ? networkEtaPc(selectedNetwork) : `0.01 ${asset}`} />
              <InfoPair label="代币合约" value="查看详情 〉" />
            </div>
          )}

          <FundingRecords asset={asset} mode={mode} onShowAsset={onShowAsset} />
        </div>
        <FaqCard title="常见问题" />
      </div>
      <SupportBubble />
    </section>
  );
}

function AssetTabs({ active }: { active: string }) {
  const tabs = ["资产总览", "资金账户", "交易账户", "金融账户", "资产分析", "订单中心", "手续费", "账户结单", "储备金证明报告"];
  return <nav className="asset-tabs">{tabs.map((tab) => <button className={tab === active ? "active" : ""} key={tab}>{tab}</button>)}</nav>;
}

function PortfolioBox({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return <div className="portfolio-box"><span>{icon}</span><small>{title}</small><strong>{value}</strong></div>;
}

function FundingStep({ index, label, done, active, children }: { index: number; label: string; done?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <section className={active ? "funding-step active" : "funding-step"}>
      <div className={done ? "step-index done" : "step-index"}>{done ? <CheckCircle2 size={18} /> : index}</div>
      <div className="step-body">
        <h2>{label}</h2>
        {children}
      </div>
    </section>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return <div><span>{label} <Info size={13} /></span><strong>{value}</strong></div>;
}

function FundingRecords({ asset, mode, onShowAsset }: { asset: string; mode: "deposit" | "withdraw"; onShowAsset: () => void }) {
  return (
    <section className="funding-records">
      <div className="record-tabs"><button className="active">{asset} {mode === "deposit" ? "充币" : "提币"}记录</button><button>全部{mode === "deposit" ? "充币" : "提币"}记录</button></div>
      <div className="record-actions"><button><Download size={14} /> 导出</button><button onClick={onShowAsset}><FileText size={14} /> 查看历史记录</button></div>
      <div className="record-table-head"><span>时间</span><span>地址</span><span>交易 ID</span><span>币种</span><span>{mode === "deposit" ? "充币" : "提币"}数量</span><span>{mode === "deposit" ? "充币" : "提币"}状态</span></div>
      <div className="empty-ledger"><FileText size={54} /><strong>暂无记录</strong><small>开始您的第一笔交易</small></div>
    </section>
  );
}

function FaqCard({ title }: { title: string }) {
  return (
    <aside className="faq-card">
      <h3>{title}</h3>
      <p>如何充币？</p>
      <p>为什么我充的币一直不到账？</p>
      <p>充币时如何查看地址及标签 (Tag)?</p>
      <p>如何查看充币进度？</p>
    </aside>
  );
}

function AssetIcon({ symbol }: { symbol: string }) {
  return <span className={`asset-icon asset-${symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}`}>{symbol.slice(0, 1)}</span>;
}

function MiniAssetChart() {
  return <svg className="mini-asset-chart" viewBox="0 0 220 92" role="img" aria-label="资产走势">
    <path d="M0 82 L0 42 C18 30 28 54 43 41 C55 30 69 46 82 31 C94 16 108 22 120 12 C135 0 150 27 166 24 C184 21 195 32 206 26 L220 70 L220 92 L0 92 Z" />
    <polyline points="0,42 18,30 43,41 69,46 82,31 108,22 120,12 150,27 166,24 195,32 206,26 220,70" />
  </svg>;
}

function QrPattern() {
  return <div className="qr-pattern" aria-label="充值二维码">
    {Array.from({ length: 121 }).map((_, index) => <i key={index} className={(index * 17 + index % 5) % 3 === 0 ? "on" : ""} />)}
  </div>;
}

function SupportBubble() {
  return <button className="support-bubble"><HelpCircle size={24} /></button>;
}

function fundingAssets(balances: Balance[]): Balance[] {
  if (balances.length) return balances;
  return [
    { accountType: "FUNDING", asset: "OKB", availableUnits: 13_500_000_009, lockedUnits: 0, equityUnits: 13_500_000_009 },
    { accountType: "FUNDING", asset: "BTC", availableUnits: 1_954_640, lockedUnits: 0, equityUnits: 1_954_640 },
    { accountType: "FUNDING", asset: "A", availableUnits: 67_170_000, lockedUnits: 0, equityUnits: 67_170_000 },
    { accountType: "FUNDING", asset: "NIGHT", availableUnits: 128_768_890, lockedUnits: 0, equityUnits: 128_768_890 },
    { accountType: "FUNDING", asset: "ETH", availableUnits: 5, lockedUnits: 0, equityUnits: 5 },
    { accountType: "FUNDING", asset: "SHIB", availableUnits: 92_099_162, lockedUnits: 0, equityUnits: 92_099_162 }
  ];
}

function unitsToNumber(units: number): number {
  return units / 100_000_000;
}

function currencyCny(value: number): string {
  const prefix = value < 0 ? "-¥" : "¥";
  return `${prefix}${Math.abs(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function assetName(symbol: string): string {
  const names: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum", OKB: "OKB", USDT: "USDT", USDC: "USD Coin", SHIB: "Shiba Inu", NIGHT: "Midnight", A: "Vaulta" };
  return names[symbol] ?? symbol;
}

function fundingNetworks(asset: string): string[] {
  if (asset === "BTC") return ["Bitcoin"];
  if (asset === "ETH") return ["Ethereum (ERC20)", "Arbitrum One", "Avalanche C-Chain"];
  return ["X Layer", "Tron (TRC20)", "Ethereum (ERC20)", "Aptos", "Arbitrum One", "Avalanche C-Chain", "Berachain"];
}

function networkLabel(network: string, asset: string): string {
  if (network === "X Layer") return `X Layer (${asset}&${asset}0)`;
  if (network === "Berachain") return `Berachain (${asset}0)`;
  return network;
}

function networkEtaPc(network: string): string {
  if (network.includes("Ethereum")) return "约 7 分钟";
  if (network.includes("Arbitrum")) return "约 18 分钟";
  return "约 1 分钟";
}

function minimumAmount(asset: string): string {
  return `0.01 ${asset}`;
}

function chainSymbol(network: string): string {
  if (network.includes("Tron")) return "TRX";
  if (network.includes("Ethereum")) return "ETH";
  if (network.includes("Bitcoin")) return "BTC";
  if (network.includes("X Layer")) return "OKB";
  return network.slice(0, 1);
}

function demoFundingAddress(asset: string, network: string): string {
  if (asset === "USDT" && network === "X Layer") return "XK00861E9d78139CD68Ae6C78A5b5F7384325e60950";
  return `${asset}${network.replace(/[^A-Za-z0-9]/g, "").slice(0, 8)}9d78139CD68Ae6C78A5b5F7384325e60950`;
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
      <button className="brand okx-brand" onClick={() => onPageChange("trade")}><span className="okx-mark" /><strong>欧易</strong></button>
      <nav>
        <button onClick={() => { onProductModeChange("spot"); onPageChange("trade"); }}>买币<ChevronDown size={13} /></button>
        <button onClick={() => { onProductModeChange("linear"); onPageChange("trade"); }}>市场</button>
        <button className={page === "trade" && productMode === "linear" ? "active" : ""} onClick={() => { onProductModeChange("linear"); onPageChange("trade"); }}><CircleDollarSign size={15} />U本位</button>
        <button className={page === "trade" && productMode === "inverse" ? "active" : ""} onClick={() => { onProductModeChange("inverse"); onPageChange("trade"); }}><Layers3 size={15} />币本位</button>
        <button className={page === "trade" && productMode === "linearDelivery" ? "active" : ""} onClick={() => { onProductModeChange("linearDelivery"); onPageChange("trade"); }}><Clock3 size={15} />U交割</button>
        <button className={page === "trade" && productMode === "inverseDelivery" ? "active" : ""} onClick={() => { onProductModeChange("inverseDelivery"); onPageChange("trade"); }}><Clock3 size={15} />币交割</button>
        <button className={page === "trade" && productMode === "option" ? "active" : ""} onClick={() => { onProductModeChange("option"); onPageChange("trade"); }}><Sparkles size={15} />期权</button>
        <button className={page === "trade" && productMode === "spot" ? "active" : ""} onClick={() => { onProductModeChange("spot"); onPageChange("trade"); }}><WalletCards size={15} />现货</button>
        <button>金融<ChevronDown size={13} /></button>
        <button>机构客户<ChevronDown size={13} /></button>
        <button>新手学院<ChevronDown size={13} /></button>
        <button>星球</button>
        <button className={page === "rules" ? "active" : ""} onClick={() => onPageChange("rules")}><FileText size={15} />交易规则</button>
      </nav>
      <div className="top-actions">
        <div className="top-search"><Search size={14} />搜索币对</div>
        <button className="asset-charge" onClick={() => onPageChange("recharge")}>充值</button>
        <button className={page === "assets" ? "user-pill active" : "user-pill"} onClick={() => onPageChange("assets")}>资产管理<ChevronDown size={13} /></button>
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
  const isFunding = isFundingProduct(product);
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
          {isFunding ? (
            <>
              <Metric label="资金费率" value={displayPpm(market.fundingRatePpm, 4)} tone={fundingTone} />
              <Metric label="资金费倒计时" value={formatFundingCountdown(market, nowMs)} tone="gold" />
            </>
          ) : (
            <>
              <Metric label={product === "option" ? "行权方向" : "到期时间"} value={product === "option" ? market.optionType ?? "-" : market.expiryTime ?? "-"} tone="gold" />
              <Metric label="交割时间" value={market.deliveryTime ?? "-"} />
            </>
          )}
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

function positionModeLabel(mode: PositionMode): string {
  return mode === "HEDGE" ? "双向持仓" : "净仓";
}

function positionSideLabel(side: PositionSide | "NET"): string {
  if (side === "LONG") return "多仓";
  if (side === "SHORT") return "空仓";
  return "净仓";
}

function triggerTypeLabel(type: TriggerOrderType): string {
  if (type === "TAKE_PROFIT") return "止盈";
  if (type === "TRAILING_STOP") return "追踪止损";
  return "止损";
}

function triggerCloseLabel(side: OrderSide, positionSide: PositionSide | "NET" | undefined): string {
  if (positionSide === "LONG") return "平多";
  if (positionSide === "SHORT") return "平空";
  return side === "SELL" ? "平多" : "平空";
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
  const productLine = eventProductLine(event) ?? "";
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
    productLine,
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
        textColor: "#b7c4d8",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.10)" },
        horzLines: { color: "rgba(148, 163, 184, 0.10)" }
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, .18)",
        scaleMargins: { top: 0.04, bottom: 0.18 }
      }
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00c076",
      downColor: "#f6465d",
      borderUpColor: "#00c076",
      borderDownColor: "#f6465d",
      wickUpColor: "#00c076",
      wickDownColor: "#f6465d",
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
      color: item.close >= item.open ? "rgba(0, 192, 118, .28)" : "rgba(246, 70, 93, .28)"
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

function OrderTicket({
  productMode,
  positionMode,
  symbol,
  market,
  pricePreset,
  onSubmit,
  onSubmitAlgo,
  onSubmitTriggers
}: {
  productMode: ProductMode;
  positionMode: PositionMode;
  symbol: string;
  market?: Market;
  pricePreset: PickedPrice | null;
  onSubmit: (draft: PlaceOrderDraft) => void;
  onSubmitAlgo: (draft: PlaceAlgoOrderDraft) => void;
  onSubmitTriggers: (drafts: PlaceTriggerOrderDraft[]) => void;
}) {
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC");
  const [marginMode, setMarginMode] = useState<MarginMode>("CROSS");
  const [positionSide, setPositionSide] = useState<PositionSide>("NET");
  const [priceTicks, setPriceTicks] = useState("65000");
  const [quantitySteps, setQuantitySteps] = useState("1");
  const [triggerLevels, setTriggerLevels] = useState<TriggerLevelInput[]>([]);
  const [algoType, setAlgoType] = useState<AlgoOrderType>("TWAP");
  const [algoChildQuantitySteps, setAlgoChildQuantitySteps] = useState("1");
  const [algoIntervalSeconds, setAlgoIntervalSeconds] = useState("5");
  const [algoDurationSeconds, setAlgoDurationSeconds] = useState("20");
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
  const isHedgeMode = !isSpot && positionMode === "HEDGE";
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

  useEffect(() => {
    if (isSpot || positionMode === "ONE_WAY") {
      setPositionSide("NET");
      return;
    }
    if (positionSide === "NET") setPositionSide(side === "SELL" ? "SHORT" : "LONG");
  }, [isSpot, positionMode, positionSide, side]);

  function addTriggerLevel(triggerType: TriggerOrderType) {
    setTriggerLevels((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        triggerType,
        triggerPriceType: "MARK_PRICE",
        closeTarget: side === "SELL" ? "SHORT" : "LONG",
        triggerPriceTicks: triggerType === "TRAILING_STOP" ? "0" : priceTicks,
        activationPriceTicks: triggerType === "TRAILING_STOP" ? priceTicks : "",
        callbackRatePpm: triggerType === "TRAILING_STOP" ? "1000" : "",
        quantitySteps
      }
    ]);
  }

  function patchTriggerLevel(id: string, patch: Partial<TriggerLevelInput>) {
    setTriggerLevels((current) => current.map((level) => level.id === id ? { ...level, ...patch } : level));
  }

  function removeTriggerLevel(id: string) {
    setTriggerLevels((current) => current.filter((level) => level.id !== id));
  }

  const validTriggerLevels = triggerLevels.filter((level) => {
    const quantity = Number(level.quantitySteps);
    if (!Number.isFinite(quantity) || quantity <= 0) return false;
    if (level.triggerType === "TRAILING_STOP") {
      const triggerPrice = Number(level.triggerPriceTicks);
      const activation = level.activationPriceTicks.trim() === "" ? 0 : Number(level.activationPriceTicks);
      const callbackRate = Number(level.callbackRatePpm);
      return Number.isFinite(triggerPrice) && triggerPrice >= 0
        && Number.isFinite(activation) && activation >= 0
        && Number.isFinite(callbackRate) && callbackRate >= 1_000 && callbackRate <= 100_000;
    }
    const triggerPrice = Number(level.triggerPriceTicks);
    return Number.isFinite(triggerPrice) && triggerPrice > 0;
  });
  const algoChildQuantity = Number(algoChildQuantitySteps);
  const algoInterval = Number(algoIntervalSeconds);
  const algoDuration = Number(algoDurationSeconds);
  const validAlgo = !isSpot
    && Number.isFinite(quantityNumber) && quantityNumber > 0
    && Number.isFinite(algoChildQuantity) && algoChildQuantity > 0 && algoChildQuantity <= quantityNumber
    && Number.isFinite(algoInterval) && algoInterval >= 1
    && Number.isFinite(algoDuration) && algoDuration >= algoInterval
    && (algoType === "TWAP" || priceNumber > 0);

  return (
    <section className="panel ticket">
      <div className="panel-title"><span><CircleDollarSign size={16} />{PRODUCT_META[productMode].shortLabel}下单</span><button>{isSpot ? market?.quoteAsset ?? "SPOT" : `${positionModeLabel(positionMode)} · ${leverage}x`}</button></div>
      <div className="side-switch">
        <button className={side === "BUY" ? "buy active" : "buy"} onClick={() => setSide("BUY")}>{isHedgeMode ? "买入" : isSpot ? "买入" : "开多 / 买入"}</button>
        <button className={side === "SELL" ? "sell active" : "sell"} onClick={() => setSide("SELL")}>{isHedgeMode ? "卖出" : isSpot ? "卖出" : "开空 / 卖出"}</button>
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
      {isHedgeMode && (
        <div className="position-side-switch">
          {(["LONG", "SHORT"] as PositionSide[]).map((item) => (
            <button
              key={item}
              className={positionSide === item ? `${item.toLowerCase()} active` : item.toLowerCase()}
              type="button"
              onClick={() => setPositionSide(item)}
            >
              {positionSideLabel(item)}
            </button>
          ))}
        </div>
      )}
      <label>价格 ticks<input disabled={orderType === "MARKET"} value={priceTicks} onChange={(event) => setPriceTicks(event.target.value)} /></label>
      <label>数量 steps<input value={quantitySteps} onChange={(event) => setQuantitySteps(event.target.value)} /></label>
      {!isSpot && <label>杠杆 <span>{leverage}x</span><input type="range" min="1" max={market?.maxLeverage ?? 100} value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} /></label>}
      {!isSpot && <label className="check"><input disabled={market?.reduceOnlyEnabled === false} type="checkbox" checked={reduceOnly} onChange={(event) => setReduceOnly(event.target.checked)} />Reduce-only</label>}
      <label className="check"><input disabled={market?.postOnlyEnabled === false || orderType === "MARKET"} type="checkbox" checked={postOnly && orderType !== "MARKET"} onChange={(event) => setPostOnly(event.target.checked)} />Post-only</label>
      {!isSpot && (
        <div className="algo-panel">
          <div className="trigger-head">
            <span>Algo</span>
            <div className="segmented tiny">
              {(["TWAP", "ICEBERG"] as AlgoOrderType[]).map((item) => (
                <button
                  key={item}
                  className={algoType === item ? "active" : ""}
                  type="button"
                  onClick={() => setAlgoType(item)}
                >
                  {item === "TWAP" ? "TWAP" : "Iceberg"}
                </button>
              ))}
            </div>
          </div>
          <div className="algo-grid">
            <label>切片<input value={algoChildQuantitySteps} onChange={(event) => setAlgoChildQuantitySteps(event.target.value)} /></label>
            <label>间隔s<input value={algoIntervalSeconds} onChange={(event) => setAlgoIntervalSeconds(event.target.value)} /></label>
            <label>时长s<input value={algoDurationSeconds} onChange={(event) => setAlgoDurationSeconds(event.target.value)} /></label>
          </div>
          <button
            className="submit-algo"
            disabled={!validAlgo}
            type="button"
            onClick={() => onSubmitAlgo({
              symbol,
              algoType,
              side,
              priceTicks: algoType === "TWAP" && orderType === "MARKET" ? 0 : priceNumber,
              quantitySteps: quantityNumber,
              childQuantitySteps: algoChildQuantity,
              intervalSeconds: algoInterval,
              durationSeconds: algoDuration,
              marginMode: isSpot ? "CROSS" : marginMode,
              positionSide: isHedgeMode ? positionSide : "NET",
              reduceOnly: isSpot ? false : reduceOnly,
              postOnly: algoType === "ICEBERG" && postOnly,
              timeInForce: algoType === "TWAP" ? "IOC" : postOnly ? "GTX" : "GTC"
            })}
          >
            <Clock3 size={14} />提交 {algoType}
          </button>
        </div>
      )}
      {!isSpot && (
        <div className="trigger-panel">
          <div className="trigger-head">
            <span>止盈止损</span>
            <div>
              <button type="button" title="新增止盈" onClick={() => addTriggerLevel("TAKE_PROFIT")}><Plus size={13} />TP</button>
              <button type="button" title="新增止损" onClick={() => addTriggerLevel("STOP_LOSS")}><Plus size={13} />SL</button>
              <button type="button" title="新增追踪止损" onClick={() => addTriggerLevel("TRAILING_STOP")}><Plus size={13} />TS</button>
            </div>
          </div>
          {triggerLevels.map((level) => (
            <div className="trigger-level-row" key={level.id}>
              <select value={level.triggerType} onChange={(event) => {
                const triggerType = event.target.value as TriggerOrderType;
                patchTriggerLevel(level.id, {
                  triggerType,
                  triggerPriceTicks: triggerType === "TRAILING_STOP" ? "0" : (level.triggerPriceTicks === "0" ? priceTicks : level.triggerPriceTicks),
                  activationPriceTicks: triggerType === "TRAILING_STOP" ? (level.activationPriceTicks || priceTicks) : "",
                  callbackRatePpm: triggerType === "TRAILING_STOP" ? (level.callbackRatePpm || "1000") : ""
                });
              }}>
                <option value="TAKE_PROFIT">TP</option>
                <option value="STOP_LOSS">SL</option>
                <option value="TRAILING_STOP">TS</option>
              </select>
              <select value={level.closeTarget} onChange={(event) => patchTriggerLevel(level.id, { closeTarget: event.target.value as TriggerCloseTarget })}>
                <option value="LONG">平多</option>
                <option value="SHORT">平空</option>
              </select>
              <select value={level.triggerPriceType} onChange={(event) => patchTriggerLevel(level.id, { triggerPriceType: event.target.value as TriggerPriceType })}>
                <option value="MARK_PRICE">Mark</option>
                <option value="INDEX_PRICE">Index</option>
                <option value="LAST_PRICE">Last</option>
              </select>
              <input title="触发价 ticks" value={level.triggerPriceTicks} onChange={(event) => patchTriggerLevel(level.id, { triggerPriceTicks: event.target.value })} />
              <input title="激活价 ticks" disabled={level.triggerType !== "TRAILING_STOP"} value={level.activationPriceTicks} onChange={(event) => patchTriggerLevel(level.id, { activationPriceTicks: event.target.value })} />
              <input title="回调 ppm" disabled={level.triggerType !== "TRAILING_STOP"} value={level.callbackRatePpm} onChange={(event) => patchTriggerLevel(level.id, { callbackRatePpm: event.target.value })} />
              <input title="数量 steps" value={level.quantitySteps} onChange={(event) => patchTriggerLevel(level.id, { quantitySteps: event.target.value })} />
              <button type="button" title="删除" onClick={() => removeTriggerLevel(level.id)}><Trash2 size={13} /></button>
            </div>
          ))}
          {triggerLevels.length > 0 && (
            <button
              className="submit-trigger"
              disabled={validTriggerLevels.length === 0}
              type="button"
              onClick={() => onSubmitTriggers(validTriggerLevels.map((level) => ({
                symbol,
                side: level.closeTarget === "LONG" ? "SELL" : "BUY",
                triggerType: level.triggerType,
                triggerPriceType: level.triggerPriceType,
                triggerPriceTicks: Number(level.triggerPriceTicks),
                activationPriceTicks: level.triggerType === "TRAILING_STOP" && level.activationPriceTicks.trim() !== ""
                  ? Number(level.activationPriceTicks)
                  : undefined,
                callbackRatePpm: level.triggerType === "TRAILING_STOP" ? Number(level.callbackRatePpm) : undefined,
                orderType: "MARKET",
                timeInForce: "IOC",
                priceTicks: 0,
                quantitySteps: Number(level.quantitySteps),
                marginMode,
                positionSide: isHedgeMode ? level.closeTarget : "NET"
              })))}
            >
              <Bell size={14} />提交止盈止损
            </button>
          )}
        </div>
      )}
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
        positionSide: isHedgeMode ? positionSide : "NET",
        reduceOnly: isSpot ? false : reduceOnly,
        postOnly: orderType === "MARKET" ? false : postOnly
      })}>{side === "BUY" ? "确认买入" : "确认卖出"}</button>
    </section>
  );
}

function BottomDeck({ productMode, positionMode, balances, positions, orders, algoOrders, triggerOrders, trades, market, markets, onPositionModeChange, onCancel, onCancelAlgo, onCancelTrigger }: {
  productMode: ProductMode;
  positionMode: PositionMode;
  balances: Balance[];
  positions: Position[];
  orders: OpenOrder[];
  algoOrders: AlgoOrder[];
  triggerOrders: OpenTriggerOrder[];
  trades: TradeRecord[];
  market?: Market;
  markets: Market[];
  onPositionModeChange: (mode: PositionMode) => void;
  onCancel: (order: OpenOrder) => void;
  onCancelAlgo: (order: AlgoOrder) => void;
  onCancelTrigger: (order: OpenTriggerOrder) => void;
}) {
  const equity = balances.reduce((sum, item) => sum + item.equityUnits, 0);
  const available = balances.reduce((sum, item) => sum + item.availableUnits, 0);
  const locked = balances.reduce((sum, item) => sum + item.lockedUnits, 0);
  const pnl = positions.reduce((sum, item) => sum + item.unrealizedPnlUnits, 0);
  const marginRatio = Math.max(0, ...positions.map((item) => item.marginRatioPpm));
  const isSpot = productMode === "spot";

  return (
    <section className="bottom-deck panel">
      <div className="panel-title">
        <span><WalletCards size={16} />{PRODUCT_META[productMode].label}账户</span>
        {!isSpot && (
          <div className="mode-switch" aria-label="持仓模式">
            {(["ONE_WAY", "HEDGE"] as PositionMode[]).map((mode) => (
              <button
                key={mode}
                className={positionMode === mode ? "active" : ""}
                type="button"
                onClick={() => onPositionModeChange(mode)}
              >
                {positionModeLabel(mode)}
              </button>
            ))}
          </div>
        )}
      </div>
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
              <span>市场</span><span>仓位</span><span>方向数量</span><span>入场/标记</span><span>浮盈亏</span><span>维持保证金</span><span>保证金率</span><span>状态</span>
            </div>
            {positions.length === 0 ? <p className="empty">暂无持仓</p> : positions.map((item) => (
              <div className="position-row" key={`${item.symbol}-${item.marginMode}-${item.positionSide ?? "NET"}`}>
                <strong>{item.symbol}</strong>
                <span>{positionSideLabel(item.positionSide ?? "NET")}</span>
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
            <span>市场</span><span>方向</span><span>仓位</span><span>类型</span><span>价格</span><span>成交/剩余</span><span>模式</span><span>状态</span><span></span>
          </div>
          {orders.length === 0 ? <p className="empty">暂无委托</p> : orders.map((item) => (
            <div className="order-row" key={item.orderId}>
              <strong>{item.symbol}</strong>
              <span className={item.side === "BUY" ? "up" : "down"}>{item.side}</span>
              <span>{positionSideLabel(item.positionSide ?? "NET")}</span>
              <span>{item.orderType}</span>
              <span>{displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.priceTicks)}</span>
              <span>{item.executedQuantitySteps}/{item.remainingQuantitySteps}</span>
              <span>{item.marginMode}</span>
              <span>{item.status}</span>
              <button onClick={() => onCancel(item)}>撤单</button>
            </div>
          ))}
        </AccountTable>
        {!isSpot && (
          <AccountTable title="算法单" icon={<Clock3 size={15} />}>
            <div className="algo-order-row table-head">
              <span>市场</span><span>类型</span><span>方向</span><span>价格</span><span>进度</span><span>切片</span><span>状态</span><span></span>
            </div>
            {algoOrders.length === 0 ? <p className="empty">暂无算法单</p> : algoOrders.map((item) => (
              <div className="algo-order-row" key={item.algoOrderId}>
                <strong>{item.symbol}</strong>
                <span>{item.algoType}</span>
                <span className={item.side === "BUY" ? "up" : "down"}>{item.side}</span>
                <span>{item.priceTicks > 0 ? displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.priceTicks) : "MARKET"}</span>
                <span>{item.executedQuantitySteps + item.activeQuantitySteps}/{item.quantitySteps}</span>
                <span>{item.childQuantitySteps} / {item.intervalSeconds}s</span>
                <span>{item.status}</span>
                <button onClick={() => onCancelAlgo(item)}>撤销</button>
              </div>
            ))}
          </AccountTable>
        )}
        {!isSpot && (
          <AccountTable title="止盈止损" icon={<Bell size={15} />}>
            <div className="trigger-order-row table-head">
              <span>市场</span><span>类型</span><span>目标</span><span>触发价</span><span>数量</span><span>委托</span><span>状态</span><span></span>
            </div>
            {triggerOrders.length === 0 ? <p className="empty">暂无止盈止损</p> : triggerOrders.map((item) => (
              <div className="trigger-order-row" key={item.triggerOrderId}>
                <strong>{item.symbol}</strong>
                <span>{triggerTypeLabel(item.triggerType)}</span>
                <span className={triggerCloseLabel(item.side, item.positionSide) === "平多" ? "down" : "up"}>
                  {triggerCloseLabel(item.side, item.positionSide)}
                </span>
                <span>{item.triggerType === "TRAILING_STOP"
                  ? `${item.activationPriceTicks ? displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.activationPriceTicks) : "立即"} / ${((item.callbackRatePpm ?? 0) / 10_000).toFixed(2)}%`
                  : displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.triggerPriceTicks)}</span>
                <span>{item.quantitySteps}</span>
                <span>{item.orderType}/{item.timeInForce}</span>
                <span>{item.status}</span>
                <button onClick={() => onCancelTrigger(item)}>撤销</button>
              </div>
            ))}
          </AccountTable>
        )}
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

function TradesTape({ events, symbol, productLine, market, mid, onPickPrice }: { events: WsEnvelope[]; symbol: string; productLine: ProductLine; market?: Market; mid: number; onPickPrice: (priceTicks: number) => void }) {
  const [trades, setTrades] = useState<TradePrint[]>(() => fallbackTrades(symbol, mid).slice(0, TRADE_TAPE_ROWS));

  useEffect(() => {
    setTrades(fallbackTrades(symbol, mid).slice(0, TRADE_TAPE_ROWS));
  }, [symbol]);

  useEffect(() => {
    const liveTrades = buildPublicTrades(events, symbol, productLine, mid, false);
    if (!liveTrades.length) return;
    setTrades((current) => mergeTradeTape(liveTrades, current));
  }, [events, mid, productLine, symbol]);

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
  const isFunding = isFundingProduct(product);
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
      ...(isFunding ? [["资金费率周期", `${market.fundingIntervalHours ?? "-"} 小时`]] as Array<[string, ReactNode]> : []),
      ...(market.expiryTime ? [["到期时间", market.expiryTime]] as Array<[string, ReactNode]> : []),
      ...(market.deliveryTime ? [["交割时间", market.deliveryTime]] as Array<[string, ReactNode]> : []),
      ...(product === "option" ? [
        ["底层标的", market.underlyingSymbol ?? "-"],
        ["行权价", market.strikePriceUnits ?? "-"],
        ["期权方向/行权方式", `${market.optionType ?? "-"} / ${market.optionExerciseStyle ?? "-"}`],
      ] as Array<[string, ReactNode]> : []),
      ...(market.settlementMethod ? [["结算方式", market.settlementMethod]] as Array<[string, ReactNode]> : []),
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
          <p>页面展示的数据来自 instrument 当前版本。现货、永续、交割和期权按产品线隔离撮合与账户，但共享同一套 symbol 规则、订单能力、数量边界、费率和风控配置入口。</p>
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
          <p>现货、U本位/币本位永续、交割和期权都由后端 `instrumentType` 与 `contractType` 区分，前端不维护独立交易对清单。</p>
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
  if (market.instrumentType === "OPTION" || market.contractType === "VANILLA_OPTION") return "option";
  if (market.contractType === "LINEAR_DELIVERY") return "linearDelivery";
  if (market.contractType === "INVERSE_DELIVERY") return "inverseDelivery";
  if (
    market.contractType === "INVERSE_PERPETUAL" ||
    market.contractType === "INVERSE" ||
    (market.settleAsset && market.settleAsset === market.baseAsset)
  ) {
    return "inverse";
  }
  return "linear";
}

function productLineForMarket(market: Market | undefined, fallbackMode: ProductMode): ProductLine {
  return PRODUCT_META[market ? marketProduct(market) : fallbackMode].productLine;
}

function productLineForSymbol(symbol: string, markets: Market[], fallbackMode: ProductMode): ProductLine {
  return productLineForMarket(marketForSymbolAndMode(markets, symbol, fallbackMode), fallbackMode);
}

function marketForSymbolAndMode(markets: Market[], symbol: string, productMode: ProductMode): Market | undefined {
  return markets.find((market) => market.symbol === symbol && marketProduct(market) === productMode)
    ?? markets.find((market) => market.symbol === symbol);
}

function eventProductLine(event: WsEnvelope): ProductLine | undefined {
  const data = asRecord(event.data);
  const value = data?.productLine ?? event.productLine;
  return typeof value === "string" ? value as ProductLine : undefined;
}

function matchesProductLine(event: WsEnvelope, productLine: ProductLine): boolean {
  const eventLine = eventProductLine(event);
  return !eventLine || eventLine === productLine;
}

function filterPositionsByProduct(positions: Position[], markets: Market[], productMode: ProductMode): Position[] {
  if (productMode === "spot") return [];
  const productSymbols = new Set(markets.filter((market) => marketProduct(market) === productMode).map((market) => market.symbol));
  if (!productSymbols.size) return positions;
  return positions.filter((position) => productSymbols.has(position.symbol));
}

function estimateNotional(market: Market | undefined, priceTicks: number, quantitySteps: number): number {
  if (!Number.isFinite(priceTicks) || !Number.isFinite(quantitySteps)) return 0;
  if (isInverseProduct(marketProduct(market))) {
    return quantitySteps * (market?.notionalMultiplierUnits ?? 1);
  }
  return priceTicks * quantitySteps * (market?.notionalMultiplierUnits ?? 1);
}

function isInverseProduct(productMode: ProductMode): boolean {
  return productMode === "inverse" || productMode === "inverseDelivery";
}

function isFundingProduct(productMode: ProductMode): boolean {
  return productMode === "linear" || productMode === "inverse";
}

function buildPublicTrades(
  events: WsEnvelope[],
  symbol: string,
  productLine: ProductLine,
  mid: number,
  includeFallback = true
): TradePrint[] {
  const liveTrades = events
    .filter((event) => event.channel === "trades"
      && matchesProductLine(event, productLine)
      && (!event.symbol || event.symbol === symbol))
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

function buildTradeRecords(
  events: WsEnvelope[],
  userId: number | undefined,
  symbol: string,
  productLine: ProductLine,
  mid: number
): TradeRecord[] {
  const records = events
    .filter((event) => {
      if (!matchesProductLine(event, productLine)) return false;
      if (event.symbol && event.symbol !== symbol) return false;
      if (event.channel === "matches") return true;
      if (event.channel !== "executionReports") return false;
      const data = asRecord(event.data);
      return String(data?.reportType ?? "").toUpperCase() === "TRADE";
    })
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
    orderId: asNumber(data.orderId ?? data.takerOrderId ?? data.makerOrderId),
    traceId: typeof data.traceId === "string" ? data.traceId : undefined
  };
}

function userRole(data: unknown, userId: number | undefined): TradeRecord["role"] {
  const record = asRecord(data);
  if (!record || !userId) return "PUBLIC";
  const liquidityRole = String(record.liquidityRole ?? "").toUpperCase();
  if (liquidityRole === "TAKER" || liquidityRole === "MAKER") return liquidityRole;
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
