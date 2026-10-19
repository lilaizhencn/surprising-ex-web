import type { ApiOrderBook } from "../../api/types"
import { decimalToStepUnits, stepUnitsToDecimal } from "../../lib/units"
import type { Market, OrderSide } from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"
import { signedPositionSteps } from "./triggerOrder"

/** Prices in this UI book have already been converted to exact decimal strings. */
export function spotReferenceTicks({
  market,
  scales,
  book,
  price,
  side,
  orderType,
  bboMode,
  slippagePpm,
}: {
  market: Market
  scales: Readonly<Record<string, string>>
  book: ApiOrderBook | null
  price: string
  side: OrderSide
  orderType: string
  bboMode: string | null
  slippagePpm: number | undefined
}): string | null {
  try {
    if (market.productLine !== "SPOT") return null
    const ticks = (value: string) =>
      BigInt(
        decimalToStepUnits(value, market.priceTickUnits ?? "", scales[market.quoteAsset] ?? ""),
      )
    if (orderType === "LIMIT" && !bboMode) return ticks(price).toString()
    const sameSide = bboMode?.startsWith("SAME_SIDE_") ?? false
    if (bboMode && !["OPPONENT_1", "OPPONENT_5", "SAME_SIDE_1", "SAME_SIDE_5"].includes(bboMode))
      return null
    const levels = (side === "BUY") !== sameSide ? book?.asks : book?.bids
    const level = levels?.[bboMode?.endsWith("_5") ? 4 : 0]
    if (!level) return null
    const reference = ticks(String(Array.isArray(level) ? level[0] : level.priceTicks))
    if (orderType === "LIMIT") return reference.toString()
    if (
      orderType !== "MARKET" ||
      slippagePpm == null ||
      !Number.isSafeInteger(slippagePpm) ||
      slippagePpm < 0 ||
      slippagePpm >= 1000000
    )
      return null
    const numerator =
      reference * BigInt(side === "BUY" ? 1000000 + slippagePpm : 1000000 - slippagePpm)
    const bound = side === "BUY" ? (numerator + 999999n) / 1000000n : numerator / 1000000n
    return bound > 9223372036854775807n ? null : (bound > 0n ? bound : 1n).toString()
  } catch {
    return null
  }
}

/** Core reserves each step's rounded fee so fragmented fills cannot exceed the reserve. */
export function spotOrderQuantity({
  market,
  scales,
  availableUnits,
  referenceTicks,
  feeRatePpm,
  percentage,
  side,
}: {
  market: Market
  scales: Readonly<Record<string, string>>
  availableUnits: string | number | undefined
  referenceTicks: string | null
  feeRatePpm: number | undefined
  percentage: number
  side: OrderSide
}): string | null {
  try {
    if (
      market.productLine !== "SPOT" ||
      !Number.isInteger(percentage) ||
      percentage < 0 ||
      percentage > 100
    )
      return null
    if (
      availableUnits == null ||
      (typeof availableUnits === "number" && !Number.isSafeInteger(availableUnits))
    )
      return null
    const funds = BigInt(availableUnits)
    const unit = BigInt(market.quantityStepUnits ?? "")
    const scale = scales[market.baseAsset] ?? ""
    const min = BigInt(market.minQuantitySteps ?? "")
    const max = BigInt(market.maxQuantitySteps ?? "")
    const minNotional = BigInt(market.minNotionalUnits ?? "")
    const maxNotional = BigInt(market.maxNotionalUnits ?? "")
    const notional = BigInt(referenceTicks ?? "") * BigInt(market.notionalMultiplierUnits ?? "")
    if (
      funds < 0n ||
      unit <= 0n ||
      !/^10*$/.test(scale) ||
      min <= 0n ||
      max < min ||
      minNotional <= 0n ||
      maxNotional < minNotional ||
      notional <= 0n
    )
      return null
    let cost = unit
    if (side === "BUY") {
      if (feeRatePpm == null || !Number.isSafeInteger(feeRatePpm) || Math.abs(feeRatePpm) > 1000000)
        return null
      cost = notional + (notional * BigInt(Math.max(0, feeRatePpm)) + 999999n) / 1000000n
    }
    let steps = (funds * BigInt(percentage)) / 100n / cost
    for (const cap of [max, maxNotional / notional, 9223372036854775807n / unit])
      if (steps > cap) steps = cap
    if (steps < min || steps * notional < minNotional) steps = 0n
    return stepUnitsToDecimal(steps.toString(), unit.toString(), scale)
  } catch {
    return null
  }
}

