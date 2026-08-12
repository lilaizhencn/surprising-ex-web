import { config } from "../config";
import { fallbackBalancesForAccount, fallbackBook, fallbackCandles, fallbackMarkets, fallbackOrders, fallbackPositions } from "../mockData";
import type {
  AlgoOrder,
  AlgoOrderBatchResponse,
  AccountLedgerEntry,
  AmendOrderBatchResponse,
  AmendOrderDraft,
  AmendOrderResponse,
  AuthSession,
  ApiKeyView,
  Balance,
  CandlePoint,
  CancelAllAfterResponse,
  Market,
  MfaEnrollment,
  MfaStatus,
  KycProfile,
  KycDocument,
  OpenOrder,
  OpenTriggerOrder,
  OrderBatchResponse,
  OrderBookLevel,
  PlaceAlgoOrderDraft,
  PlaceOrderDraft,
  PlaceTriggerOrderDraft,
  Position,
  PositionMode,
  LedgerPage,
  ProductAccountType,
  ProductLine,
  ProductLedgerEntry,
  SecurityScene,
  TestOrderResult,
  TriggerOrderBatchResponse
} from "../types";
import { ApiError, gatewayPath, request } from "./client";

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
  impliedVolatilityPpm?: number | null;
  deltaPpm?: number | null;
  gammaPpm?: number | null;
  thetaPpm?: number | null;
  vegaPpm?: number | null;
  impactNotionalUnits?: number;
  minValidIndexSources?: number;
  status?: string;
  riskLimitBrackets?: Market["riskLimitBrackets"];
  indexSources?: Market["indexSources"];
  lastPrice?: string | number;
  lastPriceTicks?: number;
  change24hPpm?: number;
  change24h?: string | number;
  volume24hUnits?: number;
  volume24h?: string | number;
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

export interface ExchangeRateConversion {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  convertedAmount: number;
  rate: number;
  route: string;
  rateTime?: string;
}

export async function register(email: string, password: string): Promise<AuthSession> {
  return request<AuthSession>(`${config.authPrefix}/register`, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function login(identifier: string, password: string, totpCode?: string): Promise<AuthSession> {
  return request<AuthSession>(`${config.authPrefix}/login`, {
    method: "POST",
    body: JSON.stringify({ identifier, password, totpCode: totpCode || undefined })
  });
}

export function verifyEmail(session: AuthSession, email: string, code: string): Promise<boolean> {
  return request<boolean>(`${config.authPrefix}/verify-email`, {
    method: "POST",
    body: JSON.stringify({ email, code })
  }, session);
}

export function resendEmailVerification(session: AuthSession): Promise<{ challengeId: number; destination: string; expiresAt: string }> {
  return request(`${config.authPrefix}/resend-email-verification`, { method: "POST" }, session);
}

export function forgotPassword(identifier: string): Promise<{ accepted: boolean }> {
  return request(`${config.authPrefix}/forgot-password`, {
    method: "POST",
    body: JSON.stringify({ identifier })
  });
}

export function resetPassword(identifier: string, code: string, newPassword: string): Promise<{ accepted: boolean }> {
  return request(`${config.authPrefix}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ identifier, code, newPassword })
  });
}

export function loadMfaStatus(session: AuthSession): Promise<MfaStatus> {
  return request<MfaStatus>("/api/v1/security/mfa", {}, session);
}

export function enrollMfa(session: AuthSession): Promise<MfaEnrollment> {
  return request<MfaEnrollment>("/api/v1/security/mfa/enroll", { method: "POST" }, session);
}

export function confirmMfa(session: AuthSession, totpCode: string): Promise<MfaStatus> {
  return request<MfaStatus>("/api/v1/security/mfa/confirm", {
    method: "POST",
    body: JSON.stringify({ totpCode })
  }, session);
}

export function disableMfa(session: AuthSession, totpCode: string): Promise<MfaStatus> {
  return request<MfaStatus>("/api/v1/security/mfa/disable", {
    method: "POST",
    body: JSON.stringify({ totpCode })
  }, session);
}

export function loadSecurityScenes(session: AuthSession): Promise<SecurityScene[]> {
  return request<SecurityScene[]>("/api/v1/security/scenes", {}, session);
}

export function updateSecurityScene(
  session: AuthSession,
  sceneCode: string,
  enabled: boolean,
  emailCode?: string,
  totpCode?: string
): Promise<SecurityScene> {
  return request<SecurityScene>(`/api/v1/security/scenes/${encodeURIComponent(sceneCode)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled, emailCode: emailCode || undefined, totpCode: totpCode || undefined })
  }, session);
}

export function issueSecurityChallenge(session: AuthSession, sceneCode: string): Promise<{ challengeId: number; destination: string; expiresAt: string }> {
  return request(`/api/v1/security/verification/challenge`, {
    method: "POST",
    body: JSON.stringify({ sceneCode })
  }, session);
}

