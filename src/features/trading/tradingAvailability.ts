import type { Market } from "../../types/domain"

/** Delivery contracts accept only direct reductions while settling. */
export function canSubmitTradingOrder(
  market: Market | null,
  reduceOnly: boolean,
  now = Date.now(),
): boolean {
  if (market?.productLine === "OPTION")
    return (
      market.status === "TRADING" &&
      Number.isFinite(Date.parse(market.expiryTime ?? "")) &&
      Date.parse(market.expiryTime ?? "") > now
    )
  return (
    market?.status === "TRADING" ||
    (!!market &&
      ["LINEAR_DELIVERY", "INVERSE_DELIVERY"].includes(market.productLine) &&
      market.status === "SETTLING" &&
      reduceOnly)
  )
}

/** Settlement admits direct reductions, never new conditional protection. */
export function canSubmitTriggerOrder(market: Market | null, now = Date.now()): boolean {
  if (!market || market.productLine === "SPOT" || market.status !== "TRADING") return false
  if (["LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"].includes(market.productLine))
    return (
      Number.isFinite(Date.parse(market.expiryTime ?? "")) &&
      Date.parse(market.expiryTime ?? "") > now
    )
  return true
}
