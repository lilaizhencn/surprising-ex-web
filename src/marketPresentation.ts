import type { Market, ProductMode } from "./types";

type MarketIdentity = Pick<Market, "symbol" | "instrumentType" | "contractType" | "settleAsset" | "baseAsset">;

export function marketProductForPresentation(market: MarketIdentity): ProductMode {
  if (market.instrumentType === "SPOT" || market.contractType === "SPOT") return "spot";
  if (market.instrumentType === "OPTION" || market.contractType === "VANILLA_OPTION") return "option";
  if (market.contractType === "LINEAR_DELIVERY") return "linearDelivery";
  if (market.contractType === "INVERSE_DELIVERY") return "inverseDelivery";
  if (market.contractType === "INVERSE_PERPETUAL" || market.contractType === "INVERSE" || market.settleAsset === market.baseAsset) return "inverse";
  return "linear";
}

export function marketFavoriteKey(market: MarketIdentity): string {
  return `${marketProductForPresentation(market)}:${market.symbol}`;
}

export function marketTickerIsReady(market: Pick<Market, "tickerReady">): boolean {
  return market.tickerReady === true;
}

export function marketIsTradable(market: Pick<Market, "status">): boolean {
  return market.status === "TRADING";
}

export function mergeMarketSnapshots(current: Market[], incoming: Market[], preserveCurrentSnapshot: boolean): Market[] {
  const currentByKey = new Map(current.map((market) => [`${marketProductForPresentation(market)}:${market.symbol}`, market]));
  return incoming.map((market) => {
    const previous = currentByKey.get(`${marketProductForPresentation(market)}:${market.symbol}`);
    if (!previous) return market;
    if (previous.dataSource === "live" && market.dataSource === "fallback") return previous;
    if (previous.dataSource === "fallback" && market.dataSource === "live") return market;
    const preserveTicker = preserveCurrentSnapshot && previous.tickerReady === true;
    if (!preserveTicker) return market;
    return {
      ...market,
      lastPriceTicks: previous.lastPriceTicks,
      markPriceTicks: previous.markPriceTicks > 0 ? previous.markPriceTicks : market.markPriceTicks,
      indexPriceTicks: previous.indexPriceTicks > 0 ? previous.indexPriceTicks : market.indexPriceTicks,
      change24hPpm: previous.change24hPpm,
      volume24hUnits: previous.volume24hUnits,
      fundingRatePpm: previous.fundingRatePpm !== 0 ? previous.fundingRatePpm : market.fundingRatePpm,
      tickerReady: true
    };
  });
}
