import { t } from "../../i18n"
import { signedUnitsToDecimal, stepUnitsToDecimal } from "../../lib/units"
import type { Market } from "../../types/domain"
import { quantity } from "../trading/TradingAccountTables"
import "./TradeHistory.css"

/** Both record entry points present only the user's own execution side. */
export function TradeFillTable({
  rows,
  markets,
  scales,
}: {
  readonly rows: readonly Readonly<Record<string, unknown>>[]
  readonly markets: Readonly<Record<string, Market>>
  readonly scales: Readonly<Record<string, string>>
}) {
  const items = rows.map((row) => {
    const market = markets[`${row["productLine"]}:${row["instrumentId"]}`]
    let price = "—",
      fee = "—"
    try {
      if (market?.priceTickUnits && scales[market.quoteAsset])
        price = `${stepUnitsToDecimal(String(row["priceTicks"]), market.priceTickUnits, scales[market.quoteAsset] ?? "")} ${market.quoteAsset}`
    } catch {
      /* Unknown price metadata remains visibly unavailable. */
    }
    try {
      fee = `${signedUnitsToDecimal(String(row["feeRatePpm"]), "10000")}%`
    } catch {
      /* No guessed fee. */
    }
    return {
      row,
      market,
      price,
      fee,
      size: quantity(row["quantitySteps"], market, scales),
      key: `${row["tradeId"]}:${row["liquidityRole"]}:${row["orderId"]}`,
    }
  })
  return (
    <div className="trade-fill-history">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {[
                "Trade ID",
                "Order ID",
                "Symbol",
                "Side",
                "Price",
                "Quantity",
                "Liquidity role",
                "Execution fee rate",
                "Time",
              ].map((label) => (
                <th key={label}>{t(label)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(({ row, market, price, fee, size, key }) => {
              return (
                <tr key={key}>
                  <td className="mono">{String(row["tradeId"])}</td>
                  <td className="mono">{String(row["orderId"])}</td>
                  <td>{market?.symbol ?? String(row["instrumentId"])}</td>
                  <td>{t(String(row["side"]))}</td>
                  <td className="mono">{price}</td>
                  <td className="mono">{size}</td>
                  <td>{row["liquidityRole"] === "MAKER" ? "Maker" : "Taker"}</td>
                  <td className="mono">{fee}</td>
                  <td>{String(row["eventTime"])}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ul className="trade-fill-cards">
        {items.map(({ row, market, price, fee, size, key }) => (
          <li className="trade-fill-card" key={key}>
            <strong>{market?.symbol ?? String(row["instrumentId"])}</strong>
            <span>
              {t(String(row["side"]))} · {row["liquidityRole"] === "MAKER" ? "Maker" : "Taker"}
            </span>
            <dl>
              {[
                ["Price", price],
                ["Quantity", size],
                ["Execution fee rate", fee],
                ["Order ID", String(row["orderId"])],
                ["Trade ID", String(row["tradeId"])],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{t(label ?? "")}</dt>
                  <dd className="mono">{value}</dd>
                </div>
              ))}
            </dl>
            <time dateTime={String(row["eventTime"])}>{String(row["eventTime"])}</time>
          </li>
        ))}
      </ul>
    </div>
  )
}
