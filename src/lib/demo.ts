import type { Balance, Market } from "../types/domain"

export const demoMarkets: readonly Market[] = [
  {
    symbol: "BTC/USDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    productLine: "SPOT",
    price: 64230.5,
    change24h: 2.45,
    volume24h: 1_200_000_000,
    high24h: 65000,
    low24h: 62000,
    pricePrecision: 2,
    quantityPrecision: 6,
    maxLeverage: null,
  },
  {
    symbol: "ETH/USDT",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    productLine: "SPOT",
    price: 3450.2,
    change24h: -0.85,
    volume24h: 850_000_000,
    high24h: 3500,
    low24h: 3300,
    pricePrecision: 2,
    quantityPrecision: 5,
    maxLeverage: null,
  },
  {
    symbol: "SOL/USDT",
    baseAsset: "SOL",
    quoteAsset: "USDT",
    productLine: "SPOT",
    price: 145.8,
    change24h: 5.12,
    volume24h: 420_000_000,
    high24h: 150,
    low24h: 138,
    pricePrecision: 2,
    quantityPrecision: 3,
    maxLeverage: null,
  },
  {
    symbol: "XRP/USDT",
    baseAsset: "XRP",
    quoteAsset: "USDT",
    productLine: "SPOT",
    price: 0.584,
    change24h: 0,
    volume24h: 150_000_000,
    high24h: 0.6,
    low24h: 0.55,
    pricePrecision: 4,
    quantityPrecision: 2,
    maxLeverage: null,
  },
]

export const demoBalances: readonly Balance[] = [
  { asset: "USDT", available: 56_039.8, locked: 0, estimatedUsd: 56_039.8 },
  { asset: "BTC", available: 0.82, locked: 0.04, estimatedUsd: 52_689.01 },
  { asset: "ETH", available: 4.7, locked: 0, estimatedUsd: 16_215.94 },
]

export const demoTrend = [38, 42, 39, 48, 45, 56, 52, 65, 61, 73]
