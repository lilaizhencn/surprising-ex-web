import { memo, useState } from "react"
import type { ApiOrderBook } from "../../api/types"
import { Badge, Panel } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { stepUnitsToDecimal } from "../../lib/units"
import { type Market, PRODUCT_LINES, type ProductLine } from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"
import { OrderBook } from "./OrderBook"
import {
  displayPrice,
  formatClock,
  formatTradeQuantity,
  isDollarQuote,
  priceDisplayPrecision,
} from "./tradeFormatting"

export const TradeMarketPanel = memo(function TradeMarketPanel({
  current,
  productLine,
  assetScales,
  book,
  recentTrades,
  onPriceSelect: selectBookPrice,
}: {
  readonly current: Market | null
  readonly productLine: ProductLine
  readonly assetScales: Readonly<Record<string, string>>
  readonly book: ApiOrderBook | null
  readonly recentTrades: readonly Record<string, unknown>[]
  readonly onPriceSelect: (price: string) => void
}) {
  const [marketSideTab, setMarketSideTab] = useState<"book" | "trades">("book")
  const [bookDepth, setBookDepth] = useState<10 | 20 | 50>(50)
  const [bookPrecision, setBookPrecision] = useState(1)
  return (
    <aside className="trade-market-side">
      <div className="trade-tabs" role="tablist" aria-label={t("Market depth and trades")}>
        <button
          type="button"
          role="tab"
          aria-selected={marketSideTab === "book"}
          className={marketSideTab === "book" ? "active" : ""}
          onClick={() => setMarketSideTab("book")}
        >
          {" "}
          {t("Order book")}{" "}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={marketSideTab === "trades"}
          className={marketSideTab === "trades" ? "active" : ""}
          onClick={() => setMarketSideTab("trades")}
        >
          {" "}
          {t("Recent trades")}{" "}
        </button>
      </div>
      {marketSideTab === "book" ? (
        <OrderBook
          book={book}
          latestTrade={recentTrades[0] ?? null}
          depth={bookDepth}
          precision={bookPrecision}
          priceStep={
            current?.priceTickUnits && assetScales[current.quoteAsset]
              ? Number(current.priceTickUnits) / Number(assetScales[current.quoteAsset])
              : 0
          }
          dollar={isDollarQuote(current?.quoteAsset)}
          pricePrecision={priceDisplayPrecision(current, assetScales)}
          baseAsset={
            productLine === PRODUCT_LINES.spot ? (current?.baseAsset ?? "—") : t("Contracts")
          }
          quoteAsset={current?.quoteAsset ?? "—"}
          onPriceSelect={selectBookPrice}
          onDepthChange={setBookDepth}
          onPrecisionChange={setBookPrecision}
        />
      ) : (
        <Panel dense className="trade-side-panel">
          <div className="panel-heading">
            <h2>{t("Recent trades")}</h2>
            <Badge tone="neutral">{recentTrades.length > 0 ? t("Recent") : t("Waiting")}</Badge>
          </div>
          <div className="recent-trade-columns">
            <span>
              {t("Price (")}
              {current?.quoteAsset ?? "—"}
              {t(")")}
            </span>
            <span>
              {t("Quantity (")}
              {productLine === PRODUCT_LINES.spot ? (current?.baseAsset ?? "—") : t("Contracts")}
              {t(")")}
            </span>
            <span>{t("Time")}</span>
          </div>
          {recentTrades.length === 0 ? (
            <p className="subtle">{t("Waiting for recent trades.")}</p>
          ) : (
            <div className="recent-trades">
              {recentTrades.slice(0, 50).map((trade, index) => (
                <div className="recent-trade-row" key={`${text(trade, "coreSequence")}-${index}`}>
                  <span
                    className={text(trade, "side") === "SELL" ? "negative mono" : "positive mono"}
                  >
                    {displayPrice(
                      text(trade, "price"),
                      isDollarQuote(current?.quoteAsset),
                      priceDisplayPrecision(current, assetScales),
                    )}
                  </span>
                  <span className="mono">
                    {formatTradeQuantity(tradeDisplayQuantity(trade, current, assetScales))}
                  </span>
                  <time className="mono">{formatClock(text(trade, "eventTime"))}</time>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </aside>
  )
})
function tradeDisplayQuantity(
  trade: Readonly<Record<string, unknown>>,
  market: Market | null,
  assetScales: Readonly<Record<string, string>>,
): string {
  const steps = text(trade, "quantitySteps")
  if (steps && market) {
    try {
      const spec = marketQuantitySpec(market, assetScales)
      return stepUnitsToDecimal(steps, spec.unitSize, spec.scale)
    } catch {
      return ""
    }
  }
  return text(trade, "quantity") || text(trade, "qty")
}

function text(row: Readonly<Record<string, unknown>>, key: string): string {
  const value = row[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
