import { Filter } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { loadAssetScales, loadCandles, loadMarkets, loadMarkPrice } from "../../api/endpoints"
import { mapCandle, mapMarket } from "../../api/mappers"
import { MarketTable } from "../../components/market/MarketTable"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Panel, SearchField, StateView } from "../../components/ui/Primitives"
import { useRealtimeFeed } from "../../hooks/useRealtime"
import { eventPrice } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoMarkets } from "../../lib/demo"
import type { Subscription } from "../../realtime"
import { type Market, PRODUCT_LINES } from "../../types/domain"

const primaryPairs = new Set(
  [
    "BTC",
    "ETH",
    "SOL",
    "BNB",
    "XRP",
    "DOGE",
    "ADA",
    "TRX",
    "LINK",
    "AVAX",
    "SUI",
    "BCH",
    "LTC",
    "DOT",
    "UNI",
    "NEAR",
    "ETC",
    "APT",
    "FIL",
    "HBAR",
  ].map((asset) => `${asset}-USDT-SWAP`),
)

export function MarketsPage() {
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<"all" | "perpetual" | "favorites">("all")
  const [showFilters, setShowFilters] = useState(false)
  const [minimumChange, setMinimumChange] = useState("0")
  const [error, setError] = useState<string | null>(null)
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const plan: Subscription[] = markets.flatMap((market) => [
    { channel: "trades", productLine: PRODUCT_LINES.usdMPerpetual, symbol: market.symbol },
    { channel: "mark", productLine: PRODUCT_LINES.usdMPerpetual, symbol: market.symbol },
  ])
  const realtime = useRealtimeFeed(null, plan)
  useEffect(() => {
    void loadMarkets(PRODUCT_LINES.usdMPerpetual)
      .then((rows) => {
        const mapped = rows
          .map(mapMarket)
          .filter(
            (m) => m.productLine === PRODUCT_LINES.usdMPerpetual && primaryPairs.has(m.symbol),
          )
        setMarkets(mapped)
        void loadAssetScales()
          .then(async (scales) => {
            setAssetScales(scales)
            const quotes = await Promise.all(
              mapped.map(async (market) => {
                const [mark, candleRows] = await Promise.allSettled([
                  loadMarkPrice(market.symbol, PRODUCT_LINES.usdMPerpetual),
                  loadCandles(market.symbol, "1h", PRODUCT_LINES.usdMPerpetual),
                ])
                return {
                  symbol: market.symbol,
                  mark: mark.status === "fulfilled" ? mark.value : null,
                  candles: candleRows.status === "fulfilled" ? candleRows.value : [],
                }
              }),
            )
            setMarkets((current) =>
              current.map((market) => {
                const quote = quotes.find((row) => row.symbol === market.symbol)
                if (!quote) return market
                const price = quote.mark ? positiveNumberValue(quote.mark, "markPrice") : null
                const candles = quote.candles
                  .map(mapCandle)
                  .filter((row) => Date.parse(row.time) >= Date.now() - 86400000)
                const first = candles[0]
                const last = candles.at(-1)
                const open = first?.open ?? null
                const close = last?.close ?? null
                return {
                  ...market,
                  price: price ?? close ?? market.price,
                  change24h: open && close ? ((close - open) / open) * 100 : null,
                  high24h: candles.length ? Math.max(...candles.map((row) => row.high)) : null,
                  low24h: candles.length ? Math.min(...candles.map((row) => row.low)) : null,
                  volume24h: candles.length
                    ? candles.reduce((sum, row) => sum + row.volume, 0)
                    : null,
                }
              }),
            )
          })
          .catch((reason: unknown) =>
            setError(reason instanceof Error ? reason.message : t("Market precision unavailable")),
          )
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : t("Market data unavailable")),
      )
  }, [loadMarkets])
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
    const event =
      realtime.events.find(
        (e) =>
          e.productLine === PRODUCT_LINES.usdMPerpetual &&
          e.symbol === m.symbol &&
          e.channel === "trades",
      ) ??
      realtime.events.find(
        (e) =>
          e.productLine === PRODUCT_LINES.usdMPerpetual &&
          e.symbol === m.symbol &&
          e.channel === "mark",
      )
    const price = eventPrice(event, m, assetScales)
    return price === null ? m : { ...m, price }
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
    markets.length > 0 && markets.some((market) => market.price !== null && market.price > 0)
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

function numberValue(row: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = row[key]
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function positiveNumberValue(row: Readonly<Record<string, unknown>>, key: string): number | null {
  const result = numberValue(row, key)
  return result !== null && result > 0 ? result : null
}
