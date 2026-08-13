import { BarChart3, Info, RefreshCw, Settings2, Star, XCircle } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  loadLatestTrade,
  loadMarkets,
  loadMarkPrice,
  loadOpenOrders,
  loadOpenTriggerOrders,
  loadOptionQuote,
  loadOrderBook,
  loadPositions,
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
import { CandleSchema, OrderBookSchema } from "../../api/types"
import { PriceChart } from "../../components/trading/PriceChart"
import {
  Badge,
  Button,
  Field,
  Panel,
  Price,
  SearchField,
  StateView,
} from "../../components/ui/Primitives"
import { useRealtime } from "../../hooks/useRealtime"
import { config, storageKeys } from "../../lib/config"
import { demoMarkets } from "../../lib/demo"
import { formatPercent } from "../../lib/format"
import {
  decimalProductExceedsUnits,
  decimalToStepUnits,
  decimalToUnits,
  isPositiveDecimal,
  signedUnitsToDecimal,
  stepUnitsToDecimal,
  unitsToDecimal,
} from "../../lib/units"
import { useSession } from "../../state/session"
import {
  type Candle,
  type Market,
  type OrderSide,
  type OrderType,
  PRODUCT_LINES,
  type ProductLine,
} from "../../types/domain"
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
    dark: false,
  },
  {
    key: "usd-m-perpetuals",
    line: PRODUCT_LINES.usdMPerpetual,
    title: "USD-M Perpetual",
    symbol: "BTC-USDT",
    dark: true,
  },
  {
    key: "coin-m-perpetuals",
    line: PRODUCT_LINES.coinMPerpetual,
    title: "Coin-M Perpetual",
    symbol: "BTC-USD-PERP",
    dark: true,
  },
  {
    key: "delivery-futures",
    line: PRODUCT_LINES.usdMDelivery,
    title: "Delivery Futures",
    symbol: "BTC-USDT-260925",
    dark: false,
  },
  {
    key: "coin-m-delivery",
    line: PRODUCT_LINES.coinMDelivery,
    title: "Coin-M Delivery",
    symbol: "BTC-USD-260925",
    dark: false,
  },
  {
    key: "options",
    line: PRODUCT_LINES.option,
    title: "Options Trading",
    symbol: "BTC-USDT-260925-59000-C",
    dark: false,
  },
] as const

const productKeyAliases: Readonly<Record<string, string>> = {
  "usd-perpetual": "usd-m-perpetuals",
  "coin-perpetual": "coin-m-perpetuals",
}

type Level = ApiOrderBookLevel

