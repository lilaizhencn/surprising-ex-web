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
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ApiError } from "../../api/client"
import {
  cancelTriggerOrder,
  loadAssetScales,
  loadCandles,
  loadEffectiveTradingFee,
  loadFundingPayments,
  loadFundingRate,
  loadFundingRateHistory,
  loadFundingSettlement,
  loadMarkets,
  loadOptionQuote,
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
  FundingRateSchema,
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
import { useRealtime, useRealtimeFeed } from "../../hooks/useRealtime"
import { eventPrice } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config, storageKeys } from "../../lib/config"
import { demoMarkets } from "../../lib/demo"
import { formatPercent, formatPrice, priceDecimalsForStep } from "../../lib/format"
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
import { IndexPriceDetails } from "./IndexPriceDetails"
import { marketQuantitySpec } from "./marketQuantity"
import { linearOpeningCapacity, orderPositionSide } from "./orderCapacity"
import { TradingAccountControls, type TradingOrderSettings } from "./TradingAccountControls"
import { TradingAccountTables } from "./TradingAccountTables"
import { type LeverageSettings, TradingTicketControls } from "./TradingTicketControls"
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
    instrumentId: "BTC-USDT",
  },
  {
    key: "usd-m-perpetuals",
    line: PRODUCT_LINES.usdMPerpetual,
    title: "USD-M Perpetual",
    instrumentId: "BTC-USDT",
  },
  {
    key: "coin-m-perpetuals",
    line: PRODUCT_LINES.coinMPerpetual,
    title: "Coin-M Perpetual",
    instrumentId: "BTC-USD",
  },
  {
    key: "delivery-futures",
    line: PRODUCT_LINES.usdMDelivery,
    title: "Delivery Futures",
    instrumentId: "BTC-USDT-260925",
  },
  {
    key: "coin-m-delivery",
    line: PRODUCT_LINES.coinMDelivery,
    title: "Coin-M Delivery",
    instrumentId: "BTC-USD-260925",
  },
  {
    key: "options",
    line: PRODUCT_LINES.option,
    title: "Options Trading",
    instrumentId: "BTC-USDT-260925-59000-C",
  },
] as const

const productKeyAliases: Readonly<Record<string, string>> = {
  "usd-perpetual": "usd-m-perpetuals",
  "coin-perpetual": "coin-m-perpetuals",
}

