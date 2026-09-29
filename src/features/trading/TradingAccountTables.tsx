import { useEffect, useRef, useState } from "react"
import { cancelOrder, loadPositionRisk } from "../../api/endpoints"
import type { ApiOrder, ApiTriggerOrder } from "../../api/types"
import { t } from "../../i18n"
import { formatPrice, priceDecimalsForStep } from "../../lib/format"
import { signedUnitsToDecimal, stepUnitsToDecimal } from "../../lib/units"
import {
  integer,
  type PrivateView,
  positionValuation,
  type Row,
  type WsEnvelope,
} from "../../realtime"
import type { Market, ProductLine } from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"
import type { LeverageSettings } from "./TradingTicketControls"

type Props = {
  readonly market: Market | null
  readonly markets: readonly Market[]
  readonly productLine: ProductLine
  readonly assetScales: Readonly<Record<string, string>>
  readonly positions: readonly Row[]
  readonly orders: readonly ApiOrder[]
  readonly triggers: readonly ApiTriggerOrder[]
  readonly account: PrivateView | undefined
  readonly leverageSetting?: LeverageSettings | null
  readonly events: readonly WsEnvelope[]
  readonly loggedIn: boolean
  readonly userId: string | number | undefined
  readonly onNotice: (message: string, failed: boolean) => void
}
const field = (row: Row | undefined, key: string) => (row?.[key] == null ? "" : String(row[key]))
export function orderStatus(row: Row): string {
  if (row["status"] !== "OPEN") return field(row, "status")
  return integer(row["executedQuantitySteps"] ?? 0) > 0n ? "PARTIALLY_FILLED" : "ACCEPTED"
}
export const statusLabels: Record<string, string> = {
  OPEN: "Unfilled",
  ACCEPTED: "Unfilled",
  PARTIALLY_FILLED: "Partially filled",
  FILLED: "Filled",
  CANCELED: "Canceled",
  REJECTED: "Rejected",
  PENDING_RESERVE: "Pending",
  CANCEL_REQUESTED: "Canceling",
}
export function fillProgress(row: Row): string {
  try {
    const filled = integer(row["executedQuantitySteps"]),
      total = integer(row["quantitySteps"])
    if (total <= 0n || filled < 0n || filled > total) return "—"
    return `${Number((filled * 10000n) / total) / 100}%`
  } catch {
    return "—"
  }
}
export function price(ticks: unknown, market: Market | undefined, scales: Props["assetScales"]) {
  if (ticks == null || !market?.priceTickUnits || !scales[market.quoteAsset]) return "—"
  try {
    const tick = Number(market.priceTickUnits) / Number(scales[market.quoteAsset])
    const amount = Number(ticks) * tick
    if (!Number.isFinite(amount)) return "—"
    return formatPrice(amount, priceDecimalsForStep(tick, market.pricePrecision))
  } catch {
    return "—"
  }
}
export function quantity(steps: unknown, market: Market | undefined, scales: Props["assetScales"]) {
  if (steps == null || !market) return "—"
  try {
    const spec = marketQuantitySpec(market, scales)
    const q = integer(steps)
    return `${stepUnitsToDecimal((q < 0n ? -q : q).toString(), spec.unitSize, spec.scale)} ${market.productLine === "SPOT" ? market.baseAsset : t("Contracts")}`
  } catch {
    return "—"
  }
}
export function units(value: unknown, asset: string | undefined, scales: Props["assetScales"]) {
  if (value == null || !asset || !scales[asset]) return "—"
  try {
    return `${signedUnitsToDecimal(String(value), scales[asset] ?? "")} ${asset}`
  } catch {
    return "—"
  }
}
export function timestamp(row: Row, key: "created" | "updated") {
  const raw = row[`${key}AtEpochMillis`] ?? row[`${key}At`]
  if (raw == null) return "—"
  const date =
    typeof raw === "number" || /^\d+$/.test(String(raw))
      ? new Date(Number(raw))
      : new Date(String(raw))
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { hour12: false }) : "—"
}
function filledValue(row: Row, market: Market | undefined, scales: Props["assetScales"]) {
  if (
    !market ||
    !["LINEAR_PERPETUAL", "LINEAR_DELIVERY"].includes(market.productLine) ||
    !market.notionalMultiplierUnits ||
    row["executedValueTicks"] == null
  )
    return "—"
  try {
    return units(
      (integer(row["executedValueTicks"]) * integer(market.notionalMultiplierUnits)).toString(),
      market.settleAsset ?? market.quoteAsset,
      scales,
    )
  } catch {
    return "—"
  }
}
function valueAtLimit(row: Row, market: Market | undefined, scales: Props["assetScales"]) {
  if (
    !market ||
    !["LINEAR_PERPETUAL", "LINEAR_DELIVERY"].includes(market.productLine) ||
    !market.notionalMultiplierUnits ||
    row["orderType"] === "MARKET"
  )
    return "—"
  try {
    return units(
      (
        integer(row["priceTicks"]) *
        integer(row["quantitySteps"]) *
        integer(market.notionalMultiplierUnits)
      ).toString(),
      market.settleAsset ?? market.quoteAsset,
      scales,
    )
  } catch {
    return "—"
  }
}
function mergeOrders(history: readonly Row[], updates: readonly Row[]) {
  const byId = new Map(history.map((row) => [field(row, "orderId"), row]))
  for (const row of updates) {
    const id = field(row, "orderId"),
      previous = byId.get(id)
    const time = (value: Row) =>
      Number(value["updatedAtEpochMillis"] ?? Date.parse(field(value, "updatedAt"))) || 0
    if (!previous || time(row) >= time(previous)) byId.set(id, { ...previous, ...row })
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        Number(b["createdAtEpochMillis"] ?? Date.parse(field(b, "createdAt"))) -
        Number(a["createdAtEpochMillis"] ?? Date.parse(field(a, "createdAt"))),
    )
    .slice(0, 100)
}

