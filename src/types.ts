export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";
export type TimeInForce = "GTC" | "IOC" | "FOK" | "GTX";
export type MarginMode = "CROSS" | "ISOLATED";
export type PositionMode = "ONE_WAY" | "HEDGE";
export type PositionSide = "NET" | "LONG" | "SHORT";
export type ConnectionState = "live" | "degraded" | "offline";
export type ProductMode = "linear" | "inverse" | "spot";
export type ProductAccountType = "USDT_PERPETUAL" | "COIN_PERPETUAL" | "SPOT";
export type InstrumentType = "SPOT" | "PERPETUAL";
export type ContractType = "SPOT" | "LINEAR" | "INVERSE" | "LINEAR_PERPETUAL" | "INVERSE_PERPETUAL";

export interface AuthUser {
  userId: number;
  username: string;
  email?: string | null;
  status: string;
  roles: string[];
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  settleAsset?: string;
  displayName: string;
  version?: number;
  instrumentType?: InstrumentType | string;
  contractType?: ContractType | string;
  contractMultiplierPpm?: number;
  contractValueAsset?: string;
  priceTickUnits?: number;
  quantityStepUnits?: number;
  minQuantitySteps?: number;
  maxQuantitySteps?: number;
  minNotionalUnits?: number;
  maxNotionalUnits?: number;
  notionalMultiplierUnits?: number;
  pricePrecision?: number;
  quantityPrecision?: number;
  supportedOrderTypes?: string[];
  supportedTimeInForce?: string[];
  postOnlyEnabled?: boolean;
  reduceOnlyEnabled?: boolean;
  marketOrderEnabled?: boolean;
  maxLeveragePpm?: number;
  initialMarginRatePpm?: number;
  maintenanceMarginRatePpm?: number;
  makerFeeRatePpm?: number;
  takerFeeRatePpm?: number;
  maxPositionNotionalUnits?: number;
  userOpenInterestLimitRatePpm?: number;
  userOpenInterestLimitFloorUnits?: number;
  fundingIntervalHours?: number;
  fundingRateCapPpm?: number;
  fundingRateFloorPpm?: number;
  nextFundingTime?: string;
  timeUntilFundingSeconds?: number;
  impactNotionalUnits?: number;
  minValidIndexSources?: number;
  status?: string;
  riskLimitBrackets?: RiskLimitBracket[];
  indexSources?: IndexSourceConfig[];
  lastPriceTicks: number;
  markPriceTicks: number;
  indexPriceTicks: number;
  change24hPpm: number;
  fundingRatePpm: number;
  volume24hUnits: number;
  maxLeverage: number;
}

export interface RiskLimitBracket {
  bracketNo?: number;
  notionalFloorUnits?: number;
  notionalCapUnits?: number;
  maintenanceMarginRatePpm?: number;
  initialMarginRatePpm?: number;
  maxLeveragePpm?: number;
}

export interface IndexSourceConfig {
  exchangeCode?: string;
  sourceSymbol?: string;
  sourceQuoteAsset?: string;
  weightPpm?: number;
  enabled?: boolean;
}

export interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookLevel {
  priceTicks: number;
  quantitySteps: number;
  orderCount: number;
  totalSteps: number;
}

export interface TradePrint {
  id: string;
  symbol: string;
  side: OrderSide;
  priceTicks: number;
  quantitySteps: number;
  time: string;
}

export interface TradeRecord extends TradePrint {
  role: "TAKER" | "MAKER" | "PUBLIC";
  orderId?: number;
  traceId?: string;
}

export interface Balance {
  accountType?: ProductAccountType | "FUNDING" | string;
  asset: string;
  availableUnits: number;
  lockedUnits: number;
  equityUnits: number;
}

export interface Position {
  symbol: string;
  marginMode: MarginMode;
  positionSide?: PositionSide;
  signedQuantitySteps: number;
  entryPriceTicks: number;
  markPriceTicks: number;
  unrealizedPnlUnits: number;
  maintenanceMarginUnits: number;
  marginRatioPpm: number;
  status: string;
}

export interface OpenOrder {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  timeInForce: TimeInForce;
  priceTicks: number;
  quantitySteps: number;
  executedQuantitySteps: number;
  remainingQuantitySteps: number;
  marginMode: MarginMode;
  positionSide?: PositionSide;
  reduceOnly: boolean;
  postOnly: boolean;
  status: string;
  createdAt?: string;
}

export interface PlaceOrderDraft {
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  timeInForce: TimeInForce;
  priceTicks: number;
  quantitySteps: number;
  marginMode: MarginMode;
  positionSide?: PositionSide;
  reduceOnly: boolean;
  postOnly: boolean;
}

export interface WsEnvelope<T = unknown> {
  op?: string;
  type?: string;
  id?: string;
  channel?: string;
  symbol?: string;
  period?: string;
  userId?: number;
  data?: T;
  error?: string;
  eventTime?: string;
}
