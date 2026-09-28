import { decimalToStepUnits, stepUnitsToDecimal } from "../../lib/units"
import type { Market, OrderSide } from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"
import { signedPositionSteps } from "./triggerOrder"

// Conservative display estimate for linear contracts; Core remains the order admission authority.
export function linearOpeningCapacity({
  market,
  scales,
  availableUnits,
  referencePrice,
  marginRatePpm,
  feeRatePpm,
  positions,
  orders,
  side,
}: {
  market: Market
  scales: Readonly<Record<string, string>>
  availableUnits: string | number | undefined
  referencePrice: string
  marginRatePpm: number | undefined
  feeRatePpm: number | undefined
  positions: readonly Record<string, unknown>[]
  orders: readonly Record<string, unknown>[]
  side: OrderSide
}): string | null {
  if (!["LINEAR_PERPETUAL", "LINEAR_DELIVERY"].includes(market.productLine)) return null
  try {
    if (availableUnits == null || !marginRatePpm || feeRatePpm == null) return null
    const multiplier = BigInt(market.notionalMultiplierUnits ?? "")
    const ticks = BigInt(
      decimalToStepUnits(
        referencePrice,
        market.priceTickUnits ?? "",
        scales[market.quoteAsset] ?? "",
      ),
    )
    const notional = ticks * multiplier
    if (notional <= 0n || marginRatePpm <= 0 || !Number.isSafeInteger(feeRatePpm)) return null
    const ceilPpm = (rate: number) => (notional * BigInt(rate) + 999999n) / 1000000n
    const cost = ceilPpm(marginRatePpm) + ceilPpm(Math.max(0, feeRatePpm))
    if (cost <= 0n) return null
    const funds = BigInt(availableUnits)
    let steps = funds > 0n ? funds / cost : 0n
    const maxPosition = BigInt(market.maxPositionNotionalUnits ?? "")
    const oiFloor = BigInt(market.userOpenInterestLimitFloorUnits ?? "")
    const cap = (maxPosition < oiFloor ? maxPosition : oiFloor) / notional
    let used = 0n
    for (const position of positions) {
      if (position["instrumentId"] !== market.instrumentId) continue
      const signed = signedPositionSteps(position)
      if (side === "BUY" && signed > 0n) used += signed
      if (side === "SELL" && signed < 0n) used -= signed
    }
    for (const order of orders) {
      if (
        order["instrumentId"] !== market.instrumentId ||
        order["side"] !== side ||
        order["reduceOnly"] === true
      )
        continue
      used += BigInt(String(order["remainingQuantitySteps"] ?? "0"))
    }
    const capacity = cap > used ? cap - used : 0n
    if (steps > capacity) steps = capacity
    const maxOrder = BigInt(market.maxQuantitySteps ?? "")
    if (steps > maxOrder) steps = maxOrder
    if (steps < BigInt(market.minQuantitySteps ?? "")) steps = 0n
    const spec = marketQuantitySpec(market, scales)
    return stepUnitsToDecimal(steps.toString(), spec.unitSize, spec.scale)
  } catch {
    return null
  }
}

export function orderPositionSide(
  positionMode: "ONE_WAY" | "HEDGE",
  action: "OPEN" | "CLOSE",
  side: OrderSide,
) {
  if (positionMode === "ONE_WAY") return "NET" as const
  return (action === "OPEN") === (side === "BUY") ? ("LONG" as const) : ("SHORT" as const)
}
