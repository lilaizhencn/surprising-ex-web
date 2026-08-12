import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
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
  House,
  Info,
  KeyRound,
  LockKeyhole,
  Layers3,
  LogOut,
  MoonStar,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  ShieldCheck,
  Star,
  Sun,
  TableProperties,
  TrendingUp,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  WalletMinimal,
  WifiOff,
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
import { cancelAlgoOrder, cancelOrder, cancelTriggerOrder, changePassword, confirmMfa, createApiKey, disableMfa, enrollMfa, forgotPassword, issueSecurityChallenge, loadAccountLedger, loadApiKeys, loadBalances, loadCandles, loadExchangeRateConversion, loadInstrumentConfig, loadKyc, loadKycDocuments, loadMarkets, loadMarkPrice, loadMfaStatus, loadOpenAlgoOrders, loadOpenOrders, loadOpenTriggerOrders, loadOrderBook, loadPositionMode, loadPositions, loadSecurityScenes, login, placeAlgoOrder, placeOrder, placeTriggerOrder, register, resendEmailVerification, resetPassword, revokeApiKey, submitKyc, updateApiKeyIpAllowlist, updatePositionMode, updateSecurityScene, uploadKycDocument, verifyEmail } from "./api/surprising";
import { compact, config, displayPpm, displayPrice, displayUnits } from "./config";
import { fallbackTrades } from "./mockData";
import { ApiError, loadSession, saveSession } from "./api/client";
import { useRealtime } from "./hooks/useRealtime";
import { localized, localizedNotice } from "./localized";
import type { LanguageMode } from "./localized";
import { AssetIcon, AssetTabs, SupportBubble, assetName, fundingAssets } from "./components/AssetPrimitives";
import { FundingFlowPage } from "./components/FundingFlowPage";
import { ProductTransferDialog } from "./components/ProductTransferDialog";
import { AssetCenter, emptyProductBalances, type ProductBalances } from "./components/AssetCenter";
import { FundingLedgerPage } from "./components/FundingLedgerPage";
import { MarketsPage, type MarketCenterState } from "./components/MarketsPage";
import { filterTradableMarkets, mergeMarketSnapshots } from "./marketPresentation";
import { UiAlert, UiButton, UiCard, UiField, UiStatusBadge } from "./components/UiPrimitives";
import { applyMarketPriceTicks, priceFromTicks, ValuationRequestGuard } from "./valuation";
import type { AccountLedgerEntry, AlgoOrder, AlgoOrderType, ApiKeyView, AuthSession, Balance, CandlePoint, ConnectionState, KycDocument, KycProfile, MarginMode, Market, MfaEnrollment, MfaStatus, OpenOrder, OpenTriggerOrder, OrderBookLevel, OrderSide, OrderType, PlaceAlgoOrderDraft, PlaceOrderDraft, PlaceTriggerOrderDraft, Position, PositionMode, PositionSide, ProductAccountType, ProductLine, ProductMode, SecurityScene, TimeInForce, TradePrint, TradeRecord, TriggerOrderType, ValuationCurrency, WsEnvelope } from "./types";
import "./styles.css";

type AuthMode = "login" | "register";
type AuthStep = AuthMode | "forgot" | "verify" | "reset";
type Page = "home" | "markets" | "trade" | "rules" | "assets" | "ledger" | "recharge" | "withdraw" | "security";
type ThemeMode = "dark" | "light";
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

const PRODUCT_MODES = Object.keys(PRODUCT_META) as ProductMode[];

function routeStateFromLocation(isAuthenticated: boolean): { page: Page; productMode: ProductMode; assetProductMode: ProductMode | null; authMode: AuthMode | null } {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const assetProductMode = assetProductModeFromPath(path);
  const productMode = productModeFromPath(path) ?? assetProductMode ?? "linear";
  if (path === "/login" || path === "/register") return { page: "home", productMode, assetProductMode: null, authMode: path === "/register" ? "register" : "login" };
  if (path === "/assets" || assetProductMode || path === "/ledger" || path === "/recharge" || path === "/withdraw") {
    return isAuthenticated
      ? { page: path === "/ledger" ? "ledger" : path === "/recharge" ? "recharge" : path === "/withdraw" ? "withdraw" : "assets", productMode, assetProductMode, authMode: null }
      : { page: "home", productMode, assetProductMode: null, authMode: "login" };
  }
  if (path === "/" || path === "/home") return { page: "home", productMode, assetProductMode: null, authMode: null };
  if (path === "/rules") return { page: "rules", productMode, assetProductMode: null, authMode: null };
  if (path === "/markets") return { page: "markets", productMode, assetProductMode: null, authMode: null };
  if (path === "/security") return { page: "security", productMode, assetProductMode: null, authMode: null };
  return { page: "trade", productMode, assetProductMode: null, authMode: null };
}

function assetProductModeFromPath(path: string): ProductMode | null {
  const prefix = "/assets/";
  if (!path.startsWith(prefix)) return null;
  const value = path.slice(prefix.length);
  return PRODUCT_MODES.includes(value as ProductMode) ? value as ProductMode : null;
}

function productModeFromPath(path: string): ProductMode | null {
  const matched = (Object.entries(PRODUCT_ROUTES) as Array<[ProductMode, string]>)
    .find(([, route]) => path === route);
  return matched?.[0] ?? null;
}

function routeForPage(page: Page, productMode: ProductMode): string {
  if (page === "home") return "/";
  if (page === "trade") return PRODUCT_ROUTES[productMode];
  return `/${page}`;
}

function routeForAssetProduct(productMode: ProductMode): string {
  return `/assets/${productMode}`;
}

function pushRoute(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
}

