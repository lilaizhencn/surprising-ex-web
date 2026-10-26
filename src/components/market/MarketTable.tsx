import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, ChevronDown } from "lucide-react"
import { t } from "../../i18n"
import { formatPercent, formatPrice } from "../../lib/format"
import { toggleFavoriteMarket, useFavoriteMarkets } from "../../state/favoriteMarkets"
import type { Market } from "../../types/domain"
import { productLineLabels } from "../layout/navigation"
import { DropdownSelect } from "../ui/DropdownSelect"
import { AssetIcon, Badge, FavoriteButton, Price, Sparkline } from "../ui/Primitives"
import { type MarketSort, type MarketSortField, marketTradeUrl, sortMarkets } from "./marketList"

export function MarketTable({
  markets,
  demo = false,
  sort,
  onSort,
}: {
  readonly markets: readonly Market[]
  readonly demo?: boolean
  readonly sort: MarketSort
  readonly onSort: (sort: MarketSort) => void
}) {
  const favorites = useFavoriteMarkets()
  const sorted = sortMarkets(markets, sort)
  const fields: readonly { field: MarketSortField; label: string }[] = [
    { field: "symbol", label: "Trading pair" },
    { field: "price", label: "Price" },
    { field: "change24h", label: "24h change" },
    { field: "quoteVolume24h", label: "24h turnover" },
  ]
  const sortButton = (field: MarketSortField, label: string) => {
    const selected = sort.field === field
    const Icon = selected ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <button
        type="button"
        className={`table-sort${selected ? " selected" : ""}`}
        onClick={() =>
          onSort({
            field,
            direction: selected
              ? sort.direction === "asc"
                ? "desc"
                : "asc"
              : field === "symbol"
                ? "asc"
                : "desc",
          })
        }
      >
        {t(label)}
        <Icon size={13} aria-hidden="true" />
      </button>
    )
  }
  const ariaSort = (field: MarketSortField) =>
    sort.field === field
      ? sort.direction === "asc"
        ? ("ascending" as const)
        : ("descending" as const)
      : ("none" as const)
  const favorite = (market: Market) => (
    <FavoriteButton
      active={favorites.includes(`${market.productLine}:${market.instrumentId}`)}
      symbol={market.symbol}
      onClick={() => toggleFavoriteMarket(`${market.productLine}:${market.instrumentId}`)}
    />
  )
  const tradeLink = (market: Market) => {
    const href = marketTradeUrl(market)
    return href ? (
      <a
        className="button button-outline market-trade-link"
        href={href}
        aria-label={`${t("Trade")} ${market.symbol}`}
      >
        {t("Trade")}
        <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    ) : (
      <span className="muted">{t("Unavailable")}</span>
    )
  }

  return (
    <div className="market-results">
      <div className="market-result-heading">
        <span role="status">
          {t("Markets shown")}: {sorted.length}
        </span>
        <div className="market-mobile-sort">
          <DropdownSelect
            aria-label={t("Sort markets")}
            value={`${sort.field}:${sort.direction}`}
            onChange={(event) => {
              const [field, direction] = event.target.value.split(":")
              const selected = fields.find((item) => item.field === field)
              if (selected && (direction === "asc" || direction === "desc"))
                onSort({ field: selected.field, direction })
            }}
          >
            {fields.flatMap((item) =>
              ["asc", "desc"].map((direction) => (
                <option key={`${item.field}:${direction}`} value={`${item.field}:${direction}`}>
                  {`${t(item.label)} · ${t(direction === "asc" ? "Ascending" : "Descending")}`}
                </option>
              )),
            )}
          </DropdownSelect>
        </div>
      </div>
      <div className="table-wrap market-desktop-table">
        <table className="data-table markets-table">
          <caption className="sr-only">
            {t("Markets shown")}: {sorted.length}
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-label={t("Favorite")} />
              <th scope="col" aria-sort={ariaSort("symbol")}>
                {sortButton("symbol", "Trading pair")}
              </th>
              <th scope="col" className="number" aria-sort={ariaSort("price")}>
                {sortButton("price", "Price")}
              </th>
              <th scope="col" className="number" aria-sort={ariaSort("change24h")}>
                {sortButton("change24h", "24h change")}
              </th>
              <th scope="col" className="number">
                {t("24h high/low")}
              </th>
              <th scope="col" className="number" aria-sort={ariaSort("quoteVolume24h")}>
                {sortButton("quoteVolume24h", "24h turnover")}
              </th>
              <th scope="col" className="trend-column">
                {t("Trend")}
              </th>
              <th scope="col">{t("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((market) => (
              <tr key={`${market.productLine}:${market.instrumentId}:${market.symbol}`}>
                <td>{favorite(market)}</td>
                <td>
                  <MarketName market={market} />
                </td>
                <td className="number">
                  <MarketPrice market={market} />
                </td>
                <td className="number">
                  <MarketChange value={market.change24h} />
                </td>
                <td className="number mono">
                  {formatPrice(market.high24h, market.pricePrecision)} /{" "}
                  {formatPrice(market.low24h, market.pricePrecision)}
                  <small className="market-value-unit">{market.quoteAsset}</small>
                </td>
                <td className="number mono">
                  {formatPrice(market.quoteVolume24h ?? null)}
                  <small className="market-value-unit">{market.quoteAsset}</small>
                </td>
                <td className="trend-column">
                  <MarketTrend market={market} demo={demo} />
                </td>
                <td>{tradeLink(market)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="market-card-list" aria-label={t("Market list")}>
        {sorted.map((market) => (
          <li
            className="market-list-card"
            key={`${market.productLine}:${market.instrumentId}:${market.symbol}`}
          >
            <div className="market-card-heading">
              <MarketName market={market} />
              {favorite(market)}
            </div>
            <div className="market-card-quote">
              <div>
                <span className="market-card-label">{t("Price")}</span>
                <MarketPrice market={market} />
              </div>
              <MarketChange value={market.change24h} />
            </div>
            <div className="market-card-footer">
              <div>
                <span className="market-card-label">{t("24h turnover")}</span>
                <span className="mono">
                  {formatPrice(market.quoteVolume24h ?? null)} <small>{market.quoteAsset}</small>
                </span>
              </div>
              {tradeLink(market)}
            </div>
            <details className="market-card-details">
              <summary>
                {t("Market details")}
                <ChevronDown className="market-card-details-chevron" size={14} aria-hidden="true" />
              </summary>
              <div>
                <span>{t("24h high/low")}</span>
                <strong className="mono">
                  {formatPrice(market.high24h, market.pricePrecision)} /{" "}
                  {formatPrice(market.low24h, market.pricePrecision)} {market.quoteAsset}
                </strong>
                <span>{t("Trend")}</span>
                <MarketTrend market={market} demo={demo} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MarketName({ market }: { readonly market: Market }) {
  const href = marketTradeUrl(market)
  const content = (
    <>
      <AssetIcon asset={market.baseAsset} />
      <span>
        <strong>{market.symbol}</strong>
        <small>
          {market.productLine === "UNKNOWN"
            ? t("Unavailable")
            : t(productLineLabels[market.productLine])}
        </small>
      </span>
    </>
  )
  return href ? (
    <a className="market-list-name" href={href}>
      {content}
    </a>
  ) : (
    <span className="market-list-name">{content}</span>
  )
}
function MarketPrice({ market }: { readonly market: Market }) {
  return (
    <>
      <Price value={market.price} pricePrecision={market.pricePrecision} />
      <small className="market-value-unit">
        {market.quoteAsset}
        {market.priceSource === "mark" ? ` · ${t("Mark price")}` : ""}
      </small>
    </>
  )
}
function MarketChange({ value }: { readonly value: number | null }) {
  const tone = value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative"
  return (
    <Badge tone={tone}>
      {value !== null && value !== 0 ? (
        value > 0 ? (
          <ArrowUp size={13} aria-hidden="true" />
        ) : (
          <ArrowDown size={13} aria-hidden="true" />
        )
      ) : null}
      {formatPercent(value)}
    </Badge>
  )
}
function MarketTrend({ market, demo }: { readonly market: Market; readonly demo: boolean }) {
  const positive = (market.change24h ?? 0) >= 0
  return market.trend && market.trend.length > 1 ? (
    <Sparkline values={market.trend} positive={positive} />
  ) : demo ? (
    <Sparkline values={positive ? [3, 4, 5, 4, 6, 7] : [7, 6, 6, 5, 4, 3]} positive={positive} />
  ) : (
    <span className="subtle">—</span>
  )
}
