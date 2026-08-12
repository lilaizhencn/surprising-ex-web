import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react"
import { useState } from "react"
import { formatNumber, formatPercent, formatUsd } from "../../lib/format"
import type { Market } from "../../types/domain"
import { AssetIcon, Badge, Button, FavoriteButton, Price, Sparkline } from "../ui/Primitives"

export function MarketTable({
  markets,
  demo = false,
}: {
  readonly markets: readonly Market[]
  readonly demo?: boolean
}) {
  const [favorites, setFavorites] = useState<readonly string[]>([])
  const [sort, setSort] = useState<"symbol" | "price" | "change" | "volume">("symbol")
  const sorted = [...markets].sort((left, right) => {
    if (sort === "symbol") return left.symbol.localeCompare(right.symbol)
    const a = sort === "price" ? left.price : sort === "change" ? left.change24h : left.volume24h
    const b = sort === "price" ? right.price : sort === "change" ? right.change24h : right.volume24h
    return (b ?? -Infinity) - (a ?? -Infinity)
  })
  const favoriteSet = new Set(favorites)
  const toggleFavorite = (symbol: string) =>
    setFavorites(
      favorites.includes(symbol)
        ? favorites.filter((value) => value !== symbol)
        : [...favorites, symbol],
    )
  return (
    <div className="table-wrap">
      <table className="data-table markets-table">
        <thead>
          <tr>
            <th aria-label="Favorite" />
            <th>
              <button type="button" className="table-sort" onClick={() => setSort("symbol")}>
                Trading pair
              </button>
            </th>
            <th className="number">
              <button type="button" className="table-sort" onClick={() => setSort("price")}>
                Price
              </button>
            </th>
            <th className="number">
              <button type="button" className="table-sort" onClick={() => setSort("change")}>
                24h change
              </button>
            </th>
            <th className="number">24h high/low</th>
            <th className="number">
              <button type="button" className="table-sort" onClick={() => setSort("volume")}>
                24h vol
              </button>
            </th>
            <th className="number">Trend</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((market) => {
            const positive = (market.change24h ?? 0) >= 0
            return (
              <tr key={`${market.productLine}-${market.symbol}`}>
                <td>
                  <FavoriteButton
                    active={favoriteSet.has(market.symbol)}
                    onClick={() => toggleFavorite(market.symbol)}
                  />
                </td>
                <td>
                  <a className="market-name" href={`/trade/${routeProduct(market.productLine)}`}>
                    <AssetIcon asset={market.baseAsset} />
                    <strong>{market.symbol}</strong>
                    <span className="muted">{market.baseAsset}</span>
                  </a>
                </td>
                <td className="number">
                  <Price value={market.price} />
                </td>
                <td className="number">
                  <Badge tone={positive ? "positive" : "negative"}>
                    {positive ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                    {formatPercent(market.change24h)}
                  </Badge>
                </td>
                <td className="number mono">
                  {formatNumber(market.high24h)} / {formatNumber(market.low24h)}
                </td>
                <td className="number mono">{formatUsd(market.volume24h)}</td>
                <td className="number">
                  {demo ? (
                    <Sparkline
                      values={positive ? [3, 4, 5, 4, 6, 7] : [7, 6, 6, 5, 4, 3]}
                      positive={positive}
                    />
                  ) : (
                    <span className="subtle">—</span>
                  )}
                </td>
                <td>
                  <Button
                    tone="primary"
                    onClick={() => {
                      window.location.href = `/trade/${routeProduct(market.productLine)}`
                    }}
                  >
                    Trade <ArrowUpRight size={14} />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function routeProduct(productLine: Market["productLine"]): string {
  switch (productLine) {
    case "SPOT":
      return "spot"
    case "INVERSE_PERPETUAL":
      return "coin-m-perpetuals"
    case "LINEAR_DELIVERY":
      return "delivery-futures"
    case "INVERSE_DELIVERY":
      return "coin-m-delivery"
    case "OPTION":
      return "options"
    case "LINEAR_PERPETUAL":
      return "usd-m-perpetuals"
    default:
      return "spot"
  }
}
