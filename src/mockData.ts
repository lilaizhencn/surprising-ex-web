import type { Balance, CandlePoint, Market, OpenOrder, OrderBookLevel, Position, ProductAccountType, TradePrint } from "./types";

const now = Math.floor(Date.now() / 1000);

export const fallbackMarkets: Market[] = [
  {
    symbol: "BTC-USDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settleAsset: "USDT",
    version: 1,
    instrumentType: "PERPETUAL",
    contractType: "LINEAR",
    displayName: "BTCUSDT 永续",
    priceTickUnits: 1,
    quantityStepUnits: 1,
    minQuantitySteps: 1,
    maxQuantitySteps: 35_000,
    minNotionalUnits: 500_000_000,
    maxNotionalUnits: 2_000_000_000_000_000,
    supportedOrderTypes: ["LIMIT", "MARKET"],
    supportedTimeInForce: ["GTC", "IOC", "FOK", "GTX"],
    postOnlyEnabled: true,
    reduceOnlyEnabled: true,
    marketOrderEnabled: true,
    maxLeveragePpm: 100_000_000,
    initialMarginRatePpm: 10_000,
    maintenanceMarginRatePpm: 5_000,
    makerFeeRatePpm: 200,
    takerFeeRatePpm: 500,
    maxPositionNotionalUnits: 25_000_000_000_000_000,
    userOpenInterestLimitRatePpm: 300_000,
    userOpenInterestLimitFloorUnits: 25_000_000_000_000,
    fundingIntervalHours: 8,
    fundingRateCapPpm: 7_500,
    fundingRateFloorPpm: -7_500,
    impactNotionalUnits: 1_000_000_000_000,
    minValidIndexSources: 3,
    status: "TRADING",
    lastPriceTicks: 65000,
    markPriceTicks: 64986,
    indexPriceTicks: 65012,
    change24hPpm: 18600,
    fundingRatePpm: 108,
    volume24hUnits: 486_210_000,
    maxLeverage: 100
  },
  {
    symbol: "ETH-USDT",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    settleAsset: "USDT",
    version: 1,
    instrumentType: "PERPETUAL",
    contractType: "LINEAR",
    displayName: "ETHUSDT 永续",
    priceTickUnits: 1,
    quantityStepUnits: 1,
    minQuantitySteps: 1,
    maxQuantitySteps: 120_000,
    minNotionalUnits: 500_000_000,
    maxNotionalUnits: 2_000_000_000_000_000,
    supportedOrderTypes: ["LIMIT", "MARKET"],
    supportedTimeInForce: ["GTC", "IOC", "FOK", "GTX"],
    postOnlyEnabled: true,
    reduceOnlyEnabled: true,
    marketOrderEnabled: true,
    maxLeveragePpm: 75_000_000,
    initialMarginRatePpm: 13_334,
    maintenanceMarginRatePpm: 5_000,
    makerFeeRatePpm: 200,
    takerFeeRatePpm: 500,
    maxPositionNotionalUnits: 20_000_000_000_000_000,
    userOpenInterestLimitRatePpm: 300_000,
    userOpenInterestLimitFloorUnits: 25_000_000_000_000,
    fundingIntervalHours: 8,
    fundingRateCapPpm: 7_500,
    fundingRateFloorPpm: -7_500,
    impactNotionalUnits: 1_000_000_000_000,
    minValidIndexSources: 3,
    status: "TRADING",
    lastPriceTicks: 3600,
    markPriceTicks: 3598,
    indexPriceTicks: 3602,
    change24hPpm: -8200,
    fundingRatePpm: 74,
    volume24hUnits: 220_890_000,
    maxLeverage: 75
  },
  {
    symbol: "BTC-USD",
    baseAsset: "BTC",
    quoteAsset: "USD",
    settleAsset: "BTC",
    version: 1,
    instrumentType: "PERPETUAL",
    contractType: "INVERSE_PERPETUAL",
    displayName: "BTCUSD 币本位永续",
    contractMultiplierPpm: 1_000_000,
    contractValueAsset: "USD",
    priceTickUnits: 1,
    quantityStepUnits: 1,
    minQuantitySteps: 1,
    maxQuantitySteps: 50_000,
    minNotionalUnits: 100_000_000,
    maxNotionalUnits: 2_000_000_000_000_000,
    notionalMultiplierUnits: 100_000_000,
    supportedOrderTypes: ["LIMIT", "MARKET"],
    supportedTimeInForce: ["GTC", "IOC", "FOK", "GTX"],
    postOnlyEnabled: true,
    reduceOnlyEnabled: true,
    marketOrderEnabled: true,
    maxLeveragePpm: 50_000_000,
    initialMarginRatePpm: 20_000,
    maintenanceMarginRatePpm: 10_000,
    makerFeeRatePpm: 200,
    takerFeeRatePpm: 500,
    maxPositionNotionalUnits: 15_000_000_000_000_000,
    userOpenInterestLimitRatePpm: 300_000,
    userOpenInterestLimitFloorUnits: 10_000_000_000_000,
    fundingIntervalHours: 8,
    fundingRateCapPpm: 7_500,
    fundingRateFloorPpm: -7_500,
    impactNotionalUnits: 500_000_000_000,
    minValidIndexSources: 3,
    status: "TRADING",
    lastPriceTicks: 65000,
    markPriceTicks: 64990,
    indexPriceTicks: 65008,
    change24hPpm: 12300,
    fundingRatePpm: 92,
    volume24hUnits: 126_400_000,
    maxLeverage: 50
  },
  {
    symbol: "ETH-USD",
    baseAsset: "ETH",
    quoteAsset: "USD",
    settleAsset: "ETH",
    version: 1,
    instrumentType: "PERPETUAL",
    contractType: "INVERSE_PERPETUAL",
    displayName: "ETHUSD 币本位永续",
    contractMultiplierPpm: 1_000_000,
    contractValueAsset: "USD",
    priceTickUnits: 1,
    quantityStepUnits: 1,
    minQuantitySteps: 1,
    maxQuantitySteps: 80_000,
    minNotionalUnits: 50_000_000,
    maxNotionalUnits: 1_500_000_000_000_000,
    notionalMultiplierUnits: 10_000_000,
    supportedOrderTypes: ["LIMIT", "MARKET"],
    supportedTimeInForce: ["GTC", "IOC", "FOK", "GTX"],
    postOnlyEnabled: true,
    reduceOnlyEnabled: true,
    marketOrderEnabled: true,
    maxLeveragePpm: 40_000_000,
    initialMarginRatePpm: 25_000,
    maintenanceMarginRatePpm: 12_500,
    makerFeeRatePpm: 200,
    takerFeeRatePpm: 500,
    maxPositionNotionalUnits: 12_000_000_000_000_000,
    userOpenInterestLimitRatePpm: 300_000,
    userOpenInterestLimitFloorUnits: 8_000_000_000_000,
    fundingIntervalHours: 8,
    fundingRateCapPpm: 7_500,
    fundingRateFloorPpm: -7_500,
    impactNotionalUnits: 350_000_000_000,
    minValidIndexSources: 3,
    status: "TRADING",
    lastPriceTicks: 3600,
    markPriceTicks: 3597,
    indexPriceTicks: 3603,
    change24hPpm: -6200,
    fundingRatePpm: 66,
    volume24hUnits: 92_700_000,
    maxLeverage: 40
  },
  {
    symbol: "BTC-USDT-SPOT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settleAsset: "USDT",
    version: 1,
    instrumentType: "SPOT",
    contractType: "SPOT",
    displayName: "BTCUSDT 现货",
    priceTickUnits: 1,
    quantityStepUnits: 1,
    minQuantitySteps: 1,
    maxQuantitySteps: 100_000,
    minNotionalUnits: 100_000_000,
    maxNotionalUnits: 1_000_000_000_000_000,
    notionalMultiplierUnits: 1,
    supportedOrderTypes: ["LIMIT"],
    supportedTimeInForce: ["GTC", "IOC", "FOK", "GTX"],
    postOnlyEnabled: false,
    reduceOnlyEnabled: false,
    marketOrderEnabled: false,
    makerFeeRatePpm: 200,
    takerFeeRatePpm: 500,
    status: "TRADING",
    lastPriceTicks: 65010,
    markPriceTicks: 65010,
    indexPriceTicks: 65010,
    change24hPpm: 15800,
    fundingRatePpm: 0,
    volume24hUnits: 318_900_000,
    maxLeverage: 1
  },
  {
    symbol: "ETH-USDT-SPOT",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    settleAsset: "USDT",
    version: 1,
    instrumentType: "SPOT",
    contractType: "SPOT",
    displayName: "ETHUSDT 现货",
    priceTickUnits: 1,
    quantityStepUnits: 1,
    minQuantitySteps: 1,
    maxQuantitySteps: 200_000,
    minNotionalUnits: 100_000_000,
    maxNotionalUnits: 1_000_000_000_000_000,
    notionalMultiplierUnits: 1,
    supportedOrderTypes: ["LIMIT"],
    supportedTimeInForce: ["GTC", "IOC", "FOK", "GTX"],
    postOnlyEnabled: false,
    reduceOnlyEnabled: false,
    marketOrderEnabled: false,
    makerFeeRatePpm: 200,
    takerFeeRatePpm: 500,
    status: "TRADING",
    lastPriceTicks: 3602,
    markPriceTicks: 3602,
    indexPriceTicks: 3602,
    change24hPpm: -5100,
    fundingRatePpm: 0,
    volume24hUnits: 147_500_000,
    maxLeverage: 1
  }
];