export function spotFeeReserve(
  market: Market,
  scales: Readonly<Record<string, string>>,
  referenceTicks: string | null,
  quantity: string,
  rate: number | undefined,
): string | null {
  try {
    if (
      market.productLine !== "SPOT" ||
      referenceTicks == null ||
      rate == null ||
      !Number.isSafeInteger(rate) ||
      Math.abs(rate) > 1000000
    )
      return null
    const notional = BigInt(referenceTicks) * BigInt(market.notionalMultiplierUnits ?? "")
    if (notional <= 0n) return null
    const steps = BigInt(
      decimalToStepUnits(quantity, market.quantityStepUnits ?? "", scales[market.baseAsset] ?? ""),
    )
    return stepUnitsToDecimal(
      (((notional * BigInt(Math.max(0, rate)) + 999999n) / 1000000n) * steps).toString(),
      "1",
      scales[market.quoteAsset] ?? "",
    )
  } catch {
    return null
  }
}

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

/** A replacement uses an independent quantity; never subtract original fills from the draft. */
export function spotAmendmentTerms(
  market: Market,
  scales: Readonly<Record<string, string>>,
  order: Readonly<Record<string, unknown>>,
  price: string,
  quantity: string,
) {
  if (
    market.productLine !== "SPOT" ||
    market.status !== "TRADING" ||
    String(order["instrumentId"]) !== market.instrumentId ||
    order["orderType"] !== "LIMIT" ||
    !["OPEN", "NEW", "ACCEPTED", "PARTIALLY_FILLED"].includes(String(order["status"]))
  )
    throw new Error("This order cannot be amended.")
  if (
    !market.priceTickUnits ||
    !market.quantityStepUnits ||
    !market.notionalMultiplierUnits ||
    BigInt(market.notionalMultiplierUnits) <= 0n ||
    !scales[market.baseAsset] ||
    !scales[market.quoteAsset] ||
    market.minQuantitySteps == null ||
    market.maxQuantitySteps == null ||
    market.minNotionalUnits == null ||
    market.maxNotionalUnits == null
  )
    throw new Error("Trading precision is unavailable. Refresh before amending.")
  const priceTicks = decimalToStepUnits(
    price,
    market.priceTickUnits,
    scales[market.quoteAsset] ?? "",
  )
  const quantitySteps = decimalToStepUnits(
    quantity,
    market.quantityStepUnits ?? "",
    scales[market.baseAsset] ?? "",
  )
  const q = BigInt(quantitySteps),
    notional = BigInt(priceTicks) * q * BigInt(market.notionalMultiplierUnits ?? "")
  if (
    q < BigInt(market.minQuantitySteps ?? "") ||
    q > BigInt(market.maxQuantitySteps ?? "") ||
    notional < BigInt(market.minNotionalUnits ?? "") ||
    notional > BigInt(market.maxNotionalUnits ?? "") ||
    q * BigInt(market.quantityStepUnits ?? "") > 9223372036854775807n
  )
    throw new Error("Replacement quantity or value exceeds the trading rules.")
  if (
    String(order["priceTicks"]) === priceTicks &&
    String(order["remainingQuantitySteps"]) === quantitySteps
  )
    throw new Error("Change the price or replacement quantity.")
  return { priceTicks, quantitySteps }
}
