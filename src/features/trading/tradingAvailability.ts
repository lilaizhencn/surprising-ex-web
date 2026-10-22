import { type Market, PRODUCT_LINES } from "../../types/domain"

const supportedProducts: ReadonlySet<string> = new Set(Object.values(PRODUCT_LINES))

/** Delivery contracts accept only direct reductions while settling. */
export function canSubmitTradingOrder(
  market: Market | null,
  reduceOnly: boolean,
  now = Date.now(),
): boolean {
  if (!market || !supportedProducts.has(market.productLine)) return false
  if (market.productLine === "OPTION")
    return (
      market.status === "TRADING" &&
      Number.isFinite(Date.parse(market.expiryTime ?? "")) &&
      Date.parse(market.expiryTime ?? "") > now
    )
  return (
    market.status === "TRADING" ||
    ((market.productLine === "LINEAR_DELIVERY" || market.productLine === "INVERSE_DELIVERY") &&
      market.status === "SETTLING" &&
      reduceOnly)
  )
}

/** Settlement admits direct reductions, never new conditional protection. */
export function canSubmitTriggerOrder(market: Market | null, now = Date.now()): boolean {
  if (
    !market ||
    !supportedProducts.has(market.productLine) ||
    market.productLine === "SPOT" ||
    market.status !== "TRADING"
  )
    return false
  if (["LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"].includes(market.productLine))
    return (
      Number.isFinite(Date.parse(market.expiryTime ?? "")) &&
      Date.parse(market.expiryTime ?? "") > now
    )
  return true
}
