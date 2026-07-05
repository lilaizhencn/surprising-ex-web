export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";
export type TimeInForce = "GTC" | "IOC" | "FOK" | "GTX";
export type MarginMode = "CROSS" | "ISOLATED";
export type PositionMode = "ONE_WAY" | "HEDGE";
export type PositionSide = "NET" | "LONG" | "SHORT";
export type TriggerOrderType = "TAKE_PROFIT" | "STOP_LOSS" | "TRAILING_STOP";
export type TriggerPriceType = "MARK_PRICE" | "INDEX_PRICE" | "LAST_PRICE";
export type AlgoOrderType = "TWAP" | "ICEBERG";
export type AlgoOrderStatus = "PENDING" | "RUNNING" | "CANCEL_REQUESTED" | "CANCELED" | "COMPLETED" | "FAILED";
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

export interface ExecutionReport {
  reportType: "ORDER_EVENT" | "MATCH_RESULT" | "TRADE" | string;
  userId: number;
  symbol: string;
  orderId?: number | null;
  commandId?: number | null;
  tradeId?: number | null;
  counterpartyOrderId?: number | null;
  counterpartyUserId?: number | null;
  instrumentVersion?: number | null;
  orderEventType?: string | null;
  commandType?: string | null;
  orderStatus?: string | null;
  resultCode?: string | null;
  liquidityRole?: "TAKER" | "MAKER" | string | null;
  side?: OrderSide | string | null;
  marginMode?: MarginMode | string | null;
  positionSide?: PositionSide | string | null;
  priceTicks?: number | null;
  quantitySteps?: number | null;
  filledQuantitySteps?: number | null;
  orderCompleted?: boolean | null;
  reason?: string | null;
  traceId?: string | null;
  eventTime?: string | null;
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

export interface AlgoOrder {
  algoOrderId: number;
  clientAlgoOrderId?: string | null;
  symbol: string;
  algoType: AlgoOrderType;
  side: OrderSide;
  priceTicks: number;
  quantitySteps: number;
  childQuantitySteps: number;
  intervalSeconds: number;
  durationSeconds: number;
  marginMode: MarginMode;
  positionSide?: PositionSide;
  reduceOnly: boolean;
  postOnly: boolean;
  timeInForce: TimeInForce;
  status: AlgoOrderStatus;
  executedQuantitySteps: number;
  activeQuantitySteps: number;
  childOrderCount: number;
  currentOrderId?: number | null;
  rejectReason?: string | null;
  startAt?: string | null;
  nextSliceAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}

export interface PlaceAlgoOrderDraft {
  symbol: string;
  algoType: AlgoOrderType;
  side: OrderSide;
  priceTicks: number;
  quantitySteps: number;
  childQuantitySteps: number;
  intervalSeconds: number;
  durationSeconds: number;
  marginMode: MarginMode;
  positionSide?: PositionSide;
  reduceOnly: boolean;
  postOnly: boolean;
  timeInForce?: TimeInForce;
}

export interface AlgoOrderBatchItem {
  index: number;
  success: boolean;
  message: string;
  algoOrder?: AlgoOrder | null;
}

export interface AlgoOrderBatchResponse {
  requested: number;
  completed: number;
  failed: number;
  results: AlgoOrderBatchItem[];
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

export interface AmendOrderDraft {
  orderId: number;
  newClientOrderId?: string;
  priceTicks?: number;
  quantitySteps?: number;
  timeInForce?: TimeInForce;
  postOnly?: boolean;
}

export interface TestOrderResult {
  accepted: boolean;
  rejectReason?: string | null;
  instrumentVersion: number;
  validationStage: string;
  accountType?: ProductAccountType | string | null;
  asset?: string | null;
  estimatedReserveUnits: number;
}

export interface OrderBatchItem {
  index: number;
  success: boolean;
  message: string;
  order?: OpenOrder | null;
}

export interface OrderBatchResponse {
  requested: number;
  completed: number;
  failed: number;
  results: OrderBatchItem[];
}

export interface CancelAllAfterResponse {
  userId: number;
  symbol?: string | null;
  countdownMs: number;
  active: boolean;
  triggerAt?: string | null;
  updatedAt?: string | null;
  canceledOrders: number;
  canceledTriggerOrders: number;
}

export interface AmendOrderResponse {
  originalOrder: OpenOrder;
  replacementOrder: OpenOrder;
  cancelRequested: boolean;
  message: string;
}

export interface AmendOrderBatchItem {
  index: number;
  success: boolean;
  message: string;
  amend?: AmendOrderResponse | null;
}

export interface AmendOrderBatchResponse {
  requested: number;
  completed: number;
  failed: number;
  results: AmendOrderBatchItem[];
}

export interface OpenTriggerOrder {
  triggerOrderId: number;
  clientTriggerOrderId?: string | null;
  ocoGroupId?: string | null;
  symbol: string;
  side: OrderSide;
  triggerType: TriggerOrderType;
  triggerPriceType: TriggerPriceType;
  triggerCondition?: string;
  triggerPriceTicks: number;
  activationPriceTicks?: number | null;
  callbackRatePpm?: number | null;
  highestPriceTicks?: number | null;
  lowestPriceTicks?: number | null;
  activatedAt?: string | null;
  orderType: OrderType;
  timeInForce: TimeInForce;
  priceTicks: number;
  quantitySteps: number;
  marginMode: MarginMode;
  positionSide?: PositionSide;
  status: string;
  placedOrderId?: number | null;
  triggeredPriceTicks?: number | null;
  rejectReason?: string | null;
  createdAt?: string;
}

export interface PlaceTriggerOrderDraft {
  symbol: string;
  side: OrderSide;
  triggerType: TriggerOrderType;
  triggerPriceType: TriggerPriceType;
  triggerPriceTicks: number;
  activationPriceTicks?: number;
  callbackRatePpm?: number;
  orderType: OrderType;
  timeInForce: TimeInForce;
  priceTicks: number;
  quantitySteps: number;
  marginMode: MarginMode;
  positionSide?: PositionSide;
  ocoGroupId?: string;
}

export interface TriggerOrderBatchItem {
  index: number;
  success: boolean;
  message: string;
  order?: OpenTriggerOrder | null;
}

export interface TriggerOrderBatchResponse {
  requested: number;
  completed: number;
  failed: number;
  results: TriggerOrderBatchItem[];
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
