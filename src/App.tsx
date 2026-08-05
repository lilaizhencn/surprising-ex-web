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
  KeyRound,
  Layers3,
  LogOut,
  MoonStar,
  Plus,
  Radio,
  Search,
  Sparkles,
  ShieldCheck,
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
import { cancelAlgoOrder, cancelOrder, cancelTriggerOrder, changePassword, confirmMfa, createApiKey, disableMfa, enrollMfa, forgotPassword, issueSecurityChallenge, loadApiKeys, loadBalances, loadCandles, loadExchangeRateConversion, loadInstrumentConfig, loadKyc, loadKycDocuments, loadMarkets, loadMarkPrice, loadMfaStatus, loadOpenAlgoOrders, loadOpenOrders, loadOpenTriggerOrders, loadOrderBook, loadPositionMode, loadPositions, loadSecurityScenes, login, placeAlgoOrder, placeOrder, placeTriggerOrder, register, resendEmailVerification, resetPassword, revokeApiKey, submitKyc, updatePositionMode, updateSecurityScene, uploadKycDocument, verifyEmail } from "./api/surprising";
import { compact, config, displayPpm, displayPrice, displayUnits } from "./config";
import { fallbackTrades } from "./mockData";
import { ApiError, loadSession, saveSession } from "./api/client";
import { useRealtime } from "./hooks/useRealtime";
import { AssetIcon, AssetTabs, SupportBubble, assetName, fundingAssets } from "./components/AssetPrimitives";
import { FundingFlowPage } from "./components/FundingFlowPage";
import { ProductTransferDialog } from "./components/ProductTransferDialog";
import { applyMarketPriceTicks, priceFromTicks, ValuationRequestGuard } from "./valuation";
import type { AlgoOrder, AlgoOrderType, ApiKeyView, AuthSession, Balance, CandlePoint, KycDocument, KycProfile, MarginMode, Market, MfaEnrollment, MfaStatus, OpenOrder, OpenTriggerOrder, OrderBookLevel, OrderSide, OrderType, PlaceAlgoOrderDraft, PlaceOrderDraft, PlaceTriggerOrderDraft, Position, PositionMode, PositionSide, ProductAccountType, ProductLine, ProductMode, SecurityScene, TimeInForce, TradePrint, TradeRecord, TriggerOrderType, ValuationCurrency, WsEnvelope } from "./types";
import "./styles.css";