export function fallbackCandles(seed = 65000): CandlePoint[] {
  return Array.from({ length: 160 }, (_, index) => {
    const drift = Math.sin(index / 8) * 260 + Math.cos(index / 17) * 180;
    const open = seed + drift + Math.sin(index) * 60;
    const close = open + Math.sin(index / 3) * 110;
    return {
      time: now - (160 - index) * 60,
      open,
      high: Math.max(open, close) + 90 + (index % 5) * 11,
      low: Math.min(open, close) - 88 - (index % 7) * 9,
      close,
      volume: 80 + Math.abs(Math.sin(index / 4)) * 240
    };
  });
}

export function fallbackBook(mid = 65000): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
  let bidTotal = 0;
  let askTotal = 0;
  const bids = Array.from({ length: 18 }, (_, index) => {
    const quantitySteps = 3 + ((index * 7) % 19);
    bidTotal += quantitySteps;
    return { priceTicks: mid - 2 - index * 4, quantitySteps, orderCount: 1 + (index % 4), totalSteps: bidTotal };
  });
  const asks = Array.from({ length: 18 }, (_, index) => {
    const quantitySteps = 4 + ((index * 5) % 17);
    askTotal += quantitySteps;
    return { priceTicks: mid + 2 + index * 4, quantitySteps, orderCount: 1 + (index % 3), totalSteps: askTotal };
  });
  return { bids, asks };
}

