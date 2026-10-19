import { z } from "zod"
import type { Market } from "../types/domain"
import { request } from "./client"

const numeric = z
  .union([z.number().finite(), z.string().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/)])
  .transform(Number)
  .refine(Number.isFinite)
const positive = numeric.refine((value) => value > 0)
export const OptionReferenceSchema = z.object({
  productLine: z.literal("OPTION"),
  instrumentId: z.string(),
  underlyingInstrumentId: z.string(),
  underlyingProductLine: z.string(),
  optionType: z.enum(["CALL", "PUT"]),
  expiryTime: z.string(),
  strikePriceUnits: z.string().regex(/^[1-9]\d*$/),
  strikePrice: positive,
  baseAsset: z.string(),
  quoteAsset: z.string(),
  premiumPrice: positive,
  underlyingIndexPrice: positive,
  sameExpiryForwardPrice: positive,
  intrinsicValue: numeric.refine((value) => value >= 0),
  asOf: z.string(),
  validUntil: z.string(),
  sourcePriceSequence: z.string().regex(/^[1-9]\d*$/),
  model: z.literal("BLACK_76_ZERO_RATE_ACT_365"),
  discountFactor: z.literal(1),
  unit: z.literal("PER_UNDERLYING_UNIT"),
  greeks: z
    .object({
      impliedVolatility: positive,
      forwardDelta: z.number().finite().min(-1).max(1),
      forwardGamma: z.number().finite().nonnegative(),
      vegaPerVolPoint: z.number().finite().nonnegative(),
      thetaPerDay: z.number().finite().nonpositive(),
    })
    .nullable(),
})
export type OptionReference = z.infer<typeof OptionReferenceSchema>

export function canQueryOptionReference(market: Market, now = Date.now()) {
  return (
    market.productLine === "OPTION" &&
    ["PRE_TRADING", "TRADING", "HALT", "SETTLING"].includes(market.status ?? "") &&
    Date.parse(market.expiryTime ?? "") > now
  )
}

export function freshOptionReference(
  quote: OptionReference | null,
  market: Market,
  now = Date.now(),
): quote is OptionReference {
  if (!quote || !canQueryOptionReference(market, now)) return false
  const source = Date.parse(quote.asOf),
    until = Date.parse(quote.validUntil),
    expiry = Date.parse(quote.expiryTime)
  return (
    Number.isFinite(source) &&
    Number.isFinite(until) &&
    Number.isFinite(expiry) &&
    source <= now &&
    now < until &&
    until <= source + 5000 &&
    until <= expiry &&
    expiry === Date.parse(market.expiryTime ?? "") &&
    quote.instrumentId === market.instrumentId &&
    quote.underlyingInstrumentId === market.underlyingInstrumentId &&
    quote.underlyingProductLine === market.underlyingProductLine &&
    quote.strikePriceUnits === market.strikePriceUnits &&
    quote.optionType === market.optionType &&
    quote.baseAsset === market.baseAsset &&
    quote.quoteAsset === market.quoteAsset
  )
}

export async function loadOptionReference(
  market: Market,
  signal?: AbortSignal,
): Promise<OptionReference> {
  if (market.productLine !== "OPTION") throw new Error("Option product is required")
  const quote = await request(
    `/api/v1/gateway/candlestick/options/quote?instrumentId=${encodeURIComponent(market.instrumentId)}`,
    OptionReferenceSchema,
    { productLine: "OPTION", retry: 0, ...(signal ? { signal } : {}) },
  )
  if (!freshOptionReference(quote, market))
    throw new Error("Option reference is stale or does not match the contract")
  return quote
}
