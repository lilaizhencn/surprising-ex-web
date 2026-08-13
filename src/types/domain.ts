export const PRODUCT_LINES = {
  spot: "SPOT",
  usdMPerpetual: "LINEAR_PERPETUAL",
  coinMPerpetual: "INVERSE_PERPETUAL",
  usdMDelivery: "LINEAR_DELIVERY",
  coinMDelivery: "INVERSE_DELIVERY",
  option: "OPTION",
} as const

export type ProductLine = (typeof PRODUCT_LINES)[keyof typeof PRODUCT_LINES]

export type Market = {
  readonly symbol: string
  readonly baseAsset: string
  readonly quoteAsset: string
  readonly settleAsset?: string
  readonly productLine: ProductLine | "UNKNOWN"
  readonly price: number | null
  readonly change24h: number | null
  readonly volume24h: number | null
  readonly high24h: number | null
  readonly low24h: number | null
  readonly pricePrecision: number
  readonly quantityPrecision: number
  readonly priceTickUnits?: string | undefined
  readonly quantityStepUnits?: string | undefined
  readonly maxLeverage: number | null
  readonly instrumentType?: string | undefined
  readonly contractValueAsset?: string | undefined
  readonly contractMultiplierPpm?: number | undefined
  readonly initialMarginRatePpm?: number | undefined
  readonly maintenanceMarginRatePpm?: number | undefined
  readonly makerFeeRatePpm?: number | undefined
  readonly takerFeeRatePpm?: number | undefined
  readonly fundingIntervalHours?: number | undefined
  readonly expiryTime?: string | null | undefined
  readonly deliveryTime?: string | null | undefined
  readonly underlyingSymbol?: string | null | undefined
  readonly strikePriceUnits?: string | null | undefined
  readonly optionType?: string | null | undefined
  readonly optionExerciseStyle?: string | null | undefined
  readonly settlementMethod?: string | null | undefined
}

export type Candle = {
  readonly time: string
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
}

export type Balance = {
  readonly asset: string
  readonly accountType?: string
  readonly available: number | null
  readonly locked: number | null
  readonly estimatedUsd: number | null
}

export type ApiState<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: T; readonly stale: boolean }
  | { readonly kind: "error"; readonly message: string; readonly retry: () => void }
  | { readonly kind: "empty"; readonly retry: () => void }

export type OrderSide = "BUY" | "SELL"
export type OrderType = "LIMIT" | "MARKET" | "STOP"
