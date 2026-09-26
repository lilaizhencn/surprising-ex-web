import {
  BarChart3,
  ChevronDown,
  CircleHelp,
  Info,
  RefreshCw,
  Settings2,
  Star,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ApiError } from "../../api/client"
import {
  cancelOrder,
  cancelTriggerOrder,
  loadAssetScales,
  loadBalances,
  loadCandles,
  loadFundingPayments,
  loadFundingRate,
  loadFundingRateHistory,
  loadFundingSettlement,
  loadIndexPrice,
  loadMarkets,
  loadMarkPrice,
  loadOpenOrders,
  loadOpenTriggerOrders,
  loadOptionQuote,
  loadOrderBook,
  loadPositions,
  loadRecentTrades,
  placeBatchTriggerOrders,
  placeOrder,
  placeTriggerOrder,
} from "../../api/endpoints"
import { mapCandle, mapMarket } from "../../api/mappers"
import type {
  ApiBalance,
  ApiFundingPayment,
  ApiFundingRate,
  ApiOptionQuote,
  ApiOrder,
  ApiOrderBook,
  ApiOrderBookLevel,
  ApiTriggerOrder,
} from "../../api/types"
import {
  BalanceSchema,
  CandleSchema,
  OrderBookSchema,
  OrderSchema,
  TriggerOrderSchema,
} from "../../api/types"
import { PriceChart } from "../../components/trading/PriceChart"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import {
  AssetIcon,
  Badge,
  Button,
  Field,
  Panel,
  Price,
  SearchField,
  StateView,
} from "../../components/ui/Primitives"
import { useRealtime } from "../../hooks/useRealtime"
import { t } from "../../i18n"
import { config, storageKeys } from "../../lib/config"
import { demoMarkets } from "../../lib/demo"
import { formatPercent } from "../../lib/format"
import {
  addDecimalQuantities,
  decimalProductExceedsUnits,
  decimalToStepUnits,
  decimalToUnits,
  isPositiveDecimal,
  signedUnitsToDecimal,
  stepUnitsToDecimal,
  unitsToDecimal,
} from "../../lib/units"
import type { WsEnvelope } from "../../realtime"
import { useSession } from "../../state/session"
import {
  type Candle,
  type Market,
  type OrderSide,
  type OrderType,
  PRODUCT_LINES,
  type ProductLine,
} from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"
import { TradingAccountControls, type TradingOrderSettings } from "./TradingAccountControls"
import {
  closeSideForPosition,
  selectTriggerPosition,
  signedPositionSteps,
  triggerConditionText,
} from "./triggerOrder"

const views = [
  {
    key: "spot",
    line: PRODUCT_LINES.spot,
    title: "Spot Trading",
    symbol: "BTC-USDT-SPOT",
  },
  {
    key: "usd-m-perpetuals",
    line: PRODUCT_LINES.usdMPerpetual,
    title: "USD-M Perpetual",
    symbol: "BTC-USDT-SWAP",
  },
  {
    key: "coin-m-perpetuals",
    line: PRODUCT_LINES.coinMPerpetual,
    title: "Coin-M Perpetual",
    symbol: "BTC-USD-PERP",
  },
  {
    key: "delivery-futures",
    line: PRODUCT_LINES.usdMDelivery,
    title: "Delivery Futures",
    symbol: "BTC-USDT-260925",
  },
  {
    key: "coin-m-delivery",
    line: PRODUCT_LINES.coinMDelivery,
    title: "Coin-M Delivery",
    symbol: "BTC-USD-260925",
  },
  {
    key: "options",
    line: PRODUCT_LINES.option,
    title: "Options Trading",
    symbol: "BTC-USDT-260925-59000-C",
  },
] as const

const productKeyAliases: Readonly<Record<string, string>> = {
  "usd-perpetual": "usd-m-perpetuals",
  "coin-perpetual": "coin-m-perpetuals",
}

type Level = ApiOrderBookLevel
const chartPeriodMs: Readonly<Record<string, number>> = {
  "1m": 60_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}
function periodMillisecondsForChart(period: string): number {
  return chartPeriodMs[period] ?? 60_000
}
export function applyTradeToCandles(
  rows: readonly Candle[],
  time: number,
  interval: number,
  price: number,
  quantity: number,
): readonly Candle[] {
  const bucketTime = Math.floor(time / interval) * interval
  const bucket = new Date(bucketTime).toISOString()
  const previous = rows.find((row) => Date.parse(row.time) === bucketTime)
  const next: Candle = previous
    ? {
        ...previous,
        time: bucket,
        high: Math.max(previous.high, price),
        low: Math.min(previous.low, price),
        close: price,
        volume: previous.volume + quantity,
      }
    : { time: bucket, open: price, high: price, low: price, close: price, volume: quantity }
  return [...rows.filter((row) => Date.parse(row.time) !== bucketTime), next]
    .sort((left, right) => left.time.localeCompare(right.time))
    .slice(-120)
}

