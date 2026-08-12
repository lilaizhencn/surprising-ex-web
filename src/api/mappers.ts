import type { Balance, Candle, Market, ProductLine } from "../types/domain"
import { PRODUCT_LINES } from "../types/domain"
import type { ApiBalance, ApiCandle, ApiMarket } from "./types"

export function mapMarket(raw: ApiMarket): Market {
  const [baseAsset, quoteAsset] = splitSymbol(raw.symbol, raw.baseAsset, raw.quoteAsset)
  return {
    symbol: raw.symbol,
    baseAsset,
    quoteAsset,
    productLine: normalizeProductLine(raw.productLine, raw.contractType),
    price: numeric(raw.lastPrice) ?? scaled(raw.lastPriceTicks, 100),
    change24h: numeric(raw.change24h) ?? scaled(raw.change24hPpm, 10_000),
    volume24h: numeric(raw.volume24h) ?? scaled(raw.volume24hUnits, 100_000_000),
    high24h: numeric(raw.high24h),
    low24h: numeric(raw.low24h),
    pricePrecision: raw.pricePrecision ?? 2,
    quantityPrecision: raw.quantityPrecision ?? 6,
    maxLeverage: raw.maxLeverage ?? null,
    instrumentType: raw.instrumentType,
    contractValueAsset: raw.contractValueAsset,
    contractMultiplierPpm: raw.contractMultiplierPpm,
    initialMarginRatePpm: raw.initialMarginRatePpm,
    maintenanceMarginRatePpm: raw.maintenanceMarginRatePpm,
    makerFeeRatePpm: raw.makerFeeRatePpm,
    takerFeeRatePpm: raw.takerFeeRatePpm,
    fundingIntervalHours: raw.fundingIntervalHours,
    expiryTime: raw.expiryTime,
    deliveryTime: raw.deliveryTime,
    underlyingSymbol: raw.underlyingSymbol,
    strikePriceUnits: raw.strikePriceUnits,
    optionType: raw.optionType,
    optionExerciseStyle: raw.optionExerciseStyle,
    settlementMethod: raw.settlementMethod,
  }
}

export function mapCandle(raw: ApiCandle): Candle {
  return {
    time: raw.openTime,
    open: numeric(raw.openPrice) ?? 0,
    high: numeric(raw.highPrice) ?? 0,
    low: numeric(raw.lowPrice) ?? 0,
    close: numeric(raw.closePrice) ?? 0,
  }
}

export function mapBalance(raw: ApiBalance): Balance {
  return {
    asset: raw.asset,
    available: numeric(raw.free) ?? scaled(raw.availableUnits, 100_000_000) ?? 0,
    locked: numeric(raw.locked) ?? scaled(raw.lockedUnits, 100_000_000) ?? 0,
    estimatedUsd: null,
  }
}

function numeric(value: string | number | undefined): number | null {
  if (value === undefined) return null
  const result = typeof value === "number" ? value : Number(value)
  return Number.isFinite(result) ? result : null
}

function scaled(value: number | undefined, divisor: number): number | null {
  return value === undefined ? null : value / divisor
}

function splitSymbol(symbol: string, base?: string, quote?: string): [string, string] {
  if (base && quote) return [base, quote]
  const normalized = symbol.replace("/", "_").split("_")
  if (normalized.length === 2) return [normalized[0] ?? symbol, normalized[1] ?? ""]
  for (const candidate of ["USDT", "USDC", "USD", "BTC"]) {
    if (symbol.endsWith(candidate)) return [symbol.slice(0, -candidate.length), candidate]
  }
  return [symbol, ""]
}

function normalizeProductLine(
  productLine?: string,
  contractType?: string,
): ProductLine | "UNKNOWN" {
  const value = `${productLine ?? ""} ${contractType ?? ""}`.toUpperCase()
  if (value.includes(PRODUCT_LINES.spot)) return PRODUCT_LINES.spot
  if (value.includes("INVERSE") && value.includes("DELIVERY")) return PRODUCT_LINES.coinMDelivery
  if (value.includes("LINEAR") && value.includes("DELIVERY")) return PRODUCT_LINES.usdMDelivery
  if (value.includes("INVERSE")) return PRODUCT_LINES.coinMPerpetual
  if (value.includes("OPTION")) return PRODUCT_LINES.option
  if (value.includes("PERPETUAL") || value.includes("LINEAR")) return PRODUCT_LINES.usdMPerpetual
  return "UNKNOWN"
}
