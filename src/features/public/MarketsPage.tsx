import { ChevronLeft, ChevronRight, Filter, RefreshCw, Star, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { loadAssetScales, loadMarkets } from "../../api/endpoints"
import { mapMarket } from "../../api/mappers"
import { productLineLabels } from "../../components/layout/navigation"
import { MarketSkeleton } from "../../components/market/MarketSkeleton"
import { MarketTable } from "../../components/market/MarketTable"
import { filterMarkets, type MarketSort, sortMarkets } from "../../components/market/marketList"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Panel, SearchField, StateView } from "../../components/ui/Primitives"
import { useRealtimeFeed } from "../../hooks/useRealtime"
import { marketWithLiveQuote } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoMarkets } from "../../lib/demo"
import type { Subscription } from "../../realtime"
import { useFavoriteMarkets } from "../../state/favoriteMarkets"
import { type Market, PRODUCT_LINES, type ProductLine } from "../../types/domain"
import "./MarketsPage.css"

type MarketData = {
  productLine: ProductLine
  markets: readonly Market[]
  assetScales: Readonly<Record<string, string>>
  loading: boolean
  error: string | null
}

export function MarketsPage() {
  const [productLine, setProductLine] = useState<ProductLine>(PRODUCT_LINES.usdMPerpetual)
  const [page, setPage] = useState(0)
  const results = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [sort, setSort] = useState<MarketSort>({ field: "symbol", direction: "asc" })
  const [showFilters, setShowFilters] = useState(false)
  const [minimumChange, setMinimumChange] = useState("0")
  const [data, setData] = useState<MarketData>({
    productLine,
    markets: [],
    assetScales: {},
    loading: true,
    error: null,
  })
  const refresh = useRef<(() => void) | null>(null)
  const favorites = useFavoriteMarkets()
  const current = data.productLine === productLine ? data : null
  const markets = current?.markets ?? []
  const loading = current?.loading ?? true
  const error = current?.error
  const demo =
    config.demoDataEnabled && markets.length === 0 && productLine === PRODUCT_LINES.usdMPerpetual
  const source = demo ? demoMarkets.map((market) => ({ ...market, productLine })) : markets
  const favoriteMarkets = source.filter((market) =>
    favorites.includes(`${market.productLine}:${market.instrumentId}`),
  )
  const scopedMarkets = favoriteOnly ? favoriteMarkets : source
  const filtered = sortMarkets(filterMarkets(scopedMarkets, query, Number(minimumChange)), sort)
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * 50, (currentPage + 1) * 50)
  const plan: Subscription[] = visible.flatMap((market) =>
    (productLine === "SPOT" ? ["trades"] : ["trades", "mark"]).map((channel) => ({
      channel,
      productLine,
      instrumentId: market.instrumentId,
    })),
  )
  const realtime = useRealtimeFeed(null, plan)
  const quotedMarkets = visible.map((market) =>
    marketWithLiveQuote(market, realtime.events, current?.assetScales ?? {}),
  )
  useEffect(() => setPage(0), [productLine, query, minimumChange, favoriteOnly, favorites, sort])

  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    setData({ productLine, markets: [], assetScales: {}, loading: true, error: null })
    const load = async () => {
      if (pending || controller.signal.aborted) return
      pending = true
      setData((currentData) => ({ ...currentData, loading: true }))
      try {
        const [rows, assetScales] = await Promise.all([
          loadMarkets(productLine, controller.signal, true, true),
          loadAssetScales(controller.signal),
        ])
        if (controller.signal.aborted) return
        setData({
          productLine,
          markets: rows.map(mapMarket).filter((market) => market.productLine === productLine),
          assetScales,
          loading: false,
          error: null,
        })
      } catch (reason: unknown) {
        if (!controller.signal.aborted)
          setData((currentData) => ({
            ...currentData,
            loading: false,
            error: reason instanceof Error ? reason.message : t("Market data unavailable"),
          }))
      } finally {
        pending = false
      }
    }
    refresh.current = () => void load()
    void load()
    const timer = window.setInterval(() => void load(), 10_000)
    return () => {
      controller.abort()
      refresh.current = null
      window.clearInterval(timer)
    }
  }, [productLine])

  const hasFilters = query.trim() !== "" || minimumChange !== "0"
  const resetFilters = () => {
    setQuery("")
    setMinimumChange("0")
  }

  return (
    <div className="container section markets-page">
      <div className="page-heading">
        <div>
          <h1>{t("Market Center")}</h1>
          <p>{t("Explore real-time prices, charts, and market data.")}</p>
        </div>
        <Button tone="outline" loading={loading} onClick={() => refresh.current?.()}>
          {!loading ? <RefreshCw size={16} aria-hidden="true" /> : null}
          {t("Refresh")}
        </Button>
      </div>
      {demo ? (
        <div className="demo-banner">
          {t("Demo data: shown only in local development when the API is unavailable.")}
        </div>
      ) : null}
      <div className="market-toolbar">
        <fieldset className="market-tabs" aria-label={t("Market list")}>
          <button
            type="button"
            aria-pressed={!favoriteOnly}
            className={!favoriteOnly ? "active" : ""}
            onClick={() => setFavoriteOnly(false)}
          >
            {t("All Markets")}
          </button>
          <button
            type="button"
            aria-pressed={favoriteOnly}
            className={favoriteOnly ? "active" : ""}
            onClick={() => setFavoriteOnly(true)}
          >
            <Star size={16} aria-hidden="true" />
            {t("Favorites")}
            <span className="market-tab-count">{favoriteMarkets.length}</span>
          </button>
        </fieldset>
        <div className="market-controls">
          <DropdownSelect
            aria-label={t("Product line")}
            value={productLine}
            onChange={(event) => {
              const selected = Object.values(PRODUCT_LINES).find(
                (line) => line === event.target.value,
              )
              if (selected) setProductLine(selected)
            }}
          >
            {Object.values(PRODUCT_LINES).map((line) => (
              <option key={line} value={line}>
                {t(productLineLabels[line])}
              </option>
            ))}
          </DropdownSelect>
          <SearchField value={query} onChange={setQuery} placeholder={t("Search coin...")} />
          <Button
            tone="outline"
            aria-expanded={showFilters}
            aria-controls="market-filters"
            onClick={() => setShowFilters((value) => !value)}
          >
            <Filter size={16} aria-hidden="true" />
            {t("Filters")}
            {minimumChange !== "0" ? <span className="market-filter-count">1</span> : null}
          </Button>
        </div>
      </div>
      {showFilters ? (
        <div className="market-filter-panel" id="market-filters">
          <div>
            <span>{t("Minimum absolute 24h change")}</span>
            <DropdownSelect
              aria-label={t("Minimum absolute 24h change")}
              value={minimumChange}
              onChange={(event) => setMinimumChange(event.target.value)}
            >
              <option value="0">{t("Any")}</option>
              <option value="1">1%</option>
              <option value="5">5%</option>
              <option value="10">10%</option>
            </DropdownSelect>
          </div>
          <Button tone="ghost" disabled={!hasFilters} onClick={resetFilters}>
            {t("Reset filters")}
          </Button>
        </div>
      ) : null}
      {minimumChange !== "0" && !showFilters ? (
        <button
          type="button"
          className="market-active-filter"
          onClick={() => setMinimumChange("0")}
          aria-label={t("Clear change filter")}
        >
          {t("24h change")} ≥ {minimumChange}%<X size={14} aria-hidden="true" />
        </button>
      ) : null}
      {error && source.length > 0 ? (
        <div className="market-refresh-error" role="alert">
          <span>
            {error} {t("Showing previously loaded markets.")}
          </span>
          <Button tone="ghost" loading={loading} onClick={() => refresh.current?.()}>
            {t("Retry")}
          </Button>
        </div>
      ) : null}
      {error && source.length === 0 ? (
        <Panel>
          <StateView kind="error" message={error} retry={() => refresh.current?.()} />
        </Panel>
      ) : loading && source.length === 0 ? (
        <MarketSkeleton />
      ) : filtered.length > 0 ? (
        <div ref={results} className="market-results-anchor">
          <MarketTable markets={quotedMarkets} demo={demo} sort={sort} onSort={setSort} />
          {pageCount > 1 ? (
            <nav className="market-pagination" aria-label={t("Market pages")}>
              <span>
                {currentPage * 50 + 1}–{Math.min((currentPage + 1) * 50, filtered.length)} /{" "}
                {filtered.length}
              </span>
              <div>
                <Button
                  tone="outline"
                  disabled={currentPage === 0}
                  onClick={() => {
                    setPage(currentPage - 1)
                    results.current?.scrollIntoView({ block: "start" })
                  }}
                  aria-label={t("Previous page")}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  {t("Previous")}
                </Button>
                <Button
                  tone="outline"
                  disabled={currentPage === pageCount - 1}
                  onClick={() => {
                    setPage(currentPage + 1)
                    results.current?.scrollIntoView({ block: "start" })
                  }}
                  aria-label={t("Next page")}
                >
                  {t("Next")}
                  <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </div>
            </nav>
          ) : null}
        </div>
      ) : (
        <Panel>
          <StateView
            kind="empty"
            message={
              favoriteOnly && favoriteMarkets.length === 0
                ? "No favorite markets yet. Select the star beside a trading pair to pin it here."
                : source.length === 0
                  ? "No markets are available for this product line."
                  : "No markets match the current filters."
            }
            retry={
              hasFilters ? resetFilters : favoriteOnly ? () => setFavoriteOnly(false) : undefined
            }
            retryLabel={hasFilters ? "Reset filters" : "Browse markets"}
          />
        </Panel>
      )}
    </div>
  )
}
