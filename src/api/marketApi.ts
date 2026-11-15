import { z } from "zod"
import type { ProductLine } from "../types/domain"
import { request } from "./client"
import type { ApiCandle, ApiFundingPayment, ApiFundingRate, ApiMarket } from "./types"
import {
  AssetScalesSchema,
  CandleListSchema,
  ExchangeRateConvertSchema,
  FundingPaymentPageSchema,
  FundingRatePageSchema,
  FundingRateSchema,
  GenericObjectSchema,
  MarketListSchema,
  MarketSchema,
} from "./types"

export async function loadRuntimeProducts(signal?: AbortSignal): Promise<readonly ProductLine[]> {
  const result = await request(
    "/api/v1/runtime",
    z.object({
      productLines: z
        .array(
          z.enum([
            "SPOT",
            "LINEAR_PERPETUAL",
            "INVERSE_PERPETUAL",
            "LINEAR_DELIVERY",
            "INVERSE_DELIVERY",
            "OPTION",
          ]),
        )
        .min(1),
    }),
    signal ? { signal } : {},
  )
  return result.productLines
}

/** Same UserReadView contract as the private WebSocket snapshot. */

export function loadMarket(instrumentId: string, productLine: ProductLine): Promise<ApiMarket> {
  const query = new URLSearchParams({ instrumentId, productLine })
  return request(`/api/v1/instruments/latest?${query}`, MarketSchema, { productLine })
}

export async function loadMarkets(
  productLine?: ProductLine,
  signal?: AbortSignal,
  includeMarketSummary = false,
  includeTrend = false,
): Promise<readonly ApiMarket[]> {
  const query = new URLSearchParams()
  if (productLine) query.set("productLine", productLine)
  if (includeMarketSummary) query.set("includeMarketSummary", "true")
  if (includeTrend) query.set("includeTrend", "true")
  const response = await request(`/api/v1/instruments/list?${query.toString()}`, MarketListSchema, {
    ...(productLine ? { productLine } : {}),
    ...(signal ? { signal } : {}),
  })
  return response.instruments ?? response.items ?? []
}

export function loadFundingRate(
  instrumentId: string,
  productLine: ProductLine,
  signal?: AbortSignal,
): Promise<ApiFundingRate> {
  const query = new URLSearchParams({ instrumentId })
  return request(`/api/v1/funding/rates/latest?${query.toString()}`, FundingRateSchema, {
    productLine,
    ...(signal ? { signal } : {}),
  })
}

export function loadUsdValuation(amount: string, asset: string, signal?: AbortSignal) {
  const query = new URLSearchParams({
    amount,
    fromCurrency: asset,
    toCurrency: "USD",
  })
  return request(`/api/v1/price/fx/convert?${query.toString()}`, ExchangeRateConvertSchema, {
    ...(signal ? { signal } : {}),
  })
}

export async function loadFundingRateHistory(instrumentId: string, productLine: ProductLine) {
  const query = new URLSearchParams({ instrumentId, limit: "100" })
  const response = await request(
    `/api/v1/funding/rates/history?${query.toString()}`,
    FundingRatePageSchema,
    { productLine },
  )
  return response.rates
}

export async function loadFundingPayments(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
): Promise<readonly ApiFundingPayment[]> {
  return (await loadFundingPaymentsPage(userId, instrumentId, productLine)).payments
}

export async function loadFundingPaymentsPage(
  userId: string | number,
  instrumentId: string,
  productLine: ProductLine,
  cursor?: string,
) {
  const query = new URLSearchParams({ userId: String(userId), instrumentId, limit: "100" })
  if (cursor) query.set("cursor", cursor)
  return request(`/api/v1/funding/payments?${query.toString()}`, FundingPaymentPageSchema, {
    productLine,
  })
}

export async function loadCandles(
  instrumentId: string,
  period: string,
  productLine?: ProductLine,
  signal?: AbortSignal,
): Promise<readonly ApiCandle[]> {
  const query = new URLSearchParams({ instrumentId, period, limit: "120" })
  const range = candleRange(period, new Date(), 120)
  query.set("startTime", range.startTime)
  query.set("endTime", range.endTime)
  const response = await request(
    `/api/v1/candlestick/candles?${query.toString()}`,
    CandleListSchema,
    { ...(productLine ? { productLine } : {}), ...(signal ? { signal } : {}), retry: 0 },
  )
  return response.candles ?? response.items ?? []
}

/** Fixed minute-resolution rolling-day history, independent of the chart selection. */

export async function loadDayWindow(
  instrumentId: string,
  productLine: ProductLine,
  signal?: AbortSignal,
) {
  const now = Date.now()
  const start = Math.floor(now / 60_000) * 60_000 - 86_400_000
  const query = new URLSearchParams({
    instrumentId,
    period: "1m",
    limit: "1441",
    startTime: new Date(start).toISOString(),
    endTime: new Date(now).toISOString(),
  })
  const response = await request(
    `/api/v1/candlestick/candles?${query.toString()}`,
    CandleListSchema,
    { productLine, retry: 0, ...(signal ? { signal } : {}) },
  )
  return response.candles ?? response.items ?? []
}

export async function loadRecentTrades(
  instrumentId: string,
  productLine: ProductLine,
  limit = 50,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ instrumentId, limit: String(limit) })
  const response = await request(
    `/api/v1/candlestick/trades/recent?${query.toString()}`,
    z.object({ trades: z.array(GenericObjectSchema) }),
    { productLine, ...(signal ? { signal } : {}) },
  )
  return response.trades
}

export function candleRange(
  period: string,
  end: Date,
  limit: number,
): Readonly<{ startTime: string; endTime: string }> {
  const periodMilliseconds = periodMillisecondsFor(period)
  const endTime = end.getTime()
  return {
    startTime: new Date(endTime - periodMilliseconds * limit).toISOString(),
    endTime: end.toISOString(),
  }
}

export function loadAssetScales(signal?: AbortSignal) {
  return request("/api/v1/instruments/asset-scales", AssetScalesSchema, {
    ...(signal ? { signal } : {}),
  })
}

function periodMillisecondsFor(period: string): number {
  const match = /^(\d+)(m|h|d)$/.exec(period)
  if (!match) return 60 * 60 * 1000
  const amount = Number(match[1])
  const unit = match[2]
  const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000
  return amount * multiplier
}
