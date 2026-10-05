import { Filter } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { loadAssetScales, loadMarkets } from "../../api/endpoints"
import { mapMarket } from "../../api/mappers"
import { MarketTable } from "../../components/market/MarketTable"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Panel, SearchField, StateView } from "../../components/ui/Primitives"
import { useRealtimeFeed } from "../../hooks/useRealtime"
import { marketWithLivePrice } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoMarkets } from "../../lib/demo"
import type { Subscription } from "../../realtime"
import { type Market, PRODUCT_LINES } from "../../types/domain"

export function MarketsPage() {
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<"all" | "perpetual" | "favorites">("all")
  const [showFilters, setShowFilters] = useState(false)
  const [minimumChange, setMinimumChange] = useState("0")
  const [error, setError] = useState<string | null>(null)
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const plan: Subscription[] = markets.map((market) => ({
    channel: "trades",
    productLine: PRODUCT_LINES.usdMPerpetual,
    instrumentId: market.instrumentId,
  }))
  const realtime = useRealtimeFeed(null, plan)
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const [rows, scales] = await Promise.all([
          loadMarkets(PRODUCT_LINES.usdMPerpetual, controller.signal, true, true),
          loadAssetScales(),
        ])
        if (controller.signal.aborted) return
        setMarkets(
          rows
            .map(mapMarket)
            .filter((market) => market.productLine === PRODUCT_LINES.usdMPerpetual),
        )
        setAssetScales(scales)
        setError(null)
      } catch (reason: unknown) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : t("Market data unavailable"))
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 10000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])
  const source = (
    markets.length > 0
      ? markets
      : config.demoDataEnabled
        ? demoMarkets.map((m) => ({
            ...m,
            productLine: PRODUCT_LINES.usdMPerpetual,
            settleAsset: m.quoteAsset,
            maxLeverage: 125,
          }))
        : []
  ).map((m) => {
    const event = realtime.events.find(
      (e) =>
        e.productLine === PRODUCT_LINES.usdMPerpetual &&
        e.instrumentId === m.instrumentId &&
        e.channel === "trades",
    )
    return marketWithLivePrice(m, event, assetScales)
  })
  const filtered = useMemo(
    () =>
      source.filter(
        (market) =>
          market.symbol.toLowerCase().includes(query.toLowerCase()) &&
          Math.abs(market.change24h ?? 0) >= Number(minimumChange) &&
          (scope === "all" ||
            scope === "favorites" ||
            market.productLine === PRODUCT_LINES.usdMPerpetual),
      ),
    [minimumChange, query, scope, source],
  )
  const hasLiveQuotes =
    markets.length > 0 && source.some((market) => market.price !== null && market.price > 0)
  const status = hasLiveQuotes
    ? { label: "Live data", className: "" }
    : markets.length > 0
      ? { label: "Live instruments", className: "status-pending" }
      : config.demoDataEnabled
        ? { label: "Demo data", className: "status-demo" }
        : error
          ? { label: "Unavailable", className: "status-error" }
          : { label: "Loading", className: "status-loading" }
  return (
    <div className="container section markets-page">
      <div className="page-heading">
        <div>
          <h1>{t("Market Center")}</h1>
          <p>{t("Explore real-time prices, charts, and market data.")}</p>
        </div>
        <span className={`live-indicator ${status.className}`}>
          <span /> {status.label}
        </span>
      </div>
      {config.demoDataEnabled && markets.length === 0 ? (
        <div className="demo-banner">
          {t("Demo data: shown only in local development when the API is unavailable.")}
        </div>
      ) : null}
      <div className="market-toolbar">
        <div className="market-tabs">
          <button
            type="button"
            className={scope === "all" ? "active" : ""}
            onClick={() => setScope("all")}
          >
            {" "}
            {t("All Markets")}{" "}
          </button>
          <button
            type="button"
            className={scope === "favorites" ? "active" : ""}
            onClick={() => setScope("favorites")}
          >
            {" "}
            {t("☆ Favorites")}{" "}
          </button>
          <button
            type="button"
            className={scope === "perpetual" ? "active" : ""}
            onClick={() => setScope("perpetual")}
          >
            {" "}
            {t("Perpetual")}{" "}
          </button>
        </div>
        <div className="cluster">
          <SearchField value={query} onChange={setQuery} placeholder={t("Search coin...")} />
          <Button tone="outline" onClick={() => setShowFilters((value) => !value)}>
            <Filter size={16} /> {t("Filters")}{" "}
          </Button>
        </div>
      </div>
      {showFilters ? (
        <div className="market-filter-panel">
          <div>
            {" "}
            {t("Minimum absolute 24h change")}{" "}
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
        </div>
      ) : null}
      {error && source.length === 0 ? (
        <Panel>
          <StateView kind="error" message={error} retry={() => window.location.reload()} />
        </Panel>
      ) : filtered.length > 0 ? (
        <MarketTable
          markets={filtered}
          favoriteOnly={scope === "favorites"}
          demo={config.demoDataEnabled && markets.length === 0}
          quoteUnavailable={!hasLiveQuotes && !config.demoDataEnabled}
        />
      ) : (
        <Panel>
          <StateView
            kind="empty"
            message="No markets match the current filters."
            retry={() => {
              setQuery("")
              setScope("all")
            }}
          />
        </Panel>
      )}
    </div>
  )
}
