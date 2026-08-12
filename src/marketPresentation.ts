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
