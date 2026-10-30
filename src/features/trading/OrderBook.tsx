import { memo, useLayoutEffect, useRef } from "react"
import type { ApiOrderBook, ApiOrderBookLevel } from "../../api/types"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Panel } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { formatPrice, priceDecimalsForStep } from "../../lib/format"
import { addDecimalQuantities, isPositiveDecimal } from "../../lib/units"
import { bookPriceMultipliers } from "./bookPriceSteps"
import { displayPrice } from "./tradeFormatting"

type Level = ApiOrderBookLevel
function text(row: Readonly<Record<string, unknown>> | null, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
export const OrderBook = memo(function OrderBook({
  book,
  latestTrade,
  depth,
  precision,
  priceStep,
  pricePrecision = priceDecimalsForStep(priceStep),
  baseAsset,
  quoteAsset,
  dollar,
  onDepthChange,
  onPrecisionChange,
  onPriceSelect,
}: {
  readonly book: ApiOrderBook | null
  readonly latestTrade: Readonly<Record<string, unknown>> | null
  readonly depth: 10 | 20 | 50
  readonly precision: number
  readonly priceStep: number
  readonly pricePrecision?: number
  readonly baseAsset: string
  readonly quoteAsset: string
  readonly dollar: boolean
  readonly onPriceSelect?: (price: string) => void
  readonly onDepthChange: (depth: 10 | 20 | 50) => void
  readonly onPrecisionChange: (precision: number) => void
}) {
  const askSideRef = useRef<HTMLDivElement>(null)
  const withTotals = (levels: Level[]) => {
    let total = "0"
    return levels.slice(0, depth).map((level) => {
      total = addDecimalQuantities(
        total,
        String(Array.isArray(level) ? level[1] : level.quantitySteps),
      )
      return { level, total }
    })
  }
  const referencePrice = Number(levelPrice(book?.asks?.[0] ?? book?.bids?.[0] ?? ["0", "0"]))
  const priceMultipliers = bookPriceMultipliers(priceStep, referencePrice)
  const selectedPrecision = priceMultipliers.includes(precision) ? precision : 1
  const aggregatedPricePrecision = priceDecimalsForStep(priceStep * selectedPrecision, 0)
  const bids = withTotals(
    aggregateBookLevels(book?.bids ?? [], priceStep * selectedPrecision, "bid"),
  )
  const asks = withTotals(
    aggregateBookLevels(book?.asks ?? [], priceStep * selectedPrecision, "ask"),
  ).reverse()
  // Keep the bar scale stable while deltas update individual price levels.
  const scaleRef = useRef({ key: "", value: 0 })
  const scaleKey = `${baseAsset}/${quoteAsset}/${depth}/${precision}`
  if (scaleRef.current.key !== scaleKey) scaleRef.current = { key: scaleKey, value: 0 }
  const observedMaximum = Math.max(
    0,
    ...[...bids, ...asks].map(({ level }) => {
      const amount = Number(Array.isArray(level) ? level[1] : level.quantitySteps)
      return Number.isFinite(amount) ? amount : 0
    }),
  )
  if (scaleRef.current.value === 0 && observedMaximum > 0) scaleRef.current.value = observedMaximum
  const maxQuantity = scaleRef.current.value
  useLayoutEffect(() => {
    const askSide = askSideRef.current
    if (askSide) askSide.scrollTop = askSide.scrollHeight
  }, [book, depth, precision])
  return (
    <Panel dense className="order-book-panel">
      <div className="panel-heading">
        <h2>{t("Order book")}</h2>
        <div className="book-depth-control">
          {" "}
          {t("Price step")}{" "}
          <DropdownSelect
            aria-label={t("Order book price precision")}
            value={selectedPrecision}
            onChange={(event) => onPrecisionChange(Number(event.target.value))}
          >
            {priceMultipliers.map((multiple) => (
              <option key={multiple} value={multiple}>
                {priceStep > 0
                  ? formatPrice(priceStep * multiple, priceDecimalsForStep(priceStep * multiple, 0))
                  : "—"}
              </option>
            ))}
          </DropdownSelect>{" "}
          {t("Depth")}{" "}
          <DropdownSelect
            aria-label={t("Order book depth")}
            value={depth}
            onChange={(event) => onDepthChange(Number(event.target.value) as 10 | 20 | 50)}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </DropdownSelect>
        </div>
      </div>
      <div className="order-book-sides">
        <section className="order-book-side" aria-label={t("Asks, high to low")}>
          <div className="order-book-columns">
            <span>
              {t("Price (")}
              {quoteAsset}
              {t(")")}
            </span>
            <span>
              {t("Quantity (")}
              {baseAsset}
              {t(")")}
            </span>
            <span>
              {t("Total (")}
              {baseAsset}
              {t(")")}
            </span>
          </div>
          <div ref={askSideRef} className="order-book-scroll order-book-asks">
            <div className="order-book">
              {asks.map(({ level, total }) => (
                <LevelRow
                  key={`ask-${levelPrice(level)}`}
                  level={level}
                  total={total}
                  maxQuantity={maxQuantity}
                  tone="negative"
                  dollar={dollar}
                  pricePrecision={aggregatedPricePrecision}
                  onPriceSelect={onPriceSelect}
                />
              ))}
            </div>
          </div>
        </section>
        <div className="order-book-last-trade" aria-live="polite">
          <span>{t("Last trade")}</span>
          <button
            type="button"
            className={`book-price-button ${text(latestTrade, "side") === "SELL" ? "negative" : "positive"} mono`}
            disabled={!isPositiveDecimal(text(latestTrade, "price"))}
            onClick={() => onPriceSelect?.(text(latestTrade, "price"))}
            aria-label={t("Use last trade price")}
          >
            {displayPrice(text(latestTrade, "price"), dollar, pricePrecision)}
          </button>
        </div>
        <section className="order-book-side" aria-label={t("Bids, high to low")}>
          <div className="order-book-columns">
            <span>
              {t("Price (")}
              {quoteAsset}
              {t(")")}
            </span>
            <span>
              {t("Quantity (")}
              {baseAsset}
              {t(")")}
            </span>
            <span>
              {t("Total (")}
              {baseAsset}
              {t(")")}
            </span>
          </div>
          <div className="order-book-scroll">
            <div className="order-book">
              {bids.map(({ level, total }) => (
                <LevelRow
                  key={`bid-${levelPrice(level)}`}
                  level={level}
                  total={total}
                  maxQuantity={maxQuantity}
                  tone="positive"
                  dollar={dollar}
                  pricePrecision={aggregatedPricePrecision}
                  onPriceSelect={onPriceSelect}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </Panel>
  )
})

function aggregateBookLevels(
  levels: readonly Level[],
  priceStep: number,
  side: "bid" | "ask",
): Level[] {
  const sorted = [...levels].sort((left, right) =>
    side === "bid" ? levelPrice(right) - levelPrice(left) : levelPrice(left) - levelPrice(right),
  )
  if (!Number.isFinite(priceStep) || priceStep <= 0) return sorted
  const buckets = new Map<string, string>()
  for (const level of sorted) {
    const price = levelPrice(level)
    const quantity = String(Array.isArray(level) ? level[1] : level.quantitySteps)
    if (!Number.isFinite(price) || !Number.isFinite(Number(quantity))) continue
    const bucket =
      side === "bid"
        ? Math.floor((price + priceStep * 1e-9) / priceStep)
        : Math.ceil((price - priceStep * 1e-9) / priceStep)
    const key = String(Number((bucket * priceStep).toFixed(priceDecimalsForStep(priceStep))))
    buckets.set(key, addDecimalQuantities(buckets.get(key) ?? "0", quantity))
  }
  return [...buckets].map(([price, quantity]) => [price, String(quantity)] as Level)
}

function LevelRow({
  level,
  total,
  maxQuantity,
  tone,
  dollar,
  pricePrecision,
  onPriceSelect,
}: {
  readonly level: Level
  readonly total: string
  readonly maxQuantity: number
  readonly tone: "positive" | "negative"
  readonly onPriceSelect?: ((price: string) => void) | undefined
  readonly pricePrecision: number
  readonly dollar: boolean
}) {
  const price = Array.isArray(level) ? String(level[0]) : String(level.priceTicks)
  const amount = Array.isArray(level) ? String(level[1]) : String(level.quantitySteps)
  const quantity = Number(amount)
  const fill =
    maxQuantity > 0 && Number.isFinite(quantity)
      ? Math.max(0, Math.min(1, quantity / maxQuantity))
      : 0
  return (
    <div className="order-book-row">
      <span
        className={`order-book-depth-fill ${tone}`}
        aria-hidden="true"
        style={{ transform: `scaleX(${fill})` }}
      />
      <button
        type="button"
        className={`book-price-button ${tone} mono`}
        onClick={() => onPriceSelect?.(price)}
        aria-label={`${t("Use price")} ${price}`}
      >
        {displayPrice(price, dollar, pricePrecision)}
      </button>
      <span className="mono" title={amount}>
        {amount}
      </span>
      <span className="mono" title={total}>
        {total}
      </span>
    </div>
  )
}

function levelPrice(level: Level): number {
  return Number(Array.isArray(level) ? level[0] : level.priceTicks)
}
