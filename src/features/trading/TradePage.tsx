import { BarChart3, ChevronDown, Info, RefreshCw, Settings2, Star } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ApiError } from "../../api/client"
import {
  loadAssetScales,
  loadFundingPayments,
  loadFundingRateHistory,
  loadFundingSettlement,
  loadMarket,
  loadMarkets,
} from "../../api/endpoints"
import { mapMarket } from "../../api/mappers"
import type {
  ApiBalance,
  ApiFundingPayment,
  ApiFundingRate,
  ApiOrder,
  ApiTriggerOrder,
} from "../../api/types"
import { BalanceSchema, OrderSchema, TriggerOrderSchema } from "../../api/types"
import { PriceChart } from "../../components/trading/PriceChart"
import {
  AssetIcon,
  Button,
  Panel,
  Price,
  SearchField,
  StateView,
} from "../../components/ui/Primitives"
import { useRealtime } from "../../hooks/useRealtime"
import { eventPrice } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoMarkets } from "../../lib/demo"
import { formatPercent, formatPrice } from "../../lib/format"
import { isPositiveDecimal, stepUnitsToDecimal, unitsToDecimal } from "../../lib/units"
import type { WsEnvelope } from "../../realtime"
import { toggleFavoriteMarket, useFavoriteMarkets } from "../../state/favoriteMarkets"
import {
  type PendingOrderCommand,
  pendingOrderChanged,
  readPendingCommand,
} from "../../state/pendingOrders"
import { useSession } from "../../state/session"
import { type Market, PRODUCT_LINES, type ProductLine } from "../../types/domain"
import {
  FundingMarketHistory,
  FundingPayments,
  formatFundingRate,
  formatNextFundingTime,
} from "./FundingPanels"
import { IndexPriceDetails } from "./IndexPriceDetails"
import { marketPriceFromRecord } from "./marketData"
import { marketQuantitySpec } from "./marketQuantity"
import { OptionMarketPanel } from "./OptionMarketPanel"
import { ReferencePrice } from "./ReferencePrice"
import { TradeMarketPanel } from "./TradeMarketPanel"
import { TradingAccountControls, type TradingOrderSettings } from "./TradingAccountControls"
import { TradingAccountTables } from "./TradingAccountTables"
import { TradingOrderTicket } from "./TradingOrderTicket"
import type { LeverageSettings } from "./TradingTicketControls"
import { TriggerOrders } from "./TriggerOrders"
import { formatTradeQuantity, isDollarQuote, priceDisplayPrecision } from "./tradeFormatting"
import { useTradeMarketData } from "./useTradeMarketData"

const views = [
  {
    key: "spot",
    line: PRODUCT_LINES.spot,
    title: "Spot Trading",
  },
  {
    key: "usd-m-perpetuals",
    line: PRODUCT_LINES.usdMPerpetual,
    title: "USD-M Perpetual",
  },
  {
    key: "coin-m-perpetuals",
    line: PRODUCT_LINES.coinMPerpetual,
    title: "Coin-M Perpetual",
  },
  {
    key: "delivery-futures",
    line: PRODUCT_LINES.usdMDelivery,
    title: "Delivery Futures",
  },
  {
    key: "coin-m-delivery",
    line: PRODUCT_LINES.coinMDelivery,
    title: "Coin-M Delivery",
  },
  {
    key: "options",
    line: PRODUCT_LINES.option,
    title: "Options Trading",
  },
] as const

const productKeyAliases: Readonly<Record<string, string>> = {
  "usd-perpetual": "usd-m-perpetuals",
  "coin-perpetual": "coin-m-perpetuals",
}

const TradePriceChart = memo(PriceChart)

