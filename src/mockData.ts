import type { Balance, Candle, Market, OpenOrder, OrderBookLevel, Position, TradePrint } from "./types";

export const markets: Market[] = [
  {
    symbol: "BTC-USDT-PERP",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    displayName: "BTCUSDT 永续",
    lastPrice: 104236.8,
    change24h: 2.84,
    volume24h: 486321000,
    markPrice: 104211.3,
    indexPrice: 104198.6,
    fundingRate: 0.0108,
    nextFunding: "05:42:18",
    openInterest: 24870,
    maxLeverage: 125
  },
  {
    symbol: "ETH-USDT-PERP",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    displayName: "ETHUSDT 永续",
    lastPrice: 5824.42,
    change24h: -0.76,
    volume24h: 264980000,
    markPrice: 5822.91,
    indexPrice: 5821.88,
    fundingRate: -0.0021,
    nextFunding: "05:42:18",
    openInterest: 184200,
    maxLeverage: 100
  },
  {
    symbol: "SOL-USDT-PERP",
    baseAsset: "SOL",
    quoteAsset: "USDT",
    displayName: "SOLUSDT 永续",
    lastPrice: 218.64,
    change24h: 4.18,
    volume24h: 82650000,
    markPrice: 218.59,
    indexPrice: 218.53,
    fundingRate: 0.0182,
    nextFunding: "05:42:18",
    openInterest: 723000,
    maxLeverage: 75
  }
];

export const balances: Balance[] = [
  { asset: "USDT", wallet: 48250.42, available: 37212.66, unrealizedPnl: 1842.28, maintenanceMargin: 812.14 },
  { asset: "BTC", wallet: 0.84, available: 0.32, unrealizedPnl: 0.018, maintenanceMargin: 0.006 }
];

export const positions: Position[] = [
  {
    symbol: "BTC-USDT-PERP",
    side: "LONG",
    size: 0.82,
    entryPrice: 101880.4,
    markPrice: 104211.3,
    margin: 6842.2,
    pnl: 1911.34,
    roe: 27.93,
    liquidationPrice: 89420.5
  },
  {
    symbol: "ETH-USDT-PERP",
    side: "SHORT",
    size: 5.4,
    entryPrice: 5890.8,
    markPrice: 5822.91,
    margin: 3181.7,
    pnl: 366.61,
    roe: 11.52,
    liquidationPrice: 6532.4
  }
];

export const openOrders: OpenOrder[] = [
  { id: "SX-483910", symbol: "BTC-USDT-PERP", side: "buy", type: "LIMIT", price: 103880, size: 0.18, filled: 0, reduceOnly: false, status: "NEW" },
  { id: "SX-483911", symbol: "BTC-USDT-PERP", side: "sell", type: "LIMIT", price: 105400, size: 0.26, filled: 0.04, reduceOnly: true, status: "PARTIALLY_FILLED" },
  { id: "SX-483912", symbol: "SOL-USDT-PERP", side: "buy", type: "POST_ONLY", price: 214.2, size: 80, filled: 0, reduceOnly: false, status: "NEW" }
];

export function buildCandles(seedPrice: number): Candle[] {
  const candles: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  let close = seedPrice * 0.965;
  for (let i = 180; i >= 0; i -= 1) {
    const wave = Math.sin(i / 7) * seedPrice * 0.0028;
    const drift = (180 - i) * seedPrice * 0.00018;
    const open = close;
    close = seedPrice * 0.965 + drift + wave + Math.sin(i / 17) * seedPrice * 0.0016;
    const high = Math.max(open, close) + seedPrice * (0.001 + Math.random() * 0.0012);
    const low = Math.min(open, close) - seedPrice * (0.001 + Math.random() * 0.001);
    candles.push({
      time: now - i * 60,
      open,
      high,
      low,
      close,
      volume: 80 + Math.round(Math.abs(close - open) * 2.4 + Math.random() * 120)
    });
  }
  return candles;
}

export function buildOrderBook(mid: number): { asks: OrderBookLevel[]; bids: OrderBookLevel[] } {
  const makeSide = (direction: 1 | -1) => {
    let total = 0;
    return Array.from({ length: 16 }, (_, index) => {
      const quantity = Number((0.12 + Math.random() * 2.4 + index * 0.08).toFixed(3));
      total += quantity;
      return {
        price: Number((mid + direction * (index + 1) * mid * 0.00014).toFixed(2)),
        quantity,
        total: Number(total.toFixed(3))
      };
    });
  };
  return { asks: makeSide(1).reverse(), bids: makeSide(-1) };
}

export function buildTrades(mid: number): TradePrint[] {
  return Array.from({ length: 28 }, (_, index) => {
    const side = Math.random() > 0.48 ? "buy" : "sell";
    const price = mid + (Math.random() - 0.5) * mid * 0.002;
    return {
      id: `T-${Date.now()}-${index}`,
      side,
      price: Number(price.toFixed(2)),
      quantity: Number((0.02 + Math.random() * 1.8).toFixed(3)),
      time: new Date(Date.now() - index * 9000).toLocaleTimeString("zh-CN", { hour12: false })
    };
  });
}
