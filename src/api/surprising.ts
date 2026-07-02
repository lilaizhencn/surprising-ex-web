import { config } from "../config";
import { fallbackBalancesForAccount, fallbackBook, fallbackCandles, fallbackMarkets, fallbackOrders, fallbackPositions } from "../mockData";
import type {
  AuthSession,
  Balance,
  CandlePoint,
  Market,
  OpenOrder,
  OrderBookLevel,
  PlaceOrderDraft,
  Position,
  ProductAccountType
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
  impactNotionalUnits?: number;
  minValidIndexSources?: number;
  status?: string;
  riskLimitBrackets?: Market["riskLimitBrackets"];
  indexSources?: Market["indexSources"];
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

export async function loadCandles(symbol: string, period = "1m"): Promise<CandlePoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 4 * 60 * 60 * 1000);
  try {
    const params = new URLSearchParams({
      symbol,
      period,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      limit: "240"
    });
    const response = await request<{ candles: BackendCandle[] }>(gatewayPath("candlestick", `/candles?${params}`));
    return response.candles.map((item) => ({
      time: Math.floor(new Date(item.openTime).getTime() / 1000),
      open: Number(item.openPrice),
      high: Number(item.highPrice),
      low: Number(item.lowPrice),
      close: Number(item.closePrice),
      volume: Number(item.baseVolume)
    }));
  } catch (error) {
    if (!config.enableMockFallback) {
      throw error instanceof Error ? error : new Error("K线后端不可用");
    }
    const seed = fallbackMarkets.find((market) => market.symbol === symbol)?.lastPriceTicks ?? 65000;
    return fallbackCandles(seed);
  }
}

export async function loadOrderBook(symbol: string): Promise<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] }> {
  try {
    const response = await request<{ bids: BackendOrderBookLevel[]; asks: BackendOrderBookLevel[] }>(
      gatewayPath("trading-market", `/orderbook?symbol=${encodeURIComponent(symbol)}&depth=40`)
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

export async function loadBalances(session: AuthSession, accountType: ProductAccountType = "USDT_PERPETUAL"): Promise<Balance[]> {
  try {
    const params = new URLSearchParams({
      userId: String(session.user.userId),
      accountType
    });
    const response = await request<{ balances: Balance[] }>(
      gatewayPath("account", `/product-balances?${params}`),
      {},
      session
    );
    return response.balances.map((balance) => ({ ...balance, accountType: balance.accountType ?? accountType }));
  } catch {
    return fallbackBalancesForAccount(accountType);
  }
}

export async function loadPositions(session: AuthSession): Promise<Position[]> {
  try {
    const response = await request<{ positions: Position[] }>(
      gatewayPath("risk", `/positions/latest?userId=${session.user.userId}`),
      {},
      session
    );
    return response.positions;
  } catch {
    return fallbackPositions;
  }
}

export async function loadOpenOrders(session: AuthSession, symbol: string): Promise<OpenOrder[]> {
  try {
    const response = await request<{ orders?: OpenOrder[]; items?: OpenOrder[] }>(
      gatewayPath("trading", `/open?userId=${session.user.userId}&symbol=${encodeURIComponent(symbol)}&limit=100`),
      {},
      session
    );
    return response.orders ?? response.items ?? [];
  } catch {
    return fallbackOrders.filter((order) => order.symbol === symbol);
  }
}

export async function placeOrder(session: AuthSession, draft: PlaceOrderDraft): Promise<OpenOrder> {
  return request<OpenOrder>(
    gatewayPath("trading"),
    {
      method: "POST",
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
        positionSide: "NET",
        reduceOnly: draft.reduceOnly,
        postOnly: draft.postOnly
      })
    },
    session
  );
}

export async function cancelOrder(session: AuthSession, order: OpenOrder): Promise<OpenOrder> {
  return request<OpenOrder>(
    gatewayPath("trading", "/cancel"),
    {
      method: "POST",
      body: JSON.stringify({
        userId: session.user.userId,
        orderId: order.orderId
      })
    },
    session
  );
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
    priceTickUnits: item.priceTickUnits,
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
    impactNotionalUnits: item.impactNotionalUnits,
    minValidIndexSources: item.minValidIndexSources,
    status: item.status,
    riskLimitBrackets: item.riskLimitBrackets,
    indexSources: item.indexSources,
    displayName: displayMarketName(item.symbol, instrumentType, contractType),
    lastPriceTicks: fallback?.lastPriceTicks ?? 1000,
    markPriceTicks: fallback?.markPriceTicks ?? 1000,
    indexPriceTicks: fallback?.indexPriceTicks ?? 1000,
    change24hPpm: fallback?.change24hPpm ?? 0,
    fundingRatePpm: fallback?.fundingRatePpm ?? 0,
    volume24hUnits: fallback?.volume24hUnits ?? 0,
    maxLeverage: item.maxLeverage ?? Math.max(1, Math.floor((item.maxLeveragePpm ?? 50_000_000) / 1_000_000))
  };
}

function displayMarketName(symbol: string, instrumentType?: string, contractType?: string): string {
  const compactSymbol = symbol.replace(/-/g, "");
  if (instrumentType === "SPOT" || contractType === "SPOT") return `${compactSymbol.replace(/SPOT$/, "")} 现货`;
  if (contractType === "INVERSE_PERPETUAL" || contractType === "INVERSE") return `${compactSymbol} 币本位永续`;
  return `${compactSymbol} U本位永续`;
}
