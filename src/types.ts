export type Side = "buy" | "sell";
export type OrderType = "LIMIT" | "MARKET" | "POST_ONLY";
export type TimeInForce = "GTC" | "IOC" | "FOK";

export interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  displayName: string;
  lastPrice: number;
  change24h: number;
  volume24h: number;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFunding: string;
  openInterest: number;
  maxLeverage: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface TradePrint {
  id: string;
  price: number;
  quantity: number;
  side: Side;
  time: string;
}

export interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  margin: number;
  pnl: number;
  roe: number;
  liquidationPrice: number;
}

export interface OpenOrder {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  price: number;
  size: number;
  filled: number;
  reduceOnly: boolean;
  status: "NEW" | "PARTIALLY_FILLED";
}

export interface Balance {
  asset: string;
  wallet: number;
  available: number;
  unrealizedPnl: number;
  maintenanceMargin: number;
}
