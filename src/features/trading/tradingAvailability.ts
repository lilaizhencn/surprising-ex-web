import type { Market } from "../../types/domain"

/** LINEAR_DELIVERY settles with direct reduce-only orders; other products retain their current policy. */
export function canSubmitTradingOrder(market: Market | null, reduceOnly: boolean): boolean {
  return (
    market?.status === "TRADING" ||
    (market?.productLine === "LINEAR_DELIVERY" && market.status === "SETTLING" && reduceOnly)
  )
}
