import { config } from "../config";
import { fallbackBalancesForAccount, fallbackBook, fallbackCandles, fallbackMarkets, fallbackOrders, fallbackPositions } from "../mockData";
import type {
  AlgoOrder,
  AlgoOrderBatchResponse,
  AmendOrderBatchResponse,
  AmendOrderDraft,
  AmendOrderResponse,
  AuthSession,
  Balance,
  CandlePoint,
  CancelAllAfterResponse,
  Market,
  OpenOrder,
  OpenTriggerOrder,
  OrderBatchResponse,
  OrderBookLevel,
  PlaceAlgoOrderDraft,
  PlaceOrderDraft,
  PlaceTriggerOrderDraft,
  Position,
  PositionMode,
  ProductAccountType,
  ProductLine,
  TestOrderResult,
  TriggerOrderBatchResponse
} from "../types";
import { gatewayPath, request } from "./client";

interface BackendInstrument {
  symbol: string;
  version?: number;
  instrumentType?: string;
  contractType?: string;
  baseAsset?: string;
  quoteAsset?: string;
  settleAsset?: string;
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
  maxLeverage?: number;
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
  expiryTime?: string | null;
  deliveryTime?: string | null;
  underlyingSymbol?: string | null;
  strikePriceUnits?: number | null;
  optionType?: string | null;
  optionExerciseStyle?: string | null;
  settlementMethod?: string | null;
  impactNotionalUnits?: number;
  minValidIndexSources?: number;
  status?: string;
  riskLimitBrackets?: Market["riskLimitBrackets"];
  indexSources?: Market["indexSources"];
}

interface BackendMarkPrice {
  symbol: string;
  markPrice?: string | number;
  markPriceUnits?: number;
  indexPrice?: string | number;
  indexPriceUnits?: number;
  fundingRate?: string | number;
  nextFundingTime?: string;
  timeUntilFundingSeconds?: number;
}

interface BackendCandle {
  openTime: string;
  openPrice: string | number;
  highPrice: string | number;
  lowPrice: string | number;
  closePrice: string | number;
  baseVolume: string | number;
}

interface BackendOrderBookLevel {
  priceTicks: number;
  quantitySteps: number;
  orderCount: number;
}

