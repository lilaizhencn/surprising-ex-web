import { t } from "../../i18n"
import { decimalStepUnitsToDecimal } from "../../lib/units"
import type { Market, ProductLine } from "../../types/domain"
import { quantity, statusLabels, timestamp, units } from "../trading/TradingAccountTables"
import "./TradeHistory.css"

type Row = Readonly<Record<string, unknown>>
/** Read-only history uses the committed order's fields and immutable contract units. */
export function OrderHistoryTable({
  rows,
  markets,
  scales,
  productLine,
}: {
  readonly rows: readonly Row[]
  readonly markets: Readonly<Record<string, Market>>
  readonly scales: Readonly<Record<string, string>>
  readonly productLine: ProductLine
}) {
  const items = rows.map((row) => {
    const market = markets[`${productLine}:${row["instrumentId"]}`]
    const price = (value: unknown) => {
      if (value == null || !market?.priceTickUnits || !scales[market.quoteAsset]) return "—"
      try {
        return `${decimalStepUnitsToDecimal(String(value), market.priceTickUnits, scales[market.quoteAsset] ?? "")} ${market.quoteAsset}`
      } catch {
        return "—"
      }
    }
    const fields = [
      ["Order ID", String(row["orderId"])],
      ["Price", row["orderType"] === "MARKET" ? t("Market") : price(row["priceTicks"])],
      [
        "Average fill price",
        String(row["executedQuantitySteps"]) === "0" ? "—" : price(row["averagePriceTicks"]),
      ],
      ["Quantity", quantity(row["quantitySteps"], market, scales)],
      ["Filled", quantity(row["executedQuantitySteps"], market, scales)],
      ["Remaining", quantity(row["remainingQuantitySteps"], market, scales)],
      [
        "Fees",
        units(
          row["cumulativeFeeUnits"],
          market?.productLine === "SPOT" ? market.quoteAsset : market?.settleAsset,
          scales,
        ),
      ],
      ["Created", timestamp(row, "created")],
      ["Updated", timestamp(row, "updated")],
    ] as const
    return {
      row,
      fields,
      symbol: market?.symbol ?? String(row["instrumentId"]),
      summary: `${t(row["side"] === "BUY" ? "Buy" : "Sell")} · ${t(row["orderType"] === "MARKET" ? "Market" : "Limit")} · ${t(statusLabels[String(row["status"])] ?? String(row["status"]))}`,
    }
  })
  return (
    <div className="trade-fill-history order-history">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Symbol")}</th>
              <th>{t("Side / Type")}</th>
              {items[0]?.fields.map(([label]) => (
                <th key={label}>{t(label)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(({ row, fields, symbol, summary }) => (
              <tr key={String(row["orderId"])}>
                <td>{symbol}</td>
                <td>{summary}</td>
                {fields.map(([label, value]) => (
                  <td key={label} className="mono">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="trade-fill-cards">
        {items.map(({ row, fields, symbol, summary }) => (
          <li className="trade-fill-card" key={String(row["orderId"])}>
            <strong>{symbol}</strong>
            <span>{summary}</span>
            <dl>
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt>{t(label)}</dt>
                  <dd className="mono">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
