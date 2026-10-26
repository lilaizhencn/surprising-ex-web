import type { Market } from "../../types/domain"

export type MarketSortField = "symbol" | "price" | "change24h" | "quoteVolume24h"
export type MarketSort = { field: MarketSortField; direction: "asc" | "desc" }

export function sortMarkets(markets: readonly Market[], sort: MarketSort): Market[] {
  return [...markets].sort((left, right) => {
    if (sort.field === "symbol") {
      const compared = left.symbol.localeCompare(right.symbol)
      return sort.direction === "asc" ? compared : -compared
    }
    const a = left[sort.field]
    const b = right[sort.field]
    const aMissing = a == null || !Number.isFinite(a)
    const bMissing = b == null || !Number.isFinite(b)
    if (aMissing && bMissing) return left.symbol.localeCompare(right.symbol)
    if (aMissing) return 1
    if (bMissing) return -1
    return (sort.direction === "asc" ? a - b : b - a) || left.symbol.localeCompare(right.symbol)
  })
}

export function filterMarkets(markets: readonly Market[], query: string, minimumChange: number) {
  const term = query.trim().toLocaleLowerCase()
  return markets.filter(
    (market) =>
      `${market.symbol} ${market.baseAsset} ${market.quoteAsset}`
        .toLocaleLowerCase()
        .includes(term) &&
      (minimumChange === 0 ||
        (market.change24h !== null && Math.abs(market.change24h) >= minimumChange)),
  )
}

export function marketTradeUrl(market: Market): string | null {
  const routes = {
    SPOT: "spot",
    LINEAR_PERPETUAL: "usd-perpetual",
    INVERSE_PERPETUAL: "coin-perpetual",
    LINEAR_DELIVERY: "delivery-futures",
    INVERSE_DELIVERY: "coin-m-delivery",
    OPTION: "options",
  } as const
  if (market.productLine === "UNKNOWN") return null
  return `/trade/${routes[market.productLine]}?instrumentId=${encodeURIComponent(market.instrumentId)}`
}