export function changePassword(
  session: AuthSession,
  currentPassword: string,
  newPassword: string,
  emailCode?: string,
  totpCode?: string
): Promise<void> {
  return request<void>("/api/v1/security/password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword,
      newPassword,
      emailCode: emailCode || undefined,
      totpCode: totpCode || undefined
    })
  }, session);
}

export function loadApiKeys(session: AuthSession): Promise<ApiKeyView[]> {
  return request<ApiKeyView[]>("/api/v1/security/api-keys", {}, session);
}

export function createApiKey(
  session: AuthSession,
  label: string,
  permissions: string[],
  emailCode: string,
  totpCode: string,
  ipAllowlist: string[] = []
): Promise<{ apiKey: ApiKeyView; secret: string }> {
  return request(`/api/v1/security/api-keys`, {
    method: "POST",
    headers: {
      "X-Security-Email-Code": emailCode || "",
      "X-Security-TOTP-Code": totpCode || ""
    },
    body: JSON.stringify({ label, permissions, ipAllowlist })
  }, session);
}

export function updateApiKeyIpAllowlist(
  session: AuthSession,
  apiKey: string,
  ipAllowlist: string[],
  emailCode: string,
  totpCode: string
): Promise<void> {
  return request<void>(`/api/v1/security/api-keys`, {
    method: "PATCH",
    headers: {
      "X-Security-Email-Code": emailCode || "",
      "X-Security-TOTP-Code": totpCode || ""
    },
    body: JSON.stringify({ apiKey, ipAllowlist })
  }, session);
}

export function revokeApiKey(session: AuthSession, apiKey: string, emailCode: string, totpCode: string): Promise<void> {
  return request<void>(`/api/v1/security/api-keys`, {
    method: "DELETE",
    headers: {
      "X-Security-Email-Code": emailCode || "",
      "X-Security-TOTP-Code": totpCode || ""
    },
    body: JSON.stringify({ apiKey })
  }, session);
}

export function loadKyc(session: AuthSession): Promise<KycProfile | null> {
  return request<KycProfile | null>("/api/v1/compliance/kyc", {}, session);
}

export function loadKycDocuments(session: AuthSession): Promise<KycDocument[]> {
  return request<KycDocument[]>("/api/v1/compliance/kyc/documents", {}, session);
}

export function uploadKycDocument(session: AuthSession, documentType: string, file: File): Promise<KycDocument> {
  const body = new FormData();
  body.append("documentType", documentType);
  body.append("file", file, file.name);
  return request<KycDocument>("/api/v1/compliance/kyc/documents", {
    method: "POST",
    body
  }, session);
}

export function submitKyc(
  session: AuthSession,
  payload: {
    applicantType: string;
    kycLevel: string;
    country: string;
    documentType: string;
    provider?: string;
    providerReference?: string;
    faceVerificationStatus: string;
    documentIds: number[];
  }
): Promise<KycProfile> {
  return request<KycProfile>("/api/v1/compliance/kyc", {
    method: "POST",
    body: JSON.stringify(payload)
  }, session);
}