type AuthMode = "login" | "register";
type AuthStep = AuthMode | "forgot" | "verify" | "reset";
type Page = "trade" | "rules" | "assets" | "recharge" | "withdraw" | "security";
type ThemeMode = "dark" | "light";
type LanguageMode = "zh-CN" | "en-US";
type FundingBalanceState = "idle" | "loading" | "ready" | "error";
type PickedPrice = { value: number; nonce: number };
type TriggerCloseTarget = "LONG" | "SHORT";
type TriggerLevelInput = {
  id: string;
  triggerType: TriggerOrderType;
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

const PRIVATE_REFRESH_CHANNELS = new Set(["orders", "positions", "positionRisk", "accountRisk", "matches", "executionReports"]);
const PRIVATE_CHANNELS = new Set([...PRIVATE_REFRESH_CHANNELS, "triggerOrders"]);
const THEME_KEY = "surprising-ex.theme";
const LANGUAGE_KEY = "surprising-ex.language";
const PRODUCT_ROUTES: Record<ProductMode, string> = {
  linear: "/trade/usdt-perpetual",
  inverse: "/trade/coin-perpetual",
  linearDelivery: "/trade/usdt-delivery",
  inverseDelivery: "/trade/coin-delivery",
  option: "/trade/option",
  spot: "/trade/spot"
};
const PRODUCT_META: Record<ProductMode, { label: string; labelEn: string; shortLabel: string; shortLabelEn: string; accountType: ProductAccountType; productLine: ProductLine }> = {
  linear: { label: "U本位永续", labelEn: "USDT Perpetual", shortLabel: "U本位永续", shortLabelEn: "USDT Perpetual", accountType: "USDT_PERPETUAL", productLine: "LINEAR_PERPETUAL" },
  inverse: { label: "币本位永续", labelEn: "Coin Perpetual", shortLabel: "币本位永续", shortLabelEn: "Coin Perpetual", accountType: "COIN_PERPETUAL", productLine: "INVERSE_PERPETUAL" },
  linearDelivery: { label: "U本位交割", labelEn: "USDT Delivery", shortLabel: "U本位交割", shortLabelEn: "USDT Delivery", accountType: "USDT_DELIVERY", productLine: "LINEAR_DELIVERY" },
  inverseDelivery: { label: "币本位交割", labelEn: "Coin Delivery", shortLabel: "币本位交割", shortLabelEn: "Coin Delivery", accountType: "COIN_DELIVERY", productLine: "INVERSE_DELIVERY" },
  option: { label: "期权", labelEn: "Options", shortLabel: "期权", shortLabelEn: "Options", accountType: "OPTION", productLine: "OPTION" },
  spot: { label: "现货", labelEn: "Spot", shortLabel: "现货", shortLabelEn: "Spot", accountType: "SPOT", productLine: "SPOT" }
};

function localized(language: LanguageMode, zh: string, en: string): string {
  return language === "en-US" ? en : zh;
}

function routeStateFromLocation(): { page: Page; productMode: ProductMode } {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const productMode = productModeFromPath(path) ?? "linear";
  if (path === "/rules") return { page: "rules", productMode };
  if (path === "/assets") return { page: "assets", productMode };
  if (path === "/recharge") return { page: "recharge", productMode };
  if (path === "/withdraw") return { page: "withdraw", productMode };
  if (path === "/security") return { page: "security", productMode };
  return { page: "trade", productMode };
}

function productModeFromPath(path: string): ProductMode | null {
  const matched = (Object.entries(PRODUCT_ROUTES) as Array<[ProductMode, string]>)
    .find(([, route]) => path === route);
  return matched?.[0] ?? null;
}

function routeForPage(page: Page, productMode: ProductMode): string {
  if (page === "trade") return PRODUCT_ROUTES[productMode];
  return `/${page}`;
}

function pushRoute(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
}

export default function App() {
  const initialRoute = routeStateFromLocation();
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [markets, setMarkets] = useState<Market[]>([]);
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [fundingBalances, setFundingBalances] = useState<Balance[]>([]);
  const [fundingBalanceState, setFundingBalanceState] = useState<FundingBalanceState>("idle");
  const [valuationCurrency, setValuationCurrency] = useState<ValuationCurrency>(() => {
    const stored = localStorage.getItem("surprising.valuationCurrency");
    return stored === "USD" || stored === "CNY" ? stored : "USDT";
  });
  const [valuationRates, setValuationRates] = useState<Partial<Record<ValuationCurrency, number>>>({ USDT: 1 });
  const [valuationRateState, setValuationRateState] = useState<FundingBalanceState>("loading");
  const [valuationMarketState, setValuationMarketState] = useState<FundingBalanceState>("loading");
  const [valuationPrices, setValuationPrices] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [openOrdersNextCursor, setOpenOrdersNextCursor] = useState<string | null>(null);
  const [openOrdersHasMore, setOpenOrdersHasMore] = useState(false);
  const [loadingMoreOpenOrders, setLoadingMoreOpenOrders] = useState(false);
  const [algoOrders, setAlgoOrders] = useState<AlgoOrder[]>([]);
  const [triggerOrders, setTriggerOrders] = useState<OpenTriggerOrder[]>([]);
  const [positionMode, setPositionMode] = useState<PositionMode>("ONE_WAY");
  const [notice, setNotice] = useState("连接后端中，若服务未启动会进入离线演示数据。");
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [productMode, setProductMode] = useState<ProductMode>(initialRoute.productMode);
  const [marketSearch, setMarketSearch] = useState("");
  const [klinePeriod, setKlinePeriod] = useState<string>("1m");
  const [theme, setTheme] = useState<ThemeMode>(() => localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");
  const [language, setLanguage] = useState<LanguageMode>(() => localStorage.getItem(LANGUAGE_KEY) === "en-US" ? "en-US" : "zh-CN");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [instrumentInfoOpen, setInstrumentInfoOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [pickedPrice, setPickedPrice] = useState<PickedPrice | null>(null);
  const processedPrivateEventKeysRef = useRef<Set<string>>(new Set());
  const processedTriggerEventKeysRef = useRef<Set<string>>(new Set());
  const triggerOrderEventVersionsRef = useRef<Map<number, number>>(new Map());
  const processedPublicEventKeysRef = useRef<Set<string>>(new Set());
  const marketDataRequestRef = useRef(0);
  const openOrdersRequestRef = useRef(0);
  const valuationRequestGuardRef = useRef(new ValuationRequestGuard());
  const marketsRef = useRef<Market[]>([]);

  useEffect(() => {
    marketsRef.current = markets;
  }, [markets]);

  useEffect(() => {
    processedTriggerEventKeysRef.current.clear();
    triggerOrderEventVersionsRef.current.clear();
  }, [session?.user.userId]);

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
    void loadMarkets(false).then((items) => {
      setMarkets(items);
      setValuationPrices({});
      setValuationMarketState("ready");
      if (items[0]) setSymbol((current) => items.some((item) => item.symbol === current) ? current : items[0].symbol);
    }).catch(() => {
      setValuationMarketState("error");
      setValuationPrices({});
      void loadMarkets().then((items) => {
        setMarkets(items);
        if (items[0]) setSymbol((current) => items.some((item) => item.symbol === current) ? current : items[0].symbol);
      }).catch(() => {
        setNotice("交易对服务暂不可用，请稍后重试");
      });
    });
  }, []);

  useEffect(() => {
    if (!session) {
      setFundingBalances([]);
      setFundingBalanceState("idle");
      return;
    }
    let cancelled = false;
    setFundingBalanceState("loading");
    void loadBalances(session, "SPOT", "SPOT", false).then((nextBalances) => {
      if (!cancelled) {
        setFundingBalances(nextBalances);
        setFundingBalanceState("ready");
      }
    }).catch(() => {
      if (!cancelled) {
        setFundingBalances([]);
        setFundingBalanceState("error");
      }
    });
    return () => { cancelled = true; };
  }, [session?.accessToken]);

  useEffect(() => {
    let cancelled = false;
    setValuationRateState("loading");
    void Promise.allSettled([
      loadExchangeRateConversion(1, "USDT", "USD"),
      loadExchangeRateConversion(1, "USDT", "CNY")
    ]).then(([usd, cny]) => {
      if (cancelled) return;
      const nextRates: Partial<Record<ValuationCurrency, number>> = { USDT: 1 };
      if (usd.status === "fulfilled" && Number.isFinite(usd.value.convertedAmount) && usd.value.convertedAmount > 0) {
        nextRates.USD = usd.value.convertedAmount;
      }
      if (cny.status === "fulfilled" && Number.isFinite(cny.value.convertedAmount) && cny.value.convertedAmount > 0) {
        nextRates.CNY = cny.value.convertedAmount;
      }
      setValuationRates(nextRates);
      setValuationRateState("ready");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (valuationMarketState !== "ready") return;
    let cancelled = false;
    const refreshSpotPrices = async () => {
      const requestGeneration = valuationRequestGuardRef.current.begin();
      const currentMarkets = marketsRef.current;
      const targetMarkets = Array.from(new Map(
        fundingBalances
          .filter((balance) => balance.asset.toUpperCase() !== "USDT")
          .map((balance) => {
            const market = currentMarkets.find((item) => item.instrumentType === "SPOT"
              && item.baseAsset.toUpperCase() === balance.asset.toUpperCase()
              && item.quoteAsset.toUpperCase() === "USDT");
            return market ? [balance.asset.toUpperCase(), market] as const : null;
          })
          .filter((item): item is readonly [string, Market] => item !== null)
      ).values());
      if (targetMarkets.length !== fundingBalances.filter((balance) => balance.asset.toUpperCase() !== "USDT").length) {
        if (!cancelled && valuationRequestGuardRef.current.isCurrent(requestGeneration)) {
          setValuationMarketState("error");
        }
        return;
      }
      try {
        const books = await Promise.all(targetMarkets.map((market) => loadOrderBook(market.symbol, "SPOT", false)));
        const prices = new Map<string, number>();
        const priceTicksBySymbol = new Map<string, number>();
        targetMarkets.forEach((market, index) => {
          const book = books[index];
          const bid = book.bids[0]?.priceTicks;
          const ask = book.asks[0]?.priceTicks;
          const priceTicks = bid && ask ? (bid + ask) / 2 : bid ?? ask;
          if (priceTicks === undefined || !Number.isFinite(priceTicks) || priceTicks <= 0) throw new Error("spot order book is empty");
          const priceUnits = priceFromTicks(market, priceTicks);
          if (!Number.isFinite(priceUnits) || priceUnits <= 0) throw new Error("spot order book price is invalid");
          prices.set(market.baseAsset.toUpperCase(), priceUnits);
          priceTicksBySymbol.set(market.symbol, priceTicks);
        });
        if (cancelled || !valuationRequestGuardRef.current.isCurrent(requestGeneration)) return;
        setValuationPrices(Object.fromEntries(prices));
        setMarkets((current) => applyMarketPriceTicks(current, priceTicksBySymbol));
      } catch {
        if (!cancelled && valuationRequestGuardRef.current.isCurrent(requestGeneration)) {
          setValuationPrices({});
          setValuationMarketState("error");
        }
      }
    };
    void refreshSpotPrices();
    const timer = window.setInterval(() => { void refreshSpotPrices(); }, 30_000);
    return () => {
      cancelled = true;
      valuationRequestGuardRef.current.invalidate();
      window.clearInterval(timer);
    };
  }, [fundingBalances, valuationMarketState]);

  function changeValuationCurrency(next: ValuationCurrency) {
    setValuationCurrency(next);
    localStorage.setItem("surprising.valuationCurrency", next);
  }

  async function refreshFundingBalances(active = session): Promise<void> {
    if (!active) return;
    setFundingBalanceState("loading");
    try {
      const nextBalances = await loadBalances(active, "SPOT", "SPOT", false);
      if (active.accessToken === session?.accessToken) {
        setFundingBalances(nextBalances);
        setFundingBalanceState("ready");
      }
    } catch {
      if (active.accessToken === session?.accessToken) {
        setFundingBalances([]);
        setFundingBalanceState("error");
      }
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      const nextRoute = routeStateFromLocation();
      setPage(nextRoute.page);
      setProductMode(nextRoute.productMode);
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    if (!visibleMarkets.length) return;
    if (!visibleMarkets.some((market) => market.symbol === symbol)) {
      setSymbol(visibleMarkets[0].symbol);
    }
  }, [symbol, visibleMarkets]);

  useEffect(() => {
    let alive = true;
    void loadInstrumentConfig(symbol, activeProductLine).then((instrument) => {
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
    }).catch(() => {
      if (alive) setNotice("交易对配置暂不可用，请稍后重试");
    });
    return () => {
      alive = false;
    };
  }, [activeProductLine, activeProductMode, symbol]);

  useEffect(() => {
    void refreshMarketData();
  }, [activeProductLine, klinePeriod, symbol]);

  useEffect(() => {
    if (session) void refreshPrivateData(session);
  }, [activeProductMode, markets, session, symbol]);

  useEffect(() => {
    if (!session) return;
    const privateEvents = nextRealtimeEvents(
      realtime.events,
      processedPrivateEventKeysRef,
      (event) => Boolean(event.channel && PRIVATE_REFRESH_CHANNELS.has(event.channel)
        && matchesProductLine(event, activeProductLine))
    );
    if (!privateEvents.length) return;
    const timer = window.setTimeout(() => void refreshPrivateData(session), 250);
    return () => window.clearTimeout(timer);
  }, [activeProductLine, productMode, realtime.events, session, symbol]);

  useEffect(() => {
    if (!session || realtime.privateConnectionVersion <= 0) return;
    void refreshPrivateData(session);
  }, [realtime.privateConnectionVersion]);

  useEffect(() => {
    if (!session) return;
    const updates = nextRealtimeEvents(
      realtime.events,
      processedTriggerEventKeysRef,
      (event) => event.op === "event" && event.channel === "triggerOrders"
        && matchesProductLine(event, activeProductLine)
    );
    for (const event of updates) {
      const data = asRecord(event.data);
      const order = asRecord(data?.order);
      if (!data || !order) continue;
      const triggerOrderId = asNumber(order.triggerOrderId);
      const eventId = asNumber(data.eventId);
      if (!triggerOrderId || !eventId) continue;
      const eventSymbol = String(order.symbol ?? event.symbol ?? "");
      if (eventSymbol !== symbol) continue;
      const previousEventId = triggerOrderEventVersionsRef.current.get(triggerOrderId) ?? 0;
      if (eventId <= previousEventId) continue;
      triggerOrderEventVersionsRef.current.set(triggerOrderId, eventId);
      const snapshot = order as unknown as OpenTriggerOrder;
      setTriggerOrders((current) => upsertOpenTriggerOrder(current, snapshot));
    }
  }, [activeProductLine, realtime.events, session, symbol]);

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

  function patchMarket(targetSymbol: string, patch: Partial<Market>, targetProductMode?: ProductMode) {
    if (!targetSymbol) return;
    setMarkets((current) => current.map((market) =>
      market.symbol === targetSymbol && (!targetProductMode || marketProduct(market) === targetProductMode)
        ? { ...market, ...patch }
        : market
    ));
  }

  function persistSession(next: AuthSession | null) {
    setSession(next);
    saveSession(next);
    if (next) {
      setAuthMode(null);
      navigateToPage("trade");
      return;
    }
    openOrdersRequestRef.current += 1;
    setBalances([]);
    setFundingBalances([]);
    setFundingBalanceState("idle");
    setPositions([]);
    setOrders([]);
    setOpenOrdersNextCursor(null);
    setOpenOrdersHasMore(false);
    setLoadingMoreOpenOrders(false);
    setAlgoOrders([]);
    setTriggerOrders([]);
    setPositionMode("ONE_WAY");
  }

  function navigateToPage(nextPage: Page) {
    setPage(nextPage);
    pushRoute(routeForPage(nextPage, productMode));
  }

  function openProductPage(nextMode: ProductMode) {
    setProductMode(nextMode);
    setPage("trade");
    setMarketSearch("");
    pushRoute(routeForPage("trade", nextMode));
  }

  function selectMarket(nextSymbol: string) {
    setSymbol(nextSymbol);
    setMarketSearch("");
    navigateToPage("trade");
  }

  function pickOrderPrice(priceTicks: number) {
    if (!Number.isFinite(priceTicks) || priceTicks <= 0) return;
    setPickedPrice({ value: priceTicks, nonce: Date.now() });
  }

  async function refreshMarketData(targetSymbol = symbol, targetPeriod = klinePeriod) {
    const requestId = marketDataRequestRef.current + 1;
    marketDataRequestRef.current = requestId;
    const targetMarket = marketForSymbolAndMode(markets, targetSymbol, productMode);
    const targetProductMode = targetMarket ? marketProduct(targetMarket) : productMode;
    const productLine = PRODUCT_META[targetProductMode].productLine;
    const shouldLoadMarkPrice = targetProductMode !== "spot";
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
      if (markPrice) patchMarket(targetSymbol, markPrice, targetProductMode);
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
    const ordersRequestId = openOrdersRequestRef.current + 1;
    openOrdersRequestRef.current = ordersRequestId;
    setLoadingMoreOpenOrders(false);
    try {
      const accountType = PRODUCT_META[activeProductMode].accountType;
      const productLine = PRODUCT_META[activeProductMode].productLine;
      const [nextBalances, nextPositions, nextOrders, nextAlgoOrders, nextTriggerOrders, nextPositionMode] = await Promise.all([
        loadBalances(active, accountType, productLine),
        activeProductMode === "spot" ? Promise.resolve([]) : loadPositions(active, productLine),
        loadOpenOrders(active, symbol, productLine),
        activeProductMode === "spot" ? Promise.resolve([]) : loadOpenAlgoOrders(active, symbol, productLine),
        activeProductMode === "spot" ? Promise.resolve([]) : loadOpenTriggerOrders(active, symbol, productLine),
        activeProductMode === "spot" ? Promise.resolve<PositionMode>("ONE_WAY") : loadPositionMode(active, productLine)
      ]);
      setBalances(nextBalances);
      setPositions(filterPositionsByProduct(nextPositions, markets, activeProductMode));
      if (ordersRequestId === openOrdersRequestRef.current) {
        setOrders(nextOrders.orders);
        setOpenOrdersNextCursor(nextOrders.nextCursor);
        setOpenOrdersHasMore(nextOrders.hasMore);
      }
      setAlgoOrders(nextAlgoOrders);
      setTriggerOrders(nextTriggerOrders);
      setPositionMode(nextPositionMode);
      setNotice(`${PRODUCT_META[activeProductMode].label}资产、${activeProductMode === "spot" ? "委托" : "持仓和委托"}已从 gateway 同步。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "私有数据同步失败");
    }
  }

  async function loadMoreOpenOrders() {
    const active = session;
    const cursor = openOrdersNextCursor;
    if (!active || !cursor || !openOrdersHasMore || loadingMoreOpenOrders) return;
    const ordersRequestId = openOrdersRequestRef.current + 1;
    openOrdersRequestRef.current = ordersRequestId;
    const selectedSymbol = symbol;
    const productLine = activeProductLine;
    setLoadingMoreOpenOrders(true);
    try {
      const nextPage = await loadOpenOrders(active, selectedSymbol, productLine, cursor);
      if (ordersRequestId !== openOrdersRequestRef.current) return;
      setOrders((current) => {
        const existingOrderIds = new Set(current.map((item) => item.orderId));
        const additions = nextPage.orders.filter((item) => {
          if (existingOrderIds.has(item.orderId)) return false;
          existingOrderIds.add(item.orderId);
          return true;
        });
        return [...current, ...additions];
      });
      setOpenOrdersNextCursor(nextPage.nextCursor);
      setOpenOrdersHasMore(nextPage.hasMore);
    } catch (error) {
      if (ordersRequestId === openOrdersRequestRef.current) {
        setNotice(error instanceof Error ? error.message : "加载更多委托失败");
      }
    } finally {
      if (ordersRequestId === openOrdersRequestRef.current) {
        setLoadingMoreOpenOrders(false);
      }
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
      const savedMode = await updatePositionMode(session, nextMode, activeProductLine);
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
      setOrders((current) => current.filter((item) => item.orderId !== canceled.orderId));
      setNotice(`撤单请求已提交：${order.orderId}`);
      void refreshPrivateData(session);
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
        markets={visibleMarkets}
        marketSearch={marketSearch}
        theme={theme}
        language={language}
        onPageChange={navigateToPage}
        onProductModeChange={openProductPage}
        onMarketSearchChange={setMarketSearch}
        onMarketSelect={selectMarket}
        onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        onLanguageToggle={() => setLanguage((current) => current === "zh-CN" ? "en-US" : "zh-CN")}
        onLogin={() => setAuthMode("login")}
        onRegister={() => setAuthMode("register")}
        onLogout={() => persistSession(null)}
      />

      {page === "rules" ? (
        <TradingRulesPage
          markets={markets}
          selectedMarket={selectedMarket}
          onOpenMarket={(market) => {
            setSymbol(market.symbol);
            openProductPage(marketProduct(market));
          }}
        />
      ) : page === "assets" ? (
        <AssetsPage
          balances={fundingBalances}
          markets={markets}
          fundingBalanceState={fundingBalanceState}
          session={session}
          valuationCurrency={valuationCurrency}
          valuationRates={valuationRates}
          valuationRateState={valuationRateState}
          valuationMarketState={valuationMarketState}
          valuationPrices={valuationPrices}
          onValuationCurrencyChange={changeValuationCurrency}
          onDeposit={() => navigateToPage("recharge")}
          onWithdraw={() => navigateToPage("withdraw")}
          onTransfer={() => setTransferOpen(true)}
          onHelp={() => navigateToPage("rules")}
        />
      ) : page === "recharge" ? (
        <FundingFlowPage
          mode="deposit"
          balances={fundingBalances}
          session={session}
          onFundingBalanceRefresh={() => { void refreshFundingBalances(); }}
          onHelp={() => navigateToPage("rules")}
          onBack={() => navigateToPage("assets")}
          onShowAsset={() => navigateToPage("assets")}
        />
      ) : page === "withdraw" ? (
        <FundingFlowPage
          mode="withdraw"
          balances={fundingBalances}
          session={session}
          onFundingBalanceRefresh={() => { void refreshFundingBalances(); }}
          onHelp={() => navigateToPage("rules")}
          onBack={() => navigateToPage("assets")}
          onShowAsset={() => navigateToPage("assets")}
        />
      ) : page === "security" ? (
        <SecurityPage session={session} onLogin={() => setAuthMode("login")} />
      ) : (
        <div className="terminal-grid" key={productMode}>
          <MarketRail productMode={productMode} markets={visibleMarkets} marketSearch={marketSearch} symbol={symbol} onSearchChange={setMarketSearch} onSelect={selectMarket} />
          <section className="workspace">
            <MarketHeader market={selectedMarket} loading={loading} nowMs={nowMs} onInfo={() => setInstrumentInfoOpen(true)} />
            <DerivativeLifecyclePanel market={selectedMarket} markets={markets} nowMs={nowMs} />
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
              openOrdersHasMore={openOrdersHasMore}
              loadingMoreOpenOrders={loadingMoreOpenOrders}
              algoOrders={algoOrders}
              triggerOrders={triggerOrders}
              trades={tradeRecords}
              market={selectedMarket}
              markets={markets}
              onPositionModeChange={changePositionMode}
              onCancel={submitCancel}
              onLoadMoreOpenOrders={loadMoreOpenOrders}
              onCancelAlgo={submitAlgoCancel}
              onCancelTrigger={submitTriggerCancel}
            />
          </section>
          <aside className="right-stack">
            <TradesTape events={realtime.events} symbol={symbol} productLine={activeProductLine}
              market={selectedMarket} mid={selectedMarket?.lastPriceTicks ?? 65000} onPickPrice={pickOrderPrice} />
            <OrderTicket productMode={activeProductMode} positionMode={positionMode} symbol={symbol} market={selectedMarket} pricePreset={pickedPrice} onSubmit={submitOrder} onSubmitAlgo={submitAlgoOrder} onSubmitTriggers={submitTriggerOrders} />
          </aside>
        </div>
      )}

      {instrumentInfoOpen && selectedMarket && (
        <ContractInfoDialog market={selectedMarket} onClose={() => setInstrumentInfoOpen(false)} />
      )}
      {transferOpen && session && <ProductTransferDialog session={session} balances={fundingBalances} onClose={() => setTransferOpen(false)} onCompleted={() => { void refreshFundingBalances(); }} />}
      {notice && <div className="toast"><Radio size={15} />{notice}</div>}
    </main>
  );
}

function AssetsPage({
  balances,
  markets,
  fundingBalanceState,
  session,
  valuationCurrency,
  valuationRates,
  valuationRateState,
  valuationMarketState,
  valuationPrices,
  onValuationCurrencyChange,
  onDeposit,
  onWithdraw,
  onTransfer,
  onHelp
}: {
  balances: Balance[];
  markets: Market[];
  fundingBalanceState: FundingBalanceState;
  session: AuthSession | null;
  valuationCurrency: ValuationCurrency;
  valuationRates: Partial<Record<ValuationCurrency, number>>;
  valuationRateState: FundingBalanceState;
  valuationMarketState: FundingBalanceState;
  valuationPrices: Record<string, number>;
  onValuationCurrencyChange: (currency: ValuationCurrency) => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onTransfer: () => void;
  onHelp: () => void;
}) {
  const [compactTable, setCompactTable] = useState(false);
  const assets = fundingAssets(balances);
  const valuationRate = valuationRates[valuationCurrency];
  const assetValues = assets.map((asset) => {
    const usdtPrice = assetValuationPrice(asset.asset, valuationPrices);
    return usdtPrice === null || valuationRate === undefined
      ? null
      : unitsToNumber(asset.equityUnits) * usdtPrice * valuationRate;
  });
  const hasFundingBalances = fundingBalanceState === "ready";
  const hasValuation = hasFundingBalances
    && valuationRateState === "ready"
    && valuationMarketState === "ready"
    && assetValues.every((value) => value !== null);
  const totalValue = hasValuation ? assetValues.reduce((sum, value) => sum + (value ?? 0), 0) : null;

  return (
    <section className="asset-page">
      <AssetTabs active="资产总览" />
      <div className="asset-layout">
        <div className="asset-main">
          <section className="asset-summary-card">
            <div>
              <p className="asset-label">资金账户估值 <Eye size={15} /></p>
              <h1>{totalValue === null ? "—" : formatValuation(totalValue, valuationCurrency)} <span><select className="asset-valuation-select" value={valuationCurrency} onChange={(event) => onValuationCurrencyChange(event.target.value as ValuationCurrency)} aria-label="估值货币"><option value="USDT">USDT</option><option value="USD">USD</option><option value="CNY">CNY</option></select><ChevronDown size={13} /></span></h1>
              <p className="asset-login-note">{hasValuation ? "按实时市场价估值，收益以资金账本为准" : "行情或汇率未同步，已隐藏估值"}</p>
              <div className="asset-actions">
                <button className="active" onClick={onDeposit}>充币</button>
                <button onClick={onWithdraw}>提币</button>
                <button onClick={onTransfer}>资金划转</button>
              </div>
            </div>
            <ChevronDown className="asset-card-chevron" size={24} />
          </section>

          <section className={`asset-portfolio-card${compactTable ? " compact" : ""}`}>
            <h2>资产组合</h2>
            <div className="portfolio-cards">
              <PortfolioBox icon={<WalletCards size={18} />} title="资金账户" value={totalValue === null ? "—" : formatValuation(totalValue, valuationCurrency)} />
              <PortfolioBox icon={<Activity size={18} />} title="交易账户" value="—" />
              <PortfolioBox icon={<Coins size={18} />} title="赚币" value="—" />
            </div>
            <div className="asset-table-toolbar">
              <div className="asset-search"><Search size={16} />搜索</div>
              <button type="button" aria-label="切换资产列表密度" title="切换资产列表密度" aria-pressed={compactTable} onClick={() => setCompactTable((current) => !current)}><TableProperties size={16} /></button>
            </div>
            <h3>代币</h3>
            <div className="pc-asset-row pc-asset-head"><span>名称</span><span>数量</span><span>估值/现货收益</span></div>
            {assets.map((asset, index) => {
              const amount = unitsToNumber(asset.equityUnits);
              const value = valuationMarketState === "ready" ? assetValues[index] : null;
              return (
                <div className="pc-asset-row" key={`${asset.accountType}-${asset.asset}`}>
                  <span className="pc-asset-name"><AssetIcon symbol={asset.asset} /><strong>{asset.asset}</strong><small>{assetName(asset.asset)}</small></span>
                  <span>{displayUnits(asset.equityUnits, 8)}</span>
                  <span><strong>{value === null ? "—" : formatValuation(value, valuationCurrency)}</strong><small>实时估值</small></span>
                </div>
              );
            })}
            {!session && <p className="asset-login-note">登录后可同步真实资产和资金记录。</p>}
            {session && fundingBalanceState === "loading" && <p className="asset-login-note">正在同步资金账户真实余额…</p>}
            {session && fundingBalanceState === "error" && <p className="asset-login-note" role="alert">资金账户数据暂不可用，已隐藏余额，请稍后重试。</p>}
            {session && hasFundingBalances && !hasValuation && <p className="asset-login-note" role="status">部分资产缺少可用市场价格或汇率，估值将在同步完成后显示。</p>}
          </section>
        </div>

        <aside className="recent-ledger-card">
          <div className="ledger-title"><h3>近期资金账单</h3></div>
          <p className="asset-login-note">真实资金流水将在资金账户记录同步后显示。</p>
        </aside>
      </div>
      <SupportBubble onOpen={onHelp} />
    </section>
  );
}

function formatKycFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateKycSubmission(
  applicantType: string,
  kycLevel: string,
  faceVerificationStatus: string,
  provider: string,
  providerReference: string,
  documents: KycDocument[]
) {
  const types = new Set(documents.map((document) => document.documentType));
  if (!types.has("ID_CARD") && !types.has("PASSPORT")) throw new Error("请上传身份证或护照。");
  if (applicantType === "BUSINESS" && !types.has("BUSINESS_LICENSE")) throw new Error("企业认证还需要上传营业执照。");
  if ((kycLevel === "STANDARD" || kycLevel === "ENHANCED") && !types.has("ADDRESS_PROOF")) throw new Error("标准及以上认证还需要上传地址证明。");
  if (kycLevel === "ENHANCED" && faceVerificationStatus !== "PENDING") throw new Error("增强认证需要启用人脸识别。");
  if (faceVerificationStatus === "PENDING" && !types.has("FACE_IMAGE")) throw new Error("启用人脸识别时还需要上传人脸材料。");
  if (provider === "THIRD_PARTY" && !providerReference.trim()) throw new Error("第三方认证需要填写服务引用。");
}

function SecurityPage({ session, onLogin }: { session: AuthSession | null; onLogin: () => void }) {
  const [mfa, setMfa] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [scenes, setScenes] = useState<SecurityScene[]>([]);
  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [kyc, setKyc] = useState<KycProfile | null>(null);
  const [kycApplicantType, setKycApplicantType] = useState("INDIVIDUAL");
  const [kycLevel, setKycLevel] = useState("STANDARD");
  const [kycCountry, setKycCountry] = useState("");
  const [kycDocumentType, setKycDocumentType] = useState("ID_CARD");
  const [kycUploadType, setKycUploadType] = useState("ID_CARD");
  const [kycUploadedDocuments, setKycUploadedDocuments] = useState<KycDocument[]>([]);
  const [kycFile, setKycFile] = useState<File | null>(null);
  const kycFileInputRef = useRef<HTMLInputElement>(null);
  const [kycProvider, setKycProvider] = useState("SELF");
  const [kycProviderReference, setKycProviderReference] = useState("");
  const [kycFaceStatus, setKycFaceStatus] = useState("NOT_REQUIRED");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changePasswordEmailCode, setChangePasswordEmailCode] = useState("");
  const [changePasswordTotpCode, setChangePasswordTotpCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [securityEmailCode, setSecurityEmailCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [apiTotpCode, setApiTotpCode] = useState("");
  const [apiLabel, setApiLabel] = useState("");
  const [apiPermissions, setApiPermissions] = useState<string[]>(["TRADE"]);
  const [createdSecret, setCreatedSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    if (!session) return;
    const [mfaStatus, securityScenes, apiKeys, kycProfile, uploadedDocuments] = await Promise.all([
      loadMfaStatus(session),
      loadSecurityScenes(session),
      loadApiKeys(session),
      loadKyc(session),
      loadKycDocuments(session)
    ]);
    setMfa(mfaStatus);
    setScenes(securityScenes);
    setKeys(apiKeys);
    setKyc(kycProfile);
    setKycUploadedDocuments(uploadedDocuments);
    if (kycProfile) {
      setKycApplicantType(kycProfile.applicantType || "INDIVIDUAL");
      setKycLevel(kycProfile.kycLevel === "NONE" ? "STANDARD" : kycProfile.kycLevel);
      setKycCountry(kycProfile.country || "");
      setKycDocumentType(kycProfile.documentType || "ID_CARD");
      setKycProvider(kycProfile.provider || "SELF");
      setKycProviderReference(kycProfile.providerReference || "");
      setKycFaceStatus(kycProfile.faceVerificationStatus || "NOT_REQUIRED");
    }
  }

  useEffect(() => {
    setMfa(null);
    setEnrollment(null);
    setScenes([]);
    setKeys([]);
    setKyc(null);
    setKycUploadedDocuments([]);
    setKycFile(null);
    if (session) {
      void reload().catch((cause) => setError(cause instanceof Error ? cause.message : "安全信息加载失败"));
    }
  }, [session?.accessToken]);

  if (!session) {
    return (
      <section className="security-page">
        <section className="panel security-locked">
          <ShieldCheck size={42} />
          <h1>安全中心</h1>
          <p>登录后管理 2FA、敏感操作验证和 API 访问权限。</p>
          <button className="primary-button" onClick={onLogin}>登录后继续</button>
        </section>
      </section>
    );
  }

  async function run(action: () => Promise<void | boolean>, successMessage: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const completed = await action();
      if (completed !== false) setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  function togglePermission(permission: string) {
    setApiPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  }

  async function changeSecurityScene(authSession: AuthSession, scene: SecurityScene): Promise<boolean> {
    try {
      const saved = await updateSecurityScene(authSession, scene.sceneCode, !scene.enabled,
        securityEmailCode || undefined, totpCode || undefined);
      setScenes((current) => current.map((item) => item.sceneCode === saved.sceneCode ? saved : item));
      setSecurityEmailCode("");
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 428) {
        const challenge = await issueSecurityChallenge(authSession, "SECURITY_SETTINGS");
        setNotice(`安全设置需要验证，验证码已发送至 ${challenge.destination}`);
        return false;
      }
      throw cause;
    }
  }

  return (
    <section className="security-page">
      <div className="security-heading">
        <div>
          <span className="auth-eyebrow">CONTROL DECK</span>
          <h1>安全中心</h1>
          <p>邮箱是账户主身份。每项敏感能力都可以<span className="no-wrap">独立开关</span>，变更会留下可追溯记录。</p>
        </div>
        <div className="security-account"><ShieldCheck size={18} />{session.user.email ?? "账户"}</div>
      </div>
      {(notice || error) && <div className={error ? "security-alert error" : "security-alert success"} role={error ? "alert" : "status"}>{error || notice}</div>}
      <div className="security-grid">
        <section className="panel security-card">
          <div className="panel-title"><span><KeyRound size={16} />登录保护</span><strong className={mfa?.enabled ? "tone-up" : "tone-gold"}>{mfa?.enabled ? "已启用" : "未启用"}</strong></div>
          <p className="security-muted">绑定验证器后，关闭安全场景和 API 敏感权限会额外要求动态验证码。</p>
          {!mfa?.enabled && !enrollment && <button className="primary-button" disabled={busy} onClick={() => void run(async () => setEnrollment(await enrollMfa(session)), "已生成 2FA 绑定信息")}>绑定 2FA</button>}
          {enrollment && !mfa?.enabled && (
            <div className="security-enrollment">
              <label>密钥<input readOnly value={enrollment.secret} /></label>
              <label>验证器 URI<input readOnly value={enrollment.provisioningUri} /></label>
              <label>输入验证器 6 位验证码<input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></label>
              <button className="primary-button" disabled={busy || totpCode.length !== 6} onClick={() => void run(async () => { setMfa(await confirmMfa(session, totpCode)); setEnrollment(null); setTotpCode(""); }, "2FA 已启用")}>确认绑定</button>
            </div>
          )}
          {mfa?.enabled && <div className="security-inline-form"><label>关闭 2FA 验证码<input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></label><button className="ghost-button" disabled={busy || totpCode.length !== 6} onClick={() => void run(async () => { setMfa(await disableMfa(session, totpCode)); setTotpCode(""); }, "2FA 已关闭")}>关闭 2FA</button></div>}
        </section>
        <section className="panel security-card">
          <div className="panel-title"><span><ShieldCheck size={16} />敏感场景</span><strong>可配置</strong></div>
          <p className="security-muted">修改安全场景需要邮箱验证；开启 2FA 后还需动态验证码。</p>
          <div className="security-scenes">
            {scenes.map((scene) => <label className="security-scene" key={scene.sceneCode}><span><strong>{scene.label}</strong><small>{scene.sceneCode}</small></span><input type="checkbox" checked={scene.enabled} disabled={busy} onChange={() => void run(() => changeSecurityScene(session, scene), `${scene.label}已更新`)} /></label>)}
          </div>
          <div className="security-verification-row"><label>安全设置邮箱验证码<input value={securityEmailCode} onChange={(event) => setSecurityEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></label><label>2FA 验证码<input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></label><button className="ghost-button" disabled={busy} onClick={() => void run(async () => { await issueSecurityChallenge(session, "SECURITY_SETTINGS"); }, "验证码已发送到邮箱")}>发送验证码</button></div>
        </section>
      </div>
      <section className="panel security-card">
        <div className="panel-title"><span><KeyRound size={16} />修改密码</span><strong>需验证</strong></div>
        <p className="security-muted">修改密码后，其他登录设备的 refresh session 会立即失效。若开启了修改密码场景，请先发送邮箱验证码。</p>
        <div className="security-inline-form">
          <label>当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label>新密码<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 8 位" /></label>
        </div>
        <div className="security-verification-row">
          <label>邮箱验证码<input value={changePasswordEmailCode} onChange={(event) => setChangePasswordEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></label>
          <label>2FA 验证码<input value={changePasswordTotpCode} onChange={(event) => setChangePasswordTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></label>
          <button className="ghost-button" disabled={busy} onClick={() => void run(async () => { await issueSecurityChallenge(session, "CHANGE_PASSWORD"); }, "验证码已发送到邮箱")}>发送验证码</button>
          <button className="primary-button" disabled={busy || !currentPassword || newPassword.length < 8} onClick={() => void run(async () => { await changePassword(session, currentPassword, newPassword, changePasswordEmailCode, changePasswordTotpCode); setCurrentPassword(""); setNewPassword(""); setChangePasswordEmailCode(""); setChangePasswordTotpCode(""); }, "密码已修改，请重新登录其他设备")}>确认修改</button>
        </div>
      </section>
      <section className="panel security-card kyc-card">
        <div className="panel-title"><span><FileText size={16} />身份认证 KYC</span><strong className={kyc?.status === "VERIFIED" ? "tone-up" : kyc?.status === "REJECTED" ? "tone-down" : "tone-gold"}>{kyc?.status ?? "未提交"}</strong></div>
        <p className="security-muted">提币前必须完成 KYC。基础认证需要身份证或护照；标准及以上还需要地址证明；企业认证还需要营业执照；启用人脸识别时需要人脸材料。</p>
        {kyc?.rejectionReason && <div className="security-alert error">审核意见：{kyc.rejectionReason}</div>}
        <div className="kyc-form-grid">
          <label>申请主体<select value={kycApplicantType} onChange={(event) => setKycApplicantType(event.target.value)}><option value="INDIVIDUAL">个人</option><option value="BUSINESS">企业</option></select></label>
          <label>认证等级<select value={kycLevel} onChange={(event) => setKycLevel(event.target.value)}><option value="BASIC">基础</option><option value="STANDARD">标准</option><option value="ENHANCED">增强</option></select></label>
          <label>国家/地区代码<input value={kycCountry} onChange={(event) => setKycCountry(event.target.value.toUpperCase().slice(0, 2))} placeholder="CN" maxLength={2} /></label>
          <label>主证件类型<select value={kycDocumentType} onChange={(event) => setKycDocumentType(event.target.value)}><option value="ID_CARD">身份证</option><option value="PASSPORT">护照</option><option value="BUSINESS_LICENSE">企业营业执照</option></select></label>
          <label>认证服务<select value={kycProvider} onChange={(event) => setKycProvider(event.target.value)}><option value="SELF">平台审核</option><option value="THIRD_PARTY">第三方服务</option></select></label>
          <label>服务引用{kycProvider === "THIRD_PARTY" ? "" : "（可选）"}<input value={kycProviderReference} onChange={(event) => setKycProviderReference(event.target.value)} placeholder={kycProvider === "THIRD_PARTY" ? "第三方返回的核验编号" : "provider-reference"} /></label>
        </div>
        <div className="kyc-upload-grid">
          <label>上传材料类型<select value={kycUploadType} onChange={(event) => setKycUploadType(event.target.value)}><option value="ID_CARD">身份证</option><option value="PASSPORT">护照</option><option value="ADDRESS_PROOF">地址证明</option><option value="BUSINESS_LICENSE">企业营业执照</option><option value="FACE_IMAGE">人脸照片</option></select></label>
          <label>选择 PDF 或图片<input ref={kycFileInputRef} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setKycFile(event.target.files?.[0] ?? null)} /></label>
          <button className="ghost-button" disabled={busy || !kycFile} onClick={() => void run(async () => { if (!kycFile) throw new Error("请选择 KYC 材料"); const uploaded = await uploadKycDocument(session, kycUploadType, kycFile); setKycUploadedDocuments((current) => [uploaded, ...current]); setKycFile(null); if (kycFileInputRef.current) kycFileInputRef.current.value = ""; }, "材料已上传")}>上传材料</button>
        </div>
        <div className="kyc-document-list" aria-live="polite">{kycUploadedDocuments.length === 0 ? <small className="security-muted">尚未上传材料。请至少上传主证件；标准及以上认证请同时上传地址证明。</small> : kycUploadedDocuments.map((document) => <div className="kyc-document-row" key={document.documentId}><span><strong>{document.originalFilename}</strong><small>{document.documentType} · {formatKycFileSize(document.fileSize)}</small></span><em>{document.status === "SUBMITTED" ? "已提交" : "已上传"}</em></div>)}</div>
        <div className="security-inline-form kyc-submit-row"><label>人脸状态<select value={kycFaceStatus} onChange={(event) => setKycFaceStatus(event.target.value)}><option value="NOT_REQUIRED">暂不启用</option><option value="PENDING">等待人脸识别</option></select></label><button className="primary-button" disabled={busy || !kycCountry || kycCountry.length !== 2 || kycUploadedDocuments.length === 0} onClick={() => void run(async () => { validateKycSubmission(kycApplicantType, kycLevel, kycFaceStatus, kycProvider, kycProviderReference, kycUploadedDocuments); setKyc(await submitKyc(session, { applicantType: kycApplicantType, kycLevel, country: kycCountry, documentType: kycDocumentType, provider: kycProvider, providerReference: kycProviderReference || undefined, faceVerificationStatus: kycFaceStatus, documentIds: kycUploadedDocuments.map((document) => document.documentId) })); }, "KYC 已提交，等待审核")}>提交认证</button></div>
      </section>
      <section className="panel security-card api-key-card">
        <div className="panel-title"><span><KeyRound size={16} />API Key</span><strong>兼容交易 API</strong></div>
        <p className="security-muted">Secret 只在创建成功时显示一次。提现权限默认关闭，签名、时间戳和幂等键由服务端校验。</p>
        <div className="api-key-create">
          <label>名称<input value={apiLabel} onChange={(event) => setApiLabel(event.target.value)} placeholder="例如：量化主账户" /></label>
          <div className="permission-picker">{["TRADE", "WITHDRAW"].map((permission) => <label key={permission}><input type="checkbox" checked={apiPermissions.includes(permission)} onChange={() => togglePermission(permission)} />{permission === "TRADE" ? "交易" : "提现"}</label>)}</div>
          <button className="primary-button" disabled={busy || !apiLabel.trim()} onClick={() => void run(async () => { const created = await createApiKey(session, apiLabel.trim(), apiPermissions, emailCode, apiTotpCode); setCreatedSecret(created.secret); setApiLabel(""); setEmailCode(""); setApiTotpCode(""); await reload(); }, "API Key 已创建，请立即保存 Secret")}>创建 Key</button>
        </div>
        <div className="security-verification-row"><label>邮箱验证码<input value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></label><label>2FA 验证码<input value={apiTotpCode} onChange={(event) => setApiTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></label><button className="ghost-button" disabled={busy} onClick={() => void run(async () => { await issueSecurityChallenge(session, "SECURITY_SETTINGS"); }, "验证码已发送到邮箱")}>发送邮箱验证码</button></div>
        {createdSecret && <div className="secret-reveal"><strong>Secret 仅显示这一次</strong><code>{createdSecret}</code><button className="ghost-button" onClick={() => void navigator.clipboard?.writeText(createdSecret)}>复制 Secret</button></div>}
        <div className="api-key-list">{keys.length === 0 ? <p className="empty">暂无 API Key</p> : keys.map((apiKey) => <div className="api-key-row" key={apiKey.apiKey}><div><strong>{apiKey.label}</strong><small>{apiKey.apiKey} · {apiKey.permissions}</small></div><span className={apiKey.status === "ACTIVE" ? "tone-up" : "security-muted"}>{apiKey.status}</span>{apiKey.status === "ACTIVE" && <button className="ghost-button danger" disabled={busy} onClick={() => void run(async () => { await revokeApiKey(session, apiKey.apiKey, emailCode, apiTotpCode); await reload(); }, "API Key 已撤销")}>撤销</button>}</div>)}</div>
      </section>
    </section>
  );
}

function PortfolioBox({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return <div className="portfolio-box"><span>{icon}</span><small>{title}</small><strong>{value}</strong></div>;
}

function unitsToNumber(units: number): number {
  return units / 100_000_000;
}

function assetValuationPrice(asset: string, valuationPrices: Record<string, number>): number | null {
  if (asset.toUpperCase() === "USDT") return 1;
  const price = valuationPrices[asset.toUpperCase()];
  return Number.isFinite(price) && price > 0 ? price : null;
}

function formatValuation(value: number, currency: ValuationCurrency): string {
  const amount = value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === "CNY") return `¥${amount}`;
  if (currency === "USD") return `$${amount}`;
  return `${amount} USDT`;
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
  const [step, setStep] = useState<AuthStep>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingSession, setPendingSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const statusDescription = error || notice ? "auth-status" : undefined;

  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (step === "forgot") {
        await forgotPassword(email);
        setStep("reset");
        setNotice("如果该邮箱已注册，验证码已发送。请检查收件箱和垃圾邮件。");
      } else if (step === "reset") {
        await resetPassword(email, code, password);
        setStep("login");
        setCode("");
        setPassword("");
        setNotice("密码已更新，请使用新密码登录。");
      } else if (step === "verify" && pendingSession) {
        const verified = await verifyEmail(pendingSession, email, code);
        if (!verified) throw new Error("验证码无效或已过期");
        onAuthenticated(pendingSession);
      } else {
        const session = step === "login" ? await login(email, password) : await register(email, password);
        if (step === "register" && session.requiresEmailVerification !== false) {
          setPendingSession(session);
          setStep("verify");
          setNotice("验证码已发送到你的邮箱，请完成验证后进入交易。");
        } else {
          onAuthenticated(session);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "认证失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <button disabled={busy} className="auth-logo" onClick={onBack}>
          <span><Sparkles size={25} /></span>
          <strong>Surprising EX</strong>
        </button>
        {step === "login" || step === "register" ? (
          <div className="auth-tabs">
            <button disabled={busy} className={step === "login" ? "active" : ""} onClick={() => { setStep("login"); setError(""); setNotice(""); }}>登录</button>
            <button disabled={busy} className={step === "register" ? "active" : ""} onClick={() => { setStep("register"); setError(""); setNotice(""); }}>注册</button>
          </div>
        ) : (
          <div className="auth-step-heading">
            <span className="auth-eyebrow">SECURE ACCESS</span>
            <h2>{step === "verify" ? "验证邮箱" : step === "reset" ? "设置新密码" : "找回密码"}</h2>
          </div>
        )}
        {step !== "verify" && (
          <label>
            邮箱地址
            <input value={email} onChange={(event) => setEmail(event.target.value.trim())} type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" aria-invalid={error ? true : undefined} aria-describedby={statusDescription} />
          </label>
        )}
        {step === "verify" && <p className="hint">验证码已发送至 {email.replace(/(^.).*(@.*$)/, "$1•••$2")}，有效期 10 分钟。</p>}
        {(step === "login" || step === "register") && (
          <label>
            密码
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={step === "login" ? "current-password" : "new-password"} placeholder="至少 8 位" aria-invalid={error ? true : undefined} aria-describedby={statusDescription} />
          </label>
        )}
        {(step === "verify" || step === "reset") && (
          <label>
            邮箱验证码
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 位数字" aria-invalid={error ? true : undefined} aria-describedby={statusDescription} />
          </label>
        )}
        {step === "reset" && (
          <label>
            新密码
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="至少 8 位" aria-invalid={error ? true : undefined} aria-describedby={statusDescription} />
          </label>
        )}
        {step === "login" && <button disabled={busy} className="link-button" onClick={() => { setStep("forgot"); setError(""); setNotice(""); }}>忘记密码？</button>}
        {notice && <p id="auth-status" className="success" role="status" aria-live="polite">{notice}</p>}
        {error && <p id="auth-status" className="error" role="alert" aria-live="assertive">{error}</p>}
        <button className="primary-button" disabled={busy} onClick={submit}>
          {busy ? "处理中..." : step === "login" ? "进入交易舱" : step === "register" ? "创建账户" : step === "verify" ? "完成邮箱验证" : step === "reset" ? "更新密码" : "发送验证码"}
        </button>
        {step === "verify" && pendingSession && <button className="ghost-button" disabled={busy} onClick={async () => { setBusy(true); setError(""); setNotice(""); try { await resendEmailVerification(pendingSession); setNotice("新的验证码已发送。"); } catch (err) { setError(err instanceof Error ? err.message : "验证码发送失败"); } finally { setBusy(false); } }}>重新发送验证码</button>}
        {(step === "forgot" || step === "reset") && <button disabled={busy} className="ghost-button" onClick={() => { setStep("login"); setError(""); setNotice(""); }}>返回登录</button>}
        <button disabled={busy} className="ghost-button" onClick={onBack}>返回行情</button>
      </section>
    </main>
  );
}

function Topbar({
  session,
  page,
  productMode,
  markets,
  marketSearch,
  theme,
  language,
  onPageChange,
  onProductModeChange,
  onMarketSearchChange,
  onMarketSelect,
  onThemeToggle,
  onLanguageToggle,
  onLogin,
  onRegister,
  onLogout
}: {
  session: AuthSession | null;
  page: Page;
  productMode: ProductMode;
  markets: Market[];
  marketSearch: string;
  theme: ThemeMode;
  language: LanguageMode;
  onPageChange: (page: Page) => void;
  onProductModeChange: (mode: ProductMode) => void;
  onMarketSearchChange: (value: string) => void;
  onMarketSelect: (symbol: string) => void;
  onThemeToggle: () => void;
  onLanguageToggle: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
}) {
  const [mobileProductsOpen, setMobileProductsOpen] = useState(false);
  const query = marketSearch.trim().toUpperCase();
  const searchResults = query
    ? markets.filter((market) => `${market.symbol} ${market.displayName}`.toUpperCase().includes(query)).slice(0, 6)
    : [];

  function openMarket(symbol: string) {
    onMarketSelect(symbol);
    onMarketSearchChange("");
    onPageChange("trade");
  }

  return (
    <header className={mobileProductsOpen ? "topbar product-menu-open" : "topbar"}>
      <button className="brand platform-brand" onClick={() => onPageChange("trade")}>
        <span className="platform-mark"><Sparkles size={16} /></span>
        <strong>Surprising EX</strong>
      </button>
      <nav>
        <button className={page === "trade" && productMode === "linear" ? "active" : ""} onClick={() => onProductModeChange("linear")}><CircleDollarSign size={15} />{localized(language, "U本位", "USDT")}</button>
        <button className={page === "trade" && productMode === "inverse" ? "active" : ""} onClick={() => onProductModeChange("inverse")}><Layers3 size={15} />{localized(language, "币本位", "Coin")}</button>
        <button className={page === "trade" && productMode === "linearDelivery" ? "active" : ""} onClick={() => onProductModeChange("linearDelivery")}><Clock3 size={15} />{localized(language, "U交割", "USDT Delivery")}</button>
        <button className={page === "trade" && productMode === "inverseDelivery" ? "active" : ""} onClick={() => onProductModeChange("inverseDelivery")}><Clock3 size={15} />{localized(language, "币交割", "Coin Delivery")}</button>
        <button className={page === "trade" && productMode === "option" ? "active" : ""} onClick={() => onProductModeChange("option")}><Sparkles size={15} />{localized(language, "期权", "Options")}</button>
        <button className={page === "trade" && productMode === "spot" ? "active" : ""} onClick={() => onProductModeChange("spot")}><WalletCards size={15} />{localized(language, "现货", "Spot")}</button>
        <button className={page === "rules" ? "active" : ""} onClick={() => onPageChange("rules")}><FileText size={15} />{localized(language, "交易规则", "Rules")}</button>
      </nav>
      <div className="top-actions">
        <div className="top-search-wrap">
          <label className="top-search">
            <Search size={14} />
            <input
              value={marketSearch}
              onChange={(event) => onMarketSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults[0]) {
                  openMarket(searchResults[0].symbol);
                }
              }}
              placeholder={`${localized(language, "搜索", "Search ")}${language === "en-US" ? PRODUCT_META[productMode].shortLabelEn : PRODUCT_META[productMode].shortLabel}`}
            />
          </label>
          {searchResults.length > 0 && (
            <div className="top-search-results">
              {searchResults.map((market) => (
                <button key={market.symbol} onClick={() => openMarket(market.symbol)}>
                  <span>{market.symbol}</span>
                  <small>{market.displayName}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="asset-charge" onClick={() => onPageChange("recharge")}>{localized(language, "充值", "Deposit")}</button>
        <button className={page === "assets" ? "user-pill active" : "user-pill"} onClick={() => onPageChange("assets")}>{localized(language, "资产管理", "Assets")}<ChevronDown size={13} /></button>
        <button className={page === "security" ? "user-pill active" : "user-pill"} onClick={() => onPageChange("security")}><ShieldCheck size={14} />{localized(language, "安全中心", "Security")}</button>
        <button onClick={onThemeToggle} aria-label={localized(language, "切换明暗主题", "Toggle theme")}>{theme === "dark" ? <Sun size={16} /> : <MoonStar size={16} />}</button>
        <button onClick={onLanguageToggle} aria-label={localized(language, "切换语言", "Switch language")}>{language === "zh-CN" ? "EN" : "中文"}</button>
        <button className="mobile-product-toggle" aria-expanded={mobileProductsOpen} aria-controls="mobile-product-menu" onClick={() => setMobileProductsOpen((current) => !current)}><Layers3 size={14} />{localized(language, "产品线", "Products")}</button>
        {session ? (
          <>
            <button className="user-pill mobile-account" aria-label="打开安全中心" onClick={() => onPageChange("security")}><ShieldCheck size={14} /><span>{session.user.email ?? "账户"}</span></button>
            <button className="logout-button mobile-logout" aria-label={localized(language, "退出登录", "Log out")} onClick={onLogout}><LogOut size={16} /><span>{localized(language, "退出", "Log out")}</span></button>
          </>
        ) : (
          <>
            <button className="auth-entry" onClick={onLogin}>{localized(language, "登录", "Log in")}</button>
            <button className="auth-entry" onClick={onRegister}>{localized(language, "注册", "Sign up")}</button>
          </>
        )}
      </div>
      {mobileProductsOpen && <div className="mobile-products-menu" id="mobile-product-menu">{(Object.entries(PRODUCT_META) as Array<[ProductMode, typeof PRODUCT_META[ProductMode]]>).map(([mode, meta]) => <button key={mode} onClick={() => { onProductModeChange(mode); setMobileProductsOpen(false); }}>{language === "en-US" ? meta.labelEn : meta.label}</button>)}</div>}
    </header>
  );
}

function MarketRail({
  productMode,
  markets,
  marketSearch,
  symbol,
  onSearchChange,
  onSelect
}: {
  productMode: ProductMode;
  markets: Market[];
  marketSearch: string;
  symbol: string;
  onSearchChange: (value: string) => void;
  onSelect: (symbol: string) => void;
}) {
  const query = marketSearch.trim().toUpperCase();
  const filteredMarkets = query
    ? markets.filter((market) => `${market.symbol} ${market.displayName}`.toUpperCase().includes(query))
    : markets;

  return (
    <aside className="market-rail">
      <label className="rail-search">
        <Search size={14} />
        <input
          value={marketSearch}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && filteredMarkets[0]) {
              onSelect(filteredMarkets[0].symbol);
            }
          }}
          placeholder={`搜索${PRODUCT_META[productMode].shortLabel}`}
        />
      </label>
      {markets.length === 0 && <p className="empty rail-empty">暂无{PRODUCT_META[productMode].label}市场</p>}
      {markets.length > 0 && filteredMarkets.length === 0 && <p className="empty rail-empty">没有匹配的币对</p>}
      {filteredMarkets.map((market) => (
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

function DerivativeLifecyclePanel({ market, markets, nowMs }: { market?: Market; markets: Market[]; nowMs: number }) {
  if (!market) return null;
  const product = marketProduct(market);
  if (product === "spot" || isFundingProduct(product)) return null;
  const isOption = product === "option";
  const lifecycleRows: Array<[string, ReactNode]> = [
    ["产品线", PRODUCT_META[product].productLine],
    ["状态", market.status ?? "TRADING"],
    ["到期时间", market.expiryTime ?? "-"],
    [isOption ? "行权时间" : "交割时间", market.deliveryTime ?? "-"],
    ["剩余时间", formatLifecycleCountdown(market, nowMs)],
    ["结算方式", market.settlementMethod ?? "-"]
  ];
  const optionChain = isOption ? optionChainForMarket(market, markets) : [];
  const optionMetrics = isOption ? optionMetricRows(market, markets) : [];
  return (
    <section className="product-insight panel">
      <div className="panel-title">
        <span>{isOption ? <Sparkles size={16} /> : <Clock3 size={16} />}{isOption ? "期权链路" : "交割合约生命周期"}</span>
        <button>{market.symbol}</button>
      </div>
      <div className="lifecycle-grid">
        {lifecycleRows.map(([label, value]) => (
          <div className="lifecycle-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {isOption ? (
        <div className="option-insight-grid">
          <div className="option-metrics">
            {optionMetrics.map(([label, value, tone]) => (
              <Metric key={label} label={label} value={String(value)} tone={tone} />
            ))}
          </div>
          <div className="option-chain">
            <div className="option-chain-head"><span>到期/行权价</span><span>CALL</span><span>PUT</span></div>
            {optionChain.length ? optionChain.map((row) => (
              <div className="option-chain-row" key={`${row.expiry}-${row.strike}`}>
                <span>{row.expiry} · {row.strike}</span>
                <strong className={row.call === market.symbol ? "active" : ""}>{row.call ?? "-"}</strong>
                <strong className={row.put === market.symbol ? "active" : ""}>{row.put ?? "-"}</strong>
              </div>
            )) : <p className="empty option-empty">暂无同到期日期权链</p>}
          </div>
        </div>
      ) : (
        <div className="delivery-note">
          <Metric label="标记价格" value={priceWithQuote(market, market.markPriceTicks, market.quoteAsset)} tone="gold" />
          <Metric label="指数价格" value={priceWithQuote(market, market.indexPriceTicks, market.quoteAsset)} />
          <Metric label="结算资产" value={market.settleAsset ?? market.quoteAsset} />
          <Metric label="合约方向" value={isInverseProduct(product) ? "币本位反向" : "U本位正向"} />
        </div>
      )}
    </section>
  );
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

function upsertOpenTriggerOrder(current: OpenTriggerOrder[], incoming: OpenTriggerOrder): OpenTriggerOrder[] {
  const remaining = current.filter((item) => item.triggerOrderId !== incoming.triggerOrderId);
  if (incoming.status !== "PENDING" && incoming.status !== "TRIGGERING") {
    return remaining;
  }
  return [incoming, ...remaining];
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

function BottomDeck({ productMode, positionMode, balances, positions, orders, openOrdersHasMore, loadingMoreOpenOrders, algoOrders, triggerOrders, trades, market, markets, onPositionModeChange, onCancel, onLoadMoreOpenOrders, onCancelAlgo, onCancelTrigger }: {
  productMode: ProductMode;
  positionMode: PositionMode;
  balances: Balance[];
  positions: Position[];
  orders: OpenOrder[];
  openOrdersHasMore: boolean;
  loadingMoreOpenOrders: boolean;
  algoOrders: AlgoOrder[];
  triggerOrders: OpenTriggerOrder[];
  trades: TradeRecord[];
  market?: Market;
  markets: Market[];
  onPositionModeChange: (mode: PositionMode) => void;
  onCancel: (order: OpenOrder) => void;
  onLoadMoreOpenOrders: () => void;
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
          {openOrdersHasMore && (
            <div className="table-load-more">
              <button type="button" onClick={onLoadMoreOpenOrders} disabled={loadingMoreOpenOrders}>
                {loadingMoreOpenOrders ? "加载中..." : "加载更多委托"}
              </button>
            </div>
          )}
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
  const [trades, setTrades] = useState<TradePrint[]>(() => config.enableMockFallback ? fallbackTrades(symbol, mid).slice(0, TRADE_TAPE_ROWS) : []);

  useEffect(() => {
    setTrades(config.enableMockFallback ? fallbackTrades(symbol, mid).slice(0, TRADE_TAPE_ROWS) : []);
  }, [mid, symbol]);

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
  return eventLine === productLine;
}

function optionChainForMarket(market: Market, markets: Market[]) {
  const targetExpiry = dateKey(market.expiryTime ?? market.deliveryTime);
  const targetUnderlying = market.underlyingSymbol ?? market.baseAsset;
  const rows = new Map<string, { expiry: string; strike: string; strikeValue: number; call?: string; put?: string }>();
  for (const item of markets) {
    if (marketProduct(item) !== "option") continue;
    const expiry = dateKey(item.expiryTime ?? item.deliveryTime);
    if (targetExpiry && expiry !== targetExpiry) continue;
    if ((item.underlyingSymbol ?? item.baseAsset) !== targetUnderlying) continue;
    const strikeValue = strikePrice(item);
    const strike = displayPrice(strikeValue);
    const key = `${expiry}:${strikeValue}`;
    const row = rows.get(key) ?? { expiry: expiry || "-", strike, strikeValue };
    if (item.optionType === "PUT") row.put = item.symbol;
    else row.call = item.symbol;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort((left, right) => left.strikeValue - right.strikeValue);
}

function optionMetricRows(market: Market, markets: Market[]): Array<[string, string, "up" | "down" | "gold" | undefined]> {
  const underlying = markets.find((item) => item.symbol === market.underlyingSymbol)
    ?? markets.find((item) => item.symbol === `${market.baseAsset}-${market.quoteAsset}`)
    ?? markets.find((item) => item.baseAsset === market.baseAsset && marketProduct(item) !== "option");
  const underlyingPrice = priceFromTicks(underlying ?? market, underlying?.indexPriceTicks || underlying?.lastPriceTicks || market.indexPriceTicks || market.lastPriceTicks);
  const strike = strikePrice(market);
  const premium = priceFromTicks(market, market.markPriceTicks || market.lastPriceTicks);
  const call = market.optionType !== "PUT";
  const intrinsic = Math.max(0, call ? underlyingPrice - strike : strike - underlyingPrice);
  const moneyness = strike > 0 ? (call ? underlyingPrice / strike : strike / Math.max(underlyingPrice, 1)) : 0;
  const delta = market.deltaPpm ?? estimatedOptionDeltaPpm(call, underlyingPrice, strike);
  return [
    ["底层价格", underlyingPrice > 0 ? `${displayPrice(underlyingPrice)} ${market.quoteAsset}` : "-", undefined],
    ["行权价", strike > 0 ? `${displayPrice(strike)} ${market.quoteAsset}` : "-", "gold"],
    ["权利金标记", premium > 0 ? `${displayPrice(premium)} ${market.quoteAsset}` : "-", undefined],
    ["内在价值", `${displayPrice(intrinsic)} ${market.quoteAsset}`, intrinsic > 0 ? "up" : undefined],
    ["Moneyness", moneyness > 0 ? moneyness.toFixed(4) : "-", moneyness >= 1 ? "up" : "down"],
    ["IV", displayOptionalPpm(market.impliedVolatilityPpm ?? undefined, 2), "gold"],
    ["Delta", displayGreekPpm(delta), delta >= 0 ? "up" : "down"],
    ["Gamma/Theta/Vega", `${displayGreekPpm(market.gammaPpm)} / ${displayGreekPpm(market.thetaPpm)} / ${displayGreekPpm(market.vegaPpm)}`, undefined]
  ];
}

function estimatedOptionDeltaPpm(call: boolean, underlyingPrice: number, strike: number): number {
  if (underlyingPrice <= 0 || strike <= 0) return 0;
  const ratio = underlyingPrice / strike;
  if (call) {
    if (ratio >= 1.03) return 750_000;
    if (ratio <= 0.97) return 250_000;
    return 500_000;
  }
  if (ratio <= 0.97) return -750_000;
  if (ratio >= 1.03) return -250_000;
  return -500_000;
}

function displayGreekPpm(value?: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? (value / 1_000_000).toFixed(4) : "-";
}

function strikePrice(market: Market): number {
  return typeof market.strikePriceUnits === "number" ? market.strikePriceUnits / PRICE_UNIT_SCALE : 0;
}

function dateKey(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function formatLifecycleCountdown(market: Market, nowMs: number): string {
  const raw = market.deliveryTime ?? market.expiryTime;
  if (!raw) return "-";
  const target = Date.parse(raw);
  if (Number.isNaN(target)) return raw;
  const seconds = Math.floor((target - nowMs) / 1000);
  if (seconds <= 0) return "已到期";
  const days = Math.floor(seconds / 86400);
  const remain = seconds % 86400;
  return days > 0 ? `${days}天 ${formatDuration(remain)}` : formatDuration(remain);
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
  if (records.length || !config.enableMockFallback) return records;
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
