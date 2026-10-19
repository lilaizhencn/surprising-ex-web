import type { Market } from "../../types/domain"

/** Delivery contracts accept only direct reductions while settling. */
export function canSubmitTradingOrder(market: Market | null, reduceOnly: boolean): boolean {
  return (
    market?.status === "TRADING" ||
    (!!market &&
      ["LINEAR_DELIVERY", "INVERSE_DELIVERY"].includes(market.productLine) &&
      market.status === "SETTLING" &&
      reduceOnly)
  )
}