export async function refresh(refreshToken: string): Promise<AuthSession> {
  return request<AuthSession>(`${config.authPrefix}/refresh`, {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
}

export async function loadMarkets(allowFallback = true): Promise<Market[]> {
  try {
    const response = await request<{ instruments?: BackendInstrument[]; items?: BackendInstrument[] }>(
      gatewayPath("instrument", "/list?status=TRADING")
    );
    const instruments = response.instruments ?? response.items ?? [];
    if (!instruments.length) {
      if (!allowFallback || !config.enableMockFallback) throw new Error("行情标的为空");
      return fallbackMarketSnapshot();
    }
    return instruments.map((instrument) => toMarket(instrument));
  } catch (error) {
    if (!allowFallback || !config.enableMockFallback) {
      throw error instanceof Error ? error : new Error("行情服务不可用");
    }
    return fallbackMarketSnapshot();
  }
}

export async function submitProductTransfer(
  session: AuthSession,
  input: {
    sourceAccountType: ProductAccountType;
    targetAccountType: ProductAccountType;
    asset: string;
    amountUnits: number;
    idempotencyKey: string;
    emailCode?: string;
    totpCode?: string;
  }
): Promise<{ transferId?: number; status?: string }> {
  try {
    return await request<{ transferId?: number; status?: string }>(gatewayPath("account", "/transfers"), {
      method: "POST",
      headers: {
        "Idempotency-Key": input.idempotencyKey,
        "X-Security-Email-Code": input.emailCode || "",
        "X-Security-TOTP-Code": input.totpCode || ""
      },
      body: JSON.stringify({
        sourceAccountType: input.sourceAccountType,
        targetAccountType: input.targetAccountType,
        asset: input.asset.toUpperCase(),
        amountUnits: input.amountUnits,
        referenceId: input.idempotencyKey,
        reason: "web product transfer"
      })
    }, session);
  } catch (reason: unknown) {
    if (reason instanceof ApiError) {
      const result = transferResultFromPayload(reason.payload);
      if (result) return result;
    }
    throw reason;
  }
}

function transferResultFromPayload(payload: unknown): { transferId?: number; status: string } | null {
  if (typeof payload !== "object" || payload === null || !("status" in payload)) return null;
  const status = payload.status;
  if (typeof status !== "string" || !status.trim()) return null;
  const transferId = "transferId" in payload && typeof payload.transferId === "number"
    ? payload.transferId
    : undefined;
  return { transferId, status };
}

export async function loadInstrumentConfig(symbol: string, productLine?: ProductLine): Promise<Market> {
  try {
    const params = new URLSearchParams({ symbol });
    if (productLine) params.set("productLine", productLine);
    const instrument = await request<BackendInstrument>(
      gatewayPath("instrument", `/latest?${params}`),
      { productLine }
    );
    return toMarket(instrument);
  } catch (error) {
    if (!config.enableMockFallback) {
      throw error instanceof Error ? error : new Error("交易对配置不可用");
    }
    const fallbackSnapshot = fallbackMarketSnapshot();
    const fallback = fallbackSnapshot.find((market) => market.symbol === symbol && fallbackMatchesProductLine(market, productLine));
    if (!fallback) throw new Error("交易对不属于当前产品线");
    return fallback;
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
  productLine?: ProductLine,
  allowFallback = true
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
  } catch (error) {
    if (!allowFallback || !config.enableMockFallback) {
      throw error instanceof Error ? error : new Error("订单簿行情不可用");
    }
    const mid = fallbackMarkets.find((market) => market.symbol === symbol)?.lastPriceTicks ?? 65000;
    return fallbackBook(mid);
  }
}

export async function loadBalances(
  session: AuthSession,
  accountType: ProductAccountType = "USDT_PERPETUAL",
  productLine?: ProductLine,
  allowFallback = true
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
  } catch (error) {
    if (!allowFallback || !config.enableMockFallback) throw error;
    return fallbackBalancesForAccount(accountType);
  }
}

export function loadAccountLedger(
  session: AuthSession,
  limit = 10,
  cursor?: string
): Promise<LedgerPage<AccountLedgerEntry>> {
  const params = new URLSearchParams({ userId: String(session.user.userId), limit: String(limit), sort: "createdAt.desc" });
  if (cursor) params.set("cursor", cursor);
  return request<LedgerPage<AccountLedgerEntry>>(
    gatewayPath("account", `/ledger?${params}`),
    {},
    session
  );
}

export function loadProductLedger(
  session: AuthSession,
  accountType: ProductAccountType,
  productLine: ProductLine,
  limit = 50,
  cursor?: string
): Promise<LedgerPage<ProductLedgerEntry>> {
  const params = new URLSearchParams({
    userId: String(session.user.userId),
    accountType,
    limit: String(limit),
    sort: "createdAt.desc"
  });
  if (cursor) params.set("cursor", cursor);
  return request<LedgerPage<ProductLedgerEntry>>(
    gatewayPath("account", `/product-ledger?${params}`),
    { productLine },
    session
  );
}

export async function loadExchangeRateConversion(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<ExchangeRateConversion> {
  const params = new URLSearchParams({
    amount: String(amount),
    fromCurrency,
    toCurrency
  });
  return request<ExchangeRateConversion>(
    gatewayPath("price-fx", `/convert?${params}`)
  );
}

export async function loadPositions(session: AuthSession, productLine?: ProductLine): Promise<Position[]> {
  try {
    const response = await request<{ positions: Position[] }>(
      gatewayPath("risk", `/positions/latest?userId=${session.user.userId}`),
      { productLine },
      session
    );
    return response.positions;
  } catch (error) {
    if (!config.enableMockFallback) throw error;
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
  const referenceId = `position-mode:${session.user.userId}:${crypto.randomUUID()}`;
  const response = await request<{ positionMode?: PositionMode }>(
    gatewayPath("account", "/position-mode"),
    {
      method: "POST",
      productLine,
      body: JSON.stringify({
        userId: session.user.userId,
        positionMode,
        referenceId
      })
    },
    session
  );
  return response.positionMode ?? positionMode;
}

export interface OpenOrderPage {
  orders: OpenOrder[];
  nextCursor: string | null;
  hasMore: boolean;
  sort: string;
  limit: number;
}

export async function loadOpenOrders(
  session: AuthSession,
  symbol: string,
  productLine?: ProductLine,
  cursor?: string | null,
  limit = 100
): Promise<OpenOrderPage> {
  try {
    const query = new URLSearchParams({
      userId: String(session.user.userId),
      symbol,
      limit: String(limit)
    });
    if (cursor) query.set("cursor", cursor);
    const response = await request<{
      orders?: OpenOrder[];
      items?: OpenOrder[];
      nextCursor?: string | null;
      hasMore?: boolean;
      sort?: string;
      limit?: number;
    }>(
      gatewayPath("trading", `/open?${query.toString()}`),
      { productLine },
      session
    );
    const nextCursor = response.nextCursor ?? null;
    return {
      orders: response.orders ?? response.items ?? [],
      nextCursor,
      hasMore: response.hasMore === true && nextCursor !== null,
      sort: response.sort ?? "orderId.desc",
      limit: response.limit ?? limit
    };
  } catch (error) {
    if (!config.enableMockFallback) throw error;
    return {
      orders: fallbackOrders.filter((order) => order.symbol === symbol),
      nextCursor: null,
      hasMore: false,
      sort: "orderId.desc",
      limit
    };
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
  } catch (error) {
    if (!config.enableMockFallback) throw error;
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
  } catch (error) {
    if (!config.enableMockFallback) throw error;
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
  const quoteAsset = item.quoteAsset ?? item.symbol.split("-")[1] ?? "USDT";
  const instrumentType = item.instrumentType;
  const contractType = item.contractType;
  const priceTickUnits = item.priceTickUnits;
  const fallbackPriceToTicks = (backendPrice: number | undefined) => {
    const value = backendPrice ?? 0;
    if (!priceTickUnits || priceTickUnits === 1) return value;
    return Math.round(value * 100_000_000 / priceTickUnits);
  };
  const backendChange = item.change24hPpm ?? (item.change24h === undefined ? undefined : asRatePpm(item.change24h));
  const backendVolume = item.volume24hUnits ?? asOptionalNumber(item.volume24h);
  const backendLastPrice = item.lastPriceTicks ?? priceToTicks(item.lastPrice, { priceTickUnits });
  const tickerReady = backendLastPrice !== undefined && backendChange !== undefined && backendVolume !== undefined;
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
    nextFundingTime: item.nextFundingTime,
    timeUntilFundingSeconds: item.timeUntilFundingSeconds,
    expiryTime: item.expiryTime,
    deliveryTime: item.deliveryTime,
    underlyingSymbol: item.underlyingSymbol,
    strikePriceUnits: item.strikePriceUnits,
    optionType: item.optionType,
    optionExerciseStyle: item.optionExerciseStyle,
    settlementMethod: item.settlementMethod,
    impliedVolatilityPpm: item.impliedVolatilityPpm,
    deltaPpm: item.deltaPpm,
    gammaPpm: item.gammaPpm,
    thetaPpm: item.thetaPpm,
    vegaPpm: item.vegaPpm,
    impactNotionalUnits: item.impactNotionalUnits,
    minValidIndexSources: item.minValidIndexSources,
    status: item.status,
    riskLimitBrackets: item.riskLimitBrackets,
    indexSources: item.indexSources,
    displayName: displayMarketName(item.symbol, instrumentType, contractType),
    lastPriceTicks: fallbackPriceToTicks(backendLastPrice),
    markPriceTicks: 0,
    indexPriceTicks: 0,
    change24hPpm: backendChange ?? 0,
    fundingRatePpm: 0,
    volume24hUnits: backendVolume ?? 0,
    maxLeverage: item.maxLeverage
      ?? (item.maxLeveragePpm !== undefined
        ? Math.max(1, Math.floor(item.maxLeveragePpm / 1_000_000))
      : 0),
    tickerReady,
    dataSource: "live"
  };
}

function fallbackMarketSnapshot(): Market[] {
  return fallbackMarkets.map((market) => ({ ...market, tickerReady: true, dataSource: "fallback" }));
}

function fallbackMatchesProductLine(market: Market, productLine?: ProductLine): boolean {
  if (!productLine) return true;
  if (productLine === "SPOT") return market.instrumentType === "SPOT" || market.contractType === "SPOT";
  if (productLine === "OPTION") return market.instrumentType === "OPTION" || market.contractType === "VANILLA_OPTION";
  if (productLine === "LINEAR_DELIVERY") return market.contractType === "LINEAR_DELIVERY";
  if (productLine === "INVERSE_DELIVERY") return market.contractType === "INVERSE_DELIVERY";
  if (productLine === "INVERSE_PERPETUAL") return market.contractType === "INVERSE_PERPETUAL" || market.contractType === "INVERSE";
  return market.contractType === "LINEAR" || market.contractType === "LINEAR_PERPETUAL";
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
