import type { ApiOrderBook, ApiOrderBookLevel } from "../../api/types"
import { stepUnitsToDecimal } from "../../lib/units"
import type { Candle, Market } from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"

export function mergeCandleSnapshot(snapshot: Candle, live: Candle | undefined): Candle {
  // History can finish after a newer WebSocket aggregate. Both carry the server's
  // aggregation time; quantities from the trade tape never enter this cumulative volume.
  if (
    live?.updatedAt &&
    snapshot.updatedAt &&
    Date.parse(live.updatedAt) > Date.parse(snapshot.updatedAt)
  )
    return live
  return snapshot
}

export function normalizeOrderBook(
  book: ApiOrderBook,
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): ApiOrderBook {
  const priceScale = assetScales[market.quoteAsset]
  if (!priceScale) throw new Error(`Missing price scale for ${market.quoteAsset}`)
  const quantitySpec = marketQuantitySpec(market, assetScales)
  const normalizeLevel = (level: ApiOrderBookLevel): ApiOrderBookLevel => {
    if (Array.isArray(level) || !market.priceTickUnits || !market.quantityStepUnits) return level
    return {
      priceTicks: stepUnitsToDecimal(level.priceTicks, market.priceTickUnits, priceScale),
      quantitySteps: stepUnitsToDecimal(
        level.quantitySteps,
        quantitySpec.unitSize,
        quantitySpec.scale,
      ),
      orderCount: level.orderCount,
    }
  }
  return {
    ...book,
    bids: book.bids?.map(normalizeLevel),
    asks: book.asks?.map(normalizeLevel),
  }
}

export function normalizeTrade(
  trade: Readonly<Record<string, unknown>>,
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const priceScale = assetScales[market.quoteAsset]
  if (!priceScale) throw new Error(`Missing price scale for ${market.quoteAsset}`)
  const price =
    trade["price"] ??
    trade["lastPrice"] ??
    (trade["priceTicks"] !== undefined && market.priceTickUnits
      ? stepUnitsToDecimal(String(trade["priceTicks"]), market.priceTickUnits, priceScale)
      : undefined)
  const quantitySpec = marketQuantitySpec(market, assetScales)
  const quantity =
    (trade["quantitySteps"] !== undefined && market.quantityStepUnits
      ? stepUnitsToDecimal(
          String(trade["quantitySteps"]),
          quantitySpec.unitSize,
          quantitySpec.scale,
        )
      : undefined) ??
    trade["quantity"] ??
    trade["qty"]
  return {
    ...trade,
    ...(price !== undefined ? { price } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
  }
}

export function marketPriceFromRecord(
  row: Record<string, unknown>,
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): number | null {
  for (const key of ["price", "lastPrice", "markPrice", "indexPrice"]) {
    const direct = numberValue(row, key)
    if (direct !== null && direct > 0) return direct
  }
  const ticks =
    row["priceTicks"] ?? row["lastPriceTicks"] ?? row["markPriceTicks"] ?? row["indexPriceTicks"]
  const priceScale = assetScales[market.quoteAsset]
  if (ticks === undefined || !market.priceTickUnits || !priceScale) return null
  try {
    const converted = Number(stepUnitsToDecimal(String(ticks), market.priceTickUnits, priceScale))
    return Number.isFinite(converted) && converted > 0 ? converted : null
  } catch {
    return null
  }
}

function numberValue(row: Record<string, unknown>, key: string): number | null {
  const value = row[key]
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