type Level = ApiOrderBookLevel
const chartPeriodMs: Readonly<Record<string, number>> = {
  "1m": 60_000,
  "5m": 300_000,
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
  const [selected, setSelected] = useState<string>("")
  const [pairSearch, setPairSearch] = useState("")
  const [pairTab, setPairTab] = useState<"all" | "favorites">("all")
  const [pairOpen, setPairOpen] = useState(false)
  const [contractInfoOpen, setContractInfoOpen] = useState(false)
  const pairPickerRef = useRef<HTMLDivElement>(null)
  const positionPairPopover = useCallback((element: HTMLDivElement | null) => {
    const anchor = pairPickerRef.current?.getBoundingClientRect()
    if (!element || !anchor) return
    element.style.left = `${Math.max(16, Math.min(anchor.left, window.innerWidth - element.offsetWidth - 16))}px`
    element.style.top = `${anchor.bottom + 12}px`
  }, [])
  const [marketSideTab, setMarketSideTab] = useState<"book" | "trades">("book")
  const [favorites, setFavorites] = useState<readonly string[]>(readFavorites)
  const [book, setBook] = useState<ApiOrderBook | null>(null)
  const [bookDepth, setBookDepth] = useState<10 | 20 | 50>(50)
  const [ticketAction, setTicketAction] = useState<"OPEN" | "CLOSE">("OPEN")
  const [leverageSetting, setLeverageSetting] = useState<LeverageSettings | null>(null)
  const [userFees, setUserFees] = useState<Record<string, unknown> | null>(null)
  const [bookPrecision, setBookPrecision] = useState<number>(1)
  const processedEvents = useRef(new Set<string>())
  const marketGeneration = useRef(0)
  const [recentTrades, setRecentTrades] = useState<readonly Record<string, unknown>[]>([])
  const latestTradeRef = useRef<{
    instrumentId: string
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
  const [positions, setPositions] = useState<readonly Record<string, unknown>[]>([])
  const [funding, setFunding] = useState<ApiFundingRate | null>(null)
  const fundingEventVersion = useRef(0)
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
  const [price, setPrice] = useState("")
  const [triggerPrice, setTriggerPrice] = useState("")
  const [protectionMode, setProtectionMode] = useState<"SINGLE" | "OCO">("SINGLE")
  const [takeProfitTriggerPrice, setTakeProfitTriggerPrice] = useState("")
  const [takeProfitLimitPrice, setTakeProfitLimitPrice] = useState("")
  const [takeProfitExecutionType, setTakeProfitExecutionType] = useState<"LIMIT" | "MARKET">(
    "MARKET",
  )
  const [triggerType, setTriggerType] = useState<"STOP_LOSS" | "TAKE_PROFIT">("STOP_LOSS")
  const [triggerPriceSource, setTriggerPriceSource] = useState<"MARK" | "LAST" | "INDEX">("MARK")
  const [triggerExecutionType, setTriggerExecutionType] = useState<"LIMIT" | "MARKET">("MARKET")
  const [orderSettings, setOrderSettings] = useState<TradingOrderSettings>({
    marginMode: "CROSS",
    positionMode: "ONE_WAY",
    positionSide: "NET",
  })
  const [quantity, setQuantity] = useState("")
  const [percentage, setPercentage] = useState(0)
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null)
  const notify = useCallback((message: string) => {
    setNotice((previous) => (message ? { id: (previous?.id ?? 0) + 1, message } : null))
  }, [])
  const clearNotice = useCallback(() => setNotice(null), [])
  const selectBookPrice = useCallback(
    (value: string) => {
      if (!isPositiveDecimal(value)) return
      if (orderType === "STOP") {
        setTriggerPrice(value)
        return
      }
      setBboEnabled(false)
      setOrderType("LIMIT")
      setPrice(value)
    },
    [orderType],
  )
  const demo = config.demoDataEnabled && !marketsRequestFinished
  const availableMarkets = markets.length > 0 ? markets : demo ? demoMarkets : []
  useEffect(() => {
    if (!pairOpen && !contractInfoOpen) return
    const closePopovers = () => {
      setPairOpen(false)
      setContractInfoOpen(false)
    }
    const closeOutside = (event: PointerEvent) => {
      if (!pairPickerRef.current?.contains(event.target as Node)) closePopovers()
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopovers()
    }
    window.addEventListener("resize", closePopovers)
    document.addEventListener("pointerdown", closeOutside)
    document.addEventListener("keydown", closeEscape)
    return () => {
      window.removeEventListener("resize", closePopovers)
      document.removeEventListener("pointerdown", closeOutside)
      document.removeEventListener("keydown", closeEscape)
    }
  }, [pairOpen, contractInfoOpen])
  const current = useMemo(() => {
    return (
      availableMarkets.find((market) => market.instrumentId === selected) ??
      availableMarkets[0] ??
      null
    )
  }, [availableMarkets, selected])
  const lastTradePrice = current
    ? marketPriceFromRecord(recentTrades[0] ?? {}, current, assetScales)
    : null
  const tabSymbol = current?.symbol ?? "—"
  const tabPrice = current ? (marketQuotes[current.instrumentId] ?? current.price) : null
  const tabTitle = `${formatPrice(tabPrice, priceDisplayPrecision(current, assetScales))} ${tabSymbol} · ${t(view.title)} | Surprising EX`
  useEffect(() => {
    const defaultTitle = document.title
    return () => {
      document.title = defaultTitle
    }
  }, [])
  useEffect(() => {
    if (document.title !== tabTitle) document.title = tabTitle
  }, [tabTitle])
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
  useEffect(() => {
    let cancelled = false
    setUserFees(null)
    if (session?.user.userId && current?.instrumentId)
      void loadEffectiveTradingFee(session.user.userId, current.instrumentId, view.line)
        .then((value) => {
          if (!cancelled) setUserFees(value)
        })
        .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session?.user.userId, current?.instrumentId, view.line])
  const handleLeverageChange = useCallback((setting: LeverageSettings | null) => {
    setLeverageSetting(setting)
    if (setting) setOrderSettings((previous) => ({ ...previous, marginMode: setting.marginMode }))
  }, [])
  const openingCapacity = (direction: OrderSide) => {
    if (!current || !leverageSetting || !userFees) return ""
    const level = direction === "BUY" ? book?.asks?.[0] : book?.bids?.[0]
    return (
      linearOpeningCapacity({
        market: current,
        scales: assetScales,
        availableUnits: balance?.availableUnits,
        referencePrice:
          orderType === "LIMIT" && !useBbo ? price : level ? String(levelPrice(level)) : "",
        marginRatePpm: leverageSetting.initialMarginRatePpm,
        feeRatePpm: numberValue(userFees, "takerFeeRatePpm") ?? undefined,
        positions,
        orders: openOrders,
        side: direction,
      }) ?? ""
    )
  }
  const triggerSupported = view.line !== PRODUCT_LINES.spot
  const activeTriggerPosition = useMemo(
    () =>
      selectTriggerPosition(
        positions,
        current?.instrumentId,
        orderSettings.marginMode,
        orderSettings.positionMode,
        orderSettings.positionSide,
      ),
    [current?.instrumentId, orderSettings, positions],
  )
  const triggerCloseSide = activeTriggerPosition
    ? closeSideForPosition(activeTriggerPosition)
    : null
  useEffect(() => {
    if (orderType !== "STOP") return
    setTicketAction("CLOSE")
    if (triggerCloseSide) setSide(triggerCloseSide)
  }, [orderType, triggerCloseSide])
  const realtime = useRealtime(session, current?.instrumentId ?? "", view.line, period)
  const pairFeed = useRealtimeFeed(
    null,
    markets.map((market) => ({
      channel: "trades",
      instrumentId: market.instrumentId,
      productLine: view.line,
    })),
    1000,
    false,
  )
  const displayedDayStats = useMemo(() => {
    if (!current) return null
    const close = marketQuotes[current.instrumentId] ?? current.price
    const initialClose = current.price
    const change = current.change24h
    const open =
      initialClose !== null && change !== null && change > -100
        ? initialClose / (1 + change / 100)
        : null
    return {
      open,
      close,
      high: close === null ? current.high24h : Math.max(current.high24h ?? close, close),
      low: close === null ? current.low24h : Math.min(current.low24h ?? close, close),
      volume: current.volume24h,
      quoteVolume: current.quoteVolume24h,
      change: open && close ? ((close - open) / open) * 100 : change,
    }
  }, [current, marketQuotes])
  const openInterestQuantity = useMemo(() => {
    if (!current || realtime.state !== "live") return ""
    const event = realtime.events.find(
      (row) =>
        row.channel === "openInterest" &&
        row.instrumentId === current.instrumentId &&
        row.productLine === view.line,
    )
    const data = event?.data as Record<string, unknown> | undefined
    const receivedAt = Date.parse(event?.eventTime ?? "")
    if (
      data?.["status"] !== "READY" ||
      !Number.isFinite(receivedAt) ||
      Date.now() - receivedAt > 5000
    )
      return ""
    try {
      const spec = marketQuantitySpec(current, assetScales)
      return stepUnitsToDecimal(String(data["openInterestSteps"]), spec.unitSize, spec.scale)
    } catch {
      return ""
    }
  }, [current, view.line, realtime.events, realtime.state, assetScales])

  useEffect(() => {
    setBalances([])
    setPositions([])
    setOpenOrders([])
    setTriggerOrders([])
  }, [session?.user.userId, view.line])

  useEffect(() => {
    const account = realtime.views[view.line]
    if (account?.ready())
      setOrderSettings((previous) => ({
        ...previous,
        positionMode: account.positionMode === "HEDGE" ? "HEDGE" : "ONE_WAY",
        positionSide:
          account.positionMode === "HEDGE"
            ? previous.positionSide === "NET"
              ? "LONG"
              : previous.positionSide
            : "NET",
      }))
    if (!session || !account?.ready()) return
    const parsedBalances = account.rows("balance").map((row) => BalanceSchema.safeParse(row))
    const parsedOrders = account
      .rows("order")
      .filter((row) => row["status"] === "OPEN")
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
          row["instrumentId"] === current?.instrumentId,
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
  }, [current?.instrumentId, realtime.views, realtime.revision, session, view.line])

  const updateMarketQuote = useCallback((instrumentId: string, price: number | null) => {
    if (price === null || !Number.isFinite(price) || price <= 0) return
    setMarketQuotes((previous) =>
      previous[instrumentId] === price ? previous : { ...previous, [instrumentId]: price },
    )
  }, [])
  const handleSettingsChange = useCallback((settings: TradingOrderSettings) => {
    setOrderSettings(settings)
  }, [])
  const toggleFavorite = useCallback(
    (instrumentId: string) => {
      const favoriteKey = `${view.line}:${instrumentId}`
      setFavorites((currentFavorites) =>
        currentFavorites.includes(favoriteKey)
          ? currentFavorites.filter((value) => value !== favoriteKey)
          : [...currentFavorites, favoriteKey],
      )
    },
    [view.line],
  )
  const selectPair = useCallback((instrumentId: string) => {
    setSelected(instrumentId)
    setPairOpen(false)
    const url = new URL(window.location.href)
    url.searchParams.set("instrumentId", instrumentId)
    window.history.replaceState(null, "", url)
  }, [])

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
    const referencePrice = Number(price || marketQuotes[current.instrumentId] || current.price)
    const factor = next / 100
    const quantityValue =
      side === "SELL" ? availableNumber * factor : (availableNumber / referencePrice) * factor
    setQuantity(Number.isFinite(quantityValue) && quantityValue > 0 ? String(quantityValue) : "")
  }

  useEffect(() => {
    setBook(null)
    processedEvents.current.clear()
  }, [current?.instrumentId, view.line])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeys.favorites, JSON.stringify(favorites))
    } catch {}
  }, [favorites])

  useEffect(() => {
    const controller = new AbortController()
    setMarketsRequestFinished(false)
    setError(null)
    setMarkets([])
    setSelected("")
    void loadMarkets(view.line, controller.signal, true)
      .then((rows) => {
        if (controller.signal.aborted) return
        const productMarkets = rows
          .map(mapMarket)
          .filter((market) => market.productLine === view.line)
        const requested = new URLSearchParams(window.location.search).get("instrumentId")
        setSelected(
          productMarkets.find((market) => market.instrumentId === requested)?.instrumentId ??
            productMarkets[0]?.instrumentId ??
            "",
        )
        setMarkets(productMarkets)
        setMarketsRequestFinished(true)
        if (rows.length > 0 && productMarkets.length === 0) {
          setError(`${t("No tradable contracts returned for")} ${t(view.title)}.`)
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setMarketsRequestFinished(true)
        setError(readError(reason))
      })
    return () => {
      controller.abort()
    }
  }, [view.line])
  useEffect(() => {
    if (!current || price) return
    const quote = marketQuotes[current.instrumentId] ?? current.price
    const quoteScale = Number(assetScales[current.quoteAsset])
    const priceTick = Number(current.priceTickUnits)
    if (!quote || !Number.isFinite(quoteScale) || quoteScale <= 0 || !priceTick) return
    const step = priceTick / quoteScale
    const ticks = Math.round(quote / step)
    if (!Number.isSafeInteger(ticks) || ticks <= 0) return
    setPrice(
      stepUnitsToDecimal(
        String(ticks),
        current.priceTickUnits ?? "",
        assetScales[current.quoteAsset] ?? "",
      ),
    )
  }, [assetScales, current, marketQuotes, price])
  useEffect(() => {
    if (!current) return
    setPrice("")
    setCandles([])
    setOptionQuote(null)
    setTriggerOrders([])
    const generation = ++marketGeneration.current
    const loadHistory = () => {
      void loadCandles(current.instrumentId, period, view.line)
        .then((rows) => {
          if (generation !== marketGeneration.current) return
          const history = rows.map(mapCandle)
          const latestCandle = history.at(-1)
          if (latestCandle && latestTradeRef.current?.instrumentId !== current.instrumentId)
            updateMarketQuote(current.instrumentId, latestCandle.close)
          setCandles((live) => {
            const byTime = new Map(history.map((candle) => [candle.time, candle]))
            for (const candle of live) byTime.set(candle.time, candle)
            return [...byTime.values()]
              .sort((left, right) => left.time.localeCompare(right.time))
              .slice(-120)
          })
        })
        .catch(() => {
          if (generation === marketGeneration.current)
            setError(t("Candlestick history unavailable"))
        })
    }
    loadHistory()
    if (view.line === PRODUCT_LINES.option)
      void loadOptionQuote(current.instrumentId)
        .then((quote) => {
          if (generation === marketGeneration.current) setOptionQuote(quote)
        })
        .catch(() => {})
    return () => {
      marketGeneration.current++
    }
  }, [current?.instrumentId, period, updateMarketQuote, view.line])

  useEffect(() => {
    let cancelled = false
    void loadAssetScales()
      .then((scales) => {
        if (!cancelled) setAssetScales(scales)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(readError(reason))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setRecentTrades([])
    latestTradeRef.current = null
    if (!current?.instrumentId || !assetScales[current.quoteAsset]) return
    let cancelled = false
    void loadRecentTrades(current.instrumentId, view.line)
      .then((history) => {
        if (cancelled) return
        if (latestTradeRef.current?.instrumentId !== current.instrumentId) {
          updateMarketQuote(
            current.instrumentId,
            marketPriceFromRecord(history[0] ?? {}, current, assetScales),
          )
        }
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
  }, [current?.instrumentId, assetScales, updateMarketQuote, view.line])

  useEffect(() => {
    if (!current || view.line === PRODUCT_LINES.spot || view.line === PRODUCT_LINES.option) {
      setFunding(null)
      return
    }
    let cancelled = false
    const fundingVersion = fundingEventVersion.current
    setFunding(null)
    void loadFundingRate(current.instrumentId, view.line)
      .then((value) => {
        if (!cancelled && fundingEventVersion.current === fundingVersion) setFunding(value)
      })
      .catch(() => {
        if (!cancelled && fundingEventVersion.current === fundingVersion) setFunding(null)
      })
    return () => {
      cancelled = true
    }
  }, [current?.instrumentId, view.line])

  useEffect(() => {
    setFundingHistory([])
    setFundingSettlement(null)
    setFundingMarketError("")
    if (
      !current ||
      accountTab !== "fundingMarket" ||
      view.line === PRODUCT_LINES.spot ||
      view.line === PRODUCT_LINES.option
    )
      return
    let cancelled = false
    void loadFundingRateHistory(current.instrumentId, view.line)
      .then((history) => {
        if (cancelled) return
        setFundingHistory(history)
        if (history.length === 0) {
          setFundingSettlement(null)
          return
        }
        void loadFundingSettlement(current.instrumentId, view.line)
          .then((settlement) => {
            if (!cancelled) setFundingSettlement(settlement)
          })
          .catch((reason: unknown) => {
            if (cancelled) return
            setFundingSettlement(null)
            if (!(reason instanceof ApiError && reason.status === 404))
              setFundingMarketError(readError(reason))
          })
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setFundingHistory([])
        setFundingSettlement(null)
        setFundingMarketError(readError(reason))
      })
    return () => {
      cancelled = true
    }
  }, [accountTab, current?.instrumentId, view.line])

  useEffect(() => {
    setFundingPayments([])
    setFundingPaymentsError("")
    if (
      !current ||
      !session ||
      accountTab !== "fundingPayments" ||
      view.line === PRODUCT_LINES.spot ||
      view.line === PRODUCT_LINES.option
    )
      return
    let cancelled = false
    void loadFundingPayments(session.user.userId, current.instrumentId, view.line)
      .then((rows) => {
        if (!cancelled) setFundingPayments(rows)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setFundingPayments([])
        setFundingPaymentsError(readError(reason))
      })
    return () => {
      cancelled = true
    }
  }, [accountTab, current?.instrumentId, session?.user.userId, view.line])

  useEffect(() => {
    if (!current) return
    setMarkPrice(null)
    setIndexPrice(null)
  }, [current?.instrumentId])

  useEffect(() => {
    if (!current || !assetScales[current.quoteAsset]) return
    const applyEvent = (event: WsEnvelope) => {
      const channel = text(event, "channel")
      const data = record(valueAt(event, "data"))
      if (
        event.op !== "event" ||
        event.productLine !== view.line ||
        !event.id ||
        processedEvents.current.has(event.id)
      )
        return
      processedEvents.current.add(event.id)
      const eventSymbol = text(event, "instrumentId")
      if (!data) return
      if (eventSymbol && eventSymbol !== current.instrumentId) {
        if (channel === "trades") {
          const market = markets.find((candidate) => candidate.instrumentId === eventSymbol)
          if (market)
            updateMarketQuote(eventSymbol, marketPriceFromRecord(data, market, assetScales))
        }
        return
      }
      if (channel === "candles") {
        const candle = CandleSchema.safeParse(data)
        if (!candle.success) return
        const candlePeriod = text(data, "period") || text(event, "period")
        if (candlePeriod && candlePeriod !== period) return
        const next = mapCandle(candle.data)
        const liveTrade = latestTradeRef.current
        const candleSequence = numberValue(candle.data, "lastSequence")
        const olderThanLiveTrade =
          liveTrade?.instrumentId === current.instrumentId &&
          liveTrade.bucket === next.time &&
          candleSequence !== null &&
          candleSequence < liveTrade.sequence
        if (!olderThanLiveTrade && (!liveTrade || next.time >= liveTrade.bucket))
          updateMarketQuote(current.instrumentId, next.close)
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
          setBook(normalizeOrderBook(orderBook.data, current, assetScales))
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
        updateMarketQuote(
          current.instrumentId,
          marketPriceFromRecord(nextTrade, current, assetScales),
        )
        const tradePrice = numberValue(nextTrade, "price")
        const tradeQuantity = numberValue(nextTrade, "quantity")
        const tradeTime = Date.parse(event.eventTime ?? "")
        if (tradePrice !== null && tradePrice > 0 && Number.isFinite(tradeTime)) {
          const tradeSequence = numberValue(data, "sequence") ?? numberValue(data, "coreSequence")
          if (tradeSequence !== null) {
            latestTradeRef.current = {
              instrumentId: current.instrumentId,
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
        }
        return
      }
      if (channel === "funding") {
        const rate = FundingRateSchema.safeParse(data)
        if (rate.success) {
          fundingEventVersion.current++
          setFunding(rate.data)
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
    // Retain only IDs still present in the bounded feed, not the session history.
    processedEvents.current = new Set(
      realtime.events.flatMap((event) => (event.id ? [event.id] : [])),
    )
  }, [assetScales, current, markets, period, realtime.events, updateMarketQuote, view.line])

  const submit = async (requestedSide: OrderSide = side) => {
    const side = requestedSide
    if (!session) {
      setSubmitState("error")
      notify(t("Please sign in before placing an order."))
      return
    }
    if (!current || !isPositiveDecimal(quantity)) {
      setSubmitState("error")
      notify(t("Please enter a valid quantity."))
      return
    }
    if (orderType === "STOP" && !triggerSupported) {
      setSubmitState("error")
      notify(t("Spot positions do not support TP/SL. Use a limit or market order."))
      return
    }
    if (orderType === "STOP" && !triggerCloseSide) {
      setSubmitState("error")
      notify(t("Open a position in this pair before setting TP/SL."))
      return
    }
    if (orderType === "STOP" && triggerCloseSide !== side) {
      setSubmitState("error")
      notify(
        triggerCloseSide === "SELL"
          ? t("Select Sell to close your long position before setting TP/SL.")
          : t("Select Buy to close your short position before setting TP/SL."),
      )
      return
    }
    const executionType = orderType === "STOP" ? triggerExecutionType : orderType
    if (executionType !== "MARKET" && !useBbo && !isPositiveDecimal(price)) {
      setSubmitState("error")
      notify(t("Limit orders require a valid price."))
      return
    }
    if (orderType === "STOP" && !isPositiveDecimal(triggerPrice)) {
      setSubmitState("error")
      notify(t("Trigger orders require a valid trigger price."))
      return
    }
    if (view.line !== PRODUCT_LINES.spot && orderType !== "STOP" && !leverageSetting) {
      setSubmitState("error")
      notify(t("Wait for account leverage settings before submitting."))
      return
    }
    let quantitySteps: string
    let priceTicks: string | 0
    try {
      const baseScale = assetScales[current.baseAsset]
      const quoteScale = assetScales[current.quoteAsset]
      if (
        (view.line === PRODUCT_LINES.spot && !baseScale) ||
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
      if (view.line !== PRODUCT_LINES.spot && orderType !== "STOP" && ticketAction === "CLOSE") {
        const position = selectTriggerPosition(
          positions,
          current.instrumentId,
          orderSettings.marginMode,
          orderSettings.positionMode,
          orderPositionSide(orderSettings.positionMode, "CLOSE", side),
        )
        if (
          !position ||
          closeSideForPosition(position) !== side ||
          BigInt(quantitySteps) >
            (signedPositionSteps(position) < 0n
              ? -signedPositionSteps(position)
              : signedPositionSteps(position))
        )
          throw new Error(t("Close quantity exceeds the selected position."))
      }

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
          executionType === "MARKET" ? (marketQuotes[current.instrumentId] ?? current.price) : price
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
      notify(reason instanceof Error ? reason.message : t("Invalid quantity precision."))
      return
    }
    setSubmitState("loading")
    try {
      if (orderType === "STOP") {
        const requestId = crypto.randomUUID()
        const leg = {
          userId: session.user.userId,
          clientTriggerOrderId: `web-trigger-${requestId}`,
          instrumentId: current.instrumentId,
          side,
          triggerType,
          priceSource: triggerPriceSource,
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
          notify(t("Take-profit and stop-loss accepted together."))
        } else {
          const response = await placeTriggerOrder(leg, view.line)
          if (response.status !== "PENDING" && response.status !== "TRIGGERING") {
            setSubmitState("error")
            notify(
              response.rejectReason ?? `${t("Trigger order not accepted")}: ${response.status}`,
            )
            return
          }
          notify(`${t("Trigger order accepted")}: ${response.status}`)
        }
      } else {
        const response = await placeOrder(
          {
            userId: session.user.userId,
            clientOrderId: `web-${crypto.randomUUID()}`,
            instrumentId: current.instrumentId,
            side,
            orderType,
            ...(useBbo ? { bboPriceMode } : {}),
            timeInForce: orderType === "MARKET" ? "IOC" : "GTC",
            priceTicks,
            quantitySteps,
            marginMode: orderSettings.marginMode,
            positionSide:
              view.line === PRODUCT_LINES.spot
                ? "NET"
                : orderPositionSide(orderSettings.positionMode, ticketAction, side),
            reduceOnly: view.line !== PRODUCT_LINES.spot && ticketAction === "CLOSE",
            postOnly: false,
          },
          view.line,
        )
        if (response.status === "REJECTED") {
          setSubmitState("error")
          notify(response.rejectReason ?? t("Order rejected."))
          return
        }
        if (
          response.status !== "PENDING_RESERVE" &&
          response.status !== "ACCEPTED" &&
          response.status !== "PARTIALLY_FILLED" &&
          response.status !== "FILLED"
        ) {
          setSubmitState("error")
          notify(`${t("Order not accepted")}: ${response.status}`)
          return
        }
        notify(`${t("Order accepted")}: ${response.status}`)
      }
      setSubmitState("success")
      setQuantity("")
      setTriggerPrice("")
      setTakeProfitTriggerPrice("")
      setTakeProfitLimitPrice("")
      refresh()
    } catch (reason: unknown) {
      setSubmitState("error")
      notify(orderType === "STOP" ? triggerSubmitError(reason) : readError(reason))
    }
  }
  const refresh = () => {
    realtime.refresh()
  }

  return (
    <div className="trade-page">
      {notice && (
        <TradeToast
          key={notice.id}
          message={notice.message}
          error={submitState === "error"}
          onClose={clearNotice}
        />
      )}
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
                  <span>{current?.symbol ?? "—"}</span>
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
                  ref={positionPairPopover}
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
                <div className="trade-pair-popover" ref={positionPairPopover}>
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
                  <PairMarketList
                    markets={markets}
                    productLine={view.line}
                    events={pairFeed.events}
                    quotes={marketQuotes}
                    selectedSymbol={current?.instrumentId}
                    search={pairSearch}
                    favoritesOnly={pairTab === "favorites"}
                    favorites={favorites}
                    assetScales={assetScales}
                    onSelect={selectPair}
                    onFavorite={toggleFavorite}
                  />
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
                  (current ? marketQuotes[current.instrumentId] : null) ??
                  current?.price ??
                  null
                }
                dollar={isDollarQuote(current?.quoteAsset)}
                pricePrecision={priceDisplayPrecision(current, assetScales)}
              />
            </strong>
          </div>
          <div>
            <small>{t("24h Change")}</small>
            <strong
              className={(displayedDayStats?.change ?? 0) >= 0 ? "positive mono" : "negative mono"}
            >
              {formatPercent(displayedDayStats?.change ?? null)}
            </strong>
          </div>
          <div>
            <small>{t("24h Open")}</small>
            <strong className="mono">
              <Price
                value={displayedDayStats?.open ?? null}
                dollar={isDollarQuote(current?.quoteAsset)}
                pricePrecision={priceDisplayPrecision(current, assetScales)}
              />
            </strong>
          </div>
          <div>
            <small>{t("24h High")}</small>
            <strong className="mono">
              <Price
                value={displayedDayStats?.high ?? null}
                dollar={isDollarQuote(current?.quoteAsset)}
                pricePrecision={priceDisplayPrecision(current, assetScales)}
              />
            </strong>
          </div>
          <div>
            <small>{t("24h Low")}</small>
            <strong className="mono">
              <Price
                value={displayedDayStats?.low ?? null}
                dollar={isDollarQuote(current?.quoteAsset)}
                pricePrecision={priceDisplayPrecision(current, assetScales)}
              />
            </strong>
          </div>
          <div>
            <small>{t("24h Close")}</small>
            <strong className="mono">
              <Price
                value={displayedDayStats?.close ?? null}
                dollar={isDollarQuote(current?.quoteAsset)}
                pricePrecision={priceDisplayPrecision(current, assetScales)}
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
                    pricePrecision={priceDisplayPrecision(current, assetScales)}
                  />
                </strong>
              </div>
              <div>
                <div className="index-price-label">
                  <small>{t("Index price")}</small>
                  <IndexPriceDetails
                    index={indexPrice}
                    precision={priceDisplayPrecision(current, assetScales)}
                  />
                </div>
                <strong className="mono">
                  <Price
                    value={numberValue(indexPrice, "indexPrice")}
                    dollar={isDollarQuote(current?.quoteAsset)}
                    pricePrecision={priceDisplayPrecision(current, assetScales)}
                  />
                </strong>
              </div>
              <div>
                <small>
                  {t("24h Volume")} ({current?.baseAsset})
                </small>
                <strong className="mono" title={String(displayedDayStats?.volume ?? "")}>
                  {formatTradeQuantity(displayedDayStats ? String(displayedDayStats.volume) : "")}
                </strong>
              </div>
              <div>
                <small>
                  {t("24h Turnover")} ({current?.quoteAsset})
                </small>
                <strong className="mono" title={String(displayedDayStats?.quoteVolume ?? "")}>
                  {formatTradeQuantity(
                    displayedDayStats?.quoteVolume == null
                      ? ""
                      : displayedDayStats.quoteVolume.toFixed(2),
                  )}
                </strong>
              </div>
              <div>
                <small>
                  {t("Open interest")} ({t("Contracts")})
                </small>
                <strong className="mono" title={openInterestQuantity}>
                  {formatTradeQuantity(openInterestQuantity)}
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
            {["1m", "5m", "15m", "1h", "4h", "1d"].map((value) => (
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
            key={`${view.line}:${current?.instrumentId ?? ""}`}
            candles={candles}
            period={period}
            priceStep={
              Number(current?.priceTickUnits ?? 0) /
              Number(assetScales[current?.quoteAsset ?? ""] ?? 1)
            }
            pricePrecision={priceDisplayPrecision(current, assetScales)}
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
                  {t("TP & SL")}{" "}
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
                  marginMode={orderSettings.marginMode}
                  userId={session?.user.userId}
                  instrumentId={current?.instrumentId ?? ""}
                  symbol={current?.symbol ?? ""}
                  productLine={view.line}
                  positions={positions}
                  settleAsset={current?.settleAsset ?? current?.quoteAsset ?? "USDT"}
                  assetScale={
                    current ? assetScales[current.settleAsset ?? current.quoteAsset] : undefined
                  }
                  priceTickUnits={current?.priceTickUnits}
                  priceScale={current ? assetScales[current.quoteAsset] : undefined}
                  quantityStepUnits={
                    current?.productLine === PRODUCT_LINES.spot ? current.quantityStepUnits : "1"
                  }
                  quantityScale={
                    current?.productLine === PRODUCT_LINES.spot && current
                      ? assetScales[current.baseAsset]
                      : "1"
                  }
                  accountView={realtime.views[view.line]}
                  onRefresh={realtime.refresh}
                  onSettingsChange={handleSettingsChange}
                />
              ) : null}
              {accountTab === "positions" ? (
                <Panel dense className="trade-orders-panel">
                  <TradingAccountTables
                    market={current}
                    markets={markets}
                    productLine={view.line}
                    assetScales={assetScales}
                    positions={positions}
                    orders={openOrders}
                    triggers={triggerOrders}
                    account={realtime.views[view.line]}
                    leverageSetting={leverageSetting}
                    events={realtime.events}
                    loggedIn={!!session}
                    userId={session?.user.userId}
                    onNotice={(message, failed) => {
                      setSubmitState(failed ? "error" : "success")
                      notify(message)
                    }}
                  />
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
                      notify(value)
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
                      symbol={current?.symbol ?? "—"}
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
              pricePrecision={priceDisplayPrecision(current, assetScales)}
              baseAsset={
                view.line === PRODUCT_LINES.spot ? (current?.baseAsset ?? "—") : t("Contracts")
              }
              quoteAsset={current?.quoteAsset ?? "—"}
              onPriceSelect={selectBookPrice}
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
                  {view.line === PRODUCT_LINES.spot ? (current?.baseAsset ?? "—") : t("Contracts")})
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
                        {displayPrice(
                          text(trade, "price"),
                          isDollarQuote(current?.quoteAsset),
                          priceDisplayPrecision(current, assetScales),
                        )}
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
            {(view.line === PRODUCT_LINES.spot
              ? (["BUY", "SELL"] as const)
              : (["OPEN", "CLOSE"] as const)
            ).map((action) => (
              <button
                type="button"
                key={action}
                className={
                  (action === "BUY" || action === "OPEN" ? "buy" : "sell") +
                  (action === side || action === ticketAction ? " active" : "")
                }
                onClick={() => {
                  if (action === "BUY" || action === "SELL") setSide(action)
                  else {
                    if (action === "OPEN" && orderType === "STOP") setOrderType("LIMIT")
                    setTicketAction(action)
                  }
                }}
              >
                {t(
                  action === "BUY"
                    ? "Buy"
                    : action === "SELL"
                      ? "Sell"
                      : action === "OPEN"
                        ? "Open position"
                        : "Close position",
                )}
              </button>
            ))}
          </div>
          {view.line !== PRODUCT_LINES.spot && current && (
            <TradingTicketControls
              key={`${view.line}:${current.instrumentId}:${session?.user.userId ?? "guest"}`}
              userId={session?.user.userId}
              instrumentId={current.instrumentId}
              productLine={view.line}
              marginMode={orderSettings.marginMode}
              onChange={handleLeverageChange}
            />
          )}
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
                <span>{t("Trigger source")}</span>
                <DropdownSelect
                  aria-label={t("Trigger source")}
                  value={triggerPriceSource}
                  onChange={(event) =>
                    setTriggerPriceSource(event.target.value as "MARK" | "LAST" | "INDEX")
                  }
                >
                  <option value="MARK">{t("Mark price")}</option>
                  <option value="LAST">{t("Last traded price")}</option>
                  <option value="INDEX" disabled={view.line === PRODUCT_LINES.spot}>
                    {t("Index price")}
                  </option>
                </DropdownSelect>
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
              <span>
                {view.line === PRODUCT_LINES.spot
                  ? (current?.baseAsset ?? t("Asset"))
                  : t("Contracts")}
              </span>
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
            <span className="mono">
              {estimatedFee(current, price, quantity, numberValue(userFees, "takerFeeRatePpm"))}
            </span>
            {view.line !== PRODUCT_LINES.spot && (
              <>
                <span
                  title={t(
                    "Estimate based on available margin, leverage, fees and position limits; final admission is checked by the matching service.",
                  )}
                >
                  {t("Est. max long")}
                </span>
                <span className="mono">
                  {formatTradeQuantity(openingCapacity("BUY"))} {t("Contracts")}
                </span>
                <span>{t("Est. max short")}</span>
                <span className="mono">
                  {formatTradeQuantity(openingCapacity("SELL"))} {t("Contracts")}
                </span>
              </>
            )}
            <span>{t("Maker / Taker fee")}</span>
            <span className="mono">
              {userFees
                ? `${Number(((numberValue(userFees, "makerFeeRatePpm") ?? 0) / 10000).toFixed(4))}% / ${Number(((numberValue(userFees, "takerFeeRatePpm") ?? 0) / 10000).toFixed(4))}%`
                : "—"}
            </span>
          </div>
          {!session ? (
            <a className="ticket-sign-in" href="/auth/login">
              {t("Log in to trade")}
            </a>
          ) : view.line !== PRODUCT_LINES.spot && orderType !== "STOP" ? (
            <div className="ticket-order-actions">
              <Button
                tone="positive"
                loading={submitState === "loading"}
                onClick={() => void submit("BUY")}
              >
                {session
                  ? t(ticketAction === "OPEN" ? "Open long" : "Close short")
                  : t("Log in to trade")}
              </Button>
              <Button
                tone="negative"
                loading={submitState === "loading"}
                onClick={() => void submit("SELL")}
              >
                {session
                  ? t(ticketAction === "OPEN" ? "Open short" : "Close long")
                  : t("Log in to trade")}
              </Button>
            </div>
          ) : (
            <Button
              tone={side === "BUY" ? "positive" : "negative"}
              loading={submitState === "loading"}
              onClick={() => void submit(orderType === "STOP" ? (triggerCloseSide ?? side) : side)}
            >
              {session && orderType === "STOP"
                ? `${protectionMode === "OCO" ? t("Set TP/SL pair") : triggerType === "STOP_LOSS" ? t("Set stop loss") : t("Set take profit")}（${side === "SELL" ? t("Sell to close") : t("Buy to close")}）`
                : session
                  ? `${side === "BUY" ? t("Buy") : t("Sell")} ${view.line === PRODUCT_LINES.spot ? (current?.baseAsset ?? t("Asset")) : t("Contracts")}`
                  : t("Log in to trade")}
            </Button>
          )}
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
  pricePrecision = priceDecimalsForStep(priceStep),
  baseAsset,
  quoteAsset,
  dollar,
  onDepthChange,
  onPrecisionChange,
  onPriceSelect,
}: {
  readonly book: ApiOrderBook | null
  readonly latestTrade: Readonly<Record<string, unknown>> | null
  readonly depth: 10 | 20 | 50
  readonly precision: number
  readonly priceStep: number
  readonly pricePrecision?: number
  readonly baseAsset: string
  readonly quoteAsset: string
  readonly dollar: boolean
  readonly onPriceSelect?: (price: string) => void
  readonly onDepthChange: (depth: 10 | 20 | 50) => void
  readonly onPrecisionChange: (precision: number) => void
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
  // Keep the bar scale stable while deltas update individual price levels.
  const scaleRef = useRef({ key: "", value: 0 })
  const scaleKey = `${baseAsset}/${quoteAsset}/${depth}/${precision}`
  if (scaleRef.current.key !== scaleKey) scaleRef.current = { key: scaleKey, value: 0 }
  const observedMaximum = Math.max(
    0,
    ...[...bids, ...asks].map(({ level }) => {
      const amount = Number(Array.isArray(level) ? level[1] : level.quantitySteps)
      return Number.isFinite(amount) ? amount : 0
    }),
  )
  if (scaleRef.current.value === 0 && observedMaximum > 0) scaleRef.current.value = observedMaximum
  const maxQuantity = scaleRef.current.value
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
          {t("Price step")}{" "}
          <DropdownSelect
            aria-label={t("Order book price precision")}
            value={precision}
            onChange={(event) => onPrecisionChange(Number(event.target.value))}
          >
            {([1, 10, 100, 500, 1000, 10000, 100000] as const).map((multiple) => (
              <option key={multiple} value={multiple}>
                {priceStep > 0
                  ? formatPrice(priceStep * multiple, priceDecimalsForStep(priceStep * multiple))
                  : "—"}
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
                  pricePrecision={pricePrecision}
                  onPriceSelect={onPriceSelect}
                />
              ))}
            </div>
          </div>
        </section>
        <div className="order-book-last-trade" aria-live="polite">
          <span>{t("Last trade")}</span>
          <button
            type="button"
            className={`book-price-button ${text(latestTrade, "side") === "SELL" ? "negative" : "positive"} mono`}
            disabled={!isPositiveDecimal(text(latestTrade, "price"))}
            onClick={() => onPriceSelect?.(text(latestTrade, "price"))}
            aria-label={t("Use last trade price")}
          >
            {displayPrice(text(latestTrade, "price"), dollar, pricePrecision)}
          </button>
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
                  pricePrecision={pricePrecision}
                  onPriceSelect={onPriceSelect}
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
    const key = String(Number((bucket * priceStep).toFixed(priceDecimalsForStep(priceStep))))
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

function LevelRow({
  level,
  total,
  maxQuantity,
  tone,
  dollar,
  pricePrecision,
  onPriceSelect,
}: {
  readonly level: Level
  readonly total: string
  readonly maxQuantity: number
  readonly tone: "positive" | "negative"
  readonly onPriceSelect?: ((price: string) => void) | undefined
  readonly pricePrecision: number
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
      <button
        type="button"
        className={`book-price-button ${tone} mono`}
        onClick={() => onPriceSelect?.(price)}
        aria-label={`${t("Use price")} ${price}`}
      >
        {displayPrice(price, dollar, pricePrecision)}
      </button>
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
  const title = t("TP & SL")
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
        <small className="table-subline">
          {t(
            row.priceSource === "LAST"
              ? "Last traded price"
              : row.priceSource === "INDEX"
                ? "Index price"
                : "Mark price",
          )}
        </small>
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
    return `${stepUnitsToDecimal(row.quantitySteps, spec.unitSize, spec.scale)} ${market.productLine === PRODUCT_LINES.spot ? market.baseAsset : t("Contracts")}`
  } catch {
    return `steps ${String(row.quantitySteps)}`
  }
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
          value={market?.underlyingInstrumentId ?? market?.baseAsset ?? "—"}
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

const tradeQuantityFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 })

function displayPrice(value: string, dollar: boolean, precision?: number): string {
  if (!value) return "—"
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? formatPrice(numeric, precision ?? (dollar && numeric >= 1 ? 2 : undefined))
    : "—"
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

function estimatedFee(
  market: Market | null,
  price: string,
  quantity: string,
  rate: number | null,
): string {
  const priceValue = Number(price)
  const quantityValue = Number(quantity)
  if (
    rate === null ||
    !Number.isFinite(priceValue) ||
    !Number.isFinite(quantityValue) ||
    priceValue <= 0 ||
    quantityValue <= 0
  ) {
    return "—"
  }
  const contractSize =
    market?.productLine === PRODUCT_LINES.spot
      ? 1
      : market?.productLine === PRODUCT_LINES.usdMPerpetual ||
          market?.productLine === PRODUCT_LINES.usdMDelivery
        ? (market.contractMultiplierPpm ?? 0) / 1_000_000
        : 0
  if (contractSize <= 0) return "—"
  const fee = ((priceValue * quantityValue * contractSize * rate) / 1_000_000).toFixed(8)
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
function triggerSubmitError(reason: unknown): string {
  const message = readError(reason)
  const explanations: Record<string, string> = {
    TRIGGER_POSITION_REQUIRED: "Open a position in this pair before setting TP/SL.",
    TRIGGER_SIDE_NOT_REDUCING: "Select the side that closes your current position.",
    TRIGGER_CLOSE_CAPACITY_EXCEEDED:
      "TP/SL quantity exceeds the position available to close, including existing close orders.",
    POSITION_MARGIN_ADJUSTMENT_INVALID: "TP/SL margin mode must match the current position.",
    POSITION_MODE_MISMATCH: "TP/SL position side must match your account position mode.",
    INVALID_COMMAND:
      "TP/SL request is invalid. Check trigger price, execution price, quantity and position settings.",
  }
  const code = Object.keys(explanations).find((key) => message.includes(key))
  return code ? t(explanations[code] ?? message) : message
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
  symbol,
  rows,
  error,
  assetScales,
}: {
  readonly symbol: string
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
                  <td>{symbol}</td>
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

function priceDisplayPrecision(
  market: Market | null | undefined,
  scales: Readonly<Record<string, string>>,
): number {
  if (!market) return 2
  const step =
    market.priceTickUnits && scales[market.quoteAsset]
      ? Number(stepUnitsToDecimal("1", market.priceTickUnits, scales[market.quoteAsset] ?? "1"))
      : 0
  return priceDecimalsForStep(step, market.pricePrecision)
}

/** The visible selector owns its subscriptions and one-second display cadence. */
const PairMarketList = memo(function PairMarketList({
  markets,
  productLine,
  events,
  quotes,
  selectedSymbol,
  search,
  favoritesOnly,
  favorites,
  assetScales,
  onSelect,
  onFavorite,
}: {
  readonly markets: readonly Market[]
  readonly productLine: ProductLine
  readonly events: readonly WsEnvelope[]
  readonly quotes: Readonly<Record<string, number>>
  readonly selectedSymbol: string | undefined
  readonly search: string
  readonly favoritesOnly: boolean
  readonly favorites: readonly string[]
  readonly assetScales: Readonly<Record<string, string>>
  readonly onSelect: (instrumentId: string) => void
  readonly onFavorite: (instrumentId: string) => void
}) {
  const visible = (market: Market) =>
    market.symbol.toLowerCase().includes(search.toLowerCase()) &&
    (!favoritesOnly || favorites.includes(`${productLine}:${market.instrumentId}`))
  return (
    <div className="trade-pair-list">
      {[...markets]
        .sort((a, b) =>
          a.instrumentId === selectedSymbol
            ? -1
            : b.instrumentId === selectedSymbol
              ? 1
              : a.symbol.localeCompare(b.symbol),
        )
        .map((market) => (
          <div
            key={market.instrumentId}
            style={{ display: visible(market) ? undefined : "none" }}
            className={`pair-row ${market.instrumentId === selectedSymbol ? "active" : ""}`}
          >
            <button
              type="button"
              className="pair-favorite"
              aria-label={`${favorites.includes(`${productLine}:${market.instrumentId}`) ? "Remove" : "Add"} ${market.symbol} favorite`}
              onClick={() => onFavorite(market.instrumentId)}
            >
              <Star
                size={15}
                fill={
                  favorites.includes(`${productLine}:${market.instrumentId}`)
                    ? "currentColor"
                    : "none"
                }
              />
            </button>
            <button
              type="button"
              className="pair-select"
              onClick={() => onSelect(market.instrumentId)}
            >
              <AssetIcon asset={market.baseAsset} />
              <span>{market.symbol}</span>
            </button>
            <PairMarketValues
              market={market}
              events={events}
              quote={quotes[market.instrumentId]}
              assetScales={assetScales}
            />
          </div>
        ))}
      {!markets.some(visible) && (
        <StateView
          kind="empty"
          message={favoritesOnly ? "No favorite pairs yet." : "No matching trading pairs."}
        />
      )}
    </div>
  )
})

function PairMarketValues({
  market,
  events,
  quote,
  assetScales,
}: {
  readonly market: Market
  readonly events: readonly WsEnvelope[]
  readonly quote: number | undefined
  readonly assetScales: Readonly<Record<string, string>>
}) {
  const event =
    events.find((row) => row.channel === "trades" && row.instrumentId === market.instrumentId) ??
    events.find((row) => row.channel === "mark" && row.instrumentId === market.instrumentId)
  const price = eventPrice(event, market, assetScales) ?? quote ?? market.price
  const change = market.change24h
  return (
    <span className="pair-market-values">
      <strong className="mono">
        <Price
          value={price}
          dollar={isDollarQuote(market.quoteAsset)}
          pricePrecision={priceDisplayPrecision(market, assetScales)}
        />
      </strong>
      <small className={change === null ? "mono" : change >= 0 ? "positive mono" : "negative mono"}>
        {formatPercent(change)}
      </small>
    </span>
  )
}

function TradeToast({
  message,
  error,
  onClose,
}: {
  readonly message: string
  readonly error: boolean
  readonly onClose: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])
  return (
    <div
      className={`trade-toast ${error ? "trade-toast-error" : "trade-toast-success"}`}
      role={error ? "alert" : "status"}
    >
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label={t("Close")}>
        ×
      </button>
    </div>
  )
}