export function TradePage({ productKey }: { readonly productKey: string }) {
  const normalizedProductKey = productKeyAliases[productKey] ?? productKey
  const view = views.find((candidate) => candidate.key === normalizedProductKey) ?? views[0]
  const session = useSession()
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [candles, setCandles] = useState<readonly Candle[]>([])
  const [selected, setSelected] = useState<string>(view.symbol)
  const [pairSearch, setPairSearch] = useState("")
  const [pairTab, setPairTab] = useState<"all" | "favorites">("all")
  const [pairOpen, setPairOpen] = useState(false)
  const [contractInfoOpen, setContractInfoOpen] = useState(false)
  const pairPickerRef = useRef<HTMLDivElement>(null)
  const [marketSideTab, setMarketSideTab] = useState<"book" | "trades">("book")
  const [favorites, setFavorites] = useState<readonly string[]>(readFavorites)
  const [book, setBook] = useState<ApiOrderBook | null>(null)
  const [bookDepth, setBookDepth] = useState<10 | 20 | 50>(50)
  const [bookPrecision, setBookPrecision] = useState<1 | 10 | 100>(1)
  const bookSequenceRef = useRef<string | null>(null)
  const processedEvents = useRef(new Set<string>())
  const marketGeneration = useRef(0)
  const bookResyncingRef = useRef(false)
  const [recentTrades, setRecentTrades] = useState<readonly Record<string, unknown>[]>([])
  const latestTradeRef = useRef<{
    symbol: string
    bucket: string
    price: number
    sequence: number
  } | null>(null)
  const [optionQuote, setOptionQuote] = useState<ApiOptionQuote | null>(null)
  const [openOrders, setOpenOrders] = useState<readonly ApiOrder[]>([])
  const [triggerOrders, setTriggerOrders] = useState<readonly ApiTriggerOrder[]>([])
  const [balances, setBalances] = useState<readonly ApiBalance[]>([])
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [marketQuotes, setMarketQuotes] = useState<Readonly<Record<string, number>>>({})
  const [pairChanges, setPairChanges] = useState<Readonly<Record<string, number>>>({})
  const [positions, setPositions] = useState<readonly Record<string, unknown>[]>([])
  const [funding, setFunding] = useState<ApiFundingRate | null>(null)
  const [markPrice, setMarkPrice] = useState<Record<string, unknown> | null>(null)
  const [indexPrice, setIndexPrice] = useState<Record<string, unknown> | null>(null)
  const [fundingPayments, setFundingPayments] = useState<readonly ApiFundingPayment[]>([])
  const [fundingPaymentsError, setFundingPaymentsError] = useState("")
  const [fundingHistory, setFundingHistory] = useState<readonly ApiFundingRate[]>([])
  const [fundingSettlement, setFundingSettlement] = useState<Record<string, unknown> | null>(null)
  const [fundingMarketError, setFundingMarketError] = useState("")
  const [marketsRequestFinished, setMarketsRequestFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [side, setSide] = useState<OrderSide>("BUY")
  const [orderType, setOrderType] = useState<OrderType>("LIMIT")
  const [bboEnabled, setBboEnabled] = useState(false)
  const [bboPriceMode, setBboPriceMode] = useState("OPPONENT_1")
  const useBbo = orderType === "LIMIT" && bboEnabled
  const [period, setPeriod] = useState("15m")
  const [accountTab, setAccountTab] = useState<
    "positions" | "triggers" | "fundingMarket" | "fundingPayments" | "settings"
  >("positions")
  const [dayCandles, setDayCandles] = useState<readonly Candle[]>([])
  const [price, setPrice] = useState("")
  const [triggerPrice, setTriggerPrice] = useState("")
  const [protectionMode, setProtectionMode] = useState<"SINGLE" | "OCO">("SINGLE")
  const [takeProfitTriggerPrice, setTakeProfitTriggerPrice] = useState("")
  const [takeProfitLimitPrice, setTakeProfitLimitPrice] = useState("")
  const [takeProfitExecutionType, setTakeProfitExecutionType] = useState<"LIMIT" | "MARKET">(
    "MARKET",
  )
  const [triggerType, setTriggerType] = useState<"STOP_LOSS" | "TAKE_PROFIT">("STOP_LOSS")
  const [triggerExecutionType, setTriggerExecutionType] = useState<"LIMIT" | "MARKET">("MARKET")
  const [orderSettings, setOrderSettings] = useState<TradingOrderSettings>({
    marginMode: "CROSS",
    positionMode: "ONE_WAY",
    positionSide: "NET",
  })
  const [quantity, setQuantity] = useState("")
  const [percentage, setPercentage] = useState(0)
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [submitMessage, setSubmitMessage] = useState("")
  const demo = config.demoDataEnabled && !marketsRequestFinished
  const availableMarkets = markets.length > 0 ? markets : demo ? demoMarkets : []
  const filteredMarkets = availableMarkets
    .filter(
      (market) =>
        market.symbol.toLowerCase().includes(pairSearch.toLowerCase()) &&
        (pairTab === "all" || favorites.includes(market.symbol)),
    )
    .sort((left, right) =>
      left.symbol === selected
        ? -1
        : right.symbol === selected
          ? 1
          : left.symbol.localeCompare(right.symbol),
    )
  useEffect(() => {
    if (!pairOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!pairPickerRef.current?.contains(event.target as Node)) setPairOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPairOpen(false)
    }
    document.addEventListener("pointerdown", closeOutside)
    document.addEventListener("keydown", closeEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOutside)
      document.removeEventListener("keydown", closeEscape)
    }
  }, [pairOpen])
  const current = useMemo(() => {
    return (
      availableMarkets.find((market) => market.symbol === selected) ?? availableMarkets[0] ?? null
    )
  }, [availableMarkets, selected])
  const dayStats = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const rows = dayCandles.filter((candle) => Date.parse(candle.time) >= cutoff)
    if (rows.length === 0) return null
    const first = rows[0]
    const last = rows[rows.length - 1]
    if (!first || !last) return null
    return {
      open: first.open,
      high: Math.max(...rows.map((row) => row.high)),
      low: Math.min(...rows.map((row) => row.low)),
      close: last.close,
      change: first.open > 0 ? ((last.close - first.open) / first.open) * 100 : null,
    }
  }, [dayCandles])
  const lastTradePrice = current
    ? marketPriceFromRecord(recentTrades[0] ?? {}, current, assetScales)
    : null
  const displayedDayStats =
    dayStats && lastTradePrice && lastTradePrice > 0
      ? {
          ...dayStats,
          high: Math.max(dayStats.high, lastTradePrice),
          low: Math.min(dayStats.low, lastTradePrice),
          close: lastTradePrice,
          change: ((lastTradePrice - dayStats.open) / dayStats.open) * 100,
        }
      : dayStats
  const balance = useMemo(() => {
    const asset =
      view.line === PRODUCT_LINES.spot
        ? side === "SELL"
          ? current?.baseAsset
          : current?.quoteAsset
        : (current?.settleAsset ?? current?.quoteAsset)
    return asset
      ? (balances.find((row) => row.asset.toUpperCase() === asset.toUpperCase()) ?? null)
      : null
  }, [balances, current, side, view.line])
  const triggerSupported = view.line !== PRODUCT_LINES.spot
  const activeTriggerPosition = useMemo(
    () =>
      selectTriggerPosition(
        positions,
        current?.symbol,
        orderSettings.marginMode,
        orderSettings.positionMode,
        orderSettings.positionSide,
      ),
    [current?.symbol, orderSettings, positions],
  )
  const triggerCloseSide = activeTriggerPosition
    ? closeSideForPosition(activeTriggerPosition)
    : null
  const realtime = useRealtime(session, current?.symbol ?? view.symbol, view.line, period)
  const privateViewReady = useRef(false)
  privateViewReady.current = realtime.views[view.line]?.ready() ?? false

  useEffect(() => {
    setBalances([])
    setPositions([])
    setOpenOrders([])
    setTriggerOrders([])
    if (!session || !current) return
    let cancelled = false
    void Promise.allSettled([
      loadBalances(view.line),
      loadPositions(session.user.userId, view.line),
      loadOpenOrders(current.symbol, view.line),
      loadOpenTriggerOrders(session.user.userId, current.symbol, view.line),
    ]).then(([balanceResult, positionResult, orderResult, triggerResult]) => {
      if (cancelled || privateViewReady.current) return
      if (balanceResult.status === "fulfilled") setBalances(balanceResult.value)
      if (positionResult.status === "fulfilled")
        setPositions(
          positionResult.value.filter((position) => Number(position["signedQuantitySteps"]) !== 0),
        )
      if (orderResult.status === "fulfilled") setOpenOrders(orderResult.value)
      if (triggerResult.status === "fulfilled") setTriggerOrders(triggerResult.value)
    })
    return () => {
      cancelled = true
    }
  }, [session?.user.userId, current?.symbol, view.line])

  useEffect(() => {
    const account = realtime.views[view.line]
    if (!session || !account?.ready()) return
    const parsedBalances = account.rows("balance").map((row) => BalanceSchema.safeParse(row))
    const parsedOrders = account
      .rows("order")
      .filter((row) => row["status"] === "OPEN" && row["symbol"] === current?.symbol)
      .map((row) =>
        OrderSchema.safeParse({
          ...row,
          status: Number(row["executedQuantitySteps"]) > 0 ? "PARTIALLY_FILLED" : "ACCEPTED",
        }),
      )
    const parsedTriggers = account
      .rows("trigger")
      .filter(
        (row) =>
          ["PENDING", "TRIGGERING"].includes(String(row["status"])) &&
          row["symbol"] === current?.symbol,
      )
      .map((row) => TriggerOrderSchema.safeParse(row))
    if ([...parsedBalances, ...parsedOrders, ...parsedTriggers].some((result) => !result.success)) {
      setError(t("Invalid account update; waiting for a new snapshot"))
      return
    }
    setBalances(parsedBalances.flatMap((result) => (result.success ? [result.data] : [])))
    setPositions(account.rows("position").filter((row) => Number(row["signedQuantitySteps"]) !== 0))
    setOpenOrders(parsedOrders.flatMap((result) => (result.success ? [result.data] : [])))
    setTriggerOrders(parsedTriggers.flatMap((result) => (result.success ? [result.data] : [])))
  }, [current?.symbol, realtime.views, realtime.revision, session, view.line])

  const updateMarketQuote = useCallback((symbol: string, price: number | null) => {
    if (price === null || !Number.isFinite(price) || price <= 0) return
    setMarketQuotes((previous) =>
      previous[symbol] === price ? previous : { ...previous, [symbol]: price },
    )
  }, [])
  const handleSettingsChange = useCallback((settings: TradingOrderSettings) => {
    setOrderSettings(settings)
  }, [])
  const toggleFavorite = (symbol: string) => {
    setFavorites((currentFavorites) =>
      currentFavorites.includes(symbol)
        ? currentFavorites.filter((value) => value !== symbol)
        : [...currentFavorites, symbol],
    )
  }

  useEffect(() => {
    if (!triggerSupported && orderType === "STOP") setOrderType("LIMIT")
  }, [orderType, triggerSupported])
  const setOrderPercentage = (next: number) => {
    setPercentage(next)
    if (!current || next === 0) {
      setQuantity("")
      return
    }
    if (orderType === "STOP" && activeTriggerPosition) {
      const signedSteps = signedPositionSteps(activeTriggerPosition)
      const magnitude = signedSteps < 0n ? -signedSteps : signedSteps
      try {
        const quantitySpec = marketQuantitySpec(current, assetScales)
        const positionQuantity = Number(
          stepUnitsToDecimal(magnitude.toString(), quantitySpec.unitSize, quantitySpec.scale),
        )
        const value = positionQuantity * (next / 100)
        setQuantity(Number.isFinite(value) && value > 0 ? String(value) : "")
      } catch {
        setQuantity("")
      }
      return
    }
    if (view.line !== PRODUCT_LINES.spot || !balance) {
      setQuantity("")
      return
    }
    const available = balanceAmount(balance, assetScales)
    const availableNumber = available === null ? null : Number(available)
    if (availableNumber === null || !Number.isFinite(availableNumber)) {
      setQuantity("")
      return
    }
    const referencePrice = Number(price || marketQuotes[current.symbol] || current.price)
    const factor = next / 100
    const quantityValue =
      side === "SELL" ? availableNumber * factor : (availableNumber / referencePrice) * factor
    setQuantity(Number.isFinite(quantityValue) && quantityValue > 0 ? String(quantityValue) : "")
  }

  const resyncOrderBook = useCallback(() => {
    if (!current || !assetScales[current.quoteAsset] || bookResyncingRef.current) return
    bookResyncingRef.current = true
    const generation = marketGeneration.current
    void loadOrderBook(current.symbol, view.line, 50)
      .then((nextBook) => {
        if (generation !== marketGeneration.current) return
        const nextSequence = orderBookSequence(nextBook)
        const currentSequence = bookSequenceRef.current
        if (nextSequence && currentSequence && compareSequences(nextSequence, currentSequence) < 0)
          return
        setBook(normalizeOrderBook(nextBook, current, assetScales))
        bookSequenceRef.current = nextSequence
      })
      .catch((reason: unknown) => {
        if (generation === marketGeneration.current) setError(readError(reason))
      })
      .finally(() => {
        bookResyncingRef.current = false
      })
  }, [assetScales, current, view.line])

  useEffect(() => {
    setBook(null)
    bookSequenceRef.current = null
    processedEvents.current.clear()
  }, [current?.symbol, view.line])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeys.favorites, JSON.stringify(favorites))
    } catch {}
  }, [favorites])

  useEffect(() => {
    let cancelled = false
    setMarketsRequestFinished(false)
    setError(null)
    void loadMarkets(view.line)
      .then((rows) => {
        if (cancelled) return
        const productMarkets = rows
          .map(mapMarket)
          .filter((market) => market.productLine === view.line)
        setMarkets(productMarkets)
        setMarketsRequestFinished(true)
        if (rows.length > 0 && productMarkets.length === 0) {
          setError(`${t("No tradable contracts returned for")} ${t(view.title)}.`)
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setMarketsRequestFinished(true)
        setError(readError(reason))
      })
    return () => {
      cancelled = true
    }
  }, [view.line])
  useEffect(() => {
    if (markets.length === 0 || view.line !== PRODUCT_LINES.usdMPerpetual) return
    let cancelled = false
    const refreshPairQuotes = async () => {
      const quotes = await Promise.allSettled(
        markets.map((market) => loadRecentTrades(market.symbol, view.line, 1)),
      )
      if (cancelled) return
      quotes.forEach((result, index) => {
        const symbol = markets[index]?.symbol
        const market = markets[index]
        if (
          symbol &&
          market &&
          result.status === "fulfilled" &&
          latestTradeRef.current?.symbol !== symbol
        ) {
          updateMarketQuote(
            symbol,
            marketPriceFromRecord(result.value[0] ?? {}, market, assetScales),
          )
        }
      })
    }
    void refreshPairQuotes()
    const timer = window.setInterval(() => void refreshPairQuotes(), 10_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [markets, assetScales, updateMarketQuote, view.line])
  useEffect(() => {
    if (markets.length === 0 || view.line !== PRODUCT_LINES.usdMPerpetual) return
    let cancelled = false
    void Promise.allSettled(
      markets.map((market) => loadCandles(market.symbol, "1h", view.line)),
    ).then((results) => {
      if (cancelled) return
      const changes: Record<string, number> = {}
      results.forEach((result, index) => {
        const symbol = markets[index]?.symbol
        if (!symbol || result.status !== "fulfilled") return
        const rows = result.value
          .map(mapCandle)
          .filter((candle) => Date.parse(candle.time) >= Date.now() - 86_400_000)
        const open = rows[0]?.open
        const close = rows.at(-1)?.close
        if (open && close) changes[symbol] = ((close - open) / open) * 100
      })
      setPairChanges(changes)
    })
    return () => {
      cancelled = true
    }
  }, [markets, view.line])
  useEffect(() => {
    if (!current || price) return
    const quote = marketQuotes[current.symbol] ?? current.price
    const quoteScale = Number(assetScales[current.quoteAsset])
    const priceTick = Number(current.priceTickUnits)
    if (!quote || !Number.isFinite(quoteScale) || quoteScale <= 0 || !priceTick) return
    const step = priceTick / quoteScale
    const decimals = Math.max(2, (String(step).split(".")[1] ?? "").length)
    setPrice((Math.round(quote / step) * step).toFixed(Math.min(decimals, 10)))
  }, [assetScales, current, marketQuotes, price])
  useEffect(() => {
    if (!current) return
    setPrice("")
    setCandles([])
    setOptionQuote(null)
    setTriggerOrders([])
    const generation = ++marketGeneration.current
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const loadHistory = () => {
      void loadCandles(current.symbol, period, view.line)
        .then((rows) => {
          if (generation !== marketGeneration.current) return
          const history = rows.map(mapCandle)
          const latestCandle = history.at(-1)
          if (latestCandle && latestTradeRef.current?.symbol !== current.symbol)
            updateMarketQuote(current.symbol, latestCandle.close)
          setCandles((live) => {
            const byTime = new Map(history.map((candle) => [candle.time, candle]))
            for (const candle of live) byTime.set(candle.time, candle)
            return [...byTime.values()]
              .sort((left, right) => left.time.localeCompare(right.time))
              .slice(-120)
          })
        })
        .catch(() => {
          if (generation === marketGeneration.current) retryTimer = setTimeout(loadHistory, 3_000)
        })
    }
    loadHistory()
    void Promise.allSettled([
      view.line === PRODUCT_LINES.option
        ? loadOptionQuote(current.symbol).catch(() => null)
        : Promise.resolve(null),
      loadAssetScales(),
    ]).then(([optionQuoteResult, scales]) => {
      if (generation !== marketGeneration.current) return
      setOptionQuote(optionQuoteResult.status === "fulfilled" ? optionQuoteResult.value : null)
      if (scales.status === "fulfilled") setAssetScales(scales.value)
    })
    return () => {
      marketGeneration.current++
      clearTimeout(retryTimer)
    }
  }, [current?.symbol, period, updateMarketQuote, view.line])

  useEffect(() => {
    setRecentTrades([])
    latestTradeRef.current = null
    if (!current?.symbol) return
    let cancelled = false
    void loadRecentTrades(current.symbol, view.line)
      .then((history) => {
        if (cancelled) return
        setRecentTrades((live) => {
          const byId = new Map<string, Record<string, unknown>>()
          for (const trade of [...history, ...live])
            byId.set(
              text(trade, "tradeId") || text(trade, "sequence") || JSON.stringify(trade),
              trade,
            )
          return [...byId.values()]
            .sort((left, right) => text(right, "eventTime").localeCompare(text(left, "eventTime")))
            .slice(0, 50)
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [current?.symbol, view.line])

  useEffect(() => {
    if (!current) return
    let cancelled = false
    setDayCandles([])
    void loadCandles(current.symbol, "1h", view.line)
      .then((rows) => {
        if (!cancelled) setDayCandles(rows.map(mapCandle))
      })
      .catch(() => {
        if (!cancelled) setDayCandles([])
      })
    return () => {
      cancelled = true
    }
  }, [current?.symbol, view.line, assetScales])

  useEffect(() => {
    if (!current || view.line === PRODUCT_LINES.spot || view.line === PRODUCT_LINES.option) {
      setFunding(null)
      setFundingPayments([])
      setFundingPaymentsError("")
      setFundingHistory([])
      setFundingSettlement(null)
      setFundingMarketError("")
      return
    }
    setFundingMarketError("")
    void loadFundingRate(current.symbol, view.line)
      .then((value) => setFunding(value))
      .catch(() => setFunding(null))
    void Promise.allSettled([
      loadFundingRateHistory(current.symbol, view.line),
      loadFundingSettlement(current.symbol, view.line),
    ]).then(([historyResult, settlementResult]) => {
      setFundingHistory(historyResult.status === "fulfilled" ? historyResult.value : [])
      setFundingSettlement(settlementResult.status === "fulfilled" ? settlementResult.value : null)
      if (historyResult.status === "rejected" && settlementResult.status === "rejected") {
        setFundingMarketError(readError(historyResult.reason))
      }
    })
    setFundingPaymentsError("")
    if (session) {
      void loadFundingPayments(session.user.userId, current.symbol, view.line)
        .then((rows) => setFundingPayments(rows))
        .catch((reason: unknown) => {
          setFundingPayments([])
          setFundingPaymentsError(readError(reason))
        })
    } else {
      setFundingPayments([])
    }
  }, [current?.symbol, session, view.line])

  useEffect(() => {
    if (!current || view.line === PRODUCT_LINES.spot) {
      setMarkPrice(null)
      setIndexPrice(null)
      return
    }
    let cancelled = false
    let inFlight = false
    const refreshPrices = async () => {
      if (inFlight) return
      inFlight = true
      const [markResult, indexResult] = await Promise.allSettled([
        loadMarkPrice(current.symbol, view.line),
        loadIndexPrice(current.symbol, view.line),
      ])
      inFlight = false
      if (cancelled) return
      if (markResult.status === "fulfilled") setMarkPrice(markResult.value)
      if (indexResult.status === "fulfilled") setIndexPrice(indexResult.value)
    }
    void refreshPrices()
    const timer = window.setInterval(() => void refreshPrices(), 1_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [current?.symbol, view.line])

  useEffect(() => {
    if (!current || !assetScales[current.quoteAsset]) return
    const applyEvent = (event: WsEnvelope) => {
      if (
        event.op !== "event" ||
        event.productLine !== view.line ||
        !event.id ||
        processedEvents.current.has(event.id)
      )
        return
      processedEvents.current.add(event.id)
      if (processedEvents.current.size > 20000)
        processedEvents.current = new Set([...processedEvents.current].slice(-10000))
      const eventSymbol = text(event, "symbol")
      if (eventSymbol && eventSymbol !== current.symbol) return
      const channel = text(event, "channel")
      const data = record(valueAt(event, "data"))
      if (!data) return
      if (channel === "candles") {
        const candle = CandleSchema.safeParse(data)
        if (!candle.success) return
        const candlePeriod = text(data, "period") || text(event, "period")
        if (candlePeriod && candlePeriod !== period) return
        const next = mapCandle(candle.data)
        const liveTrade = latestTradeRef.current
        const candleSequence = numberValue(candle.data, "lastSequence")
        const olderThanLiveTrade =
          liveTrade?.symbol === current.symbol &&
          liveTrade.bucket === next.time &&
          candleSequence !== null &&
          candleSequence < liveTrade.sequence
        if (!olderThanLiveTrade && (!liveTrade || next.time >= liveTrade.bucket))
          updateMarketQuote(current.symbol, next.close)
        setCandles((rows) => {
          const live = rows.find((row) => row.time === next.time)
          const resolved =
            olderThanLiveTrade && liveTrade
              ? {
                  ...next,
                  high: Math.max(next.high, live?.high ?? liveTrade.price),
                  low: Math.min(next.low, live?.low ?? liveTrade.price),
                  close: live?.close ?? liveTrade.price,
                  volume: Math.max(next.volume, live?.volume ?? 0),
                }
              : next
          return [...rows.filter((row) => row.time !== next.time), resolved]
            .sort((left, right) => left.time.localeCompare(right.time))
            .slice(-120)
        })
        return
      }
      if (channel === "depth") {
        const orderBook = OrderBookSchema.safeParse(data)
        if (orderBook.success) {
          const nextSequence = orderBookSequence(orderBook.data)
          const currentSequence = bookSequenceRef.current
          if (!nextSequence) return
          if (orderBook.data.updateType === "DELTA") {
            if (currentSequence && compareSequences(nextSequence, currentSequence) <= 0) return
            const previousSequence = orderBook.data.previousSequence
            if (
              !currentSequence ||
              previousSequence == null ||
              compareSequences(String(previousSequence), currentSequence) !== 0
            ) {
              resyncOrderBook()
              return
            }
            setBook((previousBook) =>
              previousBook
                ? mergeOrderBook(
                    previousBook,
                    normalizeOrderBook(orderBook.data, current, assetScales),
                  )
                : null,
            )
            bookSequenceRef.current = nextSequence
            return
          }
          if (!currentSequence || compareSequences(nextSequence, currentSequence) > 0) {
            bookSequenceRef.current = nextSequence
            setBook(normalizeOrderBook(orderBook.data, current, assetScales))
          }
        }
        return
      }
      if (channel === "trades") {
        const nextTrade = normalizeTrade(data, current, assetScales)
        setRecentTrades((previous) =>
          [
            { ...nextTrade, eventTime: event.eventTime ?? new Date().toISOString() },
            ...previous,
          ].slice(0, 50),
        )
        updateMarketQuote(current.symbol, marketPriceFromRecord(nextTrade, current, assetScales))
        const tradePrice = numberValue(nextTrade, "price")
        const tradeQuantity = numberValue(nextTrade, "quantity")
        const tradeTime = Date.parse(event.eventTime ?? "")
        if (tradePrice !== null && tradePrice > 0 && Number.isFinite(tradeTime)) {
          const tradeSequence = numberValue(data, "sequence") ?? numberValue(data, "coreSequence")
          if (tradeSequence !== null) {
            latestTradeRef.current = {
              symbol: current.symbol,
              bucket: new Date(
                Math.floor(tradeTime / periodMillisecondsForChart(period)) *
                  periodMillisecondsForChart(period),
              ).toISOString(),
              price: tradePrice,
              sequence: tradeSequence,
            }
          }
          const quantity = Math.max(tradeQuantity ?? 0, 0)
          setCandles((rows) =>
            applyTradeToCandles(
              rows,
              tradeTime,
              periodMillisecondsForChart(period),
              tradePrice,
              quantity,
            ),
          )
          setDayCandles((rows) =>
            applyTradeToCandles(rows, tradeTime, 3_600_000, tradePrice, quantity),
          )
        }
        return
      }
      if (channel === "mark") {
        setMarkPrice(data)
        return
      }
      if (channel === "index") {
        setIndexPrice(data)
        return
      }
    }
    for (const event of [...realtime.events].reverse()) applyEvent(event)
  }, [assetScales, current, period, realtime.events, resyncOrderBook, updateMarketQuote, view.line])

  const submit = async () => {
    if (!session) {
      setSubmitState("error")
      setSubmitMessage(t("Please sign in before placing an order."))
      return
    }
    if (!current || !isPositiveDecimal(quantity)) {
      setSubmitState("error")
      setSubmitMessage(t("Please enter a valid quantity."))
      return
    }
    if (orderType === "STOP" && !triggerSupported) {
      setSubmitState("error")
      setSubmitMessage(t("Spot positions do not support TP/SL. Use a limit or market order."))
      return
    }
    if (orderType === "STOP" && !triggerCloseSide) {
      setSubmitState("error")
      setSubmitMessage(t("Open a position in this pair before setting TP/SL."))
      return
    }
    if (orderType === "STOP" && triggerCloseSide !== side) {
      setSubmitState("error")
      setSubmitMessage(
        triggerCloseSide === "SELL"
          ? t("Select Sell to close your long position before setting TP/SL.")
          : t("Select Buy to close your short position before setting TP/SL."),
      )
      return
    }
    const executionType = orderType === "STOP" ? triggerExecutionType : orderType
    if (executionType !== "MARKET" && !useBbo && !isPositiveDecimal(price)) {
      setSubmitState("error")
      setSubmitMessage(t("Limit orders require a valid price."))
      return
    }
    if (orderType === "STOP" && !isPositiveDecimal(triggerPrice)) {
      setSubmitState("error")
      setSubmitMessage(t("Trigger orders require a valid trigger price."))
      return
    }
    let quantitySteps: string
    let priceTicks: string | 0
    try {
      const baseScale = assetScales[current.baseAsset]
      const quoteScale = assetScales[current.quoteAsset]
      if (
        !baseScale ||
        ((orderType === "STOP" || executionType !== "MARKET" || side === "BUY") && !quoteScale)
      ) {
        throw new Error(t("Asset precision is not loaded. Order not submitted."))
      }
      if (!current.quantityStepUnits) {
        throw new Error(t("Quantity step is not loaded. Order not submitted."))
      }
      if (executionType !== "MARKET" && !current.priceTickUnits) {
        throw new Error(t("Price tick is not loaded. Order not submitted."))
      }
      if (orderType === "STOP" && !current.priceTickUnits) {
        throw new Error(t("Trigger price tick is not loaded. Order not submitted."))
      }
      const quantitySpec = marketQuantitySpec(current, assetScales)
      quantitySteps = decimalToStepUnits(quantity, quantitySpec.unitSize, quantitySpec.scale)
      if (orderType === "STOP" && activeTriggerPosition) {
        const positionCapacity = signedPositionSteps(activeTriggerPosition)
        const absoluteCapacity = positionCapacity < 0n ? -positionCapacity : positionCapacity
        if (BigInt(quantitySteps) > absoluteCapacity) {
          throw new Error(t("TP/SL quantity cannot exceed the current position."))
        }
      }
      priceTicks =
        executionType === "MARKET" || useBbo
          ? 0
          : decimalToStepUnits(price, current.priceTickUnits ?? "", quoteScale ?? "")

      if (orderType !== "STOP" && view.line === PRODUCT_LINES.spot && !(useBbo && side === "BUY")) {
        const balanceScale = balance ? assetScales[balance.asset] : undefined
        if (!balance || !balanceScale) {
          throw new Error(
            t("Available balance or asset precision is not loaded. Order not submitted."),
          )
        }
        const availableUnits =
          balance.availableUnits ??
          (balance.free === undefined
            ? undefined
            : decimalToUnits(String(balance.free), balanceScale))
        const referencePrice =
          executionType === "MARKET" ? (marketQuotes[current.symbol] ?? current.price) : price
        if (side === "BUY" && referencePrice === null) {
          throw new Error(
            t("Market reference price is unavailable. Cannot validate available balance."),
          )
        }
        if (availableUnits === undefined) {
          throw new Error(t("Balance units are unavailable. Order not submitted."))
        }
        const exceedsBalance =
          side === "SELL"
            ? decimalProductExceedsUnits(quantity, "1", availableUnits, balanceScale)
            : decimalProductExceedsUnits(
                quantity,
                String(referencePrice),
                availableUnits,
                balanceScale,
              )
        if (exceedsBalance) {
          throw new Error(t("Insufficient available balance. Order not submitted."))
        }
      }
    } catch (reason: unknown) {
      setSubmitState("error")
      setSubmitMessage(reason instanceof Error ? reason.message : t("Invalid quantity precision."))
      return
    }
    setSubmitState("loading")
    try {
      if (orderType === "STOP") {
        const requestId = crypto.randomUUID()
        const leg = {
          userId: session.user.userId,
          clientTriggerOrderId: `web-trigger-${requestId}`,
          symbol: current.symbol,
          side,
          triggerType,
          triggerPriceTicks: decimalToStepUnits(
            triggerPrice,
            current.priceTickUnits ?? "",
            assetScales[current.quoteAsset] ?? "",
          ),
          orderType: triggerExecutionType,
          timeInForce: triggerExecutionType === "MARKET" ? "IOC" : "GTC",
          priceTicks,
          quantitySteps,
          marginMode: orderSettings.marginMode,
          positionSide: orderSettings.positionSide,
        }
        if (protectionMode === "OCO") {
          const takeProfitTicks = decimalToStepUnits(
            takeProfitTriggerPrice,
            current.priceTickUnits ?? "",
            assetScales[current.quoteAsset] ?? "",
          )
          if (
            BigInt(takeProfitTicks) <= 0n ||
            (side === "SELL"
              ? BigInt(takeProfitTicks) <= BigInt(leg.triggerPriceTicks)
              : BigInt(takeProfitTicks) >= BigInt(leg.triggerPriceTicks))
          ) {
            throw new Error(
              t("Take-profit and stop-loss prices are in the wrong order for this position."),
            )
          }
          const ocoGroupId = `web-oco-${requestId}`
          const response = await placeBatchTriggerOrders(
            {
              atomic: true,
              orders: [
                {
                  ...leg,
                  ocoGroupId,
                  triggerType: "TAKE_PROFIT",
                  clientTriggerOrderId: `web-tp-${requestId}`,
                  triggerPriceTicks: takeProfitTicks,
                  orderType: takeProfitExecutionType,
                  timeInForce: takeProfitExecutionType === "MARKET" ? "IOC" : "GTC",
                  priceTicks:
                    takeProfitExecutionType === "MARKET"
                      ? 0
                      : decimalToStepUnits(
                          takeProfitLimitPrice,
                          current.priceTickUnits ?? "",
                          assetScales[current.quoteAsset] ?? "",
                        ),
                },
                { ...leg, ocoGroupId, triggerType: "STOP_LOSS" },
              ],
            },
            view.line,
          )
          if (response["completed"] !== 2 || response["failed"] !== 0)
            throw new Error(t("OCO pair was not accepted."))
          setSubmitMessage(t("Take-profit and stop-loss accepted together."))
        } else {
          const response = await placeTriggerOrder(leg, view.line)
          if (response.status !== "PENDING" && response.status !== "TRIGGERING") {
            setSubmitState("error")
            setSubmitMessage(
              response.rejectReason ?? `${t("Trigger order not accepted")}: ${response.status}`,
            )
            return
          }
          setSubmitMessage(`${t("Trigger order accepted")}: ${response.status}`)
        }
      } else {
        const response = await placeOrder(
          {
            userId: session.user.userId,
            clientOrderId: `web-${crypto.randomUUID()}`,
            symbol: current.symbol,
            side,
            orderType,
            ...(useBbo ? { bboPriceMode } : {}),
            timeInForce: orderType === "MARKET" ? "IOC" : "GTC",
            priceTicks,
            quantitySteps,
            marginMode: orderSettings.marginMode,
            positionSide: orderSettings.positionSide,
            reduceOnly: false,
            postOnly: false,
          },
          view.line,
        )
        if (response.status === "REJECTED") {
          setSubmitState("error")
          setSubmitMessage(response.rejectReason ?? t("Order rejected."))
          return
        }
        if (
          response.status !== "PENDING_RESERVE" &&
          response.status !== "ACCEPTED" &&
          response.status !== "PARTIALLY_FILLED" &&
          response.status !== "FILLED"
        ) {
          setSubmitState("error")
          setSubmitMessage(`${t("Order not accepted")}: ${response.status}`)
          return
        }
        setSubmitMessage(`${t("Order accepted")}: ${response.status}`)
      }
      setSubmitState("success")
      setQuantity("")
      setTriggerPrice("")
      setTakeProfitTriggerPrice("")
      setTakeProfitLimitPrice("")
      refresh()
    } catch (reason: unknown) {
      setSubmitState("error")
      setSubmitMessage(reason instanceof ApiError ? reason.message : readError(reason))
    }
  }
  const refresh = () => {
    realtime.refresh()
  }

  return (
    <div className="trade-page">
      <div className="trade-shell">
        <header className="trade-market-header">
          <div>
            <div className="trade-pair-picker" ref={pairPickerRef}>
              <h1>
                <button
                  type="button"
                  className="trade-pair-trigger"
                  aria-expanded={pairOpen}
                  aria-label={t("Select trading pair")}
                  onClick={() => setPairOpen((open) => !open)}
                >
                  {current ? <AssetIcon asset={current.baseAsset} /> : null}
                  <span>{(current?.symbol ?? view.symbol).replace(/-SWAP$/, "")}</span>
                  <ChevronDown size={17} />
                </button>
                <button
                  type="button"
                  className="trade-contract-info-trigger"
                  aria-label={t("Contract information")}
                  aria-expanded={contractInfoOpen}
                  onClick={() => setContractInfoOpen((open) => !open)}
                >
                  <Info size={17} />
                </button>
              </h1>
              {contractInfoOpen && current ? (
                <div
                  className="trade-contract-popover"
                  role="dialog"
                  aria-label={t("Contract information")}
                >
                  <strong>{current.symbol}</strong>
                  <dl>
                    <div>
                      <dt>{t("Product")}</dt>
                      <dd>{t(view.title)}</dd>
                    </div>
                    <div>
                      <dt>{t("Base / Quote")}</dt>
                      <dd>
                        {current.baseAsset} / {current.quoteAsset}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("Settlement")}</dt>
                      <dd>{current.settleAsset ?? current.quoteAsset}</dd>
                    </div>
                    <div>
                      <dt>{t("Price tick")}</dt>
                      <dd>
                        {current.priceTickUnits && assetScales[current.quoteAsset]
                          ? Number(current.priceTickUnits) / Number(assetScales[current.quoteAsset])
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("Contract size")}</dt>
                      <dd>
                        {current.contractMultiplierPpm
                          ? current.contractMultiplierPpm / 1_000_000
                          : "—"}{" "}
                        {current.contractValueAsset ?? current.baseAsset}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("Max leverage")}</dt>
                      <dd>{current.maxLeverage ? `${current.maxLeverage}×` : "—"}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
              {pairOpen ? (
                <div className="trade-pair-popover">
                  <SearchField
                    value={pairSearch}
                    onChange={setPairSearch}
                    placeholder={t("Search pairs...")}
                  />
                  <div className="trade-tabs">
                    <button
                      type="button"
                      className={pairTab === "all" ? "active" : ""}
                      onClick={() => setPairTab("all")}
                    >
                      {" "}
                      {t("All")}{" "}
                    </button>
                    <button
                      type="button"
                      className={pairTab === "favorites" ? "active" : ""}
                      onClick={() => setPairTab("favorites")}
                    >
                      {" "}
                      {t("Favorites")}{" "}
                    </button>
                  </div>
                  <div className="trade-pair-list">
                    {filteredMarkets.map((market) => (
                      <div
                        className={`pair-row ${market.symbol === current?.symbol ? "active" : ""}`}
                        key={market.symbol}
                      >
                        <button
                          type="button"
                          className="pair-favorite"
                          aria-label={
                            favorites.includes(market.symbol)
                              ? `Remove ${market.symbol} from favorites`
                              : `Add ${market.symbol} to favorites`
                          }
                          onClick={() => toggleFavorite(market.symbol)}
                        >
                          <Star
                            size={15}
                            fill={favorites.includes(market.symbol) ? "currentColor" : "none"}
                          />
                        </button>
                        <button
                          type="button"
                          className="pair-select"
                          onClick={() => {
                            setSelected(market.symbol)
                            setPairOpen(false)
                          }}
                        >
                          <AssetIcon asset={market.baseAsset} />
                          <span>{market.symbol}</span>
                        </button>
                        <span className="pair-market-values">
                          <strong className="mono">
                            <Price
                              value={marketQuotes[market.symbol] ?? market.price}
                              dollar={isDollarQuote(market.quoteAsset)}
                            />
                          </strong>
                          <small
                            className={
                              (pairChanges[market.symbol] ?? market.change24h ?? 0) >= 0
                                ? "positive mono"
                                : "negative mono"
                            }
                          >
                            {formatPercent(pairChanges[market.symbol] ?? market.change24h)}
                          </small>
                        </span>
                      </div>
                    ))}
                    {filteredMarkets.length === 0 ? (
                      <StateView
                        kind="empty"
                        message={
                          pairTab === "favorites"
                            ? "No favorite pairs yet."
                            : "No matching trading pairs."
                        }
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <small>{t("Last Price")}</small>
            <strong className="positive mono">
              <Price
                value={
                  lastTradePrice ??
                  candles.at(-1)?.close ??
                  (current ? marketQuotes[current.symbol] : null) ??
                  current?.price ??
                  null
                }
                dollar={isDollarQuote(current?.quoteAsset)}
              />
            </strong>
          </div>
          <div>
            <small>{t("24h Change")}</small>
            <strong
              className={
                (displayedDayStats?.change ?? current?.change24h ?? 0) >= 0
                  ? "positive mono"
                  : "negative mono"
              }
            >
              {formatPercent(displayedDayStats?.change ?? current?.change24h ?? null)}
            </strong>
          </div>
          <div>
            <small>{t("24h Open")}</small>
            <strong className="mono">
              <Price
                value={displayedDayStats?.open ?? null}
                dollar={isDollarQuote(current?.quoteAsset)}
              />
            </strong>
          </div>
          <div>
            <small>{t("24h High")}</small>
            <strong className="mono">
              <Price
                value={displayedDayStats?.high ?? current?.high24h ?? null}
                dollar={isDollarQuote(current?.quoteAsset)}
              />
            </strong>
          </div>
          <div>
            <small>{t("24h Low")}</small>
            <strong className="mono">
              <Price
                value={displayedDayStats?.low ?? current?.low24h ?? null}
                dollar={isDollarQuote(current?.quoteAsset)}
              />
            </strong>
          </div>
          <div>
            <small>{t("24h Close")}</small>
            <strong className="mono">
              <Price
                value={displayedDayStats?.close ?? null}
                dollar={isDollarQuote(current?.quoteAsset)}
              />
            </strong>
          </div>
          {view.line !== PRODUCT_LINES.spot && view.line !== PRODUCT_LINES.option ? (
            <>
              <div>
                <small>{t("Mark price")}</small>
                <strong className="mono">
                  <Price
                    value={numberValue(markPrice, "markPrice")}
                    dollar={isDollarQuote(current?.quoteAsset)}
                  />
                </strong>
              </div>
              <div>
                <small>{t("Index price")}</small>
                <strong className="mono">
                  <Price
                    value={numberValue(indexPrice, "indexPrice")}
                    dollar={isDollarQuote(current?.quoteAsset)}
                  />
                </strong>
              </div>
              <div className="funding-summary">
                <small>{t("Funding / Next funding")}</small>
                <strong className="mono">
                  <span className="positive">{fundingRate(funding)}</span> · {fundingTime(funding)}
                </strong>
              </div>
            </>
          ) : null}
        </header>
        <main className="trade-main">
          {view.line === PRODUCT_LINES.option ? (
            <OptionDetails market={current} quote={optionQuote} />
          ) : null}
          {view.key === "delivery-futures" || view.key === "coin-m-delivery" ? (
            <DeliveryDetails market={current} />
          ) : null}
          <div className="trade-chart-toolbar">
            {["1m", "15m", "1h", "4h", "1d"].map((value) => (
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
          <PriceChart
            candles={candles}
            period={period}
            dollar={isDollarQuote(current?.quoteAsset)}
            volumeUnit={current?.baseAsset ?? ""}
            demo={demo}
            unavailable={!demo && candles.length === 0}
          />
          <div className="trade-account-shell">
            <div className="trade-account-tabs" role="tablist" aria-label={t("Account data")}>
              <button
                type="button"
                role="tab"
                aria-selected={accountTab === "positions"}
                className={accountTab === "positions" ? "active" : ""}
                onClick={() => setAccountTab("positions")}
              >
                {" "}
                {t("Positions & order state")}{" "}
              </button>
              {view.line !== PRODUCT_LINES.spot ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={accountTab === "triggers"}
                  className={accountTab === "triggers" ? "active" : ""}
                  onClick={() => setAccountTab("triggers")}
                >
                  {" "}
                  {t("Take-profit & stop-loss")}{" "}
                </button>
              ) : null}
              {view.line !== PRODUCT_LINES.spot && view.line !== PRODUCT_LINES.option ? (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={accountTab === "fundingMarket"}
                    className={accountTab === "fundingMarket" ? "active" : ""}
                    onClick={() => setAccountTab("fundingMarket")}
                  >
                    {" "}
                    {t("Funding market history")}{" "}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={accountTab === "fundingPayments"}
                    className={accountTab === "fundingPayments" ? "active" : ""}
                    onClick={() => setAccountTab("fundingPayments")}
                  >
                    {" "}
                    {t("Funding payment history")}{" "}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                role="tab"
                aria-selected={accountTab === "settings"}
                className={accountTab === "settings" ? "active" : ""}
                onClick={() => setAccountTab("settings")}
              >
                {" "}
                {t("Account settings & risk")}{" "}
              </button>
            </div>
            <div className="trade-account-body" role="tabpanel">
              {accountTab === "settings" ? (
                <TradingAccountControls
                  userId={session?.user.userId}
                  symbol={current?.symbol ?? view.symbol}
                  productLine={view.line}
                  positions={positions}
                  settleAsset={current?.settleAsset ?? current?.quoteAsset ?? "USDT"}
                  assetScale={
                    current ? assetScales[current.settleAsset ?? current.quoteAsset] : undefined
                  }
                  priceTickUnits={current?.priceTickUnits}
                  priceScale={current ? assetScales[current.quoteAsset] : undefined}
                  quantityStepUnits={
                    current?.productLine === PRODUCT_LINES.usdMPerpetual
                      ? String(current.contractMultiplierPpm ?? "")
                      : current?.quantityStepUnits
                  }
                  quantityScale={
                    current?.productLine === PRODUCT_LINES.usdMPerpetual
                      ? "1000000"
                      : current
                        ? assetScales[current.baseAsset]
                        : undefined
                  }
                  accountView={realtime.views[view.line]}
                  onRefresh={realtime.refresh}
                  onSettingsChange={handleSettingsChange}
                />
              ) : null}
              {accountTab === "positions" ? (
                <Panel dense>
                  <div className="panel-heading">
                    <h2>
                      {view.line === PRODUCT_LINES.spot
                        ? "Account order state"
                        : t("Positions & order state")}
                    </h2>
                    <Badge tone="info">{t("Backend")}</Badge>
                  </div>
                  {positions.length > 0 ? (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>{t("Symbol")}</th>
                            <th>{t("Side")}</th>
                            <th>{t("Quantity")}</th>
                            <th>{t("Entry")}</th>
                            <th>{t("Realized PnL")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.map((position, index) => (
                            <tr key={text(position, "positionId") || String(index)}>
                              <td>{text(position, "symbol") || "—"}</td>
                              <td>
                                {text(position, "positionSide") || text(position, "side") || "—"}
                              </td>
                              <td className="mono">
                                {formatPositionQuantity(position, current, assetScales)}
                              </td>
                              <td className="mono">
                                {formatPositionEntry(position, current, assetScales)}
                              </td>
                              <td className="mono">
                                {formatPositionPnl(position, current, assetScales)}
                              </td>
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
                          : view.line === PRODUCT_LINES.spot
                            ? "Log in to view your open orders and account state."
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
              ) : null}
              {accountTab === "triggers" && view.line !== PRODUCT_LINES.spot ? (
                <Panel dense>
                  <TriggerOrders
                    rows={triggerOrders}
                    productLine={view.line}
                    userId={session?.user.userId}
                    market={current}
                    assetScales={assetScales}
                    onDone={(value) => {
                      setSubmitMessage(value)
                      refresh()
                    }}
                  />
                </Panel>
              ) : null}
              {view.line !== PRODUCT_LINES.spot && view.line !== PRODUCT_LINES.option ? (
                <>
                  {accountTab === "fundingMarket" ? (
                    <FundingMarketHistory
                      rows={fundingHistory}
                      settlement={fundingSettlement}
                      error={fundingMarketError}
                    />
                  ) : null}
                  {accountTab === "fundingPayments" ? (
                    <FundingPayments
                      rows={fundingPayments}
                      error={fundingPaymentsError}
                      assetScales={assetScales}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </main>
        <aside className="trade-market-side">
          <div className="trade-tabs" role="tablist" aria-label={t("Market depth and trades")}>
            <button
              type="button"
              role="tab"
              aria-selected={marketSideTab === "book"}
              className={marketSideTab === "book" ? "active" : ""}
              onClick={() => setMarketSideTab("book")}
            >
              {" "}
              {t("Order book")}{" "}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={marketSideTab === "trades"}
              className={marketSideTab === "trades" ? "active" : ""}
              onClick={() => setMarketSideTab("trades")}
            >
              {" "}
              {t("Recent trades")}{" "}
            </button>
          </div>
          {marketSideTab === "book" ? (
            <OrderBook
              book={book}
              latestTrade={recentTrades[0] ?? null}
              depth={bookDepth}
              precision={bookPrecision}
              priceStep={
                current?.priceTickUnits && assetScales[current.quoteAsset]
                  ? Number(current.priceTickUnits) / Number(assetScales[current.quoteAsset])
                  : 0
              }
              dollar={isDollarQuote(current?.quoteAsset)}
              baseAsset={current?.baseAsset ?? "—"}
              quoteAsset={current?.quoteAsset ?? "—"}
              onDepthChange={setBookDepth}
              onPrecisionChange={setBookPrecision}
            />
          ) : (
            <Panel dense className="trade-side-panel">
              <div className="panel-heading">
                <h2>{t("Recent trades")}</h2>
                <Badge tone="neutral">{recentTrades.length > 0 ? t("Recent") : t("Waiting")}</Badge>
              </div>
              <div className="recent-trade-columns">
                <span>
                  {t("Price (")}
                  {current?.quoteAsset ?? "—"})
                </span>
                <span>
                  {t("Quantity (")}
                  {current?.baseAsset ?? "—"})
                </span>
                <span>{t("Time")}</span>
              </div>
              {recentTrades.length === 0 ? (
                <p className="subtle">{t("Waiting for recent trades.")}</p>
              ) : (
                <div className="recent-trades">
                  {recentTrades.slice(0, 50).map((trade, index) => (
                    <div
                      className="recent-trade-row"
                      key={`${text(trade, "coreSequence")}-${index}`}
                    >
                      <span
                        className={
                          text(trade, "side") === "SELL" ? "negative mono" : "positive mono"
                        }
                      >
                        {displayPrice(text(trade, "price"), isDollarQuote(current?.quoteAsset))}
                      </span>
                      <span className="mono">
                        {formatTradeQuantity(tradeDisplayQuantity(trade, current, assetScales))}
                      </span>
                      <time className="mono">{formatClock(text(trade, "eventTime"))}</time>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </aside>
        <aside className="trade-ticket">
          <div className="ticket-tabs">
            <button
              type="button"
              className={side === "BUY" ? "buy active" : "buy"}
              onClick={() => setSide("BUY")}
            >
              {" "}
              {t("Buy")}{" "}
            </button>
            <button
              type="button"
              className={side === "SELL" ? "sell active" : "sell"}
              onClick={() => setSide("SELL")}
            >
              {" "}
              {t("Sell")}{" "}
            </button>
          </div>
          <div className="order-type-tabs">
            {(triggerSupported
              ? (["LIMIT", "MARKET", "STOP"] as const)
              : (["LIMIT", "MARKET"] as const)
            ).map((type) => (
              <button
                type="button"
                className={orderType === type ? "active" : ""}
                key={type}
                onClick={() => setOrderType(type)}
              >
                {t(type === "STOP" ? "TP / SL" : type)}
              </button>
            ))}
          </div>
          {orderType === "STOP" ? (
            <>
              <fieldset className="protection-mode" aria-label={t("Protection mode")}>
                {(["SINGLE", "OCO"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={protectionMode === mode}
                    onClick={() => {
                      setProtectionMode(mode)
                      if (mode === "OCO") setTriggerType("STOP_LOSS")
                    }}
                  >
                    {t(mode === "SINGLE" ? "One-way trigger" : "Two-way (OCO)")}
                  </button>
                ))}
              </fieldset>
              <Field
                label={
                  <span className="label-with-help">
                    {t("Trigger type")}
                    <span className="trigger-help">
                      <button
                        type="button"
                        className="trigger-help-button"
                        aria-label={t("Trigger rules")}
                        aria-describedby="trigger-rules"
                      >
                        <CircleHelp size={14} />
                      </button>
                      <span role="tooltip" id="trigger-rules" className="trigger-tooltip">
                        {protectionMode === "OCO"
                          ? t(
                              "Set both take-profit and stop-loss trigger and order prices. When one triggers, its order is submitted and the other leg is canceled.",
                            )
                          : t(
                              "Set a trigger price and an order price. When the trigger condition is met, the system submits your order.",
                            )}
                        <br />
                        {protectionMode === "OCO"
                          ? `${t("Stop loss")}: ${triggerConditionText(side, "STOP_LOSS")} · ${t("Take profit")}: ${triggerConditionText(side, "TAKE_PROFIT")}`
                          : triggerConditionText(side, triggerType)}
                        <br />
                        {t("Reduces the position after triggering; never opens a new position.")}
                      </span>
                    </span>
                  </span>
                }
              >
                {protectionMode === "OCO" ? (
                  <div className="protection-leg-title">{t("Stop loss")}</div>
                ) : (
                  <DropdownSelect
                    aria-label={t("Trigger type")}
                    value={triggerType}
                    onChange={(event) =>
                      setTriggerType(
                        event.target.value === "TAKE_PROFIT" ? "TAKE_PROFIT" : "STOP_LOSS",
                      )
                    }
                  >
                    <option value="STOP_LOSS">{t("Stop loss")}</option>
                    <option value="TAKE_PROFIT">{t("Take profit")}</option>
                  </DropdownSelect>
                )}
              </Field>
              <div className="trigger-price-source">
                {t("Trigger source")} <strong>{t("Mark price")}</strong>
              </div>
              {triggerCloseSide && triggerCloseSide !== side ? (
                <button
                  type="button"
                  className="trigger-side-action"
                  onClick={() => setSide(triggerCloseSide)}
                >
                  {t("Switch to")}{" "}
                  {triggerCloseSide === "SELL" ? t("Close long") : t("Close short")}
                </button>
              ) : null}
              <Field label={t("Trigger price")}>
                <div className="number-input">
                  <input
                    value={triggerPrice}
                    onChange={(event) => setTriggerPrice(event.target.value)}
                    inputMode="decimal"
                    placeholder={t("Enter trigger price")}
                    aria-label={t("TP/SL trigger price")}
                  />
                  <span>{current?.quoteAsset ?? "USDT"}</span>
                </div>
              </Field>
              <Field
                label={t("Execution")}
                hint={
                  triggerExecutionType === "MARKET"
                    ? t("Close at market after triggering")
                    : t("Place a limit close order after triggering")
                }
              >
                <DropdownSelect
                  aria-label={t("Execution")}
                  value={triggerExecutionType}
                  onChange={(event) =>
                    setTriggerExecutionType(event.target.value === "LIMIT" ? "LIMIT" : "MARKET")
                  }
                >
                  <option value="MARKET">{t("Market")}</option>
                  <option value="LIMIT">{t("Limit")}</option>
                </DropdownSelect>
              </Field>
            </>
          ) : null}
          {orderType !== "MARKET" && (orderType !== "STOP" || triggerExecutionType === "LIMIT") ? (
            <Field label={orderType === "STOP" ? t("Limit price") : t("Price")}>
              <div className="limit-price-control">
                {useBbo ? (
                  <DropdownSelect
                    value={bboPriceMode}
                    aria-label={t("BBO price mode")}
                    onChange={(event) => setBboPriceMode(event.target.value)}
                  >
                    <option value="OPPONENT_1">{t("Opponent 1")}</option>
                    <option value="OPPONENT_5">{t("Opponent 5")}</option>
                    <option value="SAME_SIDE_1">{t("Same side 1")}</option>
                    <option value="SAME_SIDE_5">{t("Same side 5")}</option>
                  </DropdownSelect>
                ) : (
                  <div className="number-input">
                    <input
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                      aria-label={t("Limit price")}
                      inputMode="decimal"
                    />
                    <span>{current?.quoteAsset ?? "USDT"}</span>
                  </div>
                )}
                {orderType === "LIMIT" ? (
                  <div className="bbo-toggle-wrap">
                    <button
                      type="button"
                      className="bbo-toggle"
                      aria-pressed={bboEnabled}
                      aria-describedby="bbo-explanation"
                      onClick={() => setBboEnabled(!bboEnabled)}
                    >
                      {t("BBO")}
                    </button>
                    <div id="bbo-explanation" role="tooltip" className="bbo-tooltip">
                      {t(
                        "BBO quickly sets a limit order price from the order book. Same side uses your trading direction; opponent uses the opposite side. 1 selects the best price level and 5 selects the fifth best. The server selects the price when you submit; the order does not track later book changes.",
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </Field>
          ) : null}
          {orderType === "STOP" && protectionMode === "OCO" ? (
            <div className="protection-second-leg">
              <strong className="protection-leg-title">{t("Take profit")}</strong>
              <Field label={t("Trigger price")}>
                <div className="number-input">
                  <input
                    value={takeProfitTriggerPrice}
                    onChange={(event) => setTakeProfitTriggerPrice(event.target.value)}
                    inputMode="decimal"
                    aria-label={t("Take-profit trigger price")}
                  />
                  <span>{current?.quoteAsset ?? "USDT"}</span>
                </div>
              </Field>
              <Field label={t("Execution")}>
                <DropdownSelect
                  value={takeProfitExecutionType}
                  aria-label={t("Take-profit execution")}
                  onChange={(event) =>
                    setTakeProfitExecutionType(event.target.value === "LIMIT" ? "LIMIT" : "MARKET")
                  }
                >
                  <option value="MARKET">{t("Market")}</option>
                  <option value="LIMIT">{t("Limit")}</option>
                </DropdownSelect>
              </Field>
              {takeProfitExecutionType === "LIMIT" ? (
                <Field label={t("Limit price")}>
                  <div className="number-input">
                    <input
                      value={takeProfitLimitPrice}
                      onChange={(event) => setTakeProfitLimitPrice(event.target.value)}
                      inputMode="decimal"
                      aria-label={t("Take-profit limit price")}
                    />
                    <span>{current?.quoteAsset ?? "USDT"}</span>
                  </div>
                </Field>
              ) : null}
            </div>
          ) : null}
          <Field
            label={orderType === "STOP" ? t("Close quantity") : t("Quantity")}
            {...(orderType === "STOP"
              ? { hint: t("Cannot exceed the current position size") }
              : {})}
          >
            <div className="number-input">
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                aria-label={orderType === "STOP" ? t("TP/SL close quantity") : t("Order quantity")}
              />
              <span>{current?.baseAsset ?? t("Asset")}</span>
            </div>
          </Field>
          {view.line === PRODUCT_LINES.spot || orderType === "STOP" ? (
            <div className="slider-row">
              <span>0%</span>
              <input
                type="range"
                min="0"
                max="100"
                value={percentage}
                onChange={(event) => setOrderPercentage(Number(event.target.value))}
                aria-label={t("Order percentage")}
              />
              <span>100%</span>
            </div>
          ) : null}
          <div className="ticket-summary">
            <span>{t("Available")}</span>
            <span className="mono">
              {session
                ? `${displayPrice(balanceAmount(balance, assetScales) ?? "", isDollarQuote(balance?.asset ?? current?.quoteAsset))} ${balance?.asset ?? current?.quoteAsset ?? ""}`
                : t("Login required")}
            </span>
            <span>{t("Est. fee")}</span>
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
            {session && orderType === "STOP"
              ? `${protectionMode === "OCO" ? t("Set TP/SL pair") : triggerType === "STOP_LOSS" ? t("Set stop loss") : t("Set take profit")}（${side === "SELL" ? t("Sell to close") : t("Buy to close")}）`
              : session
                ? `${side === "BUY" ? t("Buy") : t("Sell")} ${current?.baseAsset ?? t("Asset")}`
                : t("Log in to trade")}
          </Button>
          <a className="route-link ticket-login" href="/auth/login">
            {session ? t("Manage orders") : t("Create an account")}
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
          {" "}
          {t("Demo data: prices and charts are for local visual checks only.")}{" "}
        </div>
      ) : null}
    </div>
  )
}

export function OrderBook({
  book,
  latestTrade,
  depth,
  precision,
  priceStep,
  baseAsset,
  quoteAsset,
  dollar,
  onDepthChange,
  onPrecisionChange,
}: {
  readonly book: ApiOrderBook | null
  readonly latestTrade: Readonly<Record<string, unknown>> | null
  readonly depth: 10 | 20 | 50
  readonly precision: 1 | 10 | 100
  readonly priceStep: number
  readonly baseAsset: string
  readonly quoteAsset: string
  readonly dollar: boolean
  readonly onDepthChange: (depth: 10 | 20 | 50) => void
  readonly onPrecisionChange: (precision: 1 | 10 | 100) => void
}) {
  const askSideRef = useRef<HTMLDivElement>(null)
  const withTotals = (levels: Level[]) => {
    let total = "0"
    return levels.slice(0, depth).map((level) => {
      total = addDecimalQuantities(
        total,
        String(Array.isArray(level) ? level[1] : level.quantitySteps),
      )
      return { level, total }
    })
  }
  const bids = withTotals(aggregateBookLevels(book?.bids ?? [], priceStep * precision, "bid"))
  const asks = withTotals(
    aggregateBookLevels(book?.asks ?? [], priceStep * precision, "ask"),
  ).reverse()
  // Both sides use the same visible quantity scale; totals remain separate text values.
  const maxQuantity = Math.max(
    0,
    ...[...bids, ...asks].map(({ level }) => {
      const quantity = Number(Array.isArray(level) ? level[1] : level.quantitySteps)
      return Number.isFinite(quantity) ? quantity : 0
    }),
  )
  useLayoutEffect(() => {
    const askSide = askSideRef.current
    if (askSide) askSide.scrollTop = askSide.scrollHeight
  }, [book, depth, precision])
  return (
    <Panel dense className="order-book-panel">
      <div className="panel-heading">
        <h2>{t("Order book")}</h2>
        <div className="book-depth-control">
          {" "}
          {t("Precision")}{" "}
          <DropdownSelect
            aria-label={t("Order book price precision")}
            value={precision}
            onChange={(event) => onPrecisionChange(Number(event.target.value) as 1 | 10 | 100)}
          >
            {([1, 10, 100] as const).map((multiple) => (
              <option key={multiple} value={multiple}>
                {priceStep > 0 ? (priceStep * multiple).toFixed(8).replace(/\.?0+$/, "") : "—"}
              </option>
            ))}
          </DropdownSelect>{" "}
          {t("Depth")}{" "}
          <DropdownSelect
            aria-label={t("Order book depth")}
            value={depth}
            onChange={(event) => onDepthChange(Number(event.target.value) as 10 | 20 | 50)}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </DropdownSelect>
        </div>
      </div>
      <div className="order-book-sides">
        <section className="order-book-side" aria-label={t("Asks, high to low")}>
          <div className="order-book-columns">
            <span>
              {t("Price (")}
              {quoteAsset})
            </span>
            <span>
              {t("Quantity (")}
              {baseAsset})
            </span>
            <span>
              {t("Total (")}
              {baseAsset})
            </span>
          </div>
          <div ref={askSideRef} className="order-book-scroll order-book-asks">
            <div className="order-book">
              {asks.map(({ level, total }) => (
                <LevelRow
                  key={`ask-${levelPrice(level)}`}
                  level={level}
                  total={total}
                  maxQuantity={maxQuantity}
                  tone="negative"
                  dollar={dollar}
                />
              ))}
            </div>
          </div>
        </section>
        <div className="order-book-last-trade" aria-live="polite">
          <span>{t("Last trade")}</span>
          <strong
            className={text(latestTrade, "side") === "SELL" ? "negative mono" : "positive mono"}
          >
            {displayPrice(text(latestTrade, "price"), dollar)}
          </strong>
        </div>
        <section className="order-book-side" aria-label={t("Bids, high to low")}>
          <div className="order-book-columns">
            <span>
              {t("Price (")}
              {quoteAsset})
            </span>
            <span>
              {t("Quantity (")}
              {baseAsset})
            </span>
            <span>
              {t("Total (")}
              {baseAsset})
            </span>
          </div>
          <div className="order-book-scroll">
            <div className="order-book">
              {bids.map(({ level, total }) => (
                <LevelRow
                  key={`bid-${levelPrice(level)}`}
                  level={level}
                  total={total}
                  maxQuantity={maxQuantity}
                  tone="positive"
                  dollar={dollar}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </Panel>
  )
}

function aggregateBookLevels(
  levels: readonly Level[],
  priceStep: number,
  side: "bid" | "ask",
): Level[] {
  const sorted = [...levels].sort((left, right) =>
    side === "bid" ? levelPrice(right) - levelPrice(left) : levelPrice(left) - levelPrice(right),
  )
  if (!Number.isFinite(priceStep) || priceStep <= 0) return sorted
  const buckets = new Map<string, string>()
  for (const level of sorted) {
    const price = levelPrice(level)
    const quantity = String(Array.isArray(level) ? level[1] : level.quantitySteps)
    if (!Number.isFinite(price) || !Number.isFinite(Number(quantity))) continue
    const bucket =
      side === "bid"
        ? Math.floor((price + priceStep * 1e-9) / priceStep)
        : Math.ceil((price - priceStep * 1e-9) / priceStep)
    const key = String(Number((bucket * priceStep).toFixed(10)))
    buckets.set(key, addDecimalQuantities(buckets.get(key) ?? "0", quantity))
  }
  return [...buckets].map(([price, quantity]) => [price, String(quantity)] as Level)
}

function tradeDisplayQuantity(
  trade: Readonly<Record<string, unknown>>,
  market: Market | null,
  assetScales: Readonly<Record<string, string>>,
): string {
  const steps = text(trade, "quantitySteps")
  if (steps && market) {
    try {
      const spec = marketQuantitySpec(market, assetScales)
      return stepUnitsToDecimal(steps, spec.unitSize, spec.scale)
    } catch {
      return ""
    }
  }
  return text(trade, "quantity") || text(trade, "qty")
}

function normalizeOrderBook(
  book: ApiOrderBook,
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): ApiOrderBook {
  const priceScale = assetScales[market.quoteAsset]
  if (!priceScale) throw new Error(`Missing price scale for ${market.quoteAsset}`)
  const quantitySpec = marketQuantitySpec(market, assetScales)
  const normalizeLevel = (level: ApiOrderBookLevel): ApiOrderBookLevel => {
    if (Array.isArray(level) || !market.priceTickUnits || !market.quantityStepUnits) return level
    return {
      priceTicks: stepUnitsToDecimal(level.priceTicks, market.priceTickUnits, priceScale),
      quantitySteps: stepUnitsToDecimal(
        level.quantitySteps,
        quantitySpec.unitSize,
        quantitySpec.scale,
      ),
      orderCount: level.orderCount,
    }
  }
  return {
    ...book,
    bids: book.bids?.map(normalizeLevel),
    asks: book.asks?.map(normalizeLevel),
  }
}

function mergeOrderBook(base: ApiOrderBook, update: ApiOrderBook): ApiOrderBook {
  return {
    ...update,
    bids: mergeOrderBookLevels(base.bids ?? [], update.bids ?? []),
    asks: mergeOrderBookLevels(base.asks ?? [], update.asks ?? []),
  }
}

function mergeOrderBookLevels(
  base: readonly ApiOrderBookLevel[],
  updates: readonly ApiOrderBookLevel[],
): readonly ApiOrderBookLevel[] {
  if (updates.some(Array.isArray)) return updates
  const levels = new Map<string, ApiOrderBookLevel>()
  for (const level of base) {
    if (!Array.isArray(level)) levels.set(String(level.priceTicks), level)
  }
  for (const level of updates) {
    if (Array.isArray(level)) continue
    const price = String(level.priceTicks)
    if (String(level.quantitySteps) === "0") levels.delete(price)
    else levels.set(price, level)
  }
  return [...levels.values()]
}

function LevelRow({
  level,
  total,
  maxQuantity,
  tone,
  dollar,
}: {
  readonly level: Level
  readonly total: string
  readonly maxQuantity: number
  readonly tone: "positive" | "negative"
  readonly dollar: boolean
}) {
  const price = Array.isArray(level) ? String(level[0]) : String(level.priceTicks)
  const amount = Array.isArray(level) ? String(level[1]) : String(level.quantitySteps)
  const quantity = Number(amount)
  const fill =
    maxQuantity > 0 && Number.isFinite(quantity)
      ? Math.max(0, Math.min(1, quantity / maxQuantity))
      : 0
  return (
    <div className="order-book-row">
      <span
        className={`order-book-depth-fill ${tone}`}
        aria-hidden="true"
        style={{ transform: `scaleX(${fill})` }}
      />
      <strong className={`${tone} mono`}>{displayPrice(price, dollar)}</strong>
      <span className="mono" title={amount}>
        {amount}
      </span>
      <span className="mono" title={total}>
        {total}
      </span>
    </div>
  )
}

function levelPrice(level: Level): number {
  return Number(Array.isArray(level) ? level[0] : level.priceTicks)
}

function normalizeTrade(
  trade: Readonly<Record<string, unknown>>,
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const priceScale = assetScales[market.quoteAsset]
  if (!priceScale) throw new Error(`Missing price scale for ${market.quoteAsset}`)
  const value = (key: string): unknown => trade[key]
  const price =
    value("price") ??
    value("lastPrice") ??
    (value("priceTicks") !== undefined && market.priceTickUnits
      ? stepUnitsToDecimal(String(value("priceTicks")), market.priceTickUnits, priceScale)
      : undefined)
  const quantitySpec = marketQuantitySpec(market, assetScales)
  const quantity =
    (value("quantitySteps") !== undefined && market.quantityStepUnits
      ? stepUnitsToDecimal(
          String(value("quantitySteps")),
          quantitySpec.unitSize,
          quantitySpec.scale,
        )
      : undefined) ??
    value("quantity") ??
    value("qty")
  return {
    ...trade,
    ...(price !== undefined ? { price } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
  }
}

function marketPriceFromRecord(
  row: Record<string, unknown>,
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): number | null {
  for (const key of ["price", "lastPrice", "markPrice", "indexPrice"]) {
    const direct = numberValue(row, key)
    if (direct !== null && direct > 0) return direct
  }
  const ticks =
    valueAt(row, "priceTicks") ??
    valueAt(row, "lastPriceTicks") ??
    valueAt(row, "markPriceTicks") ??
    valueAt(row, "indexPriceTicks")
  const priceScale = assetScales[market.quoteAsset]
  if (ticks === undefined || !market.priceTickUnits || !priceScale) return null
  try {
    const converted = Number(stepUnitsToDecimal(String(ticks), market.priceTickUnits, priceScale))
    return Number.isFinite(converted) && converted > 0 ? converted : null
  } catch {
    return null
  }
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
            <th>{t("Open order")}</th>
            <th>{t("Side")}</th>
            <th>{t("Status")}</th>
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

function TriggerOrders({
  rows,
  productLine,
  userId,
  market,
  assetScales,
  onDone,
}: {
  readonly rows: readonly ApiTriggerOrder[]
  readonly productLine: ProductLine
  readonly userId: string | number | undefined
  readonly market: Market | null
  readonly assetScales: Readonly<Record<string, string>>
  readonly onDone: (message: string) => void
}) {
  const title = t("Take-profit & stop-loss")
  if (rows.length === 0) {
    return (
      <div className="trigger-orders-state">
        <div className="panel-heading">
          <h3>{title}</h3>
          <Badge tone="neutral">{t("0 active")}</Badge>
        </div>
        <StateView kind="empty" message={t("No pending trigger orders for this pair.")} />
      </div>
    )
  }
  return (
    <div className="trigger-orders-state">
      <div className="panel-heading">
        <h3>{title}</h3>
        <Badge tone="info">
          {rows.length} {t("active")}
        </Badge>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Protection")}</th>
              <th>{t("Trigger price")}</th>
              <th>{t("Close side")}</th>
              <th>{t("Quantity")}</th>
              <th>{t("Execution")}</th>
              <th>{t("Status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <TriggerOrderRow
                key={String(row.triggerOrderId)}
                row={row}
                productLine={productLine}
                userId={userId}
                market={market}
                assetScales={assetScales}
                onDone={onDone}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TriggerOrderRow({
  row,
  productLine,
  userId,
  market,
  assetScales,
  onDone,
}: {
  readonly row: ApiTriggerOrder
  readonly productLine: ProductLine
  readonly userId: string | number | undefined
  readonly market: Market | null
  readonly assetScales: Readonly<Record<string, string>>
  readonly onDone: (message: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const triggerPrice = formatTriggerOrderPrice(row, market, assetScales)
  const quantity = formatTriggerOrderQuantity(row, market, assetScales)
  return (
    <tr>
      <td>
        <strong>{triggerTypeLabel(row.triggerType)}</strong>
        <small className="table-subline mono">#{String(row.triggerOrderId)}</small>
      </td>
      <td className="mono" title={`ticks: ${String(row.triggerPriceTicks)}`}>
        {triggerPrice} <small>{row.triggerCondition === "GREATER_OR_EQUAL" ? "≥" : "≤"}</small>
      </td>
      <td>{row.side === "SELL" ? t("Close long") : t("Close short")}</td>
      <td className="mono">{quantity}</td>
      <td>{row.orderType === "MARKET" ? t("Market") : t("Limit")}</td>
      <td>
        <Badge tone={triggerStatusTone(row.status)}>{triggerStatusLabel(row.status)}</Badge>
      </td>
      <td>
        <Button
          tone="negative"
          loading={loading}
          disabled={userId === undefined || row.status !== "PENDING"}
          onClick={() => {
            if (
              userId === undefined ||
              !window.confirm(t("Cancel this take-profit / stop-loss order?"))
            )
              return
            setLoading(true)
            void cancelTriggerOrder(userId, row.triggerOrderId, productLine)
              .then(
                () => onDone(t("Trigger order cancellation requested.")),
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        >
          <XCircle size={14} /> {t("Revoke")}{" "}
        </Button>
      </td>
    </tr>
  )
}

function triggerTypeLabel(value: ApiTriggerOrder["triggerType"]): string {
  if (value === "STOP_LOSS") return t("Stop loss")
  if (value === "TAKE_PROFIT") return t("Take profit")
  return t("Trailing stop")
}

function triggerStatusLabel(value: ApiTriggerOrder["status"]): string {
  const labels: Readonly<Record<ApiTriggerOrder["status"], string>> = {
    PENDING: t("Pending"),
    TRIGGERING: t("Triggering"),
    TRIGGERED: t("Triggered"),
    TRIGGER_FAILED: t("Failed"),
    CANCELED: t("Canceled"),
    EXPIRED: t("Expired"),
  }
  return labels[value]
}

function triggerStatusTone(
  value: ApiTriggerOrder["status"],
): "neutral" | "positive" | "negative" | "warning" | "info" {
  if (value === "PENDING") return "info"
  if (value === "TRIGGERED") return "positive"
  if (value === "TRIGGER_FAILED") return "negative"
  if (value === "TRIGGERING") return "warning"
  return "neutral"
}

function formatTriggerOrderPrice(
  row: ApiTriggerOrder,
  market: Market | null,
  assetScales: Readonly<Record<string, string>>,
): string {
  if (!market?.priceTickUnits || !assetScales[market.quoteAsset]) {
    return `ticks ${String(row.triggerPriceTicks)}`
  }
  try {
    return `${stepUnitsToDecimal(row.triggerPriceTicks, market.priceTickUnits, assetScales[market.quoteAsset] ?? "1")} ${market.quoteAsset}`
  } catch {
    return `ticks ${String(row.triggerPriceTicks)}`
  }
}

function formatTriggerOrderQuantity(
  row: ApiTriggerOrder,
  market: Market | null,
  assetScales: Readonly<Record<string, string>>,
): string {
  if (!market) {
    return `steps ${String(row.quantitySteps)}`
  }
  try {
    const spec = marketQuantitySpec(market, assetScales)
    return `${stepUnitsToDecimal(row.quantitySteps, spec.unitSize, spec.scale)} ${market.baseAsset}`
  } catch {
    return `steps ${String(row.quantitySteps)}`
  }
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
                () => onDone(t("Cancellation requested.")),
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        >
          <XCircle size={14} /> {t("Cancel")}{" "}
        </Button>
      </td>
    </tr>
  )
}

function OptionDetails({
  market,
  quote,
}: {
  readonly market: Market | null
  readonly quote: ApiOptionQuote | null
}) {
  return (
    <Panel dense className="contract-details">
      <div className="panel-heading">
        <h2>{t("Option contract")}</h2>
        <Badge tone="info">{t("Backend fields")}</Badge>
      </div>
      <div className="contract-detail-grid">
        <Detail
          label={t("Underlying")}
          value={market?.underlyingSymbol ?? market?.baseAsset ?? "—"}
        />
        <Detail label={t("Expiry")} value={formatDate(market?.expiryTime)} />
        <Detail label={t("Strike (units)")} value={market?.strikePriceUnits?.toString() ?? "—"} />
        <Detail label={t("Call / Put")} value={market?.optionType ?? "—"} />
        <Detail label={t("Exercise")} value={market?.optionExerciseStyle ?? "—"} />
        <Detail label={t("Settlement")} value={market?.settlementMethod ?? "—"} />
        <Detail
          label={t("Implied volatility")}
          value={quote ? `${formatNumeric(Number(quote.impliedVolatility) * 100)}%` : "Unavailable"}
        />
        <Detail
          label={t("Greeks")}
          value={
            quote
              ? `Δ ${formatNumeric(quote.delta)} · Γ ${formatNumeric(quote.gamma)}`
              : "Unavailable"
          }
        />
      </div>
      <p className="muted contract-help">
        {quote
          ? `Quote as of ${formatDate(quote.asOf)} · Θ ${formatNumeric(quote.thetaPerYear)} · Vega ${formatNumeric(quote.vega)} · Rho ${formatNumeric(quote.rho)}`
          : "Fresh option quote is unavailable; no placeholder risk values are generated."}
      </p>
    </Panel>
  )
}

function formatNumeric(value: string | number): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(6) : "—"
}

function DeliveryDetails({ market }: { readonly market: Market | null }) {
  return (
    <Panel dense className="contract-details">
      <div className="panel-heading">
        <h2>{t("Delivery contract")}</h2>
        <Badge tone="info">{t("Backend fields")}</Badge>
      </div>
      <div className="contract-detail-grid">
        <Detail label={t("Contract value")} value={market?.contractValueAsset ?? "—"} />
        <Detail label={t("Expiry")} value={formatDate(market?.expiryTime)} />
        <Detail label={t("Delivery time")} value={formatDate(market?.deliveryTime)} />
        <Detail label={t("Settlement")} value={market?.settlementMethod ?? "—"} />
        <Detail label={t("Contract multiplier")} value={ppmValue(market?.contractMultiplierPpm)} />
        <Detail
          label={t("Maintenance margin")}
          value={ppmValue(market?.maintenanceMarginRatePpm)}
        />
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

function isDollarQuote(asset: string | null | undefined): boolean {
  return asset === "USD" || asset === "USDT" || asset === "USDC"
}

const dollarDisplayFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const tradeQuantityFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 })

function displayPrice(value: string, dollar: boolean): string {
  if (!value) return "—"
  const numeric = Number(value)
  return dollar && Number.isFinite(numeric) ? dollarDisplayFormatter.format(numeric) : value
}
function formatTradeQuantity(value: string): string {
  const quantity = Number(value)
  return value && Number.isFinite(quantity) && quantity >= 0
    ? tradeQuantityFormatter.format(quantity)
    : "—"
}

function formatClock(value: string): string {
  const time = Date.parse(value)
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(time)
    : "—"
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
  assetScales: Readonly<Record<string, string>>,
): string | null {
  if (!balance) return null
  const direct = numericValue(balance.free)
  if (direct !== null) return String(balance.free)
  const scale = assetScales[balance.asset]
  if (balance.availableUnits === undefined || scale === undefined) return null
  return unitsToDecimal(balance.availableUnits, scale)
}

function formatPositionQuantity(
  position: Record<string, unknown>,
  market: Market | null,
  assetScales: Readonly<Record<string, string>>,
): string {
  const signedSteps = text(position, "signedQuantitySteps")
  if (!signedSteps) return text(position, "quantity") || text(position, "quantitySteps") || "—"
  if (!market) {
    return `steps ${signedSteps}`
  }
  try {
    const negative = signedSteps.startsWith("-")
    const magnitude = negative ? signedSteps.slice(1) : signedSteps
    const spec = marketQuantitySpec(market, assetScales)
    const amount = stepUnitsToDecimal(magnitude, spec.unitSize, spec.scale)
    return `${negative ? "-" : "+"}${amount} ${market?.baseAsset ?? ""}`
  } catch {
    return `steps ${signedSteps}`
  }
}

function formatPositionEntry(
  position: Record<string, unknown>,
  market: Market | null,
  assetScales: Readonly<Record<string, string>>,
): string {
  const ticks = text(position, "entryPriceTicks")
  if (!ticks) return text(position, "entryPrice") || "—"
  const priceTickUnits = market?.priceTickUnits
  const priceScale = market === null ? undefined : assetScales[market.quoteAsset]
  if (priceTickUnits === undefined || priceScale === undefined) return `ticks ${ticks}`
  try {
    return `${stepUnitsToDecimal(ticks, priceTickUnits, priceScale)} ${market?.quoteAsset ?? ""}`
  } catch {
    return `ticks ${ticks}`
  }
}

function formatPositionPnl(
  position: Record<string, unknown>,
  market: Market | null,
  assetScales: Readonly<Record<string, string>>,
): string {
  const units = text(position, "realizedPnlUnits")
  if (!units) return text(position, "realizedPnl") || "—"
  const settleAsset = market?.settleAsset ?? market?.quoteAsset
  const scale = settleAsset === undefined ? undefined : assetScales[settleAsset]
  if (settleAsset === undefined || scale === undefined) return `units ${units}`
  try {
    return `${signedUnitsToDecimal(units, scale)} ${settleAsset}`
  } catch {
    return `units ${units}`
  }
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
  const fee = ((priceValue * quantityValue * rate) / 1_000_000).toFixed(8)
  return `${displayPrice(fee, isDollarQuote(market?.quoteAsset))} ${market?.quoteAsset ?? ""}`
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
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
function valueAt(row: Record<string, unknown> | null | undefined, key: string): unknown {
  return row === null || row === undefined ? undefined : Reflect.get(row, key)
}
function readError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : t("Trading service is unavailable. Please retry later.")
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

function formatFundingAmount(
  value: ApiFundingPayment,
  assetScales: Readonly<Record<string, string>>,
): string {
  const asset = value.asset
  const scale = asset ? assetScales[asset] : undefined
  if (!asset || !scale) return `${String(value.amountUnits)} units`
  try {
    return `${signedUnitsToDecimal(value.amountUnits, scale)} ${asset}`
  } catch {
    return `${String(value.amountUnits)} units`
  }
}

function FundingPayments({
  rows,
  error,
  assetScales,
}: {
  readonly rows: readonly ApiFundingPayment[]
  readonly error: string
  readonly assetScales: Readonly<Record<string, string>>
}) {
  return (
    <Panel dense>
      <div className="panel-heading">
        <h2>{t("Funding payment history")}</h2>
        <Badge tone="info">{t("Backend records")}</Badge>
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
                <th>{t("Symbol")}</th>
                <th>{t("Asset")}</th>
                <th>{t("Rate")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Created")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.paymentId) || String(index)}>
                  <td>{row.symbol || "—"}</td>
                  <td>{row.asset || "—"}</td>
                  <td className="mono">{fundingRate(row)}</td>
                  <td className="mono">{formatFundingAmount(row, assetScales)}</td>
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

function FundingMarketHistory({
  rows,
  settlement,
  error,
}: {
  readonly rows: readonly ApiFundingRate[]
  readonly settlement: Record<string, unknown> | null
  readonly error: string
}) {
  return (
    <Panel dense>
      <div className="panel-heading">
        <h2>{t("Funding market history")}</h2>
        <Badge tone="info">{t("Backend records")}</Badge>
      </div>
      {error ? <StateView kind="error" message={error} /> : null}
      <div className="risk-summary-grid">
        <Detail
          label={t("Latest settlement")}
          value={text(settlement, "fundingTime") || text(settlement, "eventTime") || "—"}
        />
        <Detail label={t("Settlement status")} value={text(settlement, "status") || "—"} />
        <Detail label={t("Settled payments")} value={text(settlement, "positionCount") || "—"} />
      </div>
      {rows.length === 0 ? (
        <StateView kind="empty" message="No funding rate history returned for this contract." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Funding time")}</th>
                <th>{t("Rate")}</th>
                <th>{t("Premium")}</th>
                <th>{t("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row, index) => (
                <tr key={`${row.sequence}-${index}`}>
                  <td>{row.fundingTime || "—"}</td>
                  <td className="mono">{fundingRate(row)}</td>
                  <td className="mono">{ppmText(row.premiumRatePpm)}</td>
                  <td>{row.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function ppmText(value: string | number): string {
  const ppm = Number(value)
  return Number.isFinite(ppm) ? `${(ppm / 10_000).toFixed(4)}%` : "—"
}

function readFavorites(): readonly string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKeys.favorites)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : []
  } catch {
    return []
  }
}

function orderBookSequence(book: ApiOrderBook): string | null {
  const sequence = book.sequence ?? book.lastUpdateId
  return sequence === undefined ? null : String(sequence)
}

function compareSequences(left: string, right: string): number {
  try {
    const leftValue = BigInt(left)
    const rightValue = BigInt(right)
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
  } catch {
    return left.localeCompare(right)
  }
}
