import { Filter } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { loadMarkets, loadTicker24h } from "../../api/endpoints"
import { mapMarket } from "../../api/mappers"
import { MarketTable } from "../../components/market/MarketTable"
import { Button, Panel, SearchField, StateView } from "../../components/ui/Primitives"
import { config } from "../../lib/config"
import { demoMarkets } from "../../lib/demo"
import type { Market } from "../../types/domain"

export function MarketsPage() {
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<"all" | "spot" | "futures" | "favorites">("all")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void loadMarkets()
      .then((rows) => {
        const mapped = rows.map(mapMarket)
        setMarkets(mapped)
        void Promise.allSettled(
          mapped
            .slice(0, 50)
            .map((market) =>
              loadTicker24h(
                market.symbol,
                market.productLine === "UNKNOWN" ? "SPOT" : market.productLine,
              ),
            ),
        ).then((quotes) => {
          setMarkets((current) =>
            current.map((market, index) => {
              const quote = quotes[index]
              return quote?.status === "fulfilled" ? mergeTicker(market, quote.value) : market
            }),
          )
        })
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "行情服务暂不可用"),
      )
  }, [loadMarkets])
  const source = markets.length > 0 ? markets : config.demoDataEnabled ? demoMarkets : []
  const filtered = useMemo(
    () =>
      source.filter(
        (market) =>
          market.symbol.toLowerCase().includes(query.toLowerCase()) &&
          (scope === "all" ||
            scope === "favorites" ||
            (scope === "spot" ? market.productLine === "SPOT" : market.productLine !== "SPOT")),
      ),
    [query, scope, source],
  )
  const status =
    markets.length > 0 && markets.some((market) => market.price !== null)
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
          <h1>Market Center</h1>
          <p>Explore real-time prices, charts, and market data.</p>
        </div>
        <span className={`live-indicator ${status.className}`}>
          <span /> {status.label}
        </span>
      </div>
      {config.demoDataEnabled && markets.length === 0 ? (
        <div className="demo-banner">演示数据：API 不可用时仅在本地开发环境显示。</div>
      ) : null}
      <div className="market-toolbar">
        <div className="market-tabs">
          <button
            type="button"
            className={scope === "all" ? "active" : ""}
            onClick={() => setScope("all")}
          >
            All Markets
          </button>
          <button
            type="button"
            className={scope === "favorites" ? "active" : ""}
            onClick={() => setScope("favorites")}
          >
            ☆ Favorites
          </button>
          <button
            type="button"
            className={scope === "spot" ? "active" : ""}
            onClick={() => setScope("spot")}
          >
            Spot
          </button>
          <button
            type="button"
            className={scope === "futures" ? "active" : ""}
            onClick={() => setScope("futures")}
          >
            Futures
          </button>
        </div>
        <div className="cluster">
          <SearchField value={query} onChange={setQuery} placeholder="Search coin..." />
          <Button tone="outline">
            <Filter size={16} /> Filters
          </Button>
        </div>
      </div>
      {error && source.length === 0 ? (
        <Panel>
          <StateView kind="error" message={error} retry={() => window.location.reload()} />
        </Panel>
      ) : filtered.length > 0 ? (
        <MarketTable
          markets={filtered}
          favoriteOnly={scope === "favorites"}
          demo={config.demoDataEnabled && markets.length === 0}
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

function mergeTicker(market: Market, quote: Readonly<Record<string, unknown>>): Market {
  return {
    ...market,
    price: numberValue(quote, "lastPrice") ?? numberValue(quote, "price") ?? market.price,
    change24h:
      numberValue(quote, "priceChangePercent") ??
      numberValue(quote, "change24h") ??
      market.change24h,
    volume24h:
      numberValue(quote, "quoteVolume") ?? numberValue(quote, "volume") ?? market.volume24h,
    high24h: numberValue(quote, "highPrice") ?? market.high24h,
    low24h: numberValue(quote, "lowPrice") ?? market.low24h,
  }
}

function numberValue(row: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = row[key]
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}
