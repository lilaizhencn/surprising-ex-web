const PRICE_UNIT_SCALE = 100_000_000;

export class ValuationRequestGuard {
  private generation = 0;

  begin(): number {
    return ++this.generation;
  }

  invalidate(): void {
    this.generation++;
  }

  isCurrent(requestGeneration: number): boolean {
    return requestGeneration === this.generation;
  }
}

export interface PriceTickMarket {
  symbol: string;
  lastPriceTicks: number;
  markPriceTicks: number;
  indexPriceTicks: number;
}

export function priceFromTicks(
  market: { priceTickUnits?: number } | undefined,
  priceTicks: number,
): number {
  if (!Number.isFinite(priceTicks)) return 0;
  const tickUnits = market?.priceTickUnits;
  if (!tickUnits || tickUnits === 1) return priceTicks;
  return priceTicks * tickUnits / PRICE_UNIT_SCALE;
}

export function applyMarketPriceTicks<T extends PriceTickMarket>(
  markets: readonly T[],
  priceTicksBySymbol: ReadonlyMap<string, number>,
): T[] {
  return markets.map((market) => {
    const priceTicks = priceTicksBySymbol.get(market.symbol);
    return priceTicks === undefined
      ? market
      : { ...market, lastPriceTicks: priceTicks, markPriceTicks: priceTicks, indexPriceTicks: priceTicks };
  });
}