export async function register(username: string, password: string): Promise<AuthSession> {
  return request<AuthSession>(`${config.authPrefix}/register`, {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function login(username: string, password: string): Promise<AuthSession> {
  return request<AuthSession>(`${config.authPrefix}/login`, {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function refresh(refreshToken: string): Promise<AuthSession> {
  return request<AuthSession>(`${config.authPrefix}/refresh`, {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
}

export async function loadMarkets(): Promise<Market[]> {
  try {
    const response = await request<{ instruments?: BackendInstrument[]; items?: BackendInstrument[] }>(
      gatewayPath("instrument", "/list?status=TRADING")
    );
    const instruments = response.instruments ?? response.items ?? [];
    if (!instruments.length) return fallbackMarkets;
    return instruments.map(toMarket);
  } catch {
    return fallbackMarkets;
  }
}

export async function loadInstrumentConfig(symbol: string): Promise<Market> {
  try {
    const instrument = await request<BackendInstrument>(
      gatewayPath("instrument", `/latest?symbol=${encodeURIComponent(symbol)}`)
    );
    return toMarket(instrument);
  } catch {
    return fallbackMarkets.find((market) => market.symbol === symbol) ?? fallbackMarkets[0];
  }
}

export async function loadMarkPrice(
  symbol: string,
  market?: Pick<Market, "priceTickUnits">,
  productLine?: ProductLine
): Promise<Partial<Market> | null> {
  try {
    const response = await request<BackendMarkPrice>(
      gatewayPath("price-mark", `/latest?symbol=${encodeURIComponent(symbol)}`),
      { productLine }
    );
    const markPriceTicks = priceToTicks(response.markPrice, market)
      ?? priceUnitsToTicks(response.markPriceUnits, market);
    const indexPriceTicks = priceToTicks(response.indexPrice, market)
      ?? priceUnitsToTicks(response.indexPriceUnits, market);
    const fundingRatePpm = asRatePpm(response.fundingRate);
    return {
      ...(markPriceTicks !== undefined ? { markPriceTicks } : {}),
      ...(indexPriceTicks !== undefined ? { indexPriceTicks } : {}),
      ...(fundingRatePpm !== undefined ? { fundingRatePpm } : {}),
      ...(response.nextFundingTime ? { nextFundingTime: response.nextFundingTime } : {}),
      ...(typeof response.timeUntilFundingSeconds === "number" ? { timeUntilFundingSeconds: response.timeUntilFundingSeconds } : {})
    };
  } catch {
    return null;
  }
}

export async function loadCandles(symbol: string, period = "1m", productLine?: ProductLine): Promise<CandlePoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - periodToMilliseconds(period) * 240);
  try {
    const params = new URLSearchParams({
      symbol,
      period,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      limit: "240"
    });
    const response = await request<{ candles: BackendCandle[] }>(
      gatewayPath("candlestick", `/candles?${params}`),
      { productLine }
    );
    return response.candles.map(toCandlePoint).filter((item): item is CandlePoint => Boolean(item));
  } catch (error) {
    if (!config.enableMockFallback) {
      throw error instanceof Error ? error : new Error("K线后端不可用");
    }
    const seed = fallbackMarkets.find((market) => market.symbol === symbol)?.lastPriceTicks ?? 65000;
    return fallbackCandles(seed);
  }
}

function toCandlePoint(item: BackendCandle): CandlePoint | null {
  const time = Math.floor(new Date(item.openTime).getTime() / 1000);
  const open = Number(item.openPrice);
  const high = Number(item.highPrice);
  const low = Number(item.lowPrice);
  const close = Number(item.closePrice);
  const volume = Number(item.baseVolume);
  if (![time, open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) return null;
  return {
    time,
    open,
    high: Math.max(open, high, low, close),
    low: Math.min(open, high, low, close),
    close,
    volume: Number.isFinite(volume) && volume > 0 ? volume : 0
  };
}

function periodToMilliseconds(period: string): number {
  const match = /^(\d+)([mhdw])$/.exec(period);
  if (!match) return 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "m"
    ? 60 * 1000
    : unit === "h"
      ? 60 * 60 * 1000
      : unit === "d"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return Math.max(1, value) * multiplier;
}

export async function loadOrderBook(
  symbol: string,
  productLine?: ProductLine
): Promise<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] }> {
  try {
    const response = await request<{ bids: BackendOrderBookLevel[]; asks: BackendOrderBookLevel[] }>(
      gatewayPath("trading-market", `/orderbook?symbol=${encodeURIComponent(symbol)}&depth=40`),
      { productLine }
    );
    return {
      bids: withTotals(response.bids),
      asks: withTotals(response.asks)
    };
  } catch {
    const mid = fallbackMarkets.find((market) => market.symbol === symbol)?.lastPriceTicks ?? 65000;
    return fallbackBook(mid);
  }
}

export async function loadBalances(
  session: AuthSession,
  accountType: ProductAccountType = "USDT_PERPETUAL",
  productLine?: ProductLine
): Promise<Balance[]> {
  try {
    const params = new URLSearchParams({
      userId: String(session.user.userId),
      accountType
    });
    const response = await request<{ balances: Balance[] }>(
      gatewayPath("account", `/product-balances?${params}`),
      { productLine },
      session
    );
    return response.balances.map((balance) => ({ ...balance, accountType: balance.accountType ?? accountType }));
  } catch {
    return fallbackBalancesForAccount(accountType);
  }
}

export async function loadPositions(session: AuthSession, productLine?: ProductLine): Promise<Position[]> {
  try {
    const response = await request<{ positions: Position[] }>(
      gatewayPath("risk", `/positions/latest?userId=${session.user.userId}`),
      { productLine },
      session
    );
    return response.positions;
  } catch {
    return fallbackPositions;
  }
}

export async function loadPositionMode(session: AuthSession, productLine?: ProductLine): Promise<PositionMode> {
  try {
    const response = await request<{ positionMode?: PositionMode }>(
      gatewayPath("account", `/position-mode?userId=${session.user.userId}`),
      { productLine },
      session
    );
    return response.positionMode ?? "ONE_WAY";
  } catch {
    return "ONE_WAY";
  }
}

export async function updatePositionMode(
  session: AuthSession,
  positionMode: PositionMode,
  productLine?: ProductLine
): Promise<PositionMode> {
  const response = await request<{ positionMode?: PositionMode }>(
    gatewayPath("account", "/position-mode"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        positionMode
      })
    },
    session
  );
  return response.positionMode ?? positionMode;
}

export async function loadOpenOrders(
  session: AuthSession,
  symbol: string,
  productLine?: ProductLine
): Promise<OpenOrder[]> {
  try {
    const response = await request<{ orders?: OpenOrder[]; items?: OpenOrder[] }>(
      gatewayPath("trading", `/open?userId=${session.user.userId}&symbol=${encodeURIComponent(symbol)}&limit=100`),
      { productLine },
      session
    );
    return response.orders ?? response.items ?? [];
  } catch {
    return fallbackOrders.filter((order) => order.symbol === symbol);
  }
}

export async function loadOpenTriggerOrders(
  session: AuthSession,
  symbol: string,
  productLine?: ProductLine
): Promise<OpenTriggerOrder[]> {
  try {
    const response = await request<{ orders?: OpenTriggerOrder[]; items?: OpenTriggerOrder[] }>(
      gatewayPath("trading-trigger", `/open?userId=${session.user.userId}&symbol=${encodeURIComponent(symbol)}&limit=100`),
      { productLine },
      session
    );
    return response.orders ?? response.items ?? [];
  } catch {
    return [];
  }
}

export async function loadOpenAlgoOrders(
  session: AuthSession,
  symbol: string,
  productLine?: ProductLine
): Promise<AlgoOrder[]> {
  try {
    const response = await request<{ orders?: AlgoOrder[]; items?: AlgoOrder[] }>(
      gatewayPath("trading", `/algo/open?userId=${session.user.userId}&symbol=${encodeURIComponent(symbol)}&limit=100`),
      { productLine },
      session
    );
    return response.orders ?? response.items ?? [];
  } catch {
    return [];
  }
}

export async function placeOrder(
  session: AuthSession,
  draft: PlaceOrderDraft,
  productLine?: ProductLine
): Promise<OpenOrder> {
  return request<OpenOrder>(
    gatewayPath("trading"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        clientOrderId: `web-${session.user.userId}-${Date.now()}`,
        symbol: draft.symbol,
        side: draft.side,
        orderType: draft.orderType,
        timeInForce: draft.timeInForce,
        priceTicks: draft.orderType === "MARKET" ? 0 : draft.priceTicks,
        quantitySteps: draft.quantitySteps,
        marginMode: draft.marginMode,
        positionSide: draft.positionSide ?? "NET",
        reduceOnly: draft.reduceOnly,
        postOnly: draft.postOnly
      })
    },
    session
  );
}

export async function testOrder(
  session: AuthSession,
  draft: PlaceOrderDraft,
  productLine?: ProductLine
): Promise<TestOrderResult> {
  return request<TestOrderResult>(
    gatewayPath("trading", "/test"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify(orderPayload(session, draft, `web-test-${session.user.userId}-${Date.now()}`))
    },
    session
  );
}

export async function placeOrderBatch(
  session: AuthSession,
  drafts: PlaceOrderDraft[],
  productLine?: ProductLine
): Promise<OrderBatchResponse> {
  return request<OrderBatchResponse>(
    gatewayPath("trading", "/batch"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        orders: drafts.map((draft, index) => orderPayload(
          session,
          draft,
          `web-batch-${session.user.userId}-${Date.now()}-${index}`
        ))
      })
    },
    session
  );
}

