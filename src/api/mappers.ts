import { signedUnitsToDecimal } from "../lib/units"
import type { Balance, Candle, Market, ProductLine } from "../types/domain"
import { PRODUCT_LINES } from "../types/domain"
import type { ApiBalance, ApiCandle, ApiMarket } from "./types"

export function mapMarket(raw: ApiMarket): Market {
  if (!raw.baseAsset || !raw.quoteAsset) throw new Error("Instrument asset metadata is missing")
  const { baseAsset, quoteAsset } = raw
  return {
    instrumentId: raw.instrumentId,
    changeId: raw.changeId,
    status: raw.status,
    symbol: raw.symbol,
    baseAsset,
    quoteAsset,
    settleAsset: raw.settleAsset ?? quoteAsset,
    productLine: normalizeProductLine(raw.productLine, raw.contractType, raw.instrumentType),
    price: positiveNumeric(raw.lastPrice),
    change24h: numeric(raw.change24h) ?? scaled(raw.change24hPpm, 10_000),
    volume24h: numeric(raw.volume24h),
    quoteVolume24h: numeric(raw.quoteVolume24h),
    high24h: positiveNumeric(raw.high24h),
    low24h: positiveNumeric(raw.low24h),
    trend: raw.trend ?? [],
    pricePrecision: raw.pricePrecision ?? 2,
    quantityPrecision: raw.quantityPrecision ?? 6,
    notionalMultiplierUnits: raw.notionalMultiplierUnits,
    minQuantitySteps: raw.minQuantitySteps,
    maxQuantitySteps: raw.maxQuantitySteps,
    minNotionalUnits: raw.minNotionalUnits,
    maxNotionalUnits: raw.maxNotionalUnits,
    maxPositionNotionalUnits: raw.maxPositionNotionalUnits,
    userOpenInterestLimitFloorUnits: raw.userOpenInterestLimitFloorUnits,
    priceTickUnits: integerScale(raw.priceTickUnits),
    quantityStepUnits: integerScale(raw.quantityStepUnits),
    maxLeverage: positiveScaled(raw.maxLeveragePpm, 1_000_000),
    instrumentType: raw.instrumentType,
    contractValueAsset: raw.contractValueAsset,
    contractMultiplierPpm: numeric(raw.contractMultiplierPpm) ?? undefined,
    initialMarginRatePpm: numeric(raw.initialMarginRatePpm) ?? undefined,
    maintenanceMarginRatePpm: numeric(raw.maintenanceMarginRatePpm) ?? undefined,
    makerFeeRatePpm: numeric(raw.makerFeeRatePpm) ?? undefined,
    takerFeeRatePpm: numeric(raw.takerFeeRatePpm) ?? undefined,
    fundingIntervalHours: raw.fundingIntervalHours,
    expiryTime: raw.expiryTime,
    deliveryTime: raw.deliveryTime,
    underlyingInstrumentId: raw.underlyingInstrumentId,
    underlyingProductLine: raw.underlyingProductLine,
    strikePriceUnits: raw.strikePriceUnits === undefined ? undefined : String(raw.strikePriceUnits),
    optionType: raw.optionType,
    optionExerciseStyle: raw.optionExerciseStyle,
    settlementMethod: raw.settlementMethod,
  }
}

export function mapCandle(raw: ApiCandle): Candle {
  const updatedAt = raw.updatedAt ?? raw.eventTime
  return {
    time: new Date(raw.openTime).toISOString(),
    open: numeric(raw.openPrice) ?? 0,
    high: numeric(raw.highPrice) ?? 0,
    low: numeric(raw.lowPrice) ?? 0,
    close: numeric(raw.closePrice) ?? 0,
    volume: numeric(raw.baseVolume) ?? 0,
    ...(updatedAt ? { updatedAt } : {}),
  }
}

export function mapBalance(
  raw: ApiBalance,
  assetScales: Readonly<Record<string, string>> = {},
): Balance {
  const accountType = typeof raw.accountType === "string" ? raw.accountType : undefined
  const scale = assetScales[raw.asset]
  const availableUnits =
    raw.availableUnits !== undefined && scale
      ? numeric(signedUnitsToDecimal(raw.availableUnits, scale))
      : null
  const lockedUnits =
    raw.lockedUnits !== undefined && scale
      ? numeric(signedUnitsToDecimal(raw.lockedUnits, scale))
      : null
  return {
    asset: raw.asset,
    available: availableUnits ?? numeric(raw.free),
    locked: lockedUnits ?? numeric(raw.locked),
    estimatedUsd: null,
    ...(raw.availableUnits !== undefined ? { availableUnits: String(raw.availableUnits) } : {}),
    ...(raw.lockedUnits !== undefined ? { lockedUnits: String(raw.lockedUnits) } : {}),
    ...(scale ? { scaleUnits: scale } : {}),
    ...(accountType ? { accountType } : {}),
  }
}

function numeric(value: string | number | undefined): number | null {
  if (value === undefined) return null
  const result = typeof value === "number" ? value : Number(value)
  return Number.isFinite(result) ? result : null
}

function scaled(value: string | number | undefined, divisor: number): number | null {
  const numericValue = numeric(value)
  return numericValue === null ? null : numericValue / divisor
}

function positiveNumeric(value: string | number | undefined): number | null {
  const result = numeric(value)
  return result !== null && result > 0 ? result : null
}

function positiveScaled(value: string | number | undefined, divisor: number): number | null {
  const result = scaled(value, divisor)
  return result !== null && result > 0 ? result : null
}

function integerScale(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = String(value)
  return /^\d+$/.test(normalized) && normalized !== "0" ? normalized : undefined
}

/** Only the backend ContractType identifies the product; InstrumentType is a category. */
function normalizeProductLine(
  productLine?: string,
  contractType?: string,
  instrumentType?: string,
): ProductLine | "UNKNOWN" {
  let line: ProductLine
  let category: "SPOT" | "PERPETUAL" | "DELIVERY" | "OPTION"
  switch (contractType) {
    case "SPOT":
      line = PRODUCT_LINES.spot
      category = "SPOT"
      break
    case "LINEAR_PERPETUAL":
    case "INVERSE_PERPETUAL":
      line = contractType
      category = "PERPETUAL"
      break
    case "LINEAR_DELIVERY":
    case "INVERSE_DELIVERY":
      line = contractType
      category = "DELIVERY"
      break
    case "VANILLA_OPTION":
      line = PRODUCT_LINES.option
      category = "OPTION"
      break
    default:
      return "UNKNOWN"
  }
  if (productLine !== undefined && productLine !== line) return "UNKNOWN"
  if (instrumentType !== undefined && instrumentType !== category) return "UNKNOWN"
  return line
}