export function TradePage({ productKey }: { readonly productKey: string }) {
  const normalizedProductKey = productKeyAliases[productKey] ?? productKey
  const view = views.find((candidate) => candidate.key === normalizedProductKey) ?? views[0]
  const session = useSession()
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [candles, setCandles] = useState<readonly Candle[]>([])
  const [selected, setSelected] = useState<string>(view.symbol)
  const [pairSearch, setPairSearch] = useState("")
  const [pairTab, setPairTab] = useState<"all" | "favorites">("all")
  const [favorites, setFavorites] = useState<readonly string[]>(readFavorites)
  const [book, setBook] = useState<ApiOrderBook | null>(null)
  const bookSequenceRef = useRef<string | null>(null)
  const bookResyncingRef = useRef(false)
  const [latestTrade, setLatestTrade] = useState<Record<string, unknown> | null>(null)
  const [optionQuote, setOptionQuote] = useState<ApiOptionQuote | null>(null)
  const [openOrders, setOpenOrders] = useState<readonly ApiOrder[]>([])
  const [triggerOrders, setTriggerOrders] = useState<readonly ApiTriggerOrder[]>([])
  const [balances, setBalances] = useState<readonly ApiBalance[]>([])
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [marketQuotes, setMarketQuotes] = useState<Readonly<Record<string, number>>>({})
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
  const [period, setPeriod] = useState("1h")
  const [price, setPrice] = useState("")
  const [triggerPrice, setTriggerPrice] = useState("")
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
  const filteredMarkets = availableMarkets.filter(
    (market) =>
      market.symbol.toLowerCase().includes(pairSearch.toLowerCase()) &&
      (pairTab === "all" || favorites.includes(market.symbol)),
  )
  const current = useMemo(() => {
    const base =
      availableMarkets.find((market) => market.symbol === selected) ?? availableMarkets[0] ?? null
    if (!base) return null
    const livePrice = marketQuotes[base.symbol]
    return livePrice === undefined || livePrice === base.price
      ? base
      : { ...base, price: livePrice }
  }, [availableMarkets, marketQuotes, selected])
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
        const baseScale = assetScales[current.baseAsset]
        if (!current.quantityStepUnits || !baseScale) throw new Error("position scale unavailable")
        const positionQuantity = Number(
          stepUnitsToDecimal(magnitude.toString(), current.quantityStepUnits, baseScale),
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
    const referencePrice = Number(price || current.price)
    const factor = next / 100
    const quantityValue =
      side === "SELL" ? availableNumber * factor : (availableNumber / referencePrice) * factor
    setQuantity(Number.isFinite(quantityValue) && quantityValue > 0 ? String(quantityValue) : "")
  }

  const resyncOrderBook = useCallback(() => {
    if (!current || bookResyncingRef.current) return
    bookResyncingRef.current = true
    void loadOrderBook(current.symbol, view.line)
      .then((nextBook) => {
        setBook(normalizeOrderBook(nextBook, current, assetScales))
        bookSequenceRef.current = orderBookSequence(nextBook)
      })
      .catch((reason: unknown) => setError(readError(reason)))
      .finally(() => {
        bookResyncingRef.current = false
      })
  }, [assetScales, current, view.line])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeys.favorites, JSON.stringify(favorites))
    } catch {}
  }, [favorites])

  useEffect(() => {
    setMarketsRequestFinished(false)
    setError(null)
    void loadMarkets(view.line)
      .then((rows) => {
        const productMarkets = rows
          .map(mapMarket)
          .filter((market) => market.productLine === view.line)
        setMarkets(productMarkets)
        setMarketsRequestFinished(true)
        if (rows.length > 0 && productMarkets.length === 0) {
          setError(`后端未返回 ${view.title} 的可交易合约，已阻止跨产品线操作。`)
        }
      })
      .catch((reason: unknown) => {
        setMarketsRequestFinished(true)
        setError(readError(reason))
      })
  }, [view.line])
  useEffect(() => {
    if (!current) return
    setPrice(current.price === null ? "" : String(current.price))
    setCandles([])
    setBook(null)
    bookSequenceRef.current = null
    setLatestTrade(null)
    setOptionQuote(null)
    setTriggerOrders([])
    void Promise.allSettled([
      loadCandles(current.symbol, period, view.line),
      loadOrderBook(current.symbol, view.line),
      loadLatestTrade(current.symbol, view.line).catch(() => null),
      view.line === PRODUCT_LINES.option
        ? loadOptionQuote(current.symbol).catch(() => null)
        : Promise.resolve(null),
      session
        ? loadOpenOrders(current.symbol, view.line)
        : Promise.resolve([] as readonly ApiOrder[]),
      session && view.line !== PRODUCT_LINES.spot
        ? loadPositions(session.user.userId, view.line)
        : Promise.resolve([] as readonly Record<string, unknown>[]),
      session ? loadBalances(view.line) : Promise.resolve([] as readonly ApiBalance[]),
      loadAssetScales(),
      session
        ? loadOpenTriggerOrders(session.user.userId, current.symbol, view.line)
        : Promise.resolve([] as readonly ApiTriggerOrder[]),
    ]).then(
      ([
        candleResult,
        bookResult,
        tradeResult,
        optionQuoteResult,
        orderRows,
        positionRows,
        balanceRows,
        scales,
        triggerRows,
      ]) => {
        const nextScales = scales.status === "fulfilled" ? scales.value : {}
        setCandles(candleResult.status === "fulfilled" ? candleResult.value.map(mapCandle) : [])
        if (bookResult.status === "fulfilled") {
          setBook(normalizeOrderBook(bookResult.value, current, nextScales))
          bookSequenceRef.current = orderBookSequence(bookResult.value)
        } else {
          setBook(null)
          bookSequenceRef.current = null
        }
        const normalizedLatestTrade =
          tradeResult.status === "fulfilled" && tradeResult.value
            ? normalizeTrade(tradeResult.value, current, nextScales)
            : null
        setLatestTrade(normalizedLatestTrade)
        updateMarketQuote(
          current.symbol,
          normalizedLatestTrade
            ? marketPriceFromRecord(normalizedLatestTrade, current, nextScales)
            : bookResult.status === "fulfilled"
              ? orderBookPrice(bookResult.value, current, nextScales)
              : null,
        )
        setOptionQuote(optionQuoteResult.status === "fulfilled" ? optionQuoteResult.value : null)
        setOpenOrders(orderRows.status === "fulfilled" ? orderRows.value : [])
        setPositions(positionRows.status === "fulfilled" ? positionRows.value : [])
        setBalances(balanceRows.status === "fulfilled" ? balanceRows.value : [])
        setAssetScales(nextScales)
        setTriggerOrders(triggerRows.status === "fulfilled" ? triggerRows.value : [])
      },
    )
  }, [current?.symbol, period, session, updateMarketQuote, view.line])

  useEffect(() => {
    if (
      !current ||
      !session ||
      view.line === PRODUCT_LINES.spot ||
      view.line === PRODUCT_LINES.option
    ) {
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
    void loadFundingPayments(session.user.userId, current.symbol, view.line)
      .then((rows) => setFundingPayments(rows))
      .catch((reason: unknown) => {
        setFundingPayments([])
        setFundingPaymentsError(readError(reason))
      })
  }, [current?.symbol, session, view.line])

  useEffect(() => {
    if (!current || view.line === PRODUCT_LINES.spot || view.line === PRODUCT_LINES.option) {
      setMarkPrice(null)
      setIndexPrice(null)
      return
    }
    void Promise.allSettled([
      loadMarkPrice(current.symbol, view.line),
      loadIndexPrice(current.symbol, view.line),
    ]).then(([markResult, indexResult]) => {
      setMarkPrice(markResult.status === "fulfilled" ? markResult.value : null)
      setIndexPrice(indexResult.status === "fulfilled" ? indexResult.value : null)
    })
  }, [current?.symbol, view.line])

  useEffect(() => {
    const event = realtime.events[0]
    if (!event || !current) return
    const eventSymbol = text(event, "symbol")
    if (eventSymbol && eventSymbol !== current.symbol) return
    const channel = text(event, "channel")
    const data = record(valueAt(event, "data"))
    if (!data) return
    if (channel === "candles") {
      const candle = CandleSchema.safeParse(data)
      if (!candle.success) return
      const next = mapCandle(candle.data)
      setCandles((rows) =>
        [...rows.filter((row) => row.time !== next.time), next]
          .sort((left, right) => left.time.localeCompare(right.time))
          .slice(-120),
      )
      return
    }
    if (channel === "depth") {
      const orderBook = OrderBookSchema.safeParse(data)
      if (orderBook.success) {
        const nextSequence = orderBookSequence(orderBook.data)
        const currentSequence = bookSequenceRef.current
        if (!nextSequence) return
        if (orderBook.data.updateType === "DELTA") {
          const previousSequence = orderBook.data.previousSequence
          if (
            !currentSequence ||
            previousSequence === undefined ||
            compareSequences(String(previousSequence), currentSequence) !== 0 ||
            compareSequences(nextSequence, currentSequence) <= 0
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
      setLatestTrade(nextTrade)
      updateMarketQuote(current.symbol, marketPriceFromRecord(nextTrade, current, assetScales))
      return
    }
    if (channel === "mark") {
      setMarkPrice(data)
      updateMarketQuote(current.symbol, marketPriceFromRecord(data, current, assetScales))
      return
    }
    if (channel === "index") {
      setIndexPrice(data)
      if (current.price === null)
        updateMarketQuote(current.symbol, marketPriceFromRecord(data, current, assetScales))
      return
    }
    if (
      [
        "orders",
        "matches",
        "executionReports",
        "triggerOrders",
        "positions",
        "positionRisk",
        "accountRisk",
      ].includes(channel)
    ) {
      refresh()
    }
  }, [assetScales, current, realtime.events, resyncOrderBook, updateMarketQuote])

  useEffect(() => {
    if (realtime.state === "live") refresh()
  }, [realtime.state])

  const submit = async () => {
    if (!session) {
      setSubmitState("error")
      setSubmitMessage("请先登录后再提交订单。")
      return
    }
    if (!current || !isPositiveDecimal(quantity)) {
      setSubmitState("error")
      setSubmitMessage("请输入有效数量。")
      return
    }
    if (orderType === "STOP" && !triggerSupported) {
      setSubmitState("error")
      setSubmitMessage("现货交易不支持仓位止盈止损，请使用限价或市价单。")
      return
    }
    if (orderType === "STOP" && !triggerCloseSide) {
      setSubmitState("error")
      setSubmitMessage("当前交易对没有可平仓位，请先持有仓位后再设置止盈止损。")
      return
    }
    if (orderType === "STOP" && triggerCloseSide !== side) {
      setSubmitState("error")
      setSubmitMessage(
        triggerCloseSide === "SELL"
          ? "当前是多仓，请选择卖出平仓后设置止盈止损。"
          : "当前是空仓，请选择买入平仓后设置止盈止损。",
      )
      return
    }
    const executionType = orderType === "STOP" ? triggerExecutionType : orderType
    if (executionType !== "MARKET" && !isPositiveDecimal(price)) {
      setSubmitState("error")
      setSubmitMessage("限价单需要有效价格。")
      return
    }
    if (orderType === "STOP" && !isPositiveDecimal(triggerPrice)) {
      setSubmitState("error")
      setSubmitMessage("条件单需要有效触发价。")
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
        throw new Error("交易对资产精度尚未加载，订单未提交。")
      }
      if (!current.quantityStepUnits) {
        throw new Error("交易对数量步长尚未加载，订单未提交。")
      }
      if (executionType !== "MARKET" && !current.priceTickUnits) {
        throw new Error("交易对价格跳动规格尚未加载，订单未提交。")
      }
      if (orderType === "STOP" && !current.priceTickUnits) {
        throw new Error("条件单触发价规格尚未加载，订单未提交。")
      }
      quantitySteps = decimalToStepUnits(quantity, current.quantityStepUnits, baseScale)
      if (orderType === "STOP" && activeTriggerPosition) {
        const positionCapacity = signedPositionSteps(activeTriggerPosition)
        const absoluteCapacity = positionCapacity < 0n ? -positionCapacity : positionCapacity
        if (BigInt(quantitySteps) > absoluteCapacity) {
          throw new Error("止盈止损数量不能超过当前持仓数量。")
        }
      }
      priceTicks =
        executionType === "MARKET"
          ? 0
          : decimalToStepUnits(price, current.priceTickUnits ?? "", quoteScale ?? "")

      if (orderType !== "STOP" && view.line === PRODUCT_LINES.spot) {
        const balanceScale = balance ? assetScales[balance.asset] : undefined
        if (!balance || !balanceScale) {
          throw new Error("可用余额或资产精度尚未加载，订单未提交。")
        }
        const availableUnits =
          balance.availableUnits ??
          (balance.free === undefined
            ? undefined
            : decimalToUnits(String(balance.free), balanceScale))
        const referencePrice = executionType === "MARKET" ? current.price : price
        if (side === "BUY" && referencePrice === null) {
          throw new Error("市场参考价尚未加载，无法校验可用余额。")
        }
        if (availableUnits === undefined) {
          throw new Error("可用余额单位尚未加载，订单未提交。")
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
          throw new Error("可用余额不足，订单未提交。")
        }
      }
    } catch (reason: unknown) {
      setSubmitState("error")
      setSubmitMessage(reason instanceof Error ? reason.message : "数量精度无效。")
      return
    }
    setSubmitState("loading")
    try {
      if (orderType === "STOP") {
        const response = await placeTriggerOrder(
          {
            userId: session.user.userId,
            clientTriggerOrderId: `web-trigger-${crypto.randomUUID()}`,
            ocoGroupId: `web-protection-${current.symbol}-${orderSettings.marginMode}-${orderSettings.positionSide}`,
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
          },
          view.line,
        )
        if (response.status !== "PENDING" && response.status !== "TRIGGERING") {
          setSubmitState("error")
          setSubmitMessage(response.rejectReason ?? `条件单未被接受，当前状态：${response.status}`)
          return
        }
        setSubmitMessage(`条件单已接受（${response.status}），触发状态以私有推送为准。`)
      } else {
        const response = await placeOrder(
          {
            userId: session.user.userId,
            clientOrderId: `web-${crypto.randomUUID()}`,
            symbol: current.symbol,
            side,
            orderType,
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
          setSubmitMessage(response.rejectReason ?? "订单被后端拒绝。")
          return
        }
        if (response.status !== "PENDING_RESERVE" && response.status !== "ACCEPTED") {
          setSubmitState("error")
          setSubmitMessage(`订单未被接受，当前状态：${response.status}`)
          return
        }
        setSubmitMessage(`订单已接受（${response.status}），最终状态以订单查询和私有状态为准。`)
      }
      setSubmitState("success")
      setQuantity("")
      setTriggerPrice("")
      refresh()
    } catch (reason: unknown) {
      setSubmitState("error")
      setSubmitMessage(reason instanceof ApiError ? reason.message : readError(reason))
    }
  }
  const refresh = () => {
    if (!current) return
    void Promise.all([
      loadOrderBook(current.symbol, view.line),
      loadOpenOrders(current.symbol, view.line),
      session ? loadBalances(view.line) : Promise.resolve([] as readonly ApiBalance[]),
      session
        ? loadOpenTriggerOrders(session.user.userId, current.symbol, view.line)
        : Promise.resolve([] as readonly ApiTriggerOrder[]),
    ])
      .then(([bookResult, orderRows, balanceRows, triggerRows]) => {
        setBook(normalizeOrderBook(bookResult, current, assetScales))
        bookSequenceRef.current = orderBookSequence(bookResult)
        setOpenOrders(orderRows)
        setBalances(balanceRows)
        setTriggerOrders(triggerRows)
      })
      .catch((reason: unknown) => setError(readError(reason)))
  }

  return (
    <div className={`trade-page ${view.dark ? "trade-dark" : ""}`}>
      <div className="trade-shell">
        <aside className="trade-pairs">
          <SearchField value={pairSearch} onChange={setPairSearch} placeholder="Search pairs..." />
          <div className="trade-tabs">
            <button
              type="button"
              className={pairTab === "all" ? "active" : ""}
              onClick={() => setPairTab("all")}
            >
              All
            </button>
            <button
              type="button"
              className={pairTab === "favorites" ? "active" : ""}
              onClick={() => setPairTab("favorites")}
            >
              Favorites
            </button>
          </div>
          {filteredMarkets.slice(0, 12).map((market) => (
            <div
              className={`pair-row ${market.symbol === current?.symbol ? "active" : ""}`}
              key={market.symbol}
            >
              <button
                type="button"
                className="pair-select"
                onClick={() => setSelected(market.symbol)}
              >
                {market.symbol}
              </button>
              <button
                type="button"
                className="pair-favorite"
                aria-label={
                  favorites.includes(market.symbol) ? "Remove from favorites" : "Add to favorites"
                }
                onClick={() => toggleFavorite(market.symbol)}
              >
                <Star
                  size={15}
                  fill={favorites.includes(market.symbol) ? "currentColor" : "none"}
                />
              </button>
              <span className={(market.change24h ?? 0) >= 0 ? "positive mono" : "negative mono"}>
                <Price value={market.price} />
              </span>
            </div>
          ))}
          {filteredMarkets.length === 0 ? (
            <StateView
              kind={demo ? "empty" : "error"}
              message={
                pairTab === "favorites"
                  ? "No favorite pairs yet. Select the star beside a pair to pin it here."
                  : demo
                    ? "No demo pair matches."
                    : "No market pairs returned by the backend."
              }
            />
          ) : null}
        </aside>
        <main className="trade-main">
          <header className="trade-market-header">
            <div>
              <h1>
                {current?.symbol ?? view.symbol} <Info size={18} />
              </h1>
              <span className="cluster">
                {view.title} · {current?.baseAsset ?? "Asset"}
                <Badge tone={realtime.state === "live" ? "positive" : "neutral"}>
                  {realtime.state === "live" ? "Realtime" : realtime.state}
                </Badge>
              </span>
              {realtime.lastEventAt ? (
                <small className="muted">Updated {formatDate(realtime.lastEventAt)}</small>
              ) : null}
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
            {view.line !== PRODUCT_LINES.spot && view.line !== PRODUCT_LINES.option ? (
              <>
                <div>
                  <small>Mark price</small>
                  <strong className="mono">
                    <Price value={numberValue(markPrice, "markPrice")} />
                  </strong>
                </div>
                <div>
                  <small>Index price</small>
                  <strong className="mono">
                    <Price value={numberValue(indexPrice, "indexPrice")} />
                  </strong>
                </div>
                <div>
                  <small>Funding rate</small>
                  <strong className="mono positive">{fundingRate(funding)}</strong>
                </div>
                <div>
                  <small>Next funding</small>
                  <strong className="mono">{fundingTime(funding)}</strong>
                </div>
              </>
            ) : null}
          </header>
          {view.line === PRODUCT_LINES.option ? (
            <OptionDetails market={current} quote={optionQuote} />
          ) : null}
          {view.key === "delivery-futures" || view.key === "coin-m-delivery" ? (
            <DeliveryDetails market={current} />
          ) : null}
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
            quantityStepUnits={current?.quantityStepUnits}
            quantityScale={current ? assetScales[current.baseAsset] : undefined}
            refreshToken={realtime.lastEventAt}
            onSettingsChange={handleSettingsChange}
          />
          <div className="trade-chart-toolbar">
            {["15m", "1h", "4h", "1d"].map((value) => (
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
          <PriceChart candles={candles} demo={demo} unavailable={!demo && candles.length < 2} />
          <div className="trade-bottom">
            <OrderBook book={book} />
            <Panel dense>
              <div className="panel-heading">
                <h2>Recent trade</h2>
                <Badge tone="neutral">{latestTrade ? "Live snapshot" : "Waiting"}</Badge>
              </div>
              <div className="trade-list">
                <span className="mono">{text(latestTrade, "price") || "—"}</span>
                <span className="subtle">
                  {text(latestTrade, "quantity") ||
                    text(latestTrade, "qty") ||
                    "No latest trade returned"}
                </span>
              </div>
            </Panel>
          </div>
          <Panel dense>
            <div className="panel-heading">
              <h2>
                {view.line === PRODUCT_LINES.spot
                  ? "Account order state"
                  : "Positions & order state"}
              </h2>
              <Badge tone="info">Backend</Badge>
            </div>
            {positions.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Quantity</th>
                      <th>Entry</th>
                      <th>Realized PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position, index) => (
                      <tr key={text(position, "positionId") || String(index)}>
                        <td>{text(position, "symbol") || "—"}</td>
                        <td>{text(position, "positionSide") || text(position, "side") || "—"}</td>
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
            {view.line !== PRODUCT_LINES.spot ? (
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
            ) : null}
          </Panel>
          {view.line !== PRODUCT_LINES.spot && view.line !== PRODUCT_LINES.option ? (
            <>
              <FundingMarketHistory
                rows={fundingHistory}
                settlement={fundingSettlement}
                error={fundingMarketError}
              />
              <FundingPayments
                rows={fundingPayments}
                error={fundingPaymentsError}
                assetScales={assetScales}
              />
            </>
          ) : null}
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
                {type === "STOP" ? "TP / SL" : type}
              </button>
            ))}
          </div>
          {orderType === "STOP" ? (
            <>
              <div className="trigger-explainer">
                <div className="trigger-explainer-heading">
                  <Badge tone={triggerType === "STOP_LOSS" ? "negative" : "positive"}>
                    {triggerType === "STOP_LOSS" ? "止损 Stop loss" : "止盈 Take profit"}
                  </Badge>
                  <strong>{triggerConditionText(side, triggerType)}</strong>
                </div>
                <p>触发后只减仓平仓，不会开新仓。</p>
                <small>
                  {triggerCloseSide
                    ? `当前仓位建议：${triggerCloseSide === "SELL" ? "卖出平多" : "买入平空"}。`
                    : "需要先有当前交易对的持仓，且平仓数量不能超过持仓。"}
                </small>
                <small>止盈和止损使用同一互斥组，任一触发后另一笔会自动撤销。</small>
                {triggerCloseSide && triggerCloseSide !== side ? (
                  <button
                    type="button"
                    className="trigger-side-action"
                    onClick={() => setSide(triggerCloseSide)}
                  >
                    切换为{triggerCloseSide === "SELL" ? "卖出平多" : "买入平空"}
                  </button>
                ) : null}
              </div>
              <Field label="触发类型 / Trigger type">
                <select
                  aria-label="Trigger type"
                  value={triggerType}
                  onChange={(event) =>
                    setTriggerType(
                      event.target.value === "TAKE_PROFIT" ? "TAKE_PROFIT" : "STOP_LOSS",
                    )
                  }
                >
                  <option value="STOP_LOSS">止损 Stop loss</option>
                  <option value="TAKE_PROFIT">止盈 Take profit</option>
                </select>
              </Field>
              <Field
                label="触发价格 / Trigger price"
                hint={triggerConditionText(side, triggerType)}
              >
                <div className="number-input">
                  <input
                    value={triggerPrice}
                    onChange={(event) => setTriggerPrice(event.target.value)}
                    inputMode="decimal"
                    placeholder="输入触发价格"
                    aria-label="止盈止损触发价格"
                  />
                  <span>{current?.quoteAsset ?? "USDT"}</span>
                </div>
              </Field>
              <Field
                label="触发后执行 / Execution"
                hint={
                  triggerExecutionType === "MARKET"
                    ? "触发后立即以市价平仓"
                    : "触发后挂出限价平仓单"
                }
              >
                <select
                  aria-label="Execution"
                  value={triggerExecutionType}
                  onChange={(event) =>
                    setTriggerExecutionType(event.target.value === "LIMIT" ? "LIMIT" : "MARKET")
                  }
                >
                  <option value="MARKET">市价 Market</option>
                  <option value="LIMIT">限价 Limit</option>
                </select>
              </Field>
            </>
          ) : null}
          {orderType !== "MARKET" && (orderType !== "STOP" || triggerExecutionType === "LIMIT") ? (
            <Field label={orderType === "STOP" ? "触发后限价 / Limit price" : "Price"}>
              <div className="number-input">
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                />
                <span>{current?.quoteAsset ?? "USDT"}</span>
              </div>
            </Field>
          ) : null}
          <Field
            label={orderType === "STOP" ? "平仓数量 / Close quantity" : "Quantity"}
            {...(orderType === "STOP" ? { hint: "不能超过当前仓位数量" } : {})}
          >
            <div className="number-input">
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                aria-label={orderType === "STOP" ? "止盈止损平仓数量" : "Order quantity"}
              />
              <span>{current?.baseAsset ?? "Asset"}</span>
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
                aria-label="Order percentage"
              />
              <span>100%</span>
            </div>
          ) : null}
          <div className="ticket-summary">
            <span>Available</span>
            <span className="mono">
              {session
                ? `${balanceAmount(balance, assetScales) ?? "—"} ${balance?.asset ?? current?.quoteAsset ?? ""}`
                : "Login required"}
            </span>
            <span>Est. fee</span>
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
              ? `${triggerType === "STOP_LOSS" ? "设置止损" : "设置止盈"}（${side === "SELL" ? "卖出平仓" : "买入平仓"}）`
              : session
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
          <StateView kind="error" message={error} retry={() => window.location.reload()} />
        </div>
      ) : null}
      {demo ? (
        <div className="demo-banner trade-demo-banner">
          演示数据：未登录或行情服务不可用，价格与图表仅用于本地视觉检查。
        </div>
      ) : null}
    </div>
  )
}