export async function amendOrder(
  session: AuthSession,
  draft: AmendOrderDraft,
  productLine?: ProductLine
): Promise<AmendOrderResponse> {
  return request<AmendOrderResponse>(
    gatewayPath("trading", "/amend"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        orderId: draft.orderId,
        newClientOrderId: draft.newClientOrderId ?? `web-amend-${session.user.userId}-${Date.now()}`,
        priceTicks: draft.priceTicks,
        quantitySteps: draft.quantitySteps,
        timeInForce: draft.timeInForce,
        postOnly: draft.postOnly
      })
    },
    session
  );
}

export async function amendOrderBatch(
  session: AuthSession,
  drafts: AmendOrderDraft[],
  productLine?: ProductLine
): Promise<AmendOrderBatchResponse> {
  return request<AmendOrderBatchResponse>(
    gatewayPath("trading", "/batch-amend"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        orders: drafts.map((draft, index) => ({
          userId: session.user.userId,
          orderId: draft.orderId,
          newClientOrderId: draft.newClientOrderId
            ?? `web-batch-amend-${session.user.userId}-${Date.now()}-${index}`,
          priceTicks: draft.priceTicks,
          quantitySteps: draft.quantitySteps,
          timeInForce: draft.timeInForce,
          postOnly: draft.postOnly
        }))
      })
    },
    session
  );
}