export function TradePage({ productKey }: { readonly productKey: string }) {
  const normalizedProductKey = productKeyAliases[productKey] ?? productKey
  const view = views.find((candidate) => candidate.key === normalizedProductKey) ?? views[0]
  const optionProduct = view.line === PRODUCT_LINES.option
  const deliveryProduct =
    view.line === PRODUCT_LINES.usdMDelivery || view.line === PRODUCT_LINES.coinMDelivery
  const fundingProduct =
    view.line === PRODUCT_LINES.usdMPerpetual || view.line === PRODUCT_LINES.coinMPerpetual
  const session = useSession()
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [selected, setSelected] = useState<string>("")
  const selectedMarketRef = useRef("")
  useEffect(() => {
    selectedMarketRef.current = selected
  }, [selected])
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
  const favorites = useFavoriteMarkets()
  const [leverageSetting, setLeverageSetting] = useState<LeverageSettings | null>(null)
  const [openOrders, setOpenOrders] = useState<readonly ApiOrder[]>([])
  const [triggerOrders, setTriggerOrders] = useState<readonly ApiTriggerOrder[]>([])
  const [balances, setBalances] = useState<readonly ApiBalance[]>([])
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [positions, setPositions] = useState<readonly Record<string, unknown>[]>([])
  const [fundingPayments, setFundingPayments] = useState<readonly ApiFundingPayment[]>([])
  const [fundingPaymentsError, setFundingPaymentsError] = useState("")
  const [fundingHistory, setFundingHistory] = useState<readonly ApiFundingRate[]>([])
  const [fundingSettlement, setFundingSettlement] = useState<Record<string, unknown> | null>(null)
  const [fundingMarketError, setFundingMarketError] = useState("")
  const [marketsRequestFinished, setMarketsRequestFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("15m")
  const [accountTab, setAccountTab] = useState<
    "positions" | "triggers" | "fundingMarket" | "fundingPayments" | "settings"
  >("positions")
  useEffect(() => {
    if (!fundingProduct)
      setAccountTab((tab) =>
        tab === "fundingMarket" || tab === "fundingPayments" ? "positions" : tab,
      )
  }, [fundingProduct])
  const [orderSettings, setOrderSettings] = useState<TradingOrderSettings>({
    marginMode: "CROSS",
    positionMode: "ONE_WAY",
    positionSide: "NET",
  })
  const [pendingCommand, setPendingCommand] = useState<PendingOrderCommand | null>(() =>
    readPendingCommand(String(session?.user.userId ?? "")),
  )
  useEffect(() => {
    const update = () => setPendingCommand(readPendingCommand(String(session?.user.userId ?? "")))
    update()
    window.addEventListener("storage", update)
    window.addEventListener(pendingOrderChanged, update)
    return () => {
      window.removeEventListener("storage", update)
      window.removeEventListener(pendingOrderChanged, update)
    }
  }, [session?.user.userId])
  const pendingForUser =
    pendingCommand !== null && pendingCommand.userId === String(session?.user.userId ?? "")
  const [notice, setNotice] = useState<{ id: number; message: string; error: boolean } | null>(null)
  const notify = useCallback((message: string, error = false) => {
    setNotice((previous) => (message ? { id: (previous?.id ?? 0) + 1, message, error } : null))
  }, [])
  const clearNotice = useCallback(() => setNotice(null), [])
  const [selectedBookPrice, setSelectedBookPrice] = useState<{
    price: string
    instrumentId: string
    productLine: ProductLine
    userId: string
  } | null>(null)
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
  const selectBookPrice = useCallback(
    (price: string) => {
      if (current && isPositiveDecimal(price))
        setSelectedBookPrice({
          price,
          instrumentId: current.instrumentId,
          productLine: view.line,
          userId: String(session?.user.userId ?? ""),
        })
    },
    [current?.instrumentId, view.line, session?.user.userId],
  )
  const realtime = useRealtime(
    session,
    current?.instrumentId ?? "",
    view.line,
    period,
    markets.map((market) => ({
      channel: "trades",
      instrumentId: market.instrumentId,
      productLine: view.line,
    })),
  )
  const privateAccount = realtime.views[view.line]
  const [accountProjectionReady, setAccountProjectionReady] = useState(false)
  const accountReady = Boolean(session && accountProjectionReady && privateAccount?.ready())
  const {
    candles,
    recentTrades,
    book,
    marketQuotes,
    funding,
    markPrice,
    indexPrice,
    marketDataError,
  } = useTradeMarketData(
    current,
    markets,
    view.line,
    period,
    assetScales,
    realtime.events,
    setError,
  )
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
  const handleLeverageChange = useCallback((setting: LeverageSettings | null) => {
    setLeverageSetting(setting)
    if (setting) setOrderSettings((previous) => ({ ...previous, marginMode: setting.marginMode }))
  }, [])
  const pairEvents = useMemo(() => {
    const byInstrument = new Map<string, WsEnvelope>()
    for (const event of realtime.events) {
      if (
        event.channel === "trades" &&
        event.productLine === view.line &&
        event.instrumentId &&
        !byInstrument.has(event.instrumentId)
      )
        byInstrument.set(event.instrumentId, event)
    }
    return [...byInstrument.values()]
  }, [realtime.events, view.line])
  const pairEventsRef = useRef(pairEvents)
  pairEventsRef.current = pairEvents
  const [displayedPairEvents, setDisplayedPairEvents] = useState(pairEvents)
  useEffect(() => {
    setDisplayedPairEvents(pairEventsRef.current)
    const timer = window.setInterval(() => setDisplayedPairEvents(pairEventsRef.current), 1000)
    return () => window.clearInterval(timer)
  }, [])
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
        row["instrumentId"] === current.instrumentId &&
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
    const account = privateAccount
    const clearAccount = () => {
      setAccountProjectionReady(false)
      setBalances([])
      setPositions([])
      setOpenOrders([])
      setTriggerOrders([])
    }
    if (!session || !account?.ready()) {
      clearAccount()
      return
    }
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
      clearAccount()
      setError(t("Invalid account update; waiting for a new snapshot"))
      return
    }
    setBalances(parsedBalances.flatMap((result) => (result.success ? [result.data] : [])))
    setPositions(account.rows("position").filter((row) => Number(row["signedQuantitySteps"]) !== 0))
    setOpenOrders(parsedOrders.flatMap((result) => (result.success ? [result.data] : [])))
    setTriggerOrders(parsedTriggers.flatMap((result) => (result.success ? [result.data] : [])))
    setAccountProjectionReady(true)
    // Expire the usable projection even when no public market tick causes a render.
    const timer = window.setTimeout(
      clearAccount,
      Math.max(0, account.receivedAt + 15_000 - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [current?.instrumentId, privateAccount, realtime.revision, session, view.line])

  const handleSettingsChange = useCallback((settings: TradingOrderSettings) => {
    setOrderSettings(settings)
  }, [])
  const toggleFavorite = useCallback(
    (instrumentId: string) => {
      const favoriteKey = `${view.line}:${instrumentId}`
      toggleFavoriteMarket(favoriteKey)
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
    const controller = new AbortController()
    setMarketsRequestFinished(false)
    setError(null)
    setMarkets([])
    setSelected("")
    selectedMarketRef.current = ""
    let pending = false
    const refreshMarkets = async () => {
      if (pending) return
      pending = true
      try {
        const rows = await loadMarkets(view.line, controller.signal, true)
        if (controller.signal.aborted) return
        const routeRequested = new URLSearchParams(window.location.search).get("instrumentId")
        const requested = routeRequested ?? selectedMarketRef.current
        const productMarkets = rows
          .map(mapMarket)
          .filter((market) => market.productLine === view.line)
        if (
          (deliveryProduct || optionProduct) &&
          requested &&
          !productMarkets.some((market) => market.instrumentId === requested)
        ) {
          const historical = mapMarket(await loadMarket(requested, view.line))
          if (
            historical.productLine !== view.line ||
            historical.instrumentId !== requested ||
            historical.status !== "CLOSED"
          )
            throw new Error(t("Contract metadata is unavailable. Refresh to retry."))
          productMarkets.push(historical)
        }
        if (
          controller.signal.aborted ||
          routeRequested !== new URLSearchParams(window.location.search).get("instrumentId")
        )
          return
        setSelected((previous) =>
          productMarkets.some((market) => market.instrumentId === previous)
            ? previous
            : (productMarkets.find((market) => market.instrumentId === requested)?.instrumentId ??
              productMarkets[0]?.instrumentId ??
              ""),
        )
        setMarkets(productMarkets)
        setMarketsRequestFinished(true)
      } catch (reason: unknown) {
        if (!controller.signal.aborted) {
          setMarketsRequestFinished(true)
          setError(readError(reason))
        }
      } finally {
        pending = false
      }
    }
    void refreshMarkets()
    const timer = window.setInterval(() => void refreshMarkets(), 10000)
    return () => {
      window.clearInterval(timer)
      controller.abort()
    }
  }, [view.line, deliveryProduct, optionProduct])
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
    setFundingHistory([])
    setFundingSettlement(null)
    setFundingMarketError("")
    if (!current || accountTab !== "fundingMarket" || !fundingProduct) return
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
  }, [accountTab, current?.instrumentId, view.line, fundingProduct])

  useEffect(() => {
    setFundingPayments([])
    setFundingPaymentsError("")
    if (!current || !session || accountTab !== "fundingPayments" || !fundingProduct) return
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
  }, [accountTab, current?.instrumentId, session?.user.userId, view.line, fundingProduct])

  return (
    <div className="trade-page">
      {notice && (
        <TradeToast
          key={notice.id}
          message={notice.message}
          error={notice.error}
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
                    events={displayedPairEvents}
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
                  <ReferencePrice
                    eventTime={markPrice?.["eventTime"]}
                    connected={realtime.state === "live"}
                  >
                    <Price
                      value={numberValue(markPrice, "markPrice")}
                      dollar={isDollarQuote(current?.quoteAsset)}
                      pricePrecision={priceDisplayPrecision(current, assetScales)}
                    />
                  </ReferencePrice>
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
                  <ReferencePrice
                    eventTime={indexPrice?.["eventTime"]}
                    connected={realtime.state === "live"}
                  >
                    <Price
                      value={numberValue(indexPrice, "indexPrice")}
                      dollar={isDollarQuote(current?.quoteAsset)}
                      pricePrecision={priceDisplayPrecision(current, assetScales)}
                    />
                  </ReferencePrice>
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
              {fundingProduct && (
                <div className="funding-summary">
                  <small>{t("Funding / Next funding")}</small>
                  <strong className="mono">
                    <span className="positive">{formatFundingRate(funding)}</span> ·{" "}
                    {formatNextFundingTime(funding)}
                  </strong>
                </div>
              )}
            </>
          ) : null}
        </header>
        <main className="trade-main">
          {view.line === PRODUCT_LINES.option ? (
            <>
              <OptionDetails market={current} scales={assetScales} />
              {current ? (
                <OptionMarketPanel
                  key={current.instrumentId}
                  market={current}
                  markets={markets}
                  scales={assetScales}
                  onSelect={selectPair}
                />
              ) : null}
            </>
          ) : null}
          {view.key === "delivery-futures" || view.key === "coin-m-delivery" ? (
            <DeliveryDetails market={current} scales={assetScales} />
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
            <Button tone="ghost" onClick={realtime.refresh}>
              <RefreshCw size={16} />
            </Button>
          </div>
          <TradePriceChart
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
              {fundingProduct ? (
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
                    commandPending={pendingForUser}
                    userId={session?.user.userId}
                    onNotice={(message, failed) => {
                      notify(message, failed)
                    }}
                  />
                </Panel>
              ) : null}
              {accountTab === "triggers" && view.line !== PRODUCT_LINES.spot ? (
                <Panel dense className="trade-orders-panel">
                  <TriggerOrders
                    rows={triggerOrders}
                    pending={pendingForUser}
                    productLine={view.line}
                    userId={session?.user.userId}
                    market={current}
                    assetScales={assetScales}
                    onDone={(value) => {
                      notify(value)
                      realtime.refresh()
                    }}
                  />
                </Panel>
              ) : null}
              {fundingProduct ? (
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
        <TradeMarketPanel
          current={current}
          productLine={view.line}
          assetScales={assetScales}
          book={book}
          recentTrades={recentTrades}
          onPriceSelect={selectBookPrice}
        />
        <TradingOrderTicket
          key={`${view.line}:${current?.instrumentId ?? ""}:${session?.user.userId ?? "guest"}`}
          current={current}
          productLine={view.line}
          session={session}
          accountReady={accountReady}
          assetScales={assetScales}
          marketQuote={current ? (marketQuotes[current.instrumentId] ?? current.price) : null}
          book={book}
          balances={balances}
          positions={positions}
          openOrders={openOrders}
          orderSettings={orderSettings}
          onSettingsChange={handleSettingsChange}
          leverageSetting={leverageSetting}
          onLeverageChange={handleLeverageChange}
          pendingCommand={pendingForUser ? pendingCommand : null}
          selectedBookPrice={selectedBookPrice}
          onRefresh={realtime.refresh}
          onNotice={notify}
        />
      </div>
      {(error || marketDataError) && !demo ? (
        <div className="container trade-notice">
          <StateView
            kind="error"
            message={error ?? marketDataError ?? ""}
            retry={() => window.location.reload()}
          />
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

function OptionDetails({
  market,
  scales,
}: {
  readonly market: Market | null
  readonly scales: Readonly<Record<string, string>>
}) {
  return (
    <Panel dense className="contract-details">
      <div className="panel-heading">
        <h2>{t("Option contract")}</h2>
        <a className="route-link" href="/assets/ledger?category=option-exercise&productLine=OPTION">
          {t("Option exercise cash ledger")}
        </a>
      </div>
      <div className="contract-detail-grid">
        <Detail
          label={t("Underlying")}
          value={market ? `${market.baseAsset} · ${market.underlyingInstrumentId ?? "—"}` : "—"}
        />
        <Detail label={t("Expiry")} value={formatDate(market?.expiryTime)} />
        <Detail
          label={t("Strike price")}
          value={
            market?.strikePriceUnits && scales[market.quoteAsset]
              ? `${unitsToDecimal(market.strikePriceUnits, scales[market.quoteAsset] ?? "")} ${market.quoteAsset}`
              : "—"
          }
        />
        <Detail label={t("Call / Put")} value={market?.optionType ?? "—"} />
        <Detail label={t("Exercise")} value={market?.optionExerciseStyle ?? "—"} />
        <Detail label={t("Settlement")} value={market?.settlementMethod ?? "—"} />
      </div>
    </Panel>
  )
}

function DeliveryDetails({
  market,
  scales,
}: {
  readonly market: Market | null
  readonly scales: Readonly<Record<string, string>>
}) {
  return (
    <Panel dense className="contract-details">
      <div className="panel-heading">
        <h2>{t("Delivery contract")}</h2>
        <a
          className="route-link"
          href={`/assets/ledger?category=delivery-ledger&productLine=${market?.productLine ?? PRODUCT_LINES.usdMDelivery}`}
        >
          {t("Delivery cash ledger")}
        </a>
      </div>
      <div className="contract-detail-grid">
        <Detail
          label={t("Contract value")}
          value={
            market?.productLine === PRODUCT_LINES.coinMDelivery
              ? market.notionalMultiplierUnits && scales[market.quoteAsset]
                ? `${unitsToDecimal(market.notionalMultiplierUnits, scales[market.quoteAsset] ?? "")} ${market.quoteAsset}`
                : "—"
              : (market?.contractValueAsset ?? "—")
          }
        />
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString()
}

function ppmValue(value: number | undefined): string {
  return value === undefined ? "—" : `${(value / 10_000).toFixed(4)}%`
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
    events.find((row) => row.channel === "trades" && row["instrumentId"] === market.instrumentId) ??
    events.find((row) => row.channel === "mark" && row["instrumentId"] === market.instrumentId)
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

function readError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : t("Trading service is unavailable. Please retry later.")
}
function numberValue(row: Record<string, unknown> | null, key: string): number | null {
  const value = row?.[key]
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