function OrderBook({ book }: { readonly book: ApiOrderBook | null }) {
  const bids = book?.bids ?? []
  const asks = book?.asks ?? []
  return (
    <Panel dense>
      <div className="panel-heading">
        <h2>Order book</h2>
        <Badge tone="info">{book ? "Live snapshot" : "Waiting"}</Badge>
      </div>
      {bids.length === 0 && asks.length === 0 ? (
        <StateView kind="empty" message="Order book data is not available." />
      ) : (
        <div className="order-book">
          <span>Price</span>
          <span>Amount</span>
          <span>Total</span>
          {asks
            .slice(0, 5)
            .reverse()
            .map((level, index) => (
              <LevelRow key={`ask-${index}`} level={level} tone="negative" />
            ))}
          {bids.slice(0, 5).map((level, index) => (
            <LevelRow key={`bid-${index}`} level={level} tone="positive" />
          ))}
        </div>
      )}
    </Panel>
  )
}

function normalizeOrderBook(
  book: ApiOrderBook,
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): ApiOrderBook {
  const priceScale = assetScales[market.quoteAsset]
  const quantityScale = assetScales[market.baseAsset]
  const normalizeLevel = (level: ApiOrderBookLevel): ApiOrderBookLevel => {
    if (Array.isArray(level) || !market.priceTickUnits || !market.quantityStepUnits) return level
    return {
      priceTicks: stepUnitsToDecimal(level.priceTicks, market.priceTickUnits, priceScale ?? "1"),
      quantitySteps: stepUnitsToDecimal(
        level.quantitySteps,
        market.quantityStepUnits,
        quantityScale ?? "1",
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
  tone,
}: {
  readonly level: Level
  readonly tone: "positive" | "negative"
}) {
  const price = Array.isArray(level) ? String(level[0]) : String(level.priceTicks)
  const amount = Array.isArray(level) ? String(level[1]) : String(level.quantitySteps)
  const total = Number(price) * Number(amount)
  return (
    <>
      <strong className={`${tone} mono`}>{price}</strong>
      <span className="mono">{amount}</span>
      <span className="mono">{Number.isFinite(total) ? total.toFixed(2) : "—"}</span>
    </>
  )
}

function normalizeTrade(
  trade: Readonly<Record<string, unknown>>,
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const value = (key: string): unknown => trade[key]
  const price =
    value("price") ??
    value("lastPrice") ??
    (value("priceTicks") !== undefined && market.priceTickUnits
      ? stepUnitsToDecimal(
          String(value("priceTicks")),
          market.priceTickUnits,
          assetScales[market.quoteAsset] ?? "1",
        )
      : undefined)
  const quantity =
    value("quantity") ??
    value("qty") ??
    (value("quantitySteps") !== undefined && market.quantityStepUnits
      ? stepUnitsToDecimal(
          String(value("quantitySteps")),
          market.quantityStepUnits,
          assetScales[market.baseAsset] ?? "1",
        )
      : undefined)
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
  if (ticks === undefined || !market.priceTickUnits) return null
  try {
    const converted = Number(
      stepUnitsToDecimal(
        String(ticks),
        market.priceTickUnits,
        assetScales[market.quoteAsset] ?? "1",
      ),
    )
    return Number.isFinite(converted) && converted > 0 ? converted : null
  } catch {
    return null
  }
}

function orderBookPrice(
  book: ApiOrderBook,
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): number | null {
  const level = book.bids?.[0] ?? book.asks?.[0]
  if (level === undefined) return null
  if (Array.isArray(level)) {
    const parsed = Number(level[0])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return marketPriceFromRecord({ priceTicks: level.priceTicks }, market, assetScales)
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
            <th>Open order</th>
            <th>Side</th>
            <th>Status</th>
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
  const title = "止盈止损 / Take-profit & stop-loss"
  if (rows.length === 0) {
    return (
      <div className="trigger-orders-state">
        <div className="panel-heading">
          <h3>{title}</h3>
          <Badge tone="neutral">0 active</Badge>
        </div>
        <StateView kind="empty" message="当前交易对暂无待触发条件单。" />
      </div>
    )
  }
  return (
    <div className="trigger-orders-state">
      <div className="panel-heading">
        <h3>{title}</h3>
        <Badge tone="info">{rows.length} active</Badge>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Protection</th>
              <th>Trigger price</th>
              <th>Close side</th>
              <th>Quantity</th>
              <th>Execution</th>
              <th>Status</th>
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
      <td>{row.side === "SELL" ? "卖出平多" : "买入平空"}</td>
      <td className="mono">{quantity}</td>
      <td>{row.orderType === "MARKET" ? "市价" : "限价"}</td>
      <td>
        <Badge tone={triggerStatusTone(row.status)}>{triggerStatusLabel(row.status)}</Badge>
      </td>
      <td>
        <Button
          tone="negative"
          loading={loading}
          disabled={userId === undefined || row.status !== "PENDING"}
          onClick={() => {
            if (userId === undefined || !window.confirm("撤销这笔止盈止损单？")) return
            setLoading(true)
            void cancelTriggerOrder(userId, row.triggerOrderId, productLine)
              .then(
                () => onDone("条件单撤销请求已发送。"),
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        >
          <XCircle size={14} /> 撤销
        </Button>
      </td>
    </tr>
  )
}

function triggerTypeLabel(value: ApiTriggerOrder["triggerType"]): string {
  if (value === "STOP_LOSS") return "止损"
  if (value === "TAKE_PROFIT") return "止盈"
  return "追踪止损"
}

function triggerStatusLabel(value: ApiTriggerOrder["status"]): string {
  const labels: Readonly<Record<ApiTriggerOrder["status"], string>> = {
    PENDING: "待触发",
    TRIGGERING: "触发中",
    TRIGGERED: "已触发",
    TRIGGER_FAILED: "触发失败",
    CANCELED: "已撤销",
    EXPIRED: "已过期",
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
  if (!market?.quantityStepUnits || !assetScales[market.baseAsset]) {
    return `steps ${String(row.quantitySteps)}`
  }
  try {
    return `${stepUnitsToDecimal(row.quantitySteps, market.quantityStepUnits, assetScales[market.baseAsset] ?? "1")} ${market.baseAsset}`
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
                () => onDone("撤单请求已发送。"),
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        >
          <XCircle size={14} /> Cancel
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
        <h2>Option contract</h2>
        <Badge tone="info">Backend fields</Badge>
      </div>
      <div className="contract-detail-grid">
        <Detail label="Underlying" value={market?.underlyingSymbol ?? market?.baseAsset ?? "—"} />
        <Detail label="Expiry" value={formatDate(market?.expiryTime)} />
        <Detail label="Strike (units)" value={market?.strikePriceUnits?.toString() ?? "—"} />
        <Detail label="Call / Put" value={market?.optionType ?? "—"} />
        <Detail label="Exercise" value={market?.optionExerciseStyle ?? "—"} />
        <Detail label="Settlement" value={market?.settlementMethod ?? "—"} />
        <Detail
          label="Implied volatility"
          value={quote ? `${formatNumeric(Number(quote.impliedVolatility) * 100)}%` : "Unavailable"}
        />
        <Detail
          label="Greeks"
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
        <h2>Delivery contract</h2>
        <Badge tone="info">Backend fields</Badge>
      </div>
      <div className="contract-detail-grid">
        <Detail label="Contract value" value={market?.contractValueAsset ?? "—"} />
        <Detail label="Expiry" value={formatDate(market?.expiryTime)} />
        <Detail label="Delivery time" value={formatDate(market?.deliveryTime)} />
        <Detail label="Settlement" value={market?.settlementMethod ?? "—"} />
        <Detail label="Contract multiplier" value={ppmValue(market?.contractMultiplierPpm)} />
        <Detail label="Maintenance margin" value={ppmValue(market?.maintenanceMarginRatePpm)} />
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
  const quantityStepUnits = market?.quantityStepUnits
  const quantityScale = market === null ? undefined : assetScales[market.baseAsset]
  if (quantityStepUnits === undefined || quantityScale === undefined) {
    return `steps ${signedSteps}`
  }
  try {
    const negative = signedSteps.startsWith("-")
    const magnitude = negative ? signedSteps.slice(1) : signedSteps
    const amount = stepUnitsToDecimal(magnitude, quantityStepUnits, quantityScale)
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
  return `${((priceValue * quantityValue * rate) / 1_000_000).toFixed(8)} ${market?.quoteAsset ?? ""}`
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
  return reason instanceof Error ? reason.message : "交易服务暂不可用，请稍后重试。"
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
        <h2>Funding payment history</h2>
        <Badge tone="info">Backend records</Badge>
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
                <th>Symbol</th>
                <th>Asset</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Created</th>
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
        <h2>Funding market history</h2>
        <Badge tone="info">Backend records</Badge>
      </div>
      {error ? <StateView kind="error" message={error} /> : null}
      <div className="risk-summary-grid">
        <Detail
          label="Latest settlement"
          value={text(settlement, "fundingTime") || text(settlement, "eventTime") || "—"}
        />
        <Detail label="Settlement status" value={text(settlement, "status") || "—"} />
        <Detail label="Settled payments" value={text(settlement, "positionCount") || "—"} />
      </div>
      {rows.length === 0 ? (
        <StateView kind="empty" message="No funding rate history returned for this contract." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Funding time</th>
                <th>Rate</th>
                <th>Premium</th>
                <th>Status</th>
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