export function TradingAccountTables(props: Props) {
  const {
    market,
    markets,
    productLine,
    assetScales,
    positions,
    orders,
    account,
    events,
    loggedIn,
    userId,
    onNotice,
  } = props
  const [tab, setTab] = useState<"positions" | "orders" | "history">("orders")
  const [onlyCurrent, setOnlyCurrent] = useState(true)
  const [history, setHistory] = useState<readonly Row[]>([])
  const [riskSnapshots, setRiskSnapshots] = useState<readonly Row[]>([])
  const positionVersion =
    positions
      .map((position) =>
        [
          position["instrumentId"],
          position["positionSide"],
          position["signedQuantitySteps"],
          position["entryPriceTicks"],
          position["positionMarginUnits"],
        ].join(":"),
      )
      .join("|") +
    ":" +
    (account?.rows("balance") ?? [])
      .map((balance) =>
        [balance["asset"], balance["availableUnits"], balance["lockedUnits"]].join(":"),
      )
      .join("|")
  useEffect(() => {
    if (tab !== "positions" || !loggedIn || userId == null || positions.length === 0) {
      setRiskSnapshots([])
      return
    }
    let current = true
    void loadPositionRisk(userId, productLine)
      .then((rows) => {
        if (current) setRiskSnapshots(rows)
      })
      .catch(() => {
        if (current) setRiskSnapshots([])
      })
    return () => {
      current = false
    }
  }, [tab, loggedIn, userId, productLine, positionVersion, positions.length])
  useEffect(() => {
    setHistory([])
  }, [productLine, loggedIn, market?.instrumentId])
  const lastOrderEvent = useRef<WsEnvelope | undefined>(undefined)
  useEffect(() => {
    const latestOrder = events.find(
      (event) => event.channel === "orders" && event.productLine === productLine,
    )
    if (latestOrder === lastOrderEvent.current) return
    lastOrderEvent.current = latestOrder
    const orderEvents = events
      .filter((event) => event.channel === "orders" && event.productLine === productLine)
      .map((event) => event.data as Row)
      .reverse()
    if (orderEvents.length)
      setHistory((previous) => {
        const merged = mergeOrders(previous, orderEvents)
        return JSON.stringify(merged) === JSON.stringify(previous) ? previous : merged
      })
  }, [events, productLine])
  const filter = (row: Row) => !onlyCurrent || field(row, "instrumentId") === market?.instrumentId
  const positionRows = positions.filter(filter),
    orderRows = orders.filter(filter)
  const marketFor = (instrumentId: string) =>
    market?.instrumentId === instrumentId
      ? market
      : markets.find((row) => row.instrumentId === instrumentId)
  return (
    <section className="trade-account-tables">
      <div className="account-table-toolbar">
        <div role="tablist" aria-label={t("Trading account")}>
          {(
            [
              ["positions", `${t("Positions")} (${positionRows.length})`],
              ["orders", `${t("Open orders")} (${orderRows.length})`],
              ["history", t("Recent order updates")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={onlyCurrent}
            onChange={(event) => setOnlyCurrent(event.target.checked)}
          />
          {t("Current pair only")}
        </label>
      </div>
      {!loggedIn ? (
        <p className="account-table-empty">{t("Log in to view orders and positions.")}</p>
      ) : tab === "positions" ? (
        <div className="table-wrap">
          <table className="data-table compact-trading-table">
            <thead>
              <tr>
                {[
                  "Symbol / Side",
                  "Margin / Leverage",
                  "Position quantity",
                  "Entry price",
                  "Mark price",
                  "Unrealized PnL",
                  "Realized PnL",
                  "Position margin",
                  "Maintenance margin",
                  "Margin ratio",
                  "Liquidation price",
                  "Risk status",
                  "TP/SL",
                ].map((label) => (
                  <th key={label}>{t(label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positionRows.map((position) => {
                const instrumentId = field(position, "instrumentId"),
                  side = field(position, "positionSide"),
                  mode = field(position, "marginMode")
                const m = marketFor(instrumentId),
                  settle = field(position, "marginAsset") || m?.settleAsset || m?.quoteAsset
                const risk = account?.ready()
                  ? account
                      .rows("risk")
                      .find(
                        (row) =>
                          row["instrumentId"] === instrumentId && row["positionSide"] === side,
                      )
                  : undefined
                const queriedRisk = riskSnapshots.find(
                  (row) => row["instrumentId"] === instrumentId && row["positionSide"] === side,
                )
                const leverage = account
                  ?.rows("leverage")
                  .find((row) => row["instrumentId"] === instrumentId && row["marginMode"] === mode)
                const mark = events.find(
                  (event) =>
                    event.channel === "mark" &&
                    event.instrumentId === instrumentId &&
                    event.productLine === productLine,
                )?.data as Row | undefined
                const markTicks =
                  mark?.["markPriceTicks"] ??
                  (mark?.["markPrice"] != null && m?.priceTickUnits && assetScales[m.quoteAsset]
                    ? String(
                        Math.round(
                          (Number(mark["markPrice"]) * Number(assetScales[m.quoteAsset])) /
                            Number(m.priceTickUnits),
                        ),
                      )
                    : undefined)
                const livePnl =
                  markTicks == null || m?.productLine === "OPTION"
                    ? null
                    : positionValuation(position, {
                        ...m,
                        contractType: m?.productLine,
                        markPriceTicks: markTicks,
                        settleScaleUnits: assetScales[settle ?? ""],
                      })?.pnl
                const isLong = Number(position["signedQuantitySteps"]) > 0
                const triggers = props.triggers.filter(
                  (row) => row.instrumentId === instrumentId && row.positionSide === side,
                )
                return (
                  <tr key={`${instrumentId}:${side}:${mode}`}>
                    <td>
                      <b>{m?.symbol ?? "—"}</b>
                      <small className={isLong ? "positive" : "negative"}>
                        {t(isLong ? "Long" : "Short")}
                      </small>
                    </td>
                    <td>
                      {t(mode === "ISOLATED" ? "Isolated" : "Cross")}
                      <small>
                        {leverage
                          ? `${Number(leverage["leveragePpm"]) / 1000000}×`
                          : m?.instrumentId === props.market?.instrumentId && props.leverageSetting
                            ? `${props.leverageSetting.leveragePpm / 1000000}×`
                            : "—"}
                      </small>
                    </td>
                    <td>{quantity(position["signedQuantitySteps"], m, assetScales)}</td>
                    <td>{price(position["entryPriceTicks"], m, assetScales)}</td>
                    <td>
                      {mark?.["markPrice"] == null
                        ? price(mark?.["markPriceTicks"], m, assetScales)
                        : formatPrice(
                            Number(mark["markPrice"]),
                            priceDecimalsForStep(
                              Number(m?.priceTickUnits) / Number(assetScales[m?.quoteAsset ?? ""]),
                              m?.pricePrecision,
                            ),
                          )}
                    </td>
                    <td
                      className={
                        Number(livePnl ?? risk?.["unrealizedPnlUnits"]) >= 0
                          ? "positive"
                          : "negative"
                      }
                    >
                      {units(
                        livePnl?.toString() ?? risk?.["unrealizedPnlUnits"],
                        settle,
                        assetScales,
                      )}
                    </td>
                    <td>{units(position["realizedPnlUnits"], settle, assetScales)}</td>
                    <td>{units(position["positionMarginUnits"], settle, assetScales)}</td>
                    <td>{units(risk?.["maintenanceMarginUnits"], settle, assetScales)}</td>
                    <td>
                      {risk?.["marginRatioPpm"] == null
                        ? "—"
                        : `${Number(risk["marginRatioPpm"]) / 10000}%`}
                    </td>
                    <td>{price(queriedRisk?.["liquidationPriceTicks"], m, assetScales)}</td>
                    <td>{field(risk, "status") || t("Risk data pending")}</td>
                    <td>
                      {triggers.length
                        ? triggers
                            .map(
                              (row) =>
                                `${row.triggerType}: ${price(row.triggerPriceTicks, m, assetScales)}`,
                            )
                            .join(" / ")
                        : t("Not set")}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!positionRows.length && <p className="account-table-empty">{t("No open positions.")}</p>}
        </div>
      ) : (
        <>
          {tab === "history" && (
            <p className="account-table-empty">
              {t("Shows up to 100 order updates received while this page is open.")}
            </p>
          )}
          <div className="table-wrap">
            <table className="data-table compact-trading-table">
              <thead>
                <tr>
                  {[
                    "Symbol / Type",
                    "Order time",
                    "Side / Margin",
                    "Average / Order price",
                    "Filled / Order quantity",
                    "Remaining / Progress",
                    "Filled / Order value",
                    "Settlement asset",
                    "Reduce only / Post only",
                    "Fee / Time in force",
                    "Status / Order ID",
                    "Actions",
                  ].map((label) => (
                    <th key={label}>{t(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(tab === "orders" ? orderRows : history.filter(filter)).map((row) => (
                  <TradingOrderRow
                    key={field(row, "orderId")}
                    row={row}
                    market={marketFor(field(row, "instrumentId"))}
                    scales={assetScales}
                    productLine={productLine}
                    onNotice={onNotice}
                  />
                ))}
              </tbody>
            </table>
            {!(tab === "orders" ? orderRows : history.filter(filter)).length && (
              <p className="account-table-empty">{t("No orders.")}</p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
function TradingOrderRow({
  row,
  market,
  scales,
  productLine,
  onNotice,
}: {
  readonly row: Row
  readonly market: Market | undefined
  readonly scales: Props["assetScales"]
  readonly productLine: ProductLine
  readonly onNotice: Props["onNotice"]
}) {
  const [canceling, setCanceling] = useState(false)
  const status = orderStatus(row),
    id = field(row, "orderId")
  const open = ["ACCEPTED", "PARTIALLY_FILLED", "PENDING_RESERVE"].includes(status)
  return (
    <tr>
      <td>
        <b>{market?.symbol ?? "—"}</b>
        <small>{field(row, "orderType")}</small>
      </td>
      <td>
        {timestamp(row, "created")}
        <small title={t("Last updated")}>{timestamp(row, "updated")}</small>
      </td>
      <td className={row["side"] === "BUY" ? "positive" : "negative"}>
        {t(row["side"] === "BUY" ? "Buy" : "Sell")}
        <small>
          {field(row, "marginMode")} · {field(row, "positionSide")}
        </small>
      </td>
      <td>
        <span title={t("Average execution price is shown when supplied by the order service.")}>
          {price(row["averagePriceTicks"], market, scales)}
        </span>
        <small>
          {row["orderType"] === "MARKET" ? t("Market") : price(row["priceTicks"], market, scales)}
        </small>
      </td>
      <td>
        {quantity(row["executedQuantitySteps"], market, scales)}
        <small>{quantity(row["quantitySteps"], market, scales)}</small>
      </td>
      <td>
        {quantity(row["remainingQuantitySteps"], market, scales)}
        <small>{fillProgress(row)}</small>
      </td>
      <td>
        {filledValue(row, market, scales)}
        <small>{valueAtLimit(row, market, scales)}</small>
      </td>
      <td>{market?.settleAsset ?? market?.quoteAsset ?? "—"}</td>
      <td>
        {t(row["reduceOnly"] ? "Yes" : "No")}
        <small>{t(row["postOnly"] ? "Yes" : "No")}</small>
      </td>
      <td>
        {units(row["cumulativeFeeUnits"], market?.settleAsset ?? market?.quoteAsset, scales)}
        <small>{field(row, "timeInForce")}</small>
      </td>
      <td>
        <b>{t(statusLabels[status] ?? status)}</b>
        <small title={id}>{id}</small>
      </td>
      <td>
        {open && (
          <button
            className="compact-cancel"
            type="button"
            disabled={canceling}
            onClick={() => {
              setCanceling(true)
              void cancelOrder(field(row, "instrumentId"), id, productLine)
                .then(() => onNotice(t("Cancellation requested."), false))
                .catch((reason) =>
                  onNotice(reason instanceof Error ? reason.message : String(reason), true),
                )
                .finally(() => setCanceling(false))
            }}
          >
            {t(canceling ? "Canceling" : "Cancel")}
          </button>
        )}
      </td>
    </tr>
  )
}