export async function placeTriggerOrder(
  session: AuthSession,
  draft: PlaceTriggerOrderDraft,
  productLine?: ProductLine
): Promise<OpenTriggerOrder> {
  return request<OpenTriggerOrder>(
    gatewayPath("trading-trigger"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify(triggerOrderPayload(
        session,
        draft,
        `web-trigger-${session.user.userId}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
      ))
    },
    session
  );
}

export async function placeTriggerOrderBatch(
  session: AuthSession,
  drafts: PlaceTriggerOrderDraft[],
  atomic = false,
  productLine?: ProductLine
): Promise<TriggerOrderBatchResponse> {
  return request<TriggerOrderBatchResponse>(
    gatewayPath("trading-trigger", "/batch"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        atomic,
        orders: drafts.map((draft, index) => triggerOrderPayload(
          session,
          draft,
          `web-trigger-batch-${session.user.userId}-${Date.now()}-${index}`
        ))
      })
    },
    session
  );
}

export async function cancelOrder(
  session: AuthSession,
  order: OpenOrder,
  productLine?: ProductLine
): Promise<OpenOrder> {
  return request<OpenOrder>(
    gatewayPath("trading", "/cancel"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        orderId: order.orderId
      })
    },
    session
  );
}

export async function cancelOrderBatch(
  session: AuthSession,
  orders: OpenOrder[],
  productLine?: ProductLine
): Promise<OrderBatchResponse> {
  return request<OrderBatchResponse>(
    gatewayPath("trading", "/batch-cancel"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        orders: orders.map((order) => ({
          userId: session.user.userId,
          orderId: order.orderId
        }))
      })
    },
    session
  );
}

export async function cancelOpenOrders(
  session: AuthSession,
  symbol?: string,
  limit = 1000,
  productLine?: ProductLine
): Promise<OrderBatchResponse> {
  return request<OrderBatchResponse>(
    gatewayPath("trading", "/cancel-open"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        symbol,
        limit
      })
    },
    session
  );
}

export async function cancelAllAfter(
  session: AuthSession,
  countdownMs: number,
  symbol?: string,
  productLine?: ProductLine
): Promise<CancelAllAfterResponse> {
  return request<CancelAllAfterResponse>(
    gatewayPath("trading", "/cancel-all-after"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        symbol,
        countdownMs
      })
    },
    session
  );
}

export async function closePosition(
  session: AuthSession,
  symbol: string,
  marginMode: PlaceOrderDraft["marginMode"],
  positionSide: PlaceOrderDraft["positionSide"] = "NET",
  productLine?: ProductLine
): Promise<OpenOrder> {
  return request<OpenOrder>(
    gatewayPath("trading", "/close-position"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        clientOrderId: `web-close-${session.user.userId}-${Date.now()}`,
        symbol,
        marginMode,
        positionSide
      })
    },
    session
  );
}

export async function cancelTriggerOrder(
  session: AuthSession,
  order: OpenTriggerOrder,
  productLine?: ProductLine
): Promise<OpenTriggerOrder> {
  return request<OpenTriggerOrder>(
    gatewayPath("trading-trigger", "/cancel"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        triggerOrderId: order.triggerOrderId
      })
    },
    session
  );
}

export async function cancelTriggerOrderBatch(
  session: AuthSession,
  orders: OpenTriggerOrder[],
  productLine?: ProductLine
): Promise<TriggerOrderBatchResponse> {
  return request<TriggerOrderBatchResponse>(
    gatewayPath("trading-trigger", "/batch-cancel"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        orders: orders.map((order) => ({
          userId: session.user.userId,
          triggerOrderId: order.triggerOrderId
        }))
      })
    },
    session
  );
}

export async function cancelOpenTriggerOrders(
  session: AuthSession,
  symbol?: string,
  limit = 1000,
  productLine?: ProductLine
): Promise<TriggerOrderBatchResponse> {
  return request<TriggerOrderBatchResponse>(
    gatewayPath("trading-trigger", "/cancel-open"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        symbol,
        limit
      })
    },
    session
  );
}

export async function placeAlgoOrder(
  session: AuthSession,
  draft: PlaceAlgoOrderDraft,
  productLine?: ProductLine
): Promise<AlgoOrder> {
  return request<AlgoOrder>(
    gatewayPath("trading", "/algo"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        clientAlgoOrderId: `web-algo-${session.user.userId}-${Date.now()}`,
        symbol: draft.symbol,
        algoType: draft.algoType,
        side: draft.side,
        priceTicks: draft.algoType === "TWAP" && draft.priceTicks <= 0 ? 0 : draft.priceTicks,
        quantitySteps: draft.quantitySteps,
        childQuantitySteps: draft.childQuantitySteps,
        intervalSeconds: draft.intervalSeconds,
        durationSeconds: draft.durationSeconds,
        marginMode: draft.marginMode,
        positionSide: draft.positionSide ?? "NET",
        reduceOnly: draft.reduceOnly,
        postOnly: draft.algoType === "ICEBERG" && draft.postOnly,
        timeInForce: draft.algoType === "TWAP" ? "IOC" : draft.timeInForce ?? "GTC"
      })
    },
    session
  );
}

export async function cancelAlgoOrder(
  session: AuthSession,
  order: AlgoOrder,
  productLine?: ProductLine
): Promise<AlgoOrder> {
  return request<AlgoOrder>(
    gatewayPath("trading", "/algo/cancel"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        algoOrderId: order.algoOrderId
      })
    },
    session
  );
}

export async function cancelOpenAlgoOrders(
  session: AuthSession,
  symbol?: string,
  limit = 1000,
  productLine?: ProductLine
): Promise<AlgoOrderBatchResponse> {
  return request<AlgoOrderBatchResponse>(
    gatewayPath("trading", "/algo/cancel-open"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        symbol,
        limit
      })
    },
    session
  );
}

function orderPayload(session: AuthSession, draft: PlaceOrderDraft, clientOrderId: string) {
  return {
    userId: session.user.userId,
    clientOrderId,
    symbol: draft.symbol,
    side: draft.side,
    orderType: draft.orderType,
    timeInForce: draft.timeInForce,
    priceTicks: draft.orderType === "MARKET" ? 0 : draft.priceTicks,
    quantitySteps: draft.quantitySteps,
    marginMode: draft.marginMode,
    positionSide: draft.positionSide ?? "NET",
    reduceOnly: draft.reduceOnly,
    postOnly: draft.postOnly
  };
}

function triggerOrderPayload(session: AuthSession, draft: PlaceTriggerOrderDraft, clientTriggerOrderId: string) {
  return {
    userId: session.user.userId,
    clientTriggerOrderId,
    ocoGroupId: draft.ocoGroupId || undefined,
    symbol: draft.symbol,
    side: draft.side,
    triggerType: draft.triggerType,
    triggerPriceType: draft.triggerPriceType,
    triggerPriceTicks: draft.triggerPriceTicks,
    activationPriceTicks: draft.activationPriceTicks,
    callbackRatePpm: draft.callbackRatePpm,
    orderType: draft.orderType,
    timeInForce: draft.timeInForce,
    priceTicks: draft.orderType === "MARKET" ? 0 : draft.priceTicks,
    quantitySteps: draft.quantitySteps,
    marginMode: draft.marginMode,
    positionSide: draft.positionSide ?? "NET"
  };
}

function withTotals(levels: BackendOrderBookLevel[]): OrderBookLevel[] {
  let totalSteps = 0;
  return levels.map((level) => {
    totalSteps += level.quantitySteps;
    return { ...level, totalSteps };
  });
}

function toMarket(item: BackendInstrument): Market {
  const fallback = fallbackMarkets.find((market) => market.symbol === item.symbol);
  const quoteAsset = item.quoteAsset ?? item.symbol.split("-")[1] ?? "USDT";
  const instrumentType = item.instrumentType ?? fallback?.instrumentType;
  const contractType = item.contractType ?? fallback?.contractType;
  const priceTickUnits = item.priceTickUnits ?? fallback?.priceTickUnits;
  const fallbackPriceToTicks = (price: number | undefined, defaultPrice: number) => {
    const value = price ?? defaultPrice;
    if (!priceTickUnits || priceTickUnits === 1) return value;
    return Math.round(value * 100_000_000 / priceTickUnits);
  };
  return {
    symbol: item.symbol,
    version: item.version,
    instrumentType,
    contractType,
    baseAsset: item.baseAsset ?? item.symbol.split("-")[0],
    quoteAsset,
    settleAsset: item.settleAsset ?? quoteAsset,
    contractMultiplierPpm: item.contractMultiplierPpm,
    contractValueAsset: item.contractValueAsset,
    priceTickUnits,
    quantityStepUnits: item.quantityStepUnits,
    minQuantitySteps: item.minQuantitySteps,
    maxQuantitySteps: item.maxQuantitySteps,
    minNotionalUnits: item.minNotionalUnits,
    maxNotionalUnits: item.maxNotionalUnits,
    notionalMultiplierUnits: item.notionalMultiplierUnits,
    pricePrecision: item.pricePrecision,
    quantityPrecision: item.quantityPrecision,
    supportedOrderTypes: item.supportedOrderTypes,
    supportedTimeInForce: item.supportedTimeInForce,
    postOnlyEnabled: item.postOnlyEnabled,
    reduceOnlyEnabled: item.reduceOnlyEnabled,
    marketOrderEnabled: item.marketOrderEnabled,
    maxLeveragePpm: item.maxLeveragePpm,
    initialMarginRatePpm: item.initialMarginRatePpm,
    maintenanceMarginRatePpm: item.maintenanceMarginRatePpm,
    makerFeeRatePpm: item.makerFeeRatePpm,
    takerFeeRatePpm: item.takerFeeRatePpm,
    maxPositionNotionalUnits: item.maxPositionNotionalUnits,
    userOpenInterestLimitRatePpm: item.userOpenInterestLimitRatePpm,
    userOpenInterestLimitFloorUnits: item.userOpenInterestLimitFloorUnits,
    fundingIntervalHours: item.fundingIntervalHours,
    fundingRateCapPpm: item.fundingRateCapPpm,
    fundingRateFloorPpm: item.fundingRateFloorPpm,
    nextFundingTime: item.nextFundingTime ?? fallback?.nextFundingTime,
    timeUntilFundingSeconds: item.timeUntilFundingSeconds ?? fallback?.timeUntilFundingSeconds,
    expiryTime: item.expiryTime ?? fallback?.expiryTime,
    deliveryTime: item.deliveryTime ?? fallback?.deliveryTime,
    underlyingSymbol: item.underlyingSymbol ?? fallback?.underlyingSymbol,
    strikePriceUnits: item.strikePriceUnits ?? fallback?.strikePriceUnits,
    optionType: item.optionType ?? fallback?.optionType,
    optionExerciseStyle: item.optionExerciseStyle ?? fallback?.optionExerciseStyle,
    settlementMethod: item.settlementMethod ?? fallback?.settlementMethod,
    impactNotionalUnits: item.impactNotionalUnits,
    minValidIndexSources: item.minValidIndexSources,
    status: item.status,
    riskLimitBrackets: item.riskLimitBrackets,
    indexSources: item.indexSources,
    displayName: displayMarketName(item.symbol, instrumentType, contractType),
    lastPriceTicks: fallbackPriceToTicks(fallback?.lastPriceTicks, 1000),
    markPriceTicks: fallbackPriceToTicks(fallback?.markPriceTicks, 1000),
    indexPriceTicks: fallbackPriceToTicks(fallback?.indexPriceTicks, 1000),
    change24hPpm: fallback?.change24hPpm ?? 0,
    fundingRatePpm: fallback?.fundingRatePpm ?? 0,
    volume24hUnits: fallback?.volume24hUnits ?? 0,
    maxLeverage: item.maxLeverage ?? Math.max(1, Math.floor((item.maxLeveragePpm ?? 50_000_000) / 1_000_000))
  };
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function asRatePpm(value: unknown): number | undefined {
  const number = asOptionalNumber(value);
  if (number === undefined) return undefined;
  return Math.abs(number) <= 1 ? Math.round(number * 1_000_000) : Math.round(number);
}

function priceToTicks(value: unknown, market?: Pick<Market, "priceTickUnits">): number | undefined {
  const price = asOptionalNumber(value);
  if (price === undefined || price <= 0) return undefined;
  const tickUnits = market?.priceTickUnits;
  if (!tickUnits || tickUnits === 1) return price;
  return Math.round(price * 100_000_000 / tickUnits);
}

function priceUnitsToTicks(value: unknown, market?: Pick<Market, "priceTickUnits">): number | undefined {
  const units = asOptionalNumber(value);
  if (units === undefined || units <= 0) return undefined;
  const tickUnits = market?.priceTickUnits;
  if (!tickUnits || tickUnits <= 0 || tickUnits === 1) return units / 100_000_000;
  return Math.round(units / tickUnits);
}

function displayMarketName(symbol: string, instrumentType?: string, contractType?: string): string {
  const compactSymbol = symbol.replace(/-/g, "");
  if (instrumentType === "SPOT" || contractType === "SPOT") return `${compactSymbol.replace(/SPOT$/, "")} 现货`;
  if (instrumentType === "OPTION" || contractType === "VANILLA_OPTION") return `${compactSymbol} 期权`;
  if (contractType === "LINEAR_DELIVERY") return `${compactSymbol} U本位交割`;
  if (contractType === "INVERSE_DELIVERY") return `${compactSymbol} 币本位交割`;
  if (contractType === "INVERSE_PERPETUAL" || contractType === "INVERSE") return `${compactSymbol} 币本位永续`;
  return `${compactSymbol} U本位永续`;
}