export default function App() {
  const initialSession = loadSession();
  const initialRoute = routeStateFromLocation(initialSession !== null);
  const [session, setSession] = useState<AuthSession | null>(initialSession);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketState, setMarketState] = useState<MarketCenterState>("loading");
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [fundingBalances, setFundingBalances] = useState<Balance[]>([]);
  const [fundingBalanceState, setFundingBalanceState] = useState<FundingBalanceState>("idle");
  const [productBalances, setProductBalances] = useState<ProductBalances>(() => emptyProductBalances());
  const [productBalanceState, setProductBalanceState] = useState<FundingBalanceState>("idle");
  const [recentLedger, setRecentLedger] = useState<AccountLedgerEntry[]>([]);
  const [recentLedgerState, setRecentLedgerState] = useState<FundingBalanceState>("idle");
  const [recentLedgerHasMore, setRecentLedgerHasMore] = useState(false);
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
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(initialRoute.authMode);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [productMode, setProductMode] = useState<ProductMode>(initialRoute.productMode);
  const [assetProductMode, setAssetProductMode] = useState<ProductMode | null>(initialRoute.assetProductMode);
  const [marketSearch, setMarketSearch] = useState("");
  const [klinePeriod, setKlinePeriod] = useState<string>("1m");
  const [theme, setTheme] = useState<ThemeMode>(() => localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");
  const [language, setLanguage] = useState<LanguageMode>(() => localStorage.getItem(LANGUAGE_KEY) === "en-US" ? "en-US" : "zh-CN");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [instrumentInfoOpen, setInstrumentInfoOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferContext, setTransferContext] = useState<{ product: ProductMode; asset?: string } | null>(null);
  const [pickedPrice, setPickedPrice] = useState<PickedPrice | null>(null);
  const processedPrivateEventKeysRef = useRef<Set<string>>(new Set());
  const processedTriggerEventKeysRef = useRef<Set<string>>(new Set());
  const triggerOrderEventVersionsRef = useRef<Map<number, number>>(new Map());
  const processedPublicEventKeysRef = useRef<Set<string>>(new Set());
  const marketDataRequestRef = useRef(0);
  const marketsRequestRef = useRef(0);
  const marketMutationRevisionRef = useRef(0);
  const openOrdersRequestRef = useRef(0);
  const valuationRequestGuardRef = useRef(new ValuationRequestGuard());
  const marketsRef = useRef<Market[]>([]);

  useEffect(() => {
    marketsRef.current = markets;
  }, [markets]);

  async function refreshMarketsFromGateway(): Promise<void> {
    const requestId = marketsRequestRef.current + 1;
    marketsRequestRef.current = requestId;
    const mutationRevisionAtRequestStart = marketMutationRevisionRef.current;
    setMarketState("loading");
    setValuationMarketState("loading");
    try {
      const items = await loadMarkets(false);
      if (requestId !== marketsRequestRef.current) return;
      const preserveCurrentSnapshot = marketMutationRevisionRef.current !== mutationRevisionAtRequestStart;
      setMarkets((current) => mergeMarketSnapshots(current, items, preserveCurrentSnapshot));
      marketMutationRevisionRef.current += 1;
      setMarketState("ready");
      setValuationPrices({});
      setValuationMarketState("ready");
      if (items[0]) setSymbol((current) => items.some((item) => item.symbol === current) ? current : items[0].symbol);
      return;
    } catch {
      try {
        const items = await loadMarkets();
        if (requestId !== marketsRequestRef.current) return;
        const source = config.enableMockFallback ? "fallback" : "real";
        const preserveCurrentSnapshot = marketMutationRevisionRef.current !== mutationRevisionAtRequestStart;
        setMarkets((current) => mergeMarketSnapshots(current, items, preserveCurrentSnapshot));
        marketMutationRevisionRef.current += 1;
        setMarketState(source === "fallback" ? "degraded" : "ready");
        setValuationPrices({});
        setValuationMarketState("ready");
        if (items[0]) setSymbol((current) => items.some((item) => item.symbol === current) ? current : items[0].symbol);
        return;
      } catch {
        if (requestId !== marketsRequestRef.current) return;
        setMarketState("error");
        setValuationMarketState("error");
        setValuationPrices({});
        setNotice("交易对服务暂不可用，请稍后重试");
      }
    }
  }

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
      ?? visibleMarkets[0],
    [symbol, visibleMarkets]
  );
  const activeProductMode = productMode;
  const activeProductLine = PRODUCT_META[activeProductMode].productLine;
  const realtime = useRealtime(session, symbol, activeProductMode, klinePeriod);

  const tradeRecords = useMemo(
    () => buildTradeRecords(
      realtime.events,
      session?.user.userId,
      symbol,
      activeProductLine,
      selectedMarket?.lastPriceTicks ?? 0
    ),
    [activeProductLine, realtime.events, selectedMarket?.lastPriceTicks, session?.user.userId, symbol]
  );

  useEffect(() => {
    void refreshMarketsFromGateway();
  }, []);

  useEffect(() => {
    if (!session) {
      setFundingBalances([]);
      setFundingBalanceState("idle");
      setProductBalances(emptyProductBalances());
      setProductBalanceState("idle");
      setRecentLedger([]);
      setRecentLedgerState("idle");
      setRecentLedgerHasMore(false);
      return;
    }
    let cancelled = false;
    setFundingBalanceState("loading");
    setProductBalanceState("loading");
    void Promise.allSettled(PRODUCT_MODES.map((mode) => loadBalances(session, PRODUCT_META[mode].accountType, PRODUCT_META[mode].productLine, false))).then((results) => {
      if (cancelled) return;
      const nextBalances = emptyProductBalances();
      let hasError = false;
      results.forEach((result, index) => {
        const mode = PRODUCT_MODES[index];
        if (result.status === "fulfilled") nextBalances[mode] = result.value;
        else hasError = true;
      });
      setProductBalances(nextBalances);
      setFundingBalances(nextBalances.spot);
      setFundingBalanceState(results[PRODUCT_MODES.indexOf("spot")]?.status === "fulfilled" ? "ready" : "error");
      setProductBalanceState(hasError ? "error" : "ready");
    });
    setRecentLedgerState("loading");
    void loadAccountLedger(session, 10).then((nextPage) => {
      if (cancelled) return;
      setRecentLedger(nextPage.entries.slice(0, 10));
      setRecentLedgerHasMore(nextPage.hasMore);
      setRecentLedgerState("ready");
    }).catch(() => {
      if (!cancelled) {
        setRecentLedger([]);
        setRecentLedgerHasMore(false);
        setRecentLedgerState("error");
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
        marketMutationRevisionRef.current += 1;
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
    setProductBalanceState("loading");
    try {
      const results = await Promise.allSettled(PRODUCT_MODES.map((mode) => loadBalances(active, PRODUCT_META[mode].accountType, PRODUCT_META[mode].productLine, false)));
      const nextProductBalances = emptyProductBalances();
      let hasError = false;
      results.forEach((result, index) => {
        const mode = PRODUCT_MODES[index];
        if (result.status === "fulfilled") nextProductBalances[mode] = result.value;
        else hasError = true;
      });
      if (active.accessToken === session?.accessToken) {
        setProductBalances(nextProductBalances);
        setFundingBalances(nextProductBalances.spot);
        setFundingBalanceState(results[PRODUCT_MODES.indexOf("spot")]?.status === "fulfilled" ? "ready" : "error");
        setProductBalanceState(hasError ? "error" : "ready");
      }
    } catch {
      if (active.accessToken === session?.accessToken) {
        setFundingBalances([]);
        setFundingBalanceState("error");
        setProductBalances(emptyProductBalances());
        setProductBalanceState("error");
      }
    }
    if (active.accessToken === session?.accessToken) {
      try {
        const nextPage = await loadAccountLedger(active, 10);
        setRecentLedger(nextPage.entries.slice(0, 10));
        setRecentLedgerHasMore(nextPage.hasMore);
        setRecentLedgerState("ready");
      } catch {
        setRecentLedgerState("error");
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
    if (!session && (window.location.pathname === "/assets" || window.location.pathname.startsWith("/assets/") || window.location.pathname === "/ledger" || window.location.pathname === "/recharge" || window.location.pathname === "/withdraw")) {
      pushRoute("/login");
    }
  }, [session]);

  useEffect(() => {
    const syncRoute = () => {
      const nextRoute = routeStateFromLocation(session !== null);
      setPage(nextRoute.page);
      setProductMode(nextRoute.productMode);
      setAssetProductMode(nextRoute.assetProductMode);
      setAuthMode(nextRoute.authMode);
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [session]);

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
        return current.map((market) => market.symbol === instrument.symbol && marketProduct(market) === instrumentProductMode
          ? mergeMarketSnapshots([market], [instrument], true)[0]
          : market);
      });
      marketMutationRevisionRef.current += 1;
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
          patchMarket(targetSymbol, { lastPriceTicks }, activeProductMode);
        }
        continue;
      }

      if (event.channel === "index") {
        const indexPriceTicks = priceTicksFromPayload(data, selectedMarket, "indexPriceTicks", "indexPrice", "indexPriceUnits");
        if (indexPriceTicks > 0) {
          patchMarket(targetSymbol, { indexPriceTicks }, activeProductMode);
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
        }, activeProductMode);
        continue;
      }

      if (event.channel === "funding") {
        const fundingRatePpm = asRatePpm(data.fundingRatePpm ?? data.fundingRate);
        patchMarket(targetSymbol, {
          ...(fundingRatePpm !== undefined ? { fundingRatePpm } : {}),
          ...fundingTimingPatch(data)
        }, activeProductMode);
      }
    }
  }, [activeProductLine, klinePeriod, realtime.events, selectedMarket, symbol]);

  function patchMarket(targetSymbol: string, patch: Partial<Market>, targetProductMode?: ProductMode) {
    if (!targetSymbol) return;
    marketMutationRevisionRef.current += 1;
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
      navigateToPage("home");
      return;
    }
    openOrdersRequestRef.current += 1;
    setBalances([]);
    setFundingBalances([]);
    setFundingBalanceState("idle");
    setProductBalances(emptyProductBalances());
    setProductBalanceState("idle");
    setRecentLedger([]);
    setRecentLedgerState("idle");
    setRecentLedgerHasMore(false);
    setPositions([]);
    setOrders([]);
    setOpenOrdersNextCursor(null);
    setOpenOrdersHasMore(false);
    setLoadingMoreOpenOrders(false);
    setAlgoOrders([]);
    setTriggerOrders([]);
    setPositionMode("ONE_WAY");
  }

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    pushRoute(`/${mode}`);
  }

  function closeAuth() {
    setAuthMode(null);
    if (window.location.pathname === "/login" || window.location.pathname === "/register") {
      pushRoute("/");
    }
  }

  function navigateToPage(nextPage: Page) {
    if ((nextPage === "assets" || nextPage === "ledger" || nextPage === "recharge" || nextPage === "withdraw") && !session) {
      openAuth("login");
      return;
    }
    setAuthMode(null);
    setAssetProductMode(null);
    setPage(nextPage);
    pushRoute(routeForPage(nextPage, productMode));
  }

  function openAssetProductPage(nextMode: ProductMode) {
    if (!session) {
      openAuth("login");
      return;
    }
    setAuthMode(null);
    setAssetProductMode(nextMode);
    setPage("assets");
    pushRoute(routeForAssetProduct(nextMode));
  }

  function openProductPage(nextMode: ProductMode) {
    setAuthMode(null);
    setAssetProductMode(null);
    setProductMode(nextMode);
    setPage("trade");
    setMarketSearch("");
    pushRoute(routeForPage("trade", nextMode));
  }

  function openTransfer(product: ProductMode, asset?: string) {
    setTransferContext({ product, asset });
    setTransferOpen(true);
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
      setNotice(error instanceof Error ? error.message : localized(language, "行情同步失败", "Market data sync failed"));
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
      const productLabel = language === "en-US" ? PRODUCT_META[activeProductMode].labelEn : PRODUCT_META[activeProductMode].label;
      setNotice(`${productLabel}${localized(language, "资产、", " assets and ")}${activeProductMode === "spot" ? localized(language, "委托", "orders") : localized(language, "持仓和委托", "positions and orders")}${localized(language, "已从 gateway 同步。", " synced from the gateway.")}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : localized(language, "私有数据同步失败", "Private data sync failed"));
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
        setNotice(error instanceof Error ? error.message : localized(language, "加载更多委托失败", "Loading more orders failed"));
      }
    } finally {
      if (ordersRequestId === openOrdersRequestRef.current) {
        setLoadingMoreOpenOrders(false);
      }
    }
  }

  async function changePositionMode(nextMode: PositionMode) {
    if (!session) {
      setNotice(localized(language, "请先登录后再切换持仓模式。", "Sign in before changing position mode."));
      openAuth("login");
      return;
    }
    if (nextMode === positionMode) return;
    try {
      const savedMode = await updatePositionMode(session, nextMode, activeProductLine);
      setPositionMode(savedMode);
      setNotice(`${localized(language, "持仓模式已切换为", "Position mode changed to ")}${positionModeLabel(language, savedMode)}${localized(language, "。", ".")}`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error
        ? `${localized(language, "切换持仓模式失败：", "Changing position mode failed: ")}${error.message}`
        : localized(language, "切换持仓模式失败", "Changing position mode failed"));
    }
  }

  async function submitOrder(draft: PlaceOrderDraft) {
    if (!session) {
      setNotice(localized(language, "请先登录后再下单。", "Sign in before placing an order."));
      openAuth("login");
      return;
    }
    try {
      const order = await placeOrder(session, draft, productLineForSymbol(draft.symbol, markets, productMode));
      setOrders((current) => [order, ...current.filter((item) => item.orderId !== order.orderId)]);
      setNotice(`${localized(language, "订单已提交：", "Order submitted: ")}${order.orderId}`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error
        ? `${localized(language, "下单失败：", "Order submission failed: ")}${error.message}`
        : localized(language, "下单失败", "Order submission failed"));
    }
  }

  async function submitTriggerOrders(drafts: PlaceTriggerOrderDraft[]) {
    if (!session) {
      setNotice(localized(language, "请先登录后再提交止盈止损。", "Sign in before submitting take-profit or stop-loss orders."));
      openAuth("login");
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
      setNotice(localized(language, "条件单参数无效。", "Conditional order parameters are invalid."));
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
      setNotice(`${localized(language, "止盈止损已提交：", "Take-profit / stop-loss submitted: ")}${created.length}`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error
        ? `${localized(language, "止盈止损提交失败：", "Take-profit / stop-loss submission failed: ")}${error.message}`
        : localized(language, "止盈止损提交失败", "Take-profit / stop-loss submission failed"));
    }
  }

  async function submitAlgoOrder(draft: PlaceAlgoOrderDraft) {
    if (!session) {
      setNotice(localized(language, "请先登录后再提交算法单。", "Sign in before submitting an algo order."));
      openAuth("login");
      return;
    }
    try {
      const order = await placeAlgoOrder(session, draft, productLineForSymbol(draft.symbol, markets, productMode));
      setAlgoOrders((current) => [order, ...current.filter((item) => item.algoOrderId !== order.algoOrderId)]);
      setNotice(`${localized(language, "算法单已提交：", "Algo order submitted: ")}${order.algoOrderId}`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error
        ? `${localized(language, "算法单提交失败：", "Algo order submission failed: ")}${error.message}`
        : localized(language, "算法单提交失败", "Algo order submission failed"));
    }
  }

  async function submitCancel(order: OpenOrder) {
    if (!session) return;
    try {
      const canceled = await cancelOrder(session, order, productLineForSymbol(order.symbol, markets, productMode));
      setOrders((current) => current.filter((item) => item.orderId !== canceled.orderId));
      setNotice(`${localized(language, "撤单请求已提交：", "Cancel request submitted: ")}${order.orderId}`);
      void refreshPrivateData(session);
    } catch (error) {
      setNotice(error instanceof Error
        ? `${localized(language, "撤单失败：", "Cancel failed: ")}${error.message}`
        : localized(language, "撤单失败", "Cancel failed"));
    }
  }

  async function submitTriggerCancel(order: OpenTriggerOrder) {
    if (!session) return;
    try {
      const canceled = await cancelTriggerOrder(session, order, productLineForSymbol(order.symbol, markets, productMode));
      setTriggerOrders((current) => current.filter((item) => item.triggerOrderId !== canceled.triggerOrderId));
      setNotice(`${localized(language, "条件单撤销已提交：", "Conditional order cancel submitted: ")}${order.triggerOrderId}`);
    } catch (error) {
      setNotice(error instanceof Error
        ? `${localized(language, "条件单撤销失败：", "Conditional order cancel failed: ")}${error.message}`
        : localized(language, "条件单撤销失败", "Conditional order cancel failed"));
    }
  }

  async function submitAlgoCancel(order: AlgoOrder) {
    if (!session) return;
    try {
      const canceled = await cancelAlgoOrder(session, order, productLineForSymbol(order.symbol, markets, productMode));
      setAlgoOrders((current) => current.map((item) => item.algoOrderId === canceled.algoOrderId ? canceled : item));
      setNotice(`${localized(language, "算法单取消已提交：", "Algo order cancel submitted: ")}${order.algoOrderId}`);
    } catch (error) {
      setNotice(error instanceof Error
        ? `${localized(language, "算法单取消失败：", "Algo order cancel failed: ")}${error.message}`
        : localized(language, "算法单取消失败", "Algo order cancel failed"));
    }
  }

  const topbar = <Topbar
        session={session}
        page={page}
        productMode={productMode}
        markets={markets}
        marketSearch={marketSearch}
        theme={theme}
        language={language}
        onPageChange={navigateToPage}
        onProductModeChange={openProductPage}
        onMarketSearchChange={setMarketSearch}
        onMarketSelect={(nextSymbol) => {
          const market = markets.find((item) => item.symbol === nextSymbol);
          if (!market) return;
          setSymbol(nextSymbol);
          openProductPage(marketProduct(market));
        }}
        onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        onLanguageToggle={() => setLanguage((current) => current === "zh-CN" ? "en-US" : "zh-CN")}
        onLogin={() => openAuth("login")}
        onRegister={() => openAuth("register")}
        onLogout={() => persistSession(null)}
        connectionState={realtime.state}
        lastEventAt={realtime.lastEventAt}
        onRefresh={() => { void refreshMarketData(); if (session) void refreshPrivateData(session); }}
      />;

  if (authMode) {
    return <main className="app-shell">{topbar}<AuthScreen key={authMode} initialMode={authMode} language={language} onAuthenticated={persistSession} onBack={closeAuth} /></main>;
  }

  return (
    <main className="app-shell">
      {topbar}
      {page === "trade" && notice && <div className="toast"><Radio size={15} />{localizedNotice(language, notice)}</div>}

      {page === "home" ? (
        <HomePage
          session={session}
          markets={markets}
          balances={fundingBalances}
          positions={positions}
          orders={orders}
          language={language}
          onLogin={() => openAuth("login")}
          onRegister={() => openAuth("register")}
          onRefresh={() => { void refreshMarketData(); if (session) void refreshPrivateData(session); }}
          onOpenProduct={openProductPage}
          onOpenMarket={(market) => { setSymbol(market.symbol); openProductPage(marketProduct(market)); }}
          onAssets={() => navigateToPage("assets")}
          onDeposit={() => navigateToPage("recharge")}
        />
      ) : page === "markets" ? (
        <MarketsPage
          markets={markets}
          marketState={marketState}
          language={language}
          productMeta={PRODUCT_META}
          onRefresh={() => { void refreshMarketsFromGateway(); }}
          onOpenMarket={(market) => { setSymbol(market.symbol); openProductPage(marketProduct(market)); }}
        />
      ) : page === "rules" ? (
        <TradingRulesPage
          markets={markets}
          selectedMarket={selectedMarket}
          language={language}
          onOpenMarket={(market) => {
            setSymbol(market.symbol);
            openProductPage(marketProduct(market));
          }}
        />
      ) : page === "assets" ? (
        <AssetCenter activeProduct={assetProductMode} balancesByProduct={productBalances} balanceState={productBalanceState} session={session} language={language} productMeta={PRODUCT_META} valuationCurrency={valuationCurrency} valuationRates={valuationRates} valuationRateState={valuationRateState} valuationMarketState={valuationMarketState} valuationPrices={valuationPrices} recentLedger={recentLedger} recentLedgerState={recentLedgerState} recentLedgerHasMore={recentLedgerHasMore} onValuationCurrencyChange={changeValuationCurrency} onOpenProduct={openAssetProductPage} onOpenOverview={() => navigateToPage("assets")} onOpenLedger={() => navigateToPage("ledger")} onDeposit={() => navigateToPage("recharge")} onWithdraw={() => navigateToPage("withdraw")} onTransfer={openTransfer} onHelp={() => navigateToPage("rules")} onRefresh={() => { void refreshFundingBalances(); }} />
      ) : page === "ledger" ? (
        <FundingLedgerPage session={session} language={language} productMeta={PRODUCT_META} onBack={() => navigateToPage("assets")} />
      ) : page === "recharge" ? (
        <FundingFlowPage
          mode="deposit"
          language={language}
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
          language={language}
          balances={fundingBalances}
          session={session}
          onFundingBalanceRefresh={() => { void refreshFundingBalances(); }}
          onHelp={() => navigateToPage("rules")}
          onBack={() => navigateToPage("assets")}
          onShowAsset={() => navigateToPage("assets")}
        />
      ) : page === "security" ? (
        <SecurityPage language={language} session={session} onLogin={() => openAuth("login")} />
      ) : (
        <div className="terminal-grid" key={productMode}>
          <MarketRail language={language} productMode={productMode} markets={visibleMarkets} marketSearch={marketSearch} symbol={symbol} onSearchChange={setMarketSearch} onSelect={selectMarket} />
          <section className="workspace">
            <MarketHeader language={language} market={selectedMarket} loading={loading} nowMs={nowMs} onInfo={() => setInstrumentInfoOpen(true)} />
            <DerivativeLifecyclePanel language={language} market={selectedMarket} markets={markets} nowMs={nowMs} />
            <div className="main-grid">
              <section className="chart-panel panel">
                <div className="panel-title">
                  <span><CandlestickChart size={16} />{localized(language, "K线", "Candles")}</span>
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
              <OrderBook language={language} asks={asks} bids={bids} market={selectedMarket} mid={selectedMarket?.lastPriceTicks ?? 0} onPickPrice={pickOrderPrice} />
            </div>
            <BottomDeck
              productMode={productMode}
              language={language}
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
            <TradesTape language={language} events={realtime.events} symbol={symbol} productLine={activeProductLine}
              market={selectedMarket} mid={selectedMarket?.lastPriceTicks ?? 0} onPickPrice={pickOrderPrice} />
            <OrderTicket language={language} productMode={activeProductMode} positionMode={positionMode} symbol={symbol} market={selectedMarket} pricePreset={pickedPrice} onSubmit={submitOrder} onSubmitAlgo={submitAlgoOrder} onSubmitTriggers={submitTriggerOrders} />
          </aside>
        </div>
      )}

      {instrumentInfoOpen && selectedMarket && (
        <ContractInfoDialog language={language} market={selectedMarket} onClose={() => setInstrumentInfoOpen(false)} />
      )}
      {transferOpen && session && transferContext && <ProductTransferDialog session={session} balances={productBalances[transferContext.product]} initialAsset={transferContext.asset} initialSourceAccountType={PRODUCT_META[transferContext.product].accountType === "SPOT" ? "SPOT" : PRODUCT_META[transferContext.product].accountType} initialTargetAccountType={PRODUCT_META[transferContext.product].accountType === "SPOT" ? "USDT_PERPETUAL" : "SPOT"} onClose={() => { setTransferOpen(false); setTransferContext(null); }} onCompleted={() => { void refreshFundingBalances(); }} />}
    </main>
  );
}

function HomePage({
  session,
  markets,
  balances,
  positions,
  orders,
  language,
  onLogin,
  onRegister,
  onRefresh,
  onOpenProduct,
  onOpenMarket,
  onAssets,
  onDeposit
}: {
  session: AuthSession | null;
  markets: Market[];
  balances: Balance[];
  positions: Position[];
  orders: OpenOrder[];
  language: LanguageMode;
  onLogin: () => void;
  onRegister: () => void;
  onRefresh: () => void;
  onOpenProduct: (mode: ProductMode) => void;
  onOpenMarket: (market: Market) => void;
  onAssets: () => void;
  onDeposit: () => void;
}) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const featuredMarkets = filterTradableMarkets(markets).slice(0, 8);
  const productModes = Object.keys(PRODUCT_META) as ProductMode[];
  const greeting = session ? text("欢迎回来", "Welcome back") : text("为每一次决策保留清晰上下文", "A clearer context for every decision");

  return (
    <div className="home-page">
      {session && <section className="home-account-strip" aria-label={text("账户概览", "Account overview")}>
        <div><span>{text("资金账户资产种类", "Funding assets")}</span><strong>{balances.length}</strong></div>
        <div><span>{text("当前持仓", "Open positions")}</span><strong>{positions.length}</strong></div>
        <div><span>{text("当前委托", "Open orders")}</span><strong>{orders.length}</strong></div>
        <button onClick={onDeposit}><Plus size={15} />{text("充值资金", "Fund account")}</button>
      </section>}

      <section className="home-section-heading"><div><span className="eyebrow">MARKET UNIVERSE</span><h2>{text("市场概览", "Market overview")}</h2><p>{text("按产品线浏览真实可交易的市场，进入后会重新加载对应 instrument 与实时订阅。", "Browse live markets by product line. Entering a market reloads its instrument and realtime subscription.")}</p></div><button className="home-inline-action" onClick={onRefresh}><RefreshCw size={14} />{text("刷新行情", "Refresh")}</button></section>
      <div className="home-product-tabs">
        {productModes.map((mode) => <button key={mode} onClick={() => onOpenProduct(mode)}><span>{PRODUCT_META[mode].label}</span><small>{markets.filter((market) => marketProduct(market) === mode).length} {text("个市场", "markets")}</small><ArrowUpRight size={14} /></button>)}
      </div>
      <section className="home-market-card">
        <div className="home-market-head"><span>{text("交易对", "Market")}</span><span>{text("最新价", "Last")}</span><span>{text("24h 变化", "24h")}</span><span>{text("24h 成交量", "Volume")}</span><span /></div>
        {featuredMarkets.length === 0 ? <div className="home-empty"><WifiOff size={18} /><span>{text("等待后端返回可交易市场", "Waiting for tradable markets from the gateway")}</span><button onClick={onRefresh}>{text("重试", "Retry")}</button></div> : featuredMarkets.map((market) => {
          const change = market.change24hPpm >= 0;
          return <button className="home-market-row" key={`${marketProduct(market)}:${market.symbol}`} onClick={() => onOpenMarket(market)}>
            <span className="home-market-symbol"><strong>{market.symbol}</strong><small>{displayMarketName(language, market)} · {PRODUCT_META[marketProduct(market)].shortLabel}</small></span>
            <strong className="home-market-price">{displayMarketPrice(market, market.lastPriceTicks)}</strong>
            <span className={market.tickerReady ? (change ? "home-market-up" : "home-market-down") : "market-data-muted"}>{market.tickerReady ? `${change ? "+" : ""}${displayPpm(market.change24hPpm)}` : "—"}</span>
            <span className="home-market-volume">{market.tickerReady ? compact(unitsToNumber(market.volume24hUnits)) : "—"}</span>
            <ArrowUpRight size={16} />
          </button>;
        })}
      </section>
      <HomeMarketInsights markets={markets} language={language} onOpenMarket={onOpenMarket} />
    </div>
  );
}

function HomeMarketInsights({ markets, language, onOpenMarket }: { markets: Market[]; language: LanguageMode; onOpenMarket: (market: Market) => void }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const tickerMarkets = filterTradableMarkets(markets).filter((market) => market.tickerReady);
  const gainers = [...tickerMarkets].sort((left, right) => right.change24hPpm - left.change24hPpm).slice(0, 3);
  const volumeLeaders = [...tickerMarkets].sort((left, right) => right.volume24hUnits - left.volume24hUnits).slice(0, 3);
  return <section className="home-insights" aria-label={text("市场排行", "Market rankings")}>
    <div className="home-insights-heading"><div><span className="eyebrow">MARKET SIGNALS</span><h2>{text("市场信号", "Market signals")}</h2></div><span>{text("基于当前后端市场快照", "Based on the current gateway snapshot")}</span></div>
    <div className="home-insight-grid">
      <HomeRankingCard title={text("涨跌榜", "Change leaders")} markets={gainers} language={language} onOpenMarket={onOpenMarket} value="change" />
      <HomeRankingCard title={text("成交额榜", "Volume leaders")} markets={volumeLeaders} language={language} onOpenMarket={onOpenMarket} value="volume" />
    </div>
  </section>;
}

function HomeRankingCard({ title, markets, language, onOpenMarket, value }: { title: string; markets: Market[]; language: LanguageMode; onOpenMarket: (market: Market) => void; value: "change" | "volume" }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  return <article className="home-ranking-card"><h3><TrendingUp size={16} />{title}</h3>{markets.length === 0 ? <div className="home-ranking-empty"><WifiOff size={15} />{text("等待真实市场数据", "Waiting for live market data")}</div> : markets.map((market) => <button className="home-ranking-row" type="button" key={`${marketProduct(market)}:${market.symbol}`} onClick={() => onOpenMarket(market)}><span><strong>{market.symbol}</strong><small>{language === "en-US" ? PRODUCT_META[marketProduct(market)].shortLabelEn : PRODUCT_META[marketProduct(market)].shortLabel}</small></span>{value === "change" ? <b className={market.change24hPpm >= 0 ? "home-market-up" : "home-market-down"}>{market.change24hPpm >= 0 ? "+" : ""}{displayPpm(market.change24hPpm)}</b> : <b>{compact(market.volume24hUnits)}</b>}</button>)}</article>;
}

function LiveStatus({ state, lastEventAt, onRefresh }: { state: ConnectionState; lastEventAt?: Date; onRefresh: () => void }) {
  const label = state === "live" ? "LIVE" : state === "degraded" ? "RECONNECTING" : "WAITING";
  return <div className={`live-status live-status-${state}`}><span className="live-status-dot" /><span>{label}</span><small>{lastEventAt ? lastEventAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}</small><button aria-label="Refresh market data" onClick={onRefresh}><RefreshCw size={13} /></button></div>;
}

function AssetsPage({
  balances,
  markets,
  fundingBalanceState,
  session,
  language,
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
  language: LanguageMode;
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
  const text = (zh: string, en: string) => localized(language, zh, en);
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
      <AssetTabs active={text("资产总览", "Overview")} language={language} />
      <div className="asset-layout">
        <div className="asset-main">
          <section className="asset-summary-card">
            <div>
              <p className="asset-label">{text("资金账户估值", "Funding account valuation")} <Eye size={15} /></p>
              <h1>{totalValue === null ? "—" : formatValuation(totalValue, valuationCurrency)} <span><select className="asset-valuation-select" value={valuationCurrency} onChange={(event) => onValuationCurrencyChange(event.target.value as ValuationCurrency)} aria-label={text("估值货币", "Valuation currency")}><option value="USDT">USDT</option><option value="USD">USD</option><option value="CNY">CNY</option></select><ChevronDown size={13} /></span></h1>
              <p className="asset-login-note">{hasValuation ? text("按实时市场价估值，收益以资金账本为准", "Valued with live market prices; ledger activity is authoritative") : text("行情或汇率未同步，已隐藏估值", "Valuation is hidden until market data and FX rates are synchronized")}</p>
              <div className="asset-actions">
                <button className="active" onClick={onDeposit}>{text("充币", "Deposit")}</button>
                <button onClick={onWithdraw}>{text("提币", "Withdraw")}</button>
                <button onClick={onTransfer}>{text("资金划转", "Transfer")}</button>
              </div>
            </div>
            <ChevronDown className="asset-card-chevron" size={24} />
          </section>

          <section className={`asset-portfolio-card${compactTable ? " compact" : ""}`}>
            <h2>{text("资产组合", "Portfolio")}</h2>
            <div className="portfolio-cards">
              <PortfolioBox icon={<WalletCards size={18} />} title={text("资金账户", "Funding")} value={totalValue === null ? "—" : formatValuation(totalValue, valuationCurrency)} />
              <PortfolioBox icon={<Activity size={18} />} title={text("交易账户", "Trading")} value="—" />
              <PortfolioBox icon={<Coins size={18} />} title={text("赚币", "Earn")} value="—" />
            </div>
            <div className="asset-table-toolbar">
              <div className="asset-search"><Search size={16} />{text("搜索", "Search")}</div>
              <button type="button" aria-label={text("切换资产列表密度", "Toggle asset list density")} title={text("切换资产列表密度", "Toggle asset list density")} aria-pressed={compactTable} onClick={() => setCompactTable((current) => !current)}><TableProperties size={16} /></button>
            </div>
            <h3>{text("代币", "Assets")}</h3>
            <div className="pc-asset-row pc-asset-head"><span>{text("名称", "Name")}</span><span>{text("数量", "Amount")}</span><span>{text("估值/现货收益", "Valuation / spot P&L")}</span></div>
            {assets.map((asset, index) => {
              const amount = unitsToNumber(asset.equityUnits);
              const value = valuationMarketState === "ready" ? assetValues[index] : null;
              return (
                <div className="pc-asset-row" key={`${asset.accountType}-${asset.asset}`}>
                  <span className="pc-asset-name"><AssetIcon symbol={asset.asset} /><strong>{asset.asset}</strong><small>{assetName(asset.asset)}</small></span>
                  <span>{displayUnits(asset.equityUnits, 8)}</span>
                  <span><strong>{value === null ? "—" : formatValuation(value, valuationCurrency)}</strong><small>{text("实时估值", "Live valuation")}</small></span>
                </div>
              );
            })}
            {!session && <p className="asset-login-note">{text("登录后可同步真实资产和资金记录。", "Log in to sync real assets and funding records.")}</p>}
            {session && fundingBalanceState === "loading" && <p className="asset-login-note">{text("正在同步资金账户真实余额…", "Syncing real funding account balances…")}</p>}
            {session && fundingBalanceState === "error" && <p className="asset-login-note" role="alert">{text("资金账户数据暂不可用，已隐藏余额，请稍后重试。", "Funding account data is unavailable; balances are hidden. Please try again later.")}</p>}
            {session && hasFundingBalances && !hasValuation && <p className="asset-login-note" role="status">{text("部分资产缺少可用市场价格或汇率，估值将在同步完成后显示。", "Some assets are missing a usable market price or FX rate; valuation will appear after synchronization.")}</p>}
          </section>
        </div>

        <aside className="recent-ledger-card">
          <div className="ledger-title"><h3>{text("近期资金账单", "Recent funding ledger")}</h3></div>
          <p className="asset-login-note">{text("真实资金流水将在资金账户记录同步后显示。", "Real ledger activity will appear after funding account records are synchronized.")}</p>
        </aside>
      </div>
      <SupportBubble language={language} onOpen={onHelp} />
    </section>
  );
}

function formatKycFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateKycSubmission(
  language: LanguageMode,
  applicantType: string,
  kycLevel: string,
  faceVerificationStatus: string,
  provider: string,
  providerReference: string,
  documents: KycDocument[]
) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const types = new Set(documents.map((document) => document.documentType));
  if (!types.has("ID_CARD") && !types.has("PASSPORT")) throw new Error(text("请上传身份证或护照。", "Upload an ID card or passport."));
  if (applicantType === "BUSINESS" && !types.has("BUSINESS_LICENSE")) throw new Error(text("企业认证还需要上传营业执照。", "Business verification also requires a business license."));
  if ((kycLevel === "STANDARD" || kycLevel === "ENHANCED") && !types.has("ADDRESS_PROOF")) throw new Error(text("标准及以上认证还需要上传地址证明。", "Standard and enhanced verification also require proof of address."));
  if (kycLevel === "ENHANCED" && faceVerificationStatus !== "PENDING") throw new Error(text("增强认证需要启用人脸识别。", "Enhanced verification requires face verification."));
  if (faceVerificationStatus === "PENDING" && !types.has("FACE_IMAGE")) throw new Error(text("启用人脸识别时还需要上传人脸材料。", "Upload face-verification evidence when face verification is enabled."));
  if (provider === "THIRD_PARTY" && !providerReference.trim()) throw new Error(text("第三方认证需要填写服务引用。", "Enter the service reference for third-party verification."));
}

function SecurityPage({ language, session, onLogin }: { language: LanguageMode; session: AuthSession | null; onLogin: () => void }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
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
  const [apiKeyAllowlistDrafts, setApiKeyAllowlistDrafts] = useState<Record<string, string>>({});
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
      void reload().catch((cause) => setError(cause instanceof Error ? cause.message : text("安全信息加载失败", "Failed to load security information")));
    }
  }, [session?.accessToken]);

  if (!session) {
    return (
      <section className="security-page">
        <UiCard className="panel security-locked">
          <ShieldCheck size={42} />
          <h1>{text("安全中心", "Security center")}</h1>
          <p>{text("登录后管理 2FA、敏感操作验证和 API 访问权限。", "Log in to manage 2FA, sensitive-action verification, and API access.")}</p>
          <UiButton variant="primary" className="primary-button" onClick={onLogin}>{text("登录后继续", "Log in to continue")}</UiButton>
        </UiCard>
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
      setError(cause instanceof Error ? cause.message : text("操作失败", "Operation failed"));
    } finally {
      setBusy(false);
    }
  }

  function togglePermission(permission: string) {
    setApiPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  }

  function updateApiKeyAllowlistDraft(apiKey: string, value: string) {
    setApiKeyAllowlistDrafts((current) => ({ ...current, [apiKey]: value }));
  }

  function apiKeyAllowlistDraft(apiKey: ApiKeyView): string {
    return apiKeyAllowlistDrafts[apiKey.apiKey] ?? (apiKey.ipAllowlist ?? []).join(", ");
  }

  function parseIpAllowlist(value: string): string[] {
    return Array.from(new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)));
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
          <h1>{text("安全中心", "Security center")}</h1>
          <p>{text("邮箱是账户主身份。每项敏感能力都可以", "Email is the primary account identity. Each sensitive capability can be ")}<span className="no-wrap">{text("独立开关", "controlled independently")}</span>{text("，变更会留下可追溯记录。", "; every change leaves a traceable record.")}</p>
        </div>
        <div className="security-account"><ShieldCheck size={18} />{session.user.email ?? text("账户", "Account")}</div>
      </div>
      {(notice || error) && <UiAlert className={error ? "security-alert error" : "security-alert success"} tone={error ? "error" : "success"}>{error || notice}</UiAlert>}
      <div className="security-grid">
        <section className="panel security-card">
          <div className="panel-title"><span><KeyRound size={16} />{text("登录保护", "Login protection")}</span><UiStatusBadge tone={mfa?.enabled ? "positive" : "warning"}>{mfa?.enabled ? text("已启用", "Enabled") : text("未启用", "Disabled")}</UiStatusBadge></div>
          <p className="security-muted">{text("绑定验证器后，关闭安全场景和 API 敏感权限会额外要求动态验证码。", "After binding an authenticator, disabling security scenes or sensitive API permissions also requires a one-time code.")}</p>
          {!mfa?.enabled && !enrollment && <UiButton variant="primary" className="primary-button" busy={busy} onClick={() => void run(async () => setEnrollment(await enrollMfa(session)), text("已生成 2FA 绑定信息", "2FA enrollment details generated"))}>{text("绑定 2FA", "Bind 2FA")}</UiButton>}
          {enrollment && !mfa?.enabled && (
            <div className="security-enrollment">
              <UiField label={text("密钥", "Secret")}><input readOnly value={enrollment.secret} /></UiField>
              <UiField label={text("验证器 URI", "Authenticator URI")}><input readOnly value={enrollment.provisioningUri} /></UiField>
              <UiField label={text("输入验证器 6 位验证码", "Enter the 6-digit authenticator code")}><input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></UiField>
              <UiButton variant="primary" className="security-primitive-button" busy={busy} disabled={totpCode.length !== 6} onClick={() => void run(async () => { setMfa(await confirmMfa(session, totpCode)); setEnrollment(null); setTotpCode(""); }, text("2FA 已启用", "2FA enabled"))}>{text("确认绑定", "Confirm binding")}</UiButton>
            </div>
          )}
          {mfa?.enabled && <div className="security-inline-form"><UiField label={text("关闭 2FA 验证码", "Code to disable 2FA")}><input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></UiField><UiButton variant="secondary" className="security-primitive-button" busy={busy} disabled={totpCode.length !== 6} onClick={() => void run(async () => { setMfa(await disableMfa(session, totpCode)); setTotpCode(""); }, text("2FA 已关闭", "2FA disabled"))}>{text("关闭 2FA", "Disable 2FA")}</UiButton></div>}
        </section>
        <section className="panel security-card">
          <div className="panel-title"><span><ShieldCheck size={16} />{text("敏感场景", "Sensitive scenes")}</span><strong>{text("可配置", "Configurable")}</strong></div>
          <p className="security-muted">{text("修改安全场景需要邮箱验证；开启 2FA 后还需动态验证码。", "Changing a security scene requires email verification; enabled 2FA adds an authenticator code.")}</p>
          <div className="security-scenes">
            {scenes.map((scene) => <label className="security-scene" key={scene.sceneCode}><span><strong>{scene.label}</strong><small>{scene.sceneCode}</small></span><input type="checkbox" checked={scene.enabled} disabled={busy} onChange={() => void run(() => changeSecurityScene(session, scene), `${scene.label}已更新`)} /></label>)}
          </div>
          <div className="security-verification-row"><UiField label={text("安全设置邮箱验证码", "Security settings email code")}><input value={securityEmailCode} onChange={(event) => setSecurityEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></UiField><UiField label={text("2FA 验证码", "2FA code")}><input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></UiField><UiButton variant="secondary" className="security-primitive-button" busy={busy} onClick={() => void run(async () => { await issueSecurityChallenge(session, "SECURITY_SETTINGS"); }, text("验证码已发送到邮箱", "Verification code sent by email"))}>{text("发送验证码", "Send code")}</UiButton></div>
        </section>
      </div>
      <section className="panel security-card">
        <div className="panel-title"><span><KeyRound size={16} />{text("修改密码", "Change password")}</span><strong>{text("需验证", "Verification required")}</strong></div>
        <p className="security-muted">{text("修改密码后，其他登录设备的 refresh session 会立即失效。若开启了修改密码场景，请先发送邮箱验证码。", "Other refresh sessions are invalidated after a password change. If the password-change scene is enabled, send an email code first.")}</p>
        <div className="security-inline-form">
          <UiField label={text("当前密码", "Current password")}><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></UiField>
          <UiField label={text("新密码", "New password")}><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={text("至少 8 位", "At least 8 characters")} /></UiField>
        </div>
        <div className="security-verification-row">
          <UiField label={text("邮箱验证码", "Email code")}><input value={changePasswordEmailCode} onChange={(event) => setChangePasswordEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></UiField>
          <UiField label={text("2FA 验证码", "2FA code")}><input value={changePasswordTotpCode} onChange={(event) => setChangePasswordTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></UiField>
          <UiButton variant="secondary" className="security-primitive-button" busy={busy} onClick={() => void run(async () => { await issueSecurityChallenge(session, "CHANGE_PASSWORD"); }, text("验证码已发送到邮箱", "Verification code sent by email"))}>{text("发送验证码", "Send code")}</UiButton>
          <UiButton variant="primary" className="security-primitive-button" busy={busy} disabled={!currentPassword || newPassword.length < 8} onClick={() => void run(async () => { await changePassword(session, currentPassword, newPassword, changePasswordEmailCode, changePasswordTotpCode); setCurrentPassword(""); setNewPassword(""); setChangePasswordEmailCode(""); setChangePasswordTotpCode(""); }, text("密码已修改，请重新登录其他设备", "Password changed; other sessions must sign in again"))}>{text("确认修改", "Confirm change")}</UiButton>
        </div>
      </section>
      <section className="panel security-card kyc-card">
        <div className="panel-title"><span><FileText size={16} />{text("身份认证 KYC", "Identity verification KYC")}</span><strong className={kyc?.status === "VERIFIED" ? "tone-up" : kyc?.status === "REJECTED" ? "tone-down" : "tone-gold"}>{kyc?.status ?? text("未提交", "Not submitted")}</strong></div>
        <p className="security-muted">{text("提币前必须完成 KYC。基础认证需要身份证或护照；标准及以上还需要地址证明；企业认证还需要营业执照；启用人脸识别时需要人脸材料。", "KYC is required before withdrawals. Basic verification needs an ID card or passport; standard and above also need proof of address; business verification needs a license; face verification needs face material.")}</p>
        {kyc?.rejectionReason && <div className="security-alert error">{text("审核意见：", "Review note: ")}{kyc.rejectionReason}</div>}
        <div className="kyc-form-grid">
          <UiField label={text("申请主体", "Applicant type")}><select value={kycApplicantType} onChange={(event) => setKycApplicantType(event.target.value)}><option value="INDIVIDUAL">{text("个人", "Individual")}</option><option value="BUSINESS">{text("企业", "Business")}</option></select></UiField>
          <UiField label={text("认证等级", "Verification level")}><select value={kycLevel} onChange={(event) => setKycLevel(event.target.value)}><option value="BASIC">{text("基础", "Basic")}</option><option value="STANDARD">{text("标准", "Standard")}</option><option value="ENHANCED">{text("增强", "Enhanced")}</option></select></UiField>
          <UiField label={text("国家/地区代码", "Country / region code")}><input value={kycCountry} onChange={(event) => setKycCountry(event.target.value.toUpperCase().slice(0, 2))} placeholder="CN" maxLength={2} /></UiField>
          <UiField label={text("主证件类型", "Primary document")}><select value={kycDocumentType} onChange={(event) => setKycDocumentType(event.target.value)}><option value="ID_CARD">{text("身份证", "ID card")}</option><option value="PASSPORT">{text("护照", "Passport")}</option><option value="BUSINESS_LICENSE">{text("企业营业执照", "Business license")}</option></select></UiField>
          <UiField label={text("认证服务", "Verification provider")}><select value={kycProvider} onChange={(event) => setKycProvider(event.target.value)}><option value="SELF">{text("平台审核", "Platform review")}</option><option value="THIRD_PARTY">{text("第三方服务", "Third-party service")}</option></select></UiField>
          <UiField label={<>{text("服务引用", "Provider reference")}{kycProvider === "THIRD_PARTY" ? "" : text("（可选）", " (optional)")}</>}><input value={kycProviderReference} onChange={(event) => setKycProviderReference(event.target.value)} placeholder={kycProvider === "THIRD_PARTY" ? text("第三方返回的核验编号", "Reference from provider") : "provider-reference"} /></UiField>
        </div>
        <div className="kyc-upload-grid">
          <UiField label={text("上传材料类型", "Document type")}><select value={kycUploadType} onChange={(event) => setKycUploadType(event.target.value)}><option value="ID_CARD">{text("身份证", "ID card")}</option><option value="PASSPORT">{text("护照", "Passport")}</option><option value="ADDRESS_PROOF">{text("地址证明", "Proof of address")}</option><option value="BUSINESS_LICENSE">{text("企业营业执照", "Business license")}</option><option value="FACE_IMAGE">{text("人脸照片", "Face image")}</option></select></UiField>
          <UiField label={text("选择 PDF 或图片", "Choose PDF or image")}><input ref={kycFileInputRef} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setKycFile(event.target.files?.[0] ?? null)} /></UiField>
          <UiButton variant="secondary" className="security-primitive-button" busy={busy} disabled={!kycFile} onClick={() => void run(async () => { if (!kycFile) throw new Error(text("请选择 KYC 材料", "Choose a KYC document")); const uploaded = await uploadKycDocument(session, kycUploadType, kycFile); setKycUploadedDocuments((current) => [uploaded, ...current]); setKycFile(null); if (kycFileInputRef.current) kycFileInputRef.current.value = ""; }, text("材料已上传", "Document uploaded"))}>{text("上传材料", "Upload document")}</UiButton>
        </div>
        <div className="kyc-document-list" aria-live="polite">{kycUploadedDocuments.length === 0 ? <small className="security-muted">{text("尚未上传材料。请至少上传主证件；标准及以上认证请同时上传地址证明。", "No documents uploaded. Upload a primary document; standard and above also need proof of address.")}</small> : kycUploadedDocuments.map((document) => <div className="kyc-document-row" key={document.documentId}><span><strong>{document.originalFilename}</strong><small>{document.documentType} · {formatKycFileSize(document.fileSize)}</small></span><em>{document.status === "SUBMITTED" ? text("已提交", "Submitted") : text("已上传", "Uploaded")}</em></div>)}</div>
        <div className="security-inline-form kyc-submit-row"><UiField label={text("人脸状态", "Face verification")}><select value={kycFaceStatus} onChange={(event) => setKycFaceStatus(event.target.value)}><option value="NOT_REQUIRED">{text("暂不启用", "Not enabled")}</option><option value="PENDING">{text("等待人脸识别", "Face verification pending")}</option></select></UiField><UiButton variant="primary" className="security-primitive-button" busy={busy} disabled={!kycCountry || kycCountry.length !== 2 || kycUploadedDocuments.length === 0} onClick={() => void run(async () => { validateKycSubmission(language, kycApplicantType, kycLevel, kycFaceStatus, kycProvider, kycProviderReference, kycUploadedDocuments); setKyc(await submitKyc(session, { applicantType: kycApplicantType, kycLevel, country: kycCountry, documentType: kycDocumentType, provider: kycProvider, providerReference: kycProviderReference || undefined, faceVerificationStatus: kycFaceStatus, documentIds: kycUploadedDocuments.map((document) => document.documentId) })); }, text("KYC 已提交，等待审核", "KYC submitted for review"))}>{text("提交认证", "Submit verification")}</UiButton></div>
      </section>
      <section className="panel security-card api-key-card">
        <div className="panel-title"><span><KeyRound size={16} />API Key</span><strong>{text("兼容交易 API", "Trading API compatible")}</strong></div>
        <p className="security-muted">{text("Secret 只在创建成功时显示一次。提现权限默认关闭，签名、时间戳和幂等键由服务端校验。", "The Secret is shown only once. Withdrawal permission is off by default; the server validates signatures, timestamps, and idempotency keys.")}</p>
        <div className="api-key-create">
          <UiField label={text("名称", "Label")}><input value={apiLabel} onChange={(event) => setApiLabel(event.target.value)} placeholder={text("例如：量化主账户", "e.g. primary trading bot")} /></UiField>
          <div className="permission-picker">{["TRADE", "WITHDRAW"].map((permission) => <label key={permission}><input type="checkbox" checked={apiPermissions.includes(permission)} onChange={() => togglePermission(permission)} />{permission === "TRADE" ? text("交易", "Trade") : text("提现", "Withdraw")}</label>)}</div>
          <UiButton variant="primary" className="security-primitive-button" busy={busy} disabled={!apiLabel.trim()} onClick={() => void run(async () => { const created = await createApiKey(session, apiLabel.trim(), apiPermissions, emailCode, apiTotpCode); setCreatedSecret(created.secret); setApiLabel(""); setEmailCode(""); setApiTotpCode(""); await reload(); }, text("API Key 已创建，请立即保存 Secret", "API Key created; save the Secret now"))}>{text("创建 Key", "Create key")}</UiButton>
        </div>
        <div className="security-verification-row"><UiField label={text("邮箱验证码", "Email code")}><input value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></UiField><UiField label={text("2FA 验证码", "2FA code")}><input value={apiTotpCode} onChange={(event) => setApiTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></UiField><UiButton variant="secondary" className="security-primitive-button" busy={busy} onClick={() => void run(async () => { await issueSecurityChallenge(session, "SECURITY_SETTINGS"); }, text("验证码已发送到邮箱", "Verification code sent by email"))}>{text("发送邮箱验证码", "Send email code")}</UiButton></div>
        {createdSecret && <div className="secret-reveal"><strong>{text("Secret 仅显示这一次", "Secret is shown only once")}</strong><code>{createdSecret}</code><UiButton variant="secondary" className="security-primitive-button" onClick={() => void navigator.clipboard?.writeText(createdSecret)}>{text("复制 Secret", "Copy Secret")}</UiButton></div>}
        <div className="api-key-list">{keys.length === 0 ? <p className="empty">{text("暂无 API Key", "No API keys")}</p> : keys.map((apiKey) => <div className="api-key-row" key={apiKey.apiKey}><div><strong>{apiKey.label}</strong><small>{apiKey.apiKey} · {apiKey.permissions}</small>{apiKey.status === "ACTIVE" && <label className="api-key-allowlist">{text("IP 白名单", "IP allowlist")}<input value={apiKeyAllowlistDraft(apiKey)} onChange={(event) => updateApiKeyAllowlistDraft(apiKey.apiKey, event.target.value)} placeholder={text("多个 IP 用逗号或空格分隔；留空即不限制", "Separate IPs with commas or spaces; leave empty for no restriction")} /><button className="ghost-button" disabled={busy} onClick={() => void run(async () => { await updateApiKeyIpAllowlist(session, apiKey.apiKey, parseIpAllowlist(apiKeyAllowlistDraft(apiKey)), emailCode, apiTotpCode); await reload(); }, text("IP 白名单已更新", "IP allowlist updated"))}>{text("更新白名单", "Update allowlist")}</button></label>}</div><span className={apiKey.status === "ACTIVE" ? "tone-up" : "security-muted"}>{apiKey.status}</span>{apiKey.status === "ACTIVE" && <button className="ghost-button danger" disabled={busy} onClick={() => void run(async () => { await revokeApiKey(session, apiKey.apiKey, emailCode, apiTotpCode); await reload(); }, text("API Key 已撤销", "API key revoked"))}>{text("撤销", "Revoke")}</button>}</div>)}</div>
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
  language,
  onAuthenticated,
  onBack
}: {
  initialMode: AuthMode;
  language: LanguageMode;
  onAuthenticated: (session: AuthSession) => void;
  onBack: () => void;
}) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [step, setStep] = useState<AuthStep>(initialMode);
  const [email, setEmail] = useState(config.testAccount?.email ?? "");
  const [password, setPassword] = useState(config.testAccount?.password ?? "");
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
        setNotice(text("如果该邮箱已注册，验证码已发送。请检查收件箱和垃圾邮件。", "If this email is registered, a code was sent. Check your inbox and spam folder."));
      } else if (step === "reset") {
        await resetPassword(email, code, password);
        setStep("login");
        setCode("");
        setPassword("");
        setNotice(text("密码已更新，请使用新密码登录。", "Password updated. Sign in with your new password."));
      } else if (step === "verify" && pendingSession) {
        const verified = await verifyEmail(pendingSession, email, code);
        if (!verified) throw new Error(text("验证码无效或已过期", "The verification code is invalid or expired"));
        onAuthenticated(pendingSession);
      } else {
        const session = step === "login" ? await login(email, password) : await register(email, password);
        if (step === "register" && session.requiresEmailVerification !== false) {
          setPendingSession(session);
          setStep("verify");
          setNotice(text("验证码已发送到你的邮箱，请完成验证后进入交易。", "A verification code was sent to your email. Verify it before trading."));
        } else {
          onAuthenticated(session);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : text("认证失败", "Authentication failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <section className="auth-panel">
        <div className="auth-logo">
          <span><Sparkles size={25} /></span>
          <strong>Surprising EX</strong>
        </div>
        {step === "login" || step === "register" ? (
          <div className="auth-tabs">
            <button disabled={busy} className={step === "login" ? "active" : ""} onClick={() => { setStep("login"); setError(""); setNotice(""); }}>{text("登录", "Log in")}</button>
            <button disabled={busy} className={step === "register" ? "active" : ""} onClick={() => { setStep("register"); setError(""); setNotice(""); }}>{text("注册", "Sign up")}</button>
          </div>
        ) : (
          <div className="auth-step-heading">
            <span className="auth-eyebrow">SECURE ACCESS</span>
            <h2>{step === "verify" ? text("验证邮箱", "Verify email") : step === "reset" ? text("设置新密码", "Set new password") : text("找回密码", "Reset password")}</h2>
          </div>
        )}
        {step !== "verify" && (
          <UiField label={text("邮箱地址", "Email address")}>
            <input value={email} onChange={(event) => setEmail(event.target.value.trim())} type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" aria-invalid={error ? true : undefined} aria-describedby={statusDescription} />
          </UiField>
        )}
        {step === "verify" && <p className="hint">{text("验证码已发送至", "A code was sent to")} {email.replace(/(^.).*(@.*$)/, "$1•••$2")}{text("，有效期 10 分钟。", "; it expires in 10 minutes.")}</p>}
        {(step === "login" || step === "register") && (
          <UiField label={text("密码", "Password")}>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={step === "login" ? "current-password" : "new-password"} placeholder={text("至少 8 位", "At least 8 characters")} aria-invalid={error ? true : undefined} aria-describedby={statusDescription} />
          </UiField>
        )}
        {(step === "verify" || step === "reset") && (
          <UiField label={text("邮箱验证码", "Email code")}>
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder={text("6 位数字", "6 digits")} aria-invalid={error ? true : undefined} aria-describedby={statusDescription} />
          </UiField>
        )}
        {step === "reset" && (
          <UiField label={text("新密码", "New password")}>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder={text("至少 8 位", "At least 8 characters")} aria-invalid={error ? true : undefined} aria-describedby={statusDescription} />
          </UiField>
        )}
        {step === "login" && <button disabled={busy} className="link-button" onClick={() => { setStep("forgot"); setError(""); setNotice(""); }}>{text("忘记密码？", "Forgot password?")}</button>}
        {notice && <p id="auth-status" className="success" role="status" aria-live="polite">{notice}</p>}
        {error && <p id="auth-status" className="error" role="alert" aria-live="assertive">{error}</p>}
        <UiButton variant="primary" className="primary-button" busy={busy} onClick={submit}>
          {busy ? text("处理中...", "Processing...") : step === "login" ? text("登录", "Log in") : step === "register" ? text("注册", "Sign up") : step === "verify" ? text("完成邮箱验证", "Verify email") : step === "reset" ? text("更新密码", "Update password") : text("发送验证码", "Send code")}
        </UiButton>
        {step === "verify" && pendingSession && <button className="ghost-button" disabled={busy} onClick={async () => { setBusy(true); setError(""); setNotice(""); try { await resendEmailVerification(pendingSession); setNotice(text("新的验证码已发送。", "A new code was sent.")); } catch (err) { setError(err instanceof Error ? err.message : text("验证码发送失败", "Failed to send code")); } finally { setBusy(false); } }}>{text("重新发送验证码", "Resend code")}</button>}
        {(step === "forgot" || step === "reset") && <button disabled={busy} className="ghost-button" onClick={() => { setStep("login"); setError(""); setNotice(""); }}>{text("返回登录", "Back to log in")}</button>}
      </section>
    </section>
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
  onLogout,
  connectionState,
  lastEventAt,
  onRefresh
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
  connectionState: ConnectionState;
  lastEventAt?: Date;
  onRefresh: () => void;
}) {
  const [mobileProductsOpen, setMobileProductsOpen] = useState(false);
  const query = marketSearch.trim().toUpperCase();
  const searchResults = query
    ? markets.filter((market) => `${market.symbol} ${displayMarketName(language, market)}`.toUpperCase().includes(query)).slice(0, 6)
    : [];

  function openMarket(symbol: string) {
    onMarketSearchChange("");
    onMarketSelect(symbol);
  }

  return (
    <header className={mobileProductsOpen ? "topbar product-menu-open" : "topbar"}>
      <button className="brand platform-brand" aria-label={localized(language, "返回首页", "Go to home")} onClick={() => onPageChange("home")}>
        <span className="platform-mark"><Sparkles size={16} /></span>
        <strong>Surprising EX</strong>
      </button>
      <nav>
        <button className={page === "home" ? "active home-nav-link" : "home-nav-link"} onClick={() => onPageChange("home")}><House size={15} />{localized(language, "首页", "Home")}</button>
        <button className={page === "trade" && productMode === "linear" ? "active" : ""} onClick={() => onProductModeChange("linear")}><CircleDollarSign size={15} />{localized(language, "U本位", "USDT")}</button>
        <button className={page === "trade" && productMode === "inverse" ? "active" : ""} onClick={() => onProductModeChange("inverse")}><Layers3 size={15} />{localized(language, "币本位", "Coin")}</button>
        <button className={page === "trade" && productMode === "linearDelivery" ? "active" : ""} onClick={() => onProductModeChange("linearDelivery")}><Clock3 size={15} />{localized(language, "U交割", "USDT Delivery")}</button>
        <button className={page === "trade" && productMode === "inverseDelivery" ? "active" : ""} onClick={() => onProductModeChange("inverseDelivery")}><Clock3 size={15} />{localized(language, "币交割", "Coin Delivery")}</button>
        <button className={page === "trade" && productMode === "option" ? "active" : ""} onClick={() => onProductModeChange("option")}><Sparkles size={15} />{localized(language, "期权", "Options")}</button>
        <button className={page === "trade" && productMode === "spot" ? "active" : ""} onClick={() => onProductModeChange("spot")}><WalletCards size={15} />{localized(language, "现货", "Spot")}</button>
        <button className={page === "markets" ? "active" : ""} onClick={() => onPageChange("markets")}><TrendingUp size={15} />{localized(language, "行情", "Markets")}</button>
        <button className={page === "rules" ? "active" : ""} onClick={() => onPageChange("rules")}><FileText size={15} />{localized(language, "交易规则", "Rules")}</button>
      </nav>
      <div className="top-actions">
        <LiveStatus state={connectionState} lastEventAt={lastEventAt} onRefresh={onRefresh} />
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
                  <small>{displayMarketName(language, market)}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="asset-charge" onClick={() => onPageChange("recharge")}>{localized(language, "充值", "Deposit")}</button>
        <button className={`user-pill asset-management-button ${page === "assets" ? "active" : ""}`} onClick={() => onPageChange("assets")}>{localized(language, "资产管理", "Assets")}</button>
        <button className={`user-pill security-center-button ${page === "security" ? "active" : ""}`} onClick={() => onPageChange("security")}><ShieldCheck size={14} />{localized(language, "安全中心", "Security")}</button>
        <button onClick={onThemeToggle} aria-label={localized(language, "切换明暗主题", "Toggle theme")}>{theme === "dark" ? <Sun size={16} /> : <MoonStar size={16} />}</button>
        <button onClick={onLanguageToggle} aria-label={localized(language, "切换语言", "Switch language")}>{language === "zh-CN" ? "EN" : "中文"}</button>
        <button className="mobile-product-toggle" aria-expanded={mobileProductsOpen} aria-controls="mobile-product-menu" onClick={() => setMobileProductsOpen((current) => !current)}><Layers3 size={14} />{localized(language, "产品线", "Products")}</button>
        {session ? (
          <>
            <button className="user-pill mobile-account" aria-label={localized(language, "打开安全中心", "Open security center")} onClick={() => onPageChange("security")}><ShieldCheck size={14} /><span>{session.user.email ?? localized(language, "账户", "Account")}</span></button>
            <button className="logout-button mobile-logout" aria-label={localized(language, "退出登录", "Log out")} onClick={onLogout}><LogOut size={16} /><span>{localized(language, "退出", "Log out")}</span></button>
          </>
        ) : (
          <>
            <button className="auth-entry" onClick={onLogin}>{localized(language, "登录", "Log in")}</button>
            <button className="auth-entry" onClick={onRegister}>{localized(language, "注册", "Sign up")}</button>
          </>
        )}
      </div>
      {mobileProductsOpen && <div className="mobile-products-menu" id="mobile-product-menu">
        <button onClick={() => { onPageChange("home"); setMobileProductsOpen(false); }}>{localized(language, "首页", "Home")}</button>
        <button onClick={() => { onPageChange("markets"); setMobileProductsOpen(false); }}>{localized(language, "行情中心", "Markets")}</button>
        <button onClick={() => { onPageChange("recharge"); setMobileProductsOpen(false); }}>{localized(language, "充值", "Deposit")}</button>
        <button onClick={() => { onPageChange("assets"); setMobileProductsOpen(false); }}>{localized(language, "资产管理", "Assets")}</button>
        <button onClick={() => { onPageChange("security"); setMobileProductsOpen(false); }}>{localized(language, "安全中心", "Security")}</button>
        {(Object.entries(PRODUCT_META) as Array<[ProductMode, typeof PRODUCT_META[ProductMode]]>).map(([mode, meta]) => <button key={mode} onClick={() => { onProductModeChange(mode); setMobileProductsOpen(false); }}>{language === "en-US" ? meta.labelEn : meta.label}</button>)}
        <button onClick={() => { onPageChange("rules"); setMobileProductsOpen(false); }}>{localized(language, "交易规则", "Rules")}</button>
      </div>}
    </header>
  );
}

function MarketRail({
  language,
  productMode,
  markets,
  marketSearch,
  symbol,
  onSearchChange,
  onSelect
}: {
  language: LanguageMode;
  productMode: ProductMode;
  markets: Market[];
  marketSearch: string;
  symbol: string;
  onSearchChange: (value: string) => void;
  onSelect: (symbol: string) => void;
}) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const query = marketSearch.trim().toUpperCase();
  const filteredMarkets = query
    ? markets.filter((market) => `${market.symbol} ${displayMarketName(language, market)}`.toUpperCase().includes(query))
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
          placeholder={`${text("搜索", "Search ")}${language === "en-US" ? PRODUCT_META[productMode].shortLabelEn : PRODUCT_META[productMode].shortLabel}`}
        />
      </label>
      {markets.length === 0 && <p className="empty rail-empty">{text(`暂无${PRODUCT_META[productMode].label}市场`, `No ${PRODUCT_META[productMode].labelEn} markets`)}</p>}
      {markets.length > 0 && filteredMarkets.length === 0 && <p className="empty rail-empty">{text("没有匹配的币对", "No matching markets")}</p>}
      {filteredMarkets.map((market) => (
        <button className={market.symbol === symbol ? "active" : ""} key={market.symbol} title={`${market.symbol} ${displayMarketName(language, market)}`} onClick={() => onSelect(market.symbol)}>
          <span><Star size={13} />{market.symbol}</span>
          <strong>{displayMarketPrice(market, market.lastPriceTicks)}</strong>
          <small className={market.tickerReady ? (market.change24hPpm >= 0 ? "up" : "down") : "market-data-muted"}>{market.tickerReady ? displayPpm(market.change24hPpm) : "—"}</small>
          <em>{language === "en-US" ? PRODUCT_META[marketProduct(market)].shortLabelEn : PRODUCT_META[marketProduct(market)].shortLabel} · {marketProduct(market) === "spot" ? market.quoteAsset : `${market.settleAsset ?? market.quoteAsset} · ${market.maxLeverage}x`}</em>
        </button>
      ))}
    </aside>
  );
}

function MarketHeader({ language, market, loading, nowMs, onInfo }: { language: LanguageMode; market?: Market; loading: boolean; nowMs: number; onInfo: () => void }) {
  if (!market) return null;
  const text = (zh: string, en: string) => localized(language, zh, en);
  const product = marketProduct(market);
  const isSpot = product === "spot";
  const isFunding = isFundingProduct(product);
  const fundingTone = market.fundingRatePpm >= 0 ? "up" : "down";
  return (
    <section className={loading ? "market-header syncing" : "market-header"}>
      <div className="pair-title" title={`${market.symbol} ${displayMarketName(language, market)}`}>
        <Flame size={16} />
        <strong>{displayMarketName(language, market)}</strong>
        <span>{isSpot ? language === "en-US" ? PRODUCT_META[product].shortLabelEn : PRODUCT_META[product].shortLabel : `${market.maxLeverage}x`}</span>
        <button className="mini-icon-button" onClick={onInfo} aria-label={text("产品配置", "Product configuration")}><Info size={14} /></button>
      </div>
      <Metric label={text("最新", "Last")} value={priceWithQuote(market, market.lastPriceTicks, market.quoteAsset)} tone={market.change24hPpm >= 0 ? "up" : "down"} />
      <Metric label="24H" value={market.tickerReady ? displayPpm(market.change24hPpm) : "—"} tone={market.tickerReady ? (market.change24hPpm >= 0 ? "up" : "down") : undefined} />
      {isSpot ? (
        <>
          <Metric label={text("基础资产", "Base asset")} value={market.baseAsset} tone="gold" />
          <Metric label={text("计价资产", "Quote asset")} value={market.quoteAsset} />
          <Metric label={text("数量 step", "Quantity step")} value={String(market.quantityStepUnits ?? "-")} />
        </>
      ) : (
        <>
          <Metric label={text("标记", "Mark")} value={priceWithQuote(market, market.markPriceTicks, market.quoteAsset)} tone="gold" />
          <Metric label={text("指数", "Index")} value={priceWithQuote(market, market.indexPriceTicks, market.quoteAsset)} />
          {isFunding ? (
            <>
              <Metric label={text("资金费率", "Funding rate")} value={displayPpm(market.fundingRatePpm, 4)} tone={fundingTone} />
              <Metric label={text("资金费倒计时", "Funding countdown")} value={formatFundingCountdown(market, nowMs)} tone="gold" />
            </>
          ) : (
            <>
              <Metric label={product === "option" ? text("行权方向", "Option type") : text("到期时间", "Expiry")} value={product === "option" ? market.optionType ?? "-" : market.expiryTime ?? "-"} tone="gold" />
              <Metric label={text("交割时间", "Delivery")} value={market.deliveryTime ?? "-"} />
            </>
          )}
        </>
      )}
      <Metric label={text("24H量", "24H volume")} value={market.tickerReady ? compact(market.volume24hUnits) : "—"} />
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "gold" }) {
  return <div className="metric"><span>{label}</span><strong className={tone ? `tone-${tone}` : ""}>{value}</strong></div>;
}

function DerivativeLifecyclePanel({ language, market, markets, nowMs }: { language: LanguageMode; market?: Market; markets: Market[]; nowMs: number }) {
  if (!market) return null;
  const text = (zh: string, en: string) => localized(language, zh, en);
  const product = marketProduct(market);
  if (product === "spot" || isFundingProduct(product)) return null;
  const isOption = product === "option";
  const lifecycleRows: Array<[string, ReactNode]> = [
    [text("产品线", "Product line"), PRODUCT_META[product].productLine],
    [text("状态", "Status"), market.status ?? "TRADING"],
    [text("到期时间", "Expiry"), market.expiryTime ?? "-"],
    [isOption ? text("行权时间", "Exercise time") : text("交割时间", "Delivery"), market.deliveryTime ?? "-"],
    [text("剩余时间", "Time remaining"), formatLifecycleCountdown(language, market, nowMs)],
    [text("结算方式", "Settlement"), market.settlementMethod ?? "-"]
  ];
  const optionChain = isOption ? optionChainForMarket(market, markets) : [];
  const optionMetrics = isOption ? optionMetricRows(language, market, markets) : [];
  return (
    <section className="product-insight panel">
      <div className="panel-title">
        <span>{isOption ? <Sparkles size={16} /> : <Clock3 size={16} />}{isOption ? text("期权链路", "Options chain") : text("交割合约生命周期", "Delivery lifecycle")}</span>
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
            <div className="option-chain-head"><span>{text("到期/行权价", "Expiry / strike")}</span><span>CALL</span><span>PUT</span></div>
            {optionChain.length ? optionChain.map((row) => (
              <div className="option-chain-row" key={`${row.expiry}-${row.strike}`}>
                <span>{row.expiry} · {row.strike}</span>
                <strong className={row.call === market.symbol ? "active" : ""}>{row.call ?? "-"}</strong>
                <strong className={row.put === market.symbol ? "active" : ""}>{row.put ?? "-"}</strong>
              </div>
            )) : <p className="empty option-empty">{text("暂无同到期日期权链", "No options with this expiry")}</p>}
          </div>
        </div>
      ) : (
        <div className="delivery-note">
          <Metric label={text("标记价格", "Mark price")} value={priceWithQuote(market, market.markPriceTicks, market.quoteAsset)} tone="gold" />
          <Metric label={text("指数价格", "Index price")} value={priceWithQuote(market, market.indexPriceTicks, market.quoteAsset)} />
          <Metric label={text("结算资产", "Settlement asset")} value={market.settleAsset ?? market.quoteAsset} />
          <Metric label={text("合约方向", "Contract direction")} value={isInverseProduct(product) ? text("币本位反向", "Coin-margined inverse") : text("U本位正向", "USDT-margined linear")} />
        </div>
      )}
    </section>
  );
}

function priceWithQuote(market: Market | undefined, priceTicks: number, quoteAsset?: string): string {
  return `${displayMarketPrice(market, priceTicks)} ${quoteAsset ?? ""}`.trim();
}

function displayMarketPrice(market: Market | undefined, priceTicks: number): string {
  if (!market?.tickerReady || !Number.isFinite(priceTicks) || priceTicks <= 0) return "—";
  return displayPrice(priceFromTicks(market, priceTicks));
}

function displayMarketName(language: LanguageMode, market: Market): string {
  if (language !== "en-US") return market.displayName;
  return `${market.symbol} ${PRODUCT_META[marketProduct(market)].shortLabelEn}`;
}

function positionModeLabel(language: LanguageMode, mode: PositionMode): string {
  return mode === "HEDGE" ? localized(language, "双向持仓", "Hedge") : localized(language, "净仓", "One-way");
}

function positionSideLabel(language: LanguageMode, side: PositionSide | "NET"): string {
  if (side === "LONG") return localized(language, "多仓", "Long");
  if (side === "SHORT") return localized(language, "空仓", "Short");
  return localized(language, "净仓", "Net");
}

function triggerTypeLabel(language: LanguageMode, type: TriggerOrderType): string {
  if (type === "TAKE_PROFIT") return localized(language, "止盈", "Take profit");
  if (type === "TRAILING_STOP") return localized(language, "追踪止损", "Trailing stop");
  return localized(language, "止损", "Stop loss");
}

function orderTypeLabel(language: LanguageMode, type: OrderType): string {
  return language === "en-US" ? type === "LIMIT" ? "Limit order" : "Market order" : type === "LIMIT" ? "限价单" : "市价单";
}

function marginModeLabel(language: LanguageMode, mode: MarginMode): string {
  return language === "en-US" ? mode === "CROSS" ? "Cross" : "Isolated" : mode === "CROSS" ? "全仓" : "逐仓";
}

function timeInForceLabel(language: LanguageMode, value: TimeInForce): string {
  const labels: Record<TimeInForce, [string, string]> = {
    GTC: ["一直有效", "Good till canceled"],
    IOC: ["立即成交或取消", "Immediate or cancel"],
    FOK: ["全部成交或取消", "Fill or kill"],
    GTX: ["只做 Maker", "Post only"]
  };
  return labels[value][language === "en-US" ? 1 : 0];
}

function algoTypeLabel(language: LanguageMode, type: AlgoOrderType): string {
  return type === "TWAP"
    ? language === "en-US" ? "TWAP · Time sliced" : "时间加权分批"
    : language === "en-US" ? "Iceberg · Hidden size" : "冰山单 · 隐藏数量";
}

function triggerCloseLabel(language: LanguageMode, side: OrderSide, positionSide: PositionSide | "NET" | undefined): string {
  const closingLong = positionSide === "LONG" || (positionSide !== "SHORT" && side === "SELL");
  return closingLong ? localized(language, "平多", "Close long") : localized(language, "平空", "Close short");
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

function OrderBook({ language, asks, bids, market, mid, onPickPrice }: { language: LanguageMode; asks: OrderBookLevel[]; bids: OrderBookLevel[]; market?: Market; mid: number; onPickPrice: (priceTicks: number) => void }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
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
        <span><BookOpen size={16} />{text("盘口", "Order book")}</span>
        <button type="button" onClick={nextPrecision} title={text("切换盘口精度", "Change order book precision")}>{formatPrecision(market, precision)}</button>
      </div>
      <div className="book-head"><span>{text("价格", "Price")}</span><span>{text("数量", "Size")}</span><span>{text("累计", "Total")}</span></div>
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
  language,
  productMode,
  positionMode,
  symbol,
  market,
  pricePreset,
  onSubmit,
  onSubmitAlgo,
  onSubmitTriggers
}: {
  language: LanguageMode;
  productMode: ProductMode;
  positionMode: PositionMode;
  symbol: string;
  market?: Market;
  pricePreset: PickedPrice | null;
  onSubmit: (draft: PlaceOrderDraft) => void;
  onSubmitAlgo: (draft: PlaceAlgoOrderDraft) => void;
  onSubmitTriggers: (drafts: PlaceTriggerOrderDraft[]) => void;
}) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC");
  const [marginMode, setMarginMode] = useState<MarginMode>("CROSS");
  const [positionSide, setPositionSide] = useState<PositionSide>("NET");
  const [priceTicks, setPriceTicks] = useState("");
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
    if (market?.lastPriceTicks && market.lastPriceTicks > 0) setPriceTicks(String(market.lastPriceTicks));
    else if (!market) setPriceTicks("");
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
      <div className="panel-title"><span><CircleDollarSign size={16} />{text("下单", "Place order")}</span><button>{isSpot ? market?.quoteAsset ?? "SPOT" : `${positionModeLabel(language, positionMode)} · ${leverage}x`}</button></div>
      <div className="side-switch">
        <button className={side === "BUY" ? "buy active" : "buy"} onClick={() => setSide("BUY")}>{isHedgeMode || isSpot ? text("买入", "Buy") : text("开多 / 买入", "Open long / Buy")}</button>
        <button className={side === "SELL" ? "sell active" : "sell"} onClick={() => setSide("SELL")}>{isHedgeMode || isSpot ? text("卖出", "Sell") : text("开空 / 卖出", "Open short / Sell")}</button>
      </div>
      <div className={isSpot ? "order-select-row two" : "order-select-row"}>
        <label className="compact-select">{text("类型", "Type")}
          <select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)}>
            {orderTypes.map((item) => <option key={item} value={item}>{orderTypeLabel(language, item)}</option>)}
          </select>
        </label>
        {!isSpot && (
          <label className="compact-select">{text("模式", "Mode")}
            <select value={marginMode} onChange={(event) => setMarginMode(event.target.value as MarginMode)}>
              {(["CROSS", "ISOLATED"] as MarginMode[]).map((item) => <option key={item} value={item}>{marginModeLabel(language, item)}</option>)}
            </select>
          </label>
        )}
        <label className="compact-select">{text("时效", "Time in force")}
          <select value={timeInForce} onChange={(event) => setTimeInForce(event.target.value as TimeInForce)}>
            {tifOptions.map((item) => <option key={item} value={item}>{timeInForceLabel(language, item)}</option>)}
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
              {positionSideLabel(language, item)}
            </button>
          ))}
        </div>
      )}
      <label>{text("价格 ticks", "Price ticks")}<input disabled={orderType === "MARKET"} value={priceTicks} onChange={(event) => setPriceTicks(event.target.value)} /></label>
      <label>{text("数量 steps", "Quantity steps")}<input value={quantitySteps} onChange={(event) => setQuantitySteps(event.target.value)} /></label>
      {!isSpot && <label>{text("杠杆", "Leverage")} <span>{leverage}x</span><input type="range" min="1" max={market?.maxLeverage ?? 100} value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} /></label>}
      {!isSpot && <label className="check"><input disabled={market?.reduceOnlyEnabled === false} type="checkbox" checked={reduceOnly} onChange={(event) => setReduceOnly(event.target.checked)} />Reduce-only</label>}
      <label className="check"><input disabled={market?.postOnlyEnabled === false || orderType === "MARKET"} type="checkbox" checked={postOnly && orderType !== "MARKET"} onChange={(event) => setPostOnly(event.target.checked)} />Post-only</label>
      {!isSpot && (
        <div className="algo-panel">
          <div className="trigger-head">
            <span>{text("策略单", "Algo orders")}</span>
            <div className="segmented tiny">
              {(["TWAP", "ICEBERG"] as AlgoOrderType[]).map((item) => (
                <button
                  key={item}
                  className={algoType === item ? "active" : ""}
                  type="button"
                  onClick={() => setAlgoType(item)}
                >
                  {algoTypeLabel(language, item)}
                </button>
              ))}
            </div>
          </div>
          <div className="algo-grid">
            <label>{text("切片", "Slice size")}<input value={algoChildQuantitySteps} onChange={(event) => setAlgoChildQuantitySteps(event.target.value)} /></label>
            <label>{text("间隔s", "Interval (s)")}<input value={algoIntervalSeconds} onChange={(event) => setAlgoIntervalSeconds(event.target.value)} /></label>
            <label>{text("时长s", "Duration (s)")}<input value={algoDurationSeconds} onChange={(event) => setAlgoDurationSeconds(event.target.value)} /></label>
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
            <Clock3 size={14} />{text("提交 ", "Submit ")}{algoTypeLabel(language, algoType)}
          </button>
        </div>
      )}
      {!isSpot && (
        <div className="trigger-panel">
          <div className="trigger-head">
            <span>{text("止盈止损", "Take profit / stop loss")}</span>
            <div>
              <button type="button" title={text("新增止盈", "Add take profit")} onClick={() => addTriggerLevel("TAKE_PROFIT")}><Plus size={13} />TP</button>
              <button type="button" title={text("新增止损", "Add stop loss")} onClick={() => addTriggerLevel("STOP_LOSS")}><Plus size={13} />SL</button>
              <button type="button" title={text("新增追踪止损", "Add trailing stop")} onClick={() => addTriggerLevel("TRAILING_STOP")}><Plus size={13} />TS</button>
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
                <option value="LONG">{text("平多", "Close long")}</option>
                <option value="SHORT">{text("平空", "Close short")}</option>
              </select>
              <input title={text("触发价 ticks", "Trigger price ticks")} value={level.triggerPriceTicks} onChange={(event) => patchTriggerLevel(level.id, { triggerPriceTicks: event.target.value })} />
              <input title={text("激活价 ticks", "Activation price ticks")} disabled={level.triggerType !== "TRAILING_STOP"} value={level.activationPriceTicks} onChange={(event) => patchTriggerLevel(level.id, { activationPriceTicks: event.target.value })} />
              <input title={text("回调 ppm", "Callback ppm")} disabled={level.triggerType !== "TRAILING_STOP"} value={level.callbackRatePpm} onChange={(event) => patchTriggerLevel(level.id, { callbackRatePpm: event.target.value })} />
              <input title={text("数量 steps", "Quantity steps")} value={level.quantitySteps} onChange={(event) => patchTriggerLevel(level.id, { quantitySteps: event.target.value })} />
              <button type="button" title={text("删除", "Remove")} onClick={() => removeTriggerLevel(level.id)}><Trash2 size={13} /></button>
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
              <Bell size={14} />{text("提交止盈止损", "Submit take profit / stop loss")}
            </button>
          )}
        </div>
      )}
      <div className="order-preview">
        <span>{marketProduct(market) === "inverse" ? text("合约面值", "Contract value") : text("预估成交额", "Estimated notional")} {displayPrice(notional)} {marketProduct(market) === "inverse" ? market?.quoteAsset : market?.quoteAsset}</span>
        <span>{isSpot ? `${text("扣减资产", "Debit asset")} ${side === "BUY" ? market?.quoteAsset ?? "-" : market?.baseAsset ?? "-"}` : `${text("预估保证金", "Estimated margin")} ${displayPrice(margin)} ${market?.settleAsset ?? ""}`}</span>
        <span>{text("单笔限制", "Order limits")} {market?.minQuantitySteps ?? "-"} - {market?.maxQuantitySteps ?? "-"} steps</span>
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
      })}>{side === "BUY" ? text("确认买入", "Confirm buy") : text("确认卖出", "Confirm sell")}</button>
    </section>
  );
}

function BottomDeck({ language, productMode, positionMode, balances, positions, orders, openOrdersHasMore, loadingMoreOpenOrders, algoOrders, triggerOrders, trades, market, markets, onPositionModeChange, onCancel, onLoadMoreOpenOrders, onCancelAlgo, onCancelTrigger }: {
  language: LanguageMode;
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
  const text = (zh: string, en: string) => localized(language, zh, en);
  const equity = balances.reduce((sum, item) => sum + item.equityUnits, 0);
  const available = balances.reduce((sum, item) => sum + item.availableUnits, 0);
  const locked = balances.reduce((sum, item) => sum + item.lockedUnits, 0);
  const pnl = positions.reduce((sum, item) => sum + item.unrealizedPnlUnits, 0);
  const marginRatio = positions.length > 0 ? Math.max(...positions.map((item) => item.marginRatioPpm)) : null;
  const hasBalanceData = balances.length > 0;
  const hasPositionData = positions.length > 0;
  const isSpot = productMode === "spot";
  const [activeTab, setActiveTab] = useState<"assets" | "positions" | "orders" | "algo" | "triggers" | "trades">("assets");

  return (
    <section className="bottom-deck panel">
      <div className="panel-title">
        <span><WalletCards size={16} />{language === "en-US" ? PRODUCT_META[productMode].labelEn : PRODUCT_META[productMode].label}{text("账户", " account")}</span>
        {!isSpot && (
          <div className="mode-switch" aria-label={text("持仓模式", "Position mode")}>
            {(["ONE_WAY", "HEDGE"] as PositionMode[]).map((mode) => (
              <button
                key={mode}
                className={positionMode === mode ? "active" : ""}
                type="button"
                onClick={() => onPositionModeChange(mode)}
              >
                {positionModeLabel(language, mode)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="account-summary">
        <Metric label={text("总权益", "Total equity")} value={hasBalanceData ? displayUnits(equity) : "—"} />
        <Metric label={text("可用", "Available")} value={hasBalanceData ? displayUnits(available) : "—"} />
        <Metric label={text("冻结", "Locked")} value={hasBalanceData ? displayUnits(locked) : "—"} />
        {isSpot ? (
          <>
            <Metric label={text("资产数", "Assets")} value={hasBalanceData ? String(balances.length) : "—"} />
            <Metric label={text("账户类型", "Account type")} value={PRODUCT_META[productMode].accountType} tone="gold" />
          </>
        ) : (
          <>
            <Metric label={text("未实现盈亏", "Unrealized PnL")} value={hasPositionData ? displayUnits(pnl) : "—"} tone={hasPositionData ? pnl >= 0 ? "up" : "down" : undefined} />
            <Metric label={text("最高保证金率", "Highest margin ratio")} value={marginRatio === null ? "—" : displayPpm(marginRatio)} tone={marginRatio === null ? undefined : marginRatio > 800000 ? "down" : "up"} />
          </>
        )}
      </div>
      <div className="account-tabs" role="tablist" aria-label={text("账户信息", "Account information")}>
        <AccountTab active={activeTab === "assets"} id="account-tab-assets" panelId="account-panel-assets" onClick={() => setActiveTab("assets")}>{text("资产", "Assets")}</AccountTab>
        {!isSpot && <AccountTab active={activeTab === "positions"} id="account-tab-positions" panelId="account-panel-positions" onClick={() => setActiveTab("positions")}>{text("持仓", "Positions")}</AccountTab>}
        <AccountTab active={activeTab === "orders"} id="account-tab-orders" panelId="account-panel-orders" onClick={() => setActiveTab("orders")}>{text("当前委托", "Open orders")}</AccountTab>
        {!isSpot && <AccountTab active={activeTab === "algo"} id="account-tab-algo" panelId="account-panel-algo" onClick={() => setActiveTab("algo")}>{text("策略单", "Algo")}</AccountTab>}
        {!isSpot && <AccountTab active={activeTab === "triggers"} id="account-tab-triggers" panelId="account-panel-triggers" onClick={() => setActiveTab("triggers")}>{text("止盈止损", "TP / SL")}</AccountTab>}
        <AccountTab active={activeTab === "trades"} id="account-tab-trades" panelId="account-panel-trades" onClick={() => setActiveTab("trades")}>{text("成交", "Trades")}</AccountTab>
      </div>
      <div className="deck-grid">
        <AccountTable id="account-panel-assets" visible={activeTab === "assets"} title={text("产品资产", "Product assets")} icon={<WalletCards size={15} />}>
          <div className="asset-row table-head">
            <span>{text("资产", "Asset")}</span><span>{text("可用", "Available")}</span><span>{text("冻结", "Locked")}</span><span>{text("权益", "Equity")}</span>
          </div>
          {balances.length === 0 ? <p className="empty">{text("暂无资产", "No assets")}</p> : balances.map((item) => (
            <div className="asset-row" key={`${item.accountType ?? PRODUCT_META[productMode].accountType}-${item.asset}`}>
              <strong>{item.asset}</strong>
              <span>{displayUnits(item.availableUnits)}</span>
              <span>{displayUnits(item.lockedUnits)}</span>
              <span>{displayUnits(item.equityUnits)}</span>
            </div>
          ))}
        </AccountTable>
        {!isSpot && (
          <AccountTable id="account-panel-positions" visible={activeTab === "positions"} title={text("持仓 / 风险", "Positions / risk")} icon={<TrendingUp size={15} />}>
            <div className="position-row table-head">
              <span>{text("市场", "Market")}</span><span>{text("仓位", "Position")}</span><span>{text("方向数量", "Side / size")}</span><span>{text("入场/标记", "Entry / mark")}</span><span>{text("浮盈亏", "Unrealized PnL")}</span><span>{text("维持保证金", "Maintenance margin")}</span><span>{text("保证金率", "Margin ratio")}</span><span>{text("状态", "Status")}</span>
            </div>
            {positions.length === 0 ? <p className="empty">{text("暂无持仓", "No positions")}</p> : positions.map((item) => (
              <div className="position-row" key={`${item.symbol}-${item.marginMode}-${item.positionSide ?? "NET"}`}>
                <strong>{item.symbol}</strong>
                <span>{positionSideLabel(language, item.positionSide ?? "NET")}</span>
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
        <AccountTable id="account-panel-orders" visible={activeTab === "orders"} title={text("当前委托", "Open orders")} icon={<TableProperties size={15} />}>
          <div className="order-row table-head">
            <span>{text("市场", "Market")}</span><span>{text("方向", "Side")}</span><span>{text("仓位", "Position")}</span><span>{text("类型", "Type")}</span><span>{text("价格", "Price")}</span><span>{text("成交/剩余", "Filled / remaining")}</span><span>{text("模式", "Mode")}</span><span>{text("状态", "Status")}</span><span></span>
          </div>
          {orders.length === 0 ? <p className="empty">{text("暂无委托", "No open orders")}</p> : orders.map((item) => (
            <div className="order-row" key={item.orderId}>
              <strong>{item.symbol}</strong>
              <span className={item.side === "BUY" ? "up" : "down"}>{item.side}</span>
              <span>{positionSideLabel(language, item.positionSide ?? "NET")}</span>
              <span>{item.orderType}</span>
              <span>{displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.priceTicks)}</span>
              <span>{item.executedQuantitySteps}/{item.remainingQuantitySteps}</span>
              <span>{item.marginMode}</span>
              <span>{item.status}</span>
              <button onClick={() => onCancel(item)}>{text("撤单", "Cancel")}</button>
            </div>
          ))}
          {openOrdersHasMore && (
            <div className="table-load-more">
              <button type="button" onClick={onLoadMoreOpenOrders} disabled={loadingMoreOpenOrders}>
                {loadingMoreOpenOrders ? text("加载中...", "Loading...") : text("加载更多委托", "Load more orders")}
              </button>
            </div>
          )}
        </AccountTable>
        {!isSpot && (
          <AccountTable id="account-panel-algo" visible={activeTab === "algo"} title={text("算法单", "Algo orders")} icon={<Clock3 size={15} />}>
            <div className="algo-order-row table-head">
              <span>{text("市场", "Market")}</span><span>{text("类型", "Type")}</span><span>{text("方向", "Side")}</span><span>{text("价格", "Price")}</span><span>{text("进度", "Progress")}</span><span>{text("切片", "Slice")}</span><span>{text("状态", "Status")}</span><span></span>
            </div>
            {algoOrders.length === 0 ? <p className="empty">{text("暂无算法单", "No algo orders")}</p> : algoOrders.map((item) => (
              <div className="algo-order-row" key={item.algoOrderId}>
                <strong>{item.symbol}</strong>
                <span>{item.algoType}</span>
                <span className={item.side === "BUY" ? "up" : "down"}>{item.side}</span>
                <span>{item.priceTicks > 0 ? displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.priceTicks) : "MARKET"}</span>
                <span>{item.executedQuantitySteps + item.activeQuantitySteps}/{item.quantitySteps}</span>
                <span>{item.childQuantitySteps} / {item.intervalSeconds}s</span>
                <span>{item.status}</span>
                <button onClick={() => onCancelAlgo(item)}>{text("撤销", "Cancel")}</button>
              </div>
            ))}
          </AccountTable>
        )}
        {!isSpot && (
          <AccountTable id="account-panel-triggers" visible={activeTab === "triggers"} title={text("止盈止损", "Take profit / stop loss")} icon={<Bell size={15} />}>
            <div className="trigger-order-row table-head">
              <span>{text("市场", "Market")}</span><span>{text("类型", "Type")}</span><span>{text("目标", "Target")}</span><span>{text("触发价", "Trigger price")}</span><span>{text("数量", "Size")}</span><span>{text("委托", "Order")}</span><span>{text("状态", "Status")}</span><span></span>
            </div>
            {triggerOrders.length === 0 ? <p className="empty">{text("暂无止盈止损", "No take profit / stop loss orders")}</p> : triggerOrders.map((item) => (
              <div className="trigger-order-row" key={item.triggerOrderId}>
                <strong>{item.symbol}</strong>
                <span>{triggerTypeLabel(language, item.triggerType)}</span>
                <span className={item.positionSide === "LONG" || (item.positionSide !== "SHORT" && item.side === "SELL") ? "down" : "up"}>
                  {triggerCloseLabel(language, item.side, item.positionSide)}
                </span>
                <span>{item.triggerType === "TRAILING_STOP"
                  ? `${item.activationPriceTicks ? displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.activationPriceTicks) : text("立即", "Immediate")} / ${((item.callbackRatePpm ?? 0) / 10_000).toFixed(2)}%`
                  : displayMarketPrice(marketForSymbol(markets, item.symbol, market), item.triggerPriceTicks)}</span>
                <span>{item.quantitySteps}</span>
                <span>{item.orderType}/{item.timeInForce}</span>
                <span>{item.status}</span>
                <button onClick={() => onCancelTrigger(item)}>{text("撤销", "Cancel")}</button>
              </div>
            ))}
          </AccountTable>
        )}
        <AccountTable id="account-panel-trades" visible={activeTab === "trades"} title={text("成交记录", "Trade history")} icon={<Activity size={15} />}>
          <div className="trade-history-row table-head">
            <span>{text("市场", "Market")}</span><span>{text("角色", "Role")}</span><span>{text("方向", "Side")}</span><span>{text("价格", "Price")}</span><span>{text("数量", "Size")}</span><span>{text("时间", "Time")}</span><span>Trace</span>
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

function AccountTab({ active, id, panelId, onClick, children }: { active: boolean; id: string; panelId: string; onClick: () => void; children: ReactNode }) {
  return <button id={id} type="button" role="tab" aria-selected={active} aria-controls={panelId} tabIndex={active ? 0 : -1} className={active ? "active" : ""} onClick={onClick}>{children}</button>;
}

function AccountTable({ id, title, icon, children, visible = true }: { id: string; title: string; icon: ReactNode; children: ReactNode; visible?: boolean }) {
  return (
    <div id={id} role="tabpanel" aria-labelledby={id.replace("account-panel", "account-tab")} hidden={!visible} className={visible ? "account-table" : "account-table account-table-hidden"}>
      <h3>{icon}{title}</h3>
      {children}
    </div>
  );
}

function TradesTape({ language, events, symbol, productLine, market, mid, onPickPrice }: { language: LanguageMode; events: WsEnvelope[]; symbol: string; productLine: ProductLine; market?: Market; mid: number; onPickPrice: (priceTicks: number) => void }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
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
      <div className="panel-title"><span><Activity size={16} />{text("最新成交", "Recent trades")}</span></div>
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

function ContractInfoDialog({ language, market, onClose }: { language: LanguageMode; market: Market; onClose: () => void }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const product = marketProduct(market);
  const isSpot = product === "spot";
  const isFunding = isFundingProduct(product);
  const items: Array<[string, ReactNode]> = [
    [text("产品类型", "Product type"), language === "en-US" ? PRODUCT_META[product].labelEn : PRODUCT_META[product].label],
    [text("后端类型", "Backend type"), `${market.instrumentType ?? "PERPETUAL"} / ${market.contractType ?? "LINEAR_PERPETUAL"}`],
    [text("基础/计价", "Base / quote"), `${market.baseAsset} / ${market.quoteAsset}`],
    [isSpot ? text("现货账户", "Spot account") : text("结算资产", "Settlement asset"), isSpot ? PRODUCT_META.spot.accountType : market.settleAsset ?? market.quoteAsset],
    [text("价格 tick", "Price tick"), market.priceTickUnits ?? "-"],
    [text("数量 step", "Quantity step"), market.quantityStepUnits ?? "-"],
    [text("最小/最大数量", "Min / max quantity"), `${market.minQuantitySteps ?? "-"} / ${market.maxQuantitySteps ?? "-"}`],
    [text("最小/最大名义价值", "Min / max notional"), `${formatUnitsOrDash(market.minNotionalUnits)} / ${formatUnitsOrDash(market.maxNotionalUnits)}`],
    ["Maker/Taker", `${displayOptionalPpm(market.makerFeeRatePpm, 4)} / ${displayOptionalPpm(market.takerFeeRatePpm, 4)}`],
    [text("状态/版本", "Status / version"), `${market.status ?? "TRADING"} / v${market.version ?? "-"}`],
    ...(isSpot ? [] : [
      [text("最大杠杆", "Maximum leverage"), `${market.maxLeverage}x`],
      [text("起始/维持保证金率", "Initial / maintenance margin"), `${displayOptionalPpm(market.initialMarginRatePpm)} / ${displayOptionalPpm(market.maintenanceMarginRatePpm)}`],
      ...(isFunding ? [[text("资金费率周期", "Funding interval"), `${market.fundingIntervalHours ?? "-"} ${text("小时", "hours")}`]] as Array<[string, ReactNode]> : []),
      ...(market.expiryTime ? [[text("到期时间", "Expiry"), market.expiryTime]] as Array<[string, ReactNode]> : []),
      ...(market.deliveryTime ? [[text("交割时间", "Delivery"), market.deliveryTime]] as Array<[string, ReactNode]> : []),
      ...(product === "option" ? [
        [text("底层标的", "Underlying"), market.underlyingSymbol ?? "-"],
        [text("行权价", "Strike price"), market.strikePriceUnits ?? "-"],
        [text("期权方向/行权方式", "Option type / exercise style"), `${market.optionType ?? "-"} / ${market.optionExerciseStyle ?? "-"}`],
      ] as Array<[string, ReactNode]> : []),
      ...(market.settlementMethod ? [[text("结算方式", "Settlement"), market.settlementMethod]] as Array<[string, ReactNode]> : []),
      [text("指数有效源数", "Valid index sources"), market.minValidIndexSources ?? "-"],
    ] as Array<[string, ReactNode]>)
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-title"><span><Info size={16} />{market.symbol} {text("产品配置", "Product configuration")}</span><button onClick={onClose}>{text("关闭", "Close")}</button></div>
        <div className="config-grid">
          {items.map(([label, value]) => (
            <div className="config-item" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="config-section">
          <h3>{text("订单能力", "Order capabilities")}</h3>
          <p>{(market.supportedOrderTypes ?? ["LIMIT", "MARKET"]).join(" / ")} · {(market.supportedTimeInForce ?? ["GTC", "IOC", "FOK", "GTX"]).join(" / ")}</p>
          <p>Post-only: {market.postOnlyEnabled === false ? text("关闭", "Disabled") : text("开启", "Enabled")} · {isSpot ? text("现货无 Reduce-only", "Reduce-only is unavailable for spot") : `Reduce-only: ${market.reduceOnlyEnabled === false ? text("关闭", "Disabled") : text("开启", "Enabled")}`} · Market: {market.marketOrderEnabled === false ? text("关闭", "Disabled") : text("开启", "Enabled")}</p>
        </div>
        {!isSpot && (
          <div className="config-section">
            <h3>{text("指数价格来源", "Index price sources")}</h3>
            {market.indexSources?.length ? market.indexSources.map((source, index) => (
              <p key={`${source.exchangeCode}-${index}`}>{source.exchangeCode ?? "-"} {source.sourceSymbol ?? ""} {text("权重", "Weight")} {displayOptionalPpm(source.weightPpm)}</p>
            )) : <p>{text("后端未返回指数源明细。", "The backend did not return index-source details.")}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function TradingRulesPage({ markets, selectedMarket, language, onOpenMarket }: { markets: Market[]; selectedMarket?: Market; language: LanguageMode; onOpenMarket: (market: Market) => void }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  return (
    <section className="rules-page">
      <div className="rules-hero">
        <div>
          <span className="eyebrow"><FileText size={15} />{text("后端标的规则", "Backend instrument rules")}</span>
          <h1>{text("交易规则", "Trading rules")}</h1>
          <p>{text("页面展示的数据来自 instrument 当前版本。现货、永续、交割和期权按产品线隔离撮合与账户，但共享同一套 symbol 规则、订单能力、数量边界、费率和风控配置入口。", "This page reflects the current instrument version. Spot, perpetuals, deliveries, and options use isolated matching and accounts while sharing symbol rules, order capabilities, quantity bounds, fees, and risk controls.")}</p>
        </div>
        <div className="rules-current">
          <strong>{selectedMarket?.symbol ?? text("选择市场", "Select market")}</strong>
          <span>{selectedMarket ? `${language === "en-US" ? PRODUCT_META[marketProduct(selectedMarket)].labelEn : PRODUCT_META[marketProduct(selectedMarket)].label} · ${selectedMarket.settleAsset ?? selectedMarket.quoteAsset}` : text("选择产品", "Select product")} </span>
          <button onClick={() => selectedMarket && onOpenMarket(selectedMarket)}>{text("打开交易", "Open trading")}</button>
        </div>
      </div>
      <div className="rules-grid">
        <RuleCard title={text("产品设计", "Product design")} icon={<Layers3 size={16} />}>
          <p>{text("当前系统采用 instrument 版本化配置，交易、撮合、账户、风险、资金费率、K线、指数/标记价格都读取同一份规则快照。", "The system uses versioned instrument configuration. Trading, matching, accounts, risk, funding rates, candles, and index/mark prices all read one rule snapshot.")}</p>
          <p>{text("现货、U本位/币本位永续、交割和期权都由后端 instrumentType 与 contractType 区分，前端不维护独立交易对清单。", "Spot, USDT/coin perpetuals, deliveries, and options are distinguished by backend instrumentType and contractType; the frontend does not maintain a separate market list.")}</p>
        </RuleCard>
        <RuleCard title={text("关键指标", "Key metrics")} icon={<TrendingUp size={16} />}>
          <p>{text("合约产品展示标记价格、指数价格和资金费率；现货产品展示基础资产、计价资产、盘口和成交。", "Derivatives show mark price, index price, and funding rate; spot shows base/quote assets, order book, and trades.")}</p>
          <p>{text("资产、持仓、权益、保证金率和风险状态由后端 account/risk 推送或查询，前端只展示，不自行结算。", "Assets, positions, equity, margin ratios, and risk status come from backend account/risk events or queries. The frontend displays them and never settles locally.")}</p>
        </RuleCard>
        <RuleCard title={text("下单保护", "Order protection")} icon={<TableProperties size={16} />}>
          <p>{text("订单入口按最小数量、最大数量、最小/最大名义价值、最大杠杆、reduce-only、post-only、价格保护和持仓限额校验。", "Order entry validates quantity, notional, leverage, reduce-only, post-only, price protection, and position limits against backend rules.")}</p>
          <p>{text("撮合结果带 traceId，成交用 symbol + tradeId 幂等，WebSocket 至少一次投递，前端按事件版本刷新账户数据。", "Matches carry a traceId, fills are idempotent by symbol + tradeId, WebSocket delivery is at-least-once, and account state refreshes by event version.")}</p>
        </RuleCard>
      </div>
      <div className="rules-table panel">
        <div className="panel-title"><span><BookOpen size={16} />{text("产品参数", "Product parameters")}</span><button>{markets.length} symbols</button></div>
        <div className="rules-row table-head">
          <span>{text("市场", "Market")}</span><span>{text("产品", "Product")}</span><span>{text("后端类型", "Backend type")}</span><span>{text("账户/结算", "Account / settlement")}</span><span>{text("杠杆", "Leverage")}</span><span>{text("数量范围", "Quantity range")}</span><span>{text("名义价值", "Notional")}</span><span>{text("费率", "Fees")}</span><span>{text("状态", "Status")}</span>
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

function optionMetricRows(language: LanguageMode, market: Market, markets: Market[]): Array<[string, string, "up" | "down" | "gold" | undefined]> {
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
    [localized(language, "底层价格", "Underlying price"), underlyingPrice > 0 ? `${displayPrice(underlyingPrice)} ${market.quoteAsset}` : "-", undefined],
    [localized(language, "行权价", "Strike price"), strike > 0 ? `${displayPrice(strike)} ${market.quoteAsset}` : "-", "gold"],
    [localized(language, "权利金标记", "Premium mark"), premium > 0 ? `${displayPrice(premium)} ${market.quoteAsset}` : "-", undefined],
    [localized(language, "内在价值", "Intrinsic value"), `${displayPrice(intrinsic)} ${market.quoteAsset}`, intrinsic > 0 ? "up" : undefined],
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

function formatLifecycleCountdown(language: LanguageMode, market: Market, nowMs: number): string {
  const raw = market.deliveryTime ?? market.expiryTime;
  if (!raw) return "-";
  const target = Date.parse(raw);
  if (Number.isNaN(target)) return raw;
  const seconds = Math.floor((target - nowMs) / 1000);
  if (seconds <= 0) return localized(language, "已到期", "Expired");
  const days = Math.floor(seconds / 86400);
  const remain = seconds % 86400;
  return days > 0 ? localized(language, `${days}天 ${formatDuration(remain)}`, `${days}d ${formatDuration(remain)}`) : formatDuration(remain);
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
