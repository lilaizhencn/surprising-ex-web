import { z } from "zod"

const NumericSchema = z.union([z.string(), z.number()])

export const UserSchema = z
  .object({
    userId: z.union([z.string(), z.number()]),
    email: z.string().optional(),
  })
  .passthrough()

export const AuthSessionSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.string().optional(),
    user: UserSchema,
  })
  .passthrough()

export const MarketSchema = z
  .object({
    symbol: z.string(),
    baseAsset: z.string().optional(),
    quoteAsset: z.string().optional(),
    contractType: z.string().optional(),
    productLine: z.string().optional(),
    lastPrice: NumericSchema.optional(),
    lastPriceTicks: z.number().optional(),
    change24h: NumericSchema.optional(),
    change24hPpm: z.number().optional(),
    volume24h: NumericSchema.optional(),
    volume24hUnits: z.number().optional(),
    high24h: NumericSchema.optional(),
    low24h: NumericSchema.optional(),
    priceTickUnits: z.number().optional(),
    quantityStepUnits: z.number().optional(),
    pricePrecision: z.number().optional(),
    quantityPrecision: z.number().optional(),
    maxLeverage: z.number().optional(),
    fundingRate: NumericSchema.optional(),
    nextFundingTime: z.string().optional(),
  })
  .passthrough()

export const MarketListSchema = z
  .object({
    instruments: z.array(MarketSchema).optional(),
    items: z.array(MarketSchema).optional(),
  })
  .passthrough()

export const CandleSchema = z
  .object({
    openTime: z.string(),
    openPrice: NumericSchema,
    highPrice: NumericSchema,
    lowPrice: NumericSchema,
    closePrice: NumericSchema,
    baseVolume: NumericSchema.optional(),
  })
  .passthrough()

export const CandleListSchema = z
  .object({
    candles: z.array(CandleSchema).optional(),
    items: z.array(CandleSchema).optional(),
  })
  .passthrough()

export const BalanceSchema = z
  .object({
    asset: z.string(),
    availableUnits: z.number().optional(),
    lockedUnits: z.number().optional(),
    free: NumericSchema.optional(),
    locked: NumericSchema.optional(),
  })
  .passthrough()

export const BalanceListSchema = z
  .object({
    balances: z.array(BalanceSchema).optional(),
    items: z.array(BalanceSchema).optional(),
  })
  .passthrough()

export const GenericObjectSchema = z.record(z.string(), z.unknown())

export type AuthSession = z.infer<typeof AuthSessionSchema>
export type ApiMarket = z.infer<typeof MarketSchema>
export type ApiCandle = z.infer<typeof CandleSchema>
export type ApiBalance = z.infer<typeof BalanceSchema>