export function fallbackTrades(symbol: string, mid = 65000): TradePrint[] {
  return Array.from({ length: 22 }, (_, index) => ({
    id: `mock-${symbol}-${index}`,
    symbol,
    side: index % 3 === 0 ? "SELL" : "BUY",
    priceTicks: mid + Math.round(Math.sin(index / 2) * 28),
    quantitySteps: 1 + ((index * 3) % 9),
    time: new Date(Date.now() - index * 4500).toLocaleTimeString()
  }));
}

const fallbackBalancesByAccount: Record<ProductAccountType, Balance[]> = {
  USDT_PERPETUAL: [
    { accountType: "USDT_PERPETUAL", asset: "USDT", availableUnits: 250_000_000_000, lockedUnits: 40_000_000_000, equityUnits: 302_000_000_000 }
  ],
  COIN_PERPETUAL: [
    { accountType: "COIN_PERPETUAL", asset: "BTC", availableUnits: 140_000_000, lockedUnits: 25_000_000, equityUnits: 171_000_000 },
    { accountType: "COIN_PERPETUAL", asset: "ETH", availableUnits: 850_000_000, lockedUnits: 0, equityUnits: 850_000_000 }
  ],
  SPOT: [
    { accountType: "SPOT", asset: "USDT", availableUnits: 180_000_000_000, lockedUnits: 12_000_000_000, equityUnits: 192_000_000_000 },
    { accountType: "SPOT", asset: "BTC", availableUnits: 85_000_000, lockedUnits: 15_000_000, equityUnits: 100_000_000 },
    { accountType: "SPOT", asset: "ETH", availableUnits: 620_000_000, lockedUnits: 0, equityUnits: 620_000_000 }
  ]
};

export function fallbackBalancesForAccount(accountType: ProductAccountType = "USDT_PERPETUAL"): Balance[] {
  return fallbackBalancesByAccount[accountType].map((balance) => ({ ...balance }));
}

export const fallbackPositions: Position[] = [
  {
    symbol: "BTC-USDT",
    marginMode: "CROSS",
    signedQuantitySteps: 8,
    entryPriceTicks: 64220,
    markPriceTicks: 64986,
    unrealizedPnlUnits: 612_800_000,
    maintenanceMarginUnits: 16_200_000,
    marginRatioPpm: 124000,
    status: "NORMAL"
  },
  {
    symbol: "BTC-USD",
    marginMode: "CROSS",
    signedQuantitySteps: -12,
    entryPriceTicks: 66100,
    markPriceTicks: 64990,
    unrealizedPnlUnits: 18_500_000,
    maintenanceMarginUnits: 4_600_000,
    marginRatioPpm: 96000,
    status: "NORMAL"
  }
];

export const fallbackOrders: OpenOrder[] = [
  {
    orderId: 10002001,
    clientOrderId: "web-demo-maker-1",
    symbol: "BTC-USDT",
    side: "BUY",
    orderType: "LIMIT",
    timeInForce: "GTC",
    priceTicks: 64200,
    quantitySteps: 2,
    executedQuantitySteps: 0,
    remainingQuantitySteps: 2,
    marginMode: "CROSS",
    reduceOnly: false,
    postOnly: false,
    status: "ACCEPTED"
  },
  {
    orderId: 10002002,
    clientOrderId: "web-demo-coin-1",
    symbol: "BTC-USD",
    side: "SELL",
    orderType: "LIMIT",
    timeInForce: "GTC",
    priceTicks: 65300,
    quantitySteps: 5,
    executedQuantitySteps: 0,
    remainingQuantitySteps: 5,
    marginMode: "CROSS",
    reduceOnly: false,
    postOnly: false,
    status: "ACCEPTED"
  },
  {
    orderId: 10002003,
    clientOrderId: "web-demo-spot-1",
    symbol: "BTC-USDT-SPOT",
    side: "BUY",
    orderType: "LIMIT",
    timeInForce: "GTC",
    priceTicks: 64880,
    quantitySteps: 1,
    executedQuantitySteps: 0,
    remainingQuantitySteps: 1,
    marginMode: "CROSS",
    reduceOnly: false,
    postOnly: false,
    status: "ACCEPTED"
  }
];
