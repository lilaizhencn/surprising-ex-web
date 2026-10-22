import { formatPrice, priceDecimalsForStep } from "../../lib/format"
import { stepUnitsToDecimal } from "../../lib/units"
import type { Market } from "../../types/domain"
export function isDollarQuote(asset: string | null | undefined): boolean {
  return asset === "USD" || asset === "USDT" || asset === "USDC"
}

const tradeQuantityFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 })

export function displayPrice(value: string, dollar: boolean, precision?: number): string {
  if (!value) return "—"
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? formatPrice(numeric, precision ?? (dollar && numeric >= 1 ? 2 : undefined))
    : "—"
}
export function formatTradeQuantity(value: string): string {
  const quantity = Number(value)
  return value && Number.isFinite(quantity) && quantity >= 0
    ? tradeQuantityFormatter.format(quantity)
    : "—"
}

export function formatClock(value: string): string {
  const time = Date.parse(value)
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(time)
    : "—"
}

export function priceDisplayPrecision(
  market: Market | null | undefined,
  scales: Readonly<Record<string, string>>,
): number {
  if (!market) return 2
  const step =
    market.priceTickUnits && scales[market.quoteAsset]
      ? Number(stepUnitsToDecimal("1", market.priceTickUnits, scales[market.quoteAsset] ?? "1"))
      : 0
  return priceDecimalsForStep(step, market.pricePrecision)
}
