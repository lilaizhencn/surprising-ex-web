import { Download, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  cancelAllAfter,
  cancelOpenAlgoOrders,
  cancelOpenTriggerOrders,
  checkOrderSubmission,
  continueCancellationPlan,
  loadAccountLedger,
  loadAssetScales,
  loadMarkets,
  loadMyTrades,
  loadOpenAlgoOrders,
  loadOrderHistory,
  loadProductLedger,
  loadTransferHistory,
} from "../../api/endpoints"
import { mapMarket } from "../../api/mappers"
import { DatePicker } from "../../components/ui/DatePicker"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { AssetIcon, Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { useRealtimeFeed } from "../../hooks/useRealtime"
import { t } from "../../i18n"
import {
  clearPendingCommand,
  pendingOrderChanged,
  readPendingCommand,
} from "../../state/pendingOrders"
import { currentAccountUserId, loadSession, useSession } from "../../state/session"
import { type Market, PRODUCT_LINES, type ProductLine } from "../../types/domain"
import {
  fillProgress,
  price,
  quantity,
  statusLabels,
  timestamp,
  units,
} from "../trading/TradingAccountTables"
import { OrderHistoryTable } from "./OrderHistoryTable"
import { AdvancedTradingActions, AlgoTable } from "./OrdersAlgoSection"
import { OrderTable, RecordTable } from "./OrdersTable"
import { TriggerTable } from "./OrdersTriggerTable"
import {
  dateValue,
  downloadCsv,
  inDateRange,
  type RecordRow,
  readError,
  type OrdersTab as Tab,
  text,
} from "./ordersShared"
import { TradeFillTable } from "./TradeFillTable"
import "./TradeHistory.css"

export function OrdersPage() {
  const session = useSession()
  const [pending, setPending] = useState(() =>
    readPendingCommand(String(currentAccountUserId(session) ?? "")),
  )
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    const update = () => setPending(readPendingCommand(String(currentAccountUserId(session) ?? "")))
    update()
    window.addEventListener("storage", update)
    window.addEventListener(pendingOrderChanged, update)
    return () => {
      window.removeEventListener("storage", update)
      window.removeEventListener(pendingOrderChanged, update)
    }
  }, [currentAccountUserId(session)])
  const commandPending = pending !== null && pending.userId === String(currentAccountUserId(session) ?? "")
  const [tab, setTab] = useState<Tab>("open")
  const [productLine, setProductLine] = useState<ProductLine>(PRODUCT_LINES.spot)
  const [instrumentId, setInstrumentId] = useState("")
  const [assetFilter, setAssetFilter] = useState("")
  const [marketOptions, setMarketOptions] = useState<{
    line: ProductLine
    items: readonly { instrumentId: string; symbol: string }[]
  } | null>(null)
  const isAssetTab = tab === "ledger" || tab === "product-ledger" || tab === "transfers"
  const filterValue = isAssetTab ? assetFilter : instrumentId
  const [status, setStatus] = useState("ALL")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [records, setRecords] = useState<{
    scope: string
    rows: readonly RecordRow[]
    nextCursor: string | null
  }>({ scope: "", rows: [], nextCursor: null })
  const requestVersion = useRef(0)
  const queryScope = JSON.stringify([
    currentAccountUserId(session),
    session?.sessionKey,
    productLine,
    tab,
    instrumentId,
    assetFilter,
    from,
    to,
    tab === "history" ? status : "",
  ])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState("")
  const [countdown, setCountdown] = useState("0")
  const realtime = useRealtimeFeed(session, [], 100, true, productLine)
  const privateView = realtime.views[productLine]

  const load = (more = false) => {
    if (!session) return
    if (more && (records.scope !== queryScope || !records.nextCursor || loading)) return
    const version = ++requestVersion.current
    setError("")
    if (tab === "open" || tab === "triggers") {
      realtime.refresh()
      setLoading(false)
      return
    }
    setLoading(true)
    if (!more) setRecords({ scope: queryScope, rows: [], nextCursor: null })
    const task =
      tab === "fills"
        ? loadMyTrades(currentAccountUserId(session), instrumentId, productLine, {
            startTime: dateValue(from),
            endTime: dateValue(to, true),
            cursor: more ? (records.nextCursor ?? undefined) : undefined,
          }).then((page) => ({
            rows: page.trades as readonly RecordRow[],
            nextCursor: page.nextCursor,
          }))
        : tab === "history"
          ? loadOrderHistory(
              instrumentId,
              productLine,
              dateValue(from),
              dateValue(to, true),
              more ? (records.nextCursor ?? undefined) : undefined,
              status === "ALL" ? undefined : status,
            ).then((page) => ({
              rows: page.orders as readonly RecordRow[],
              nextCursor: page.nextCursor,
            }))
          : (tab === "ledger"
              ? loadAccountLedger(assetFilter)
              : tab === "product-ledger"
                ? loadProductLedger(productLine, assetFilter)
                : tab === "transfers"
                  ? loadTransferHistory(productLine, assetFilter)
                  : tab === "algo"
                    ? loadOpenAlgoOrders(currentAccountUserId(session), instrumentId, productLine)
                    : Promise.resolve([])
            ).then((rows) => ({ rows: rows as readonly RecordRow[], nextCursor: null }))
    void task
      .then(
        (page) => {
          if (
            version !== requestVersion.current ||
            String(loadSession()?.user.userId) !== String(session.user.userId)
          )
            return
          setRecords((previous) => {
            const combined = [
              ...(more && previous.scope === queryScope ? previous.rows : []),
              ...page.rows,
            ]
            const unique =
              tab === "fills" || tab === "history"
                ? [
                    ...new Map(
                      combined.map((row) => [
                        tab === "history"
                          ? String(row["orderId"])
                          : `${row["tradeId"]}:${row["liquidityRole"]}:${row["orderId"]}`,
                        row,
                      ]),
                    ).values(),
                  ]
                : combined
            return { scope: queryScope, rows: unique, nextCursor: page.nextCursor }
          })
        },
        (reason: unknown) => {
          if (version === requestVersion.current) setError(readError(reason))
        },
      )
      .finally(() => {
        if (version === requestVersion.current) setLoading(false)
      })
  }
  useEffect(() => {
    load()
    return () => {
      ++requestVersion.current
    }
  }, [queryScope])
  const liveRows: readonly RecordRow[] =
    tab === "open"
      ? (privateView?.rows("order") ?? [])
          .filter((r) => r["status"] === "OPEN")
          .map((r) => ({
            ...r,
            status: Number(r["executedQuantitySteps"]) > 0 ? "PARTIALLY_FILLED" : "ACCEPTED",
          }))
      : tab === "triggers"
        ? (privateView?.rows("trigger") ?? []).filter((r) =>
            ["PENDING", "TRIGGERING"].includes(String(r["status"])),
          )
        : records.scope === queryScope
          ? records.rows
          : []
  const [markets, setMarkets] = useState<Readonly<Record<string, Market>>>({})
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  useEffect(() => {
    let active = true
    void loadAssetScales().then(
      (value) => {
        if (active) setAssetScales(value)
      },
      (reason: unknown) => {
        if (active) setError(readError(reason))
      },
    )
    return () => {
      active = false
    }
  }, [])
  const filtered = useMemo(
    () =>
      liveRows.filter(
        (row) =>
          inDateRange(row, from, to) &&
          (!filterValue || text(row, isAssetTab ? "asset" : "instrumentId") === filterValue) &&
          (status === "ALL" || text(row, "status").toUpperCase() === status),
      ),
    [liveRows, status, filterValue, isAssetTab, markets, productLine, from, to],
  )
  useEffect(() => {
    const controller = new AbortController()
    void loadMarkets(productLine, controller.signal).then(
      (rows) => {
        if (controller.signal.aborted) return
        setMarketOptions({ line: productLine, items: rows })
        setMarkets(
          Object.fromEntries(
            rows.map((row) => [`${productLine}:${row["instrumentId"]}`, mapMarket(row)]),
          ),
        )
      },
      (reason: unknown) => {
        if (!controller.signal.aborted) setError(readError(reason))
      },
    )
    return () => controller.abort()
  }, [productLine])
  const displayRows = filtered.map((row) => {
    const market = markets[`${productLine}:${text(row, "instrumentId")}`]
    return {
      ...row,
      symbol: market?.symbol ?? text(row, "instrumentId") ?? "—",
      displayPrice:
        row["orderType"] === "MARKET" ? t("Market") : price(row["priceTicks"], market, assetScales),
      displayQuantity: quantity(row["quantitySteps"], market, assetScales),
      displayFilled: quantity(row["executedQuantitySteps"], market, assetScales),
      displayAveragePrice: price(row["averagePriceTicks"], market, assetScales),
      displayFees: units(row["cumulativeFeeUnits"], market?.settleAsset, assetScales),
      displayCreatedAt: timestamp(row, "created"),
      displayUpdatedAt: timestamp(row, "updated"),
      fillProgress: fillProgress(row),
    }
  })
  const snapshotPending = (tab === "open" || tab === "triggers") && !privateView?.ready()
  const runBulkAction = async (operation: () => Promise<unknown>, success: string) => {
    setLoading(true)
    setActionMessage("")
    try {
      const result = await operation()
      if (String(loadSession()?.user.userId ?? "") !== String(session?.user.userId ?? "")) return
      setActionMessage(
        result &&
          typeof result === "object" &&
          "message" in result &&
          typeof result.message === "string"
          ? result.message
          : success,
      )
      load()
    } catch (reason: unknown) {
      setActionMessage(readError(reason))
    } finally {
      setLoading(false)
    }
  }
  if (!session)
    return (
      <div className="account-content">
        <div className="page-heading">
          <div>
            <h1>{t("Transaction History")}</h1>
            <p>{t("Review orders, fills, ledger entries and internal transfers.")}</p>
          </div>
        </div>
        <Panel>
          <StateView kind="error" message="Sign in to view orders and fills." />
          <a className="route-link" href="/auth/login">
            {" "}
            {t("Go to login")}{" "}
          </a>
        </Panel>
      </div>
    )
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>{t("Transaction History")}</h1>
          <p>{t("Review orders, fills, ledger entries and internal transfers.")}</p>
        </div>
        <Button
          tone="outline"
          disabled={displayRows.length === 0}
          onClick={() => downloadCsv(displayRows, tab)}
        >
          <Download size={16} /> {t("Export")}{" "}
        </Button>
      </div>
      {actionMessage ? (
        <div className="form-message" role="status">
          {actionMessage}
        </div>
      ) : null}
      {commandPending && (
        <div className="form-message" role="status">
          <p>
            {t(
              pending.cancelPlan
                ? "Cancellation results are pending. Check and continue the original request."
                : pending.cancelOrderId || pending.cancelTriggerOrderId
                  ? "Cancellation result is pending. Do not send it again."
                  : "Order result is pending. Do not submit it again.",
            )}
          </p>
          <Button
            disabled={checking}
            onClick={() => {
              if (!pending) return
              const original = pending
              setChecking(true)
              const task = original.cancelPlan
                ? continueCancellationPlan(original).then((result) => {
                    if (String(currentAccountUserId(loadSession()) ?? "") === original.userId) {
                      setActionMessage(result.message)
                      realtime.refresh()
                    }
                    return "handled" as const
                  })
                : checkOrderSubmission(original)
              void task
                .then((result) => {
                  if (result === "handled") return
                  if (String(currentAccountUserId(loadSession()) ?? "") !== original.userId) return
                  if (result === "pending") return
                  clearPendingCommand(original)
                  setActionMessage(
                    t(
                      original.amendRequestId
                        ? result === "confirmed"
                          ? "Amendment processing confirmed. Check both order states."
                          : "Amendment was rejected. Check the original order state."
                        : original.cancelOrderId || original.cancelTriggerOrderId
                          ? result === "confirmed"
                            ? "Cancellation processing confirmed. Check the latest order state."
                            : "Cancellation was rejected. Check the latest order state."
                          : result === "confirmed"
                            ? "Order processing confirmed. Check the latest account state."
                            : "Order was not accepted. Check your order state.",
                    ),
                  )
                  realtime.refresh()
                })
                .catch((reason: unknown) => {
                  if (String(currentAccountUserId(loadSession()) ?? "") === original.userId)
                    setActionMessage(readError(reason))
                })
                .finally(() => setChecking(false))
            }}
          >
            {t(
              pending.cancelPlan
                ? "Check and continue cancellations"
                : pending.amendRequestId
                  ? "Check amendment result"
                  : pending.cancelOrderId || pending.cancelTriggerOrderId
                    ? "Check cancellation result"
                    : "Check order result",
            )}
          </Button>
        </div>
      )}
      <div className="history-actions">
        <div className="inline-form">
          <input
            value={countdown}
            onChange={(event) => setCountdown(event.target.value)}
            inputMode="numeric"
            aria-label={t("Cancel all after milliseconds")}
          />
          <Button
            tone="outline"
            disabled={commandPending || !session || tab !== "open"}
            onClick={() => {
              if (!session) return
              const countdownMs = Math.max(0, Math.min(120000, Number(countdown) || 0))
              void runBulkAction(
                () =>
                  cancelAllAfter(
                    {
                      userId: currentAccountUserId(session),
                      instrumentId: instrumentId || null,
                      countdownMs,
                    },
                    productLine,
                  ),
                `${t("Cancel timer set (ms)")}: ${countdownMs}`,
              )
            }}
          >
            {" "}
            {t("Set cancel timer")}{" "}
          </Button>
        </div>
        <Button
          tone="outline"
          disabled={!session || tab !== "algo"}
          onClick={() => {
            if (!session) return
            void runBulkAction(
              () =>
                cancelOpenAlgoOrders(
                  { userId: currentAccountUserId(session), instrumentId: instrumentId || null, limit: 1000 },
                  productLine,
                ),
              t("Algo order batch cancellation requested."),
            )
          }}
        >
          {" "}
          {t("Cancel open algo")}{" "}
        </Button>
        <Button
          tone="outline"
          disabled={!session || tab !== "triggers"}
          onClick={() => {
            if (!session) return
            void runBulkAction(
              () =>
                cancelOpenTriggerOrders(
                  { userId: currentAccountUserId(session), instrumentId: instrumentId || null, limit: 1000 },
                  productLine,
                ),
              t("Trigger order batch cancellation requested."),
            )
          }}
        >
          {" "}
          {t("Cancel open triggers")}{" "}
        </Button>
      </div>
      <Panel className="orders-filter-panel">
        <div className="orders-filter-grid">
          <Field label={t("Product line")}>
            <DropdownSelect
              aria-label={t("Product line")}
              value={productLine}
              onChange={(event) => {
                setInstrumentId("")
                setProductLine(event.target.value as ProductLine)
              }}
            >
              <option value={PRODUCT_LINES.spot}>{t("Spot")}</option>
              <option value={PRODUCT_LINES.usdMPerpetual}>{t("USD-M perpetual")}</option>
              <option value={PRODUCT_LINES.coinMPerpetual}>{t("Coin-M perpetual")}</option>
              <option value={PRODUCT_LINES.usdMDelivery}>{t("USD-M delivery")}</option>
              <option value={PRODUCT_LINES.coinMDelivery}>{t("Coin-M delivery")}</option>
              <option value={PRODUCT_LINES.option}>{t("Options")}</option>
            </DropdownSelect>
          </Field>
          {isAssetTab ? (
            <Field label={t("Asset")}>
              <DropdownSelect
                aria-label={t("Asset")}
                value={assetFilter}
                onChange={(event) => setAssetFilter(event.target.value)}
                searchable
                searchPlaceholder={t("Search by asset name")}
                noResultsLabel={t("No matches")}
                maxMenuWidth={280}
                renderOption={(option) => (
                  <span className="ledger-asset-option">
                    <AssetIcon asset={option.value} />
                    {option.label}
                  </span>
                )}
              >
                <option value="">{t("All assets")}</option>
                {Object.keys(assetScales)
                  .sort()
                  .map((asset) => (
                    <option key={asset} value={asset}>
                      {asset}
                    </option>
                  ))}
              </DropdownSelect>
            </Field>
          ) : ["open", "history", "fills", "algo", "triggers"].includes(tab) ? (
            <Field label={t("Trading pair")}>
              <DropdownSelect
                aria-label={t("Select trading pair")}
                value={instrumentId}
                onChange={(event) => setInstrumentId(event.target.value)}
                searchable
                searchPlaceholder={t("Search trading pair")}
                noResultsLabel={t("No matches")}
              >
                <option value="">{t("All pairs")}</option>
                {(marketOptions?.line === productLine ? marketOptions.items : []).map((market) => (
                  <option
                    key={market.instrumentId}
                    value={market.instrumentId}
                    data-search={market.symbol}
                  >
                    {`${market.symbol} · ${market.instrumentId}`}
                  </option>
                ))}
              </DropdownSelect>
            </Field>
          ) : null}
          {["open", "history", "algo", "triggers"].includes(tab) ? (
            <Field label={t("Order status")}>
              <DropdownSelect
                aria-label={t("Order status")}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="ALL">{t("All statuses")}</option>
                {(tab === "history"
                  ? ["FILLED", "CANCELED", "REJECTED"]
                  : tab === "triggers"
                    ? [
                        "PENDING",
                        "TRIGGERING",
                        "TRIGGERED",
                        "TRIGGER_FAILED",
                        "CANCELED",
                        "EXPIRED",
                      ]
                    : [
                        "PENDING_RESERVE",
                        "ACCEPTED",
                        "PARTIALLY_FILLED",
                        "FILLED",
                        "CANCEL_REQUESTED",
                        "CANCELED",
                        "REJECTED",
                      ]
                ).map((value) => (
                  <option key={value} value={value}>
                    {t(statusLabels[value] ?? value)}
                  </option>
                ))}
              </DropdownSelect>
            </Field>
          ) : null}
          {["history", "fills", "ledger", "product-ledger", "transfers"].includes(tab) ? (
            <Field label={t("From")}>
              <DatePicker
                label={t("From date")}
                value={from}
                onChange={setFrom}
                min="2000-01-01"
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
          ) : null}
          {["history", "fills", "ledger", "product-ledger", "transfers"].includes(tab) ? (
            <Field label={t("To")}>
              <DatePicker
                label={t("To date")}
                value={to}
                onChange={setTo}
                min="2000-01-01"
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
          ) : null}
          <div className="orders-filter-actions">
            <Button tone="outline" onClick={() => load()}>
              <RefreshCw size={16} />
              {t("Refresh")}
            </Button>
          </div>
        </div>
      </Panel>
      <div className="segment-control history-tabs orders-history-tabs">
        <button
          type="button"
          className={tab === "open" ? "active" : ""}
          onClick={() => setTab("open")}
        >
          {" "}
          {t("Open orders")}{" "}
        </button>
        <button
          type="button"
          className={tab === "history" ? "active" : ""}
          onClick={() => {
            setStatus("ALL")
            setTab("history")
          }}
        >
          {" "}
          {t("Order history")}{" "}
        </button>
        <button
          type="button"
          className={tab === "fills" ? "active" : ""}
          onClick={() => setTab("fills")}
        >
          {" "}
          {t("Fills")}{" "}
        </button>
        <button
          type="button"
          className={tab === "ledger" ? "active" : ""}
          onClick={() => setTab("ledger")}
        >
          {" "}
          {t("Account ledger")}{" "}
        </button>
        <button
          type="button"
          className={tab === "product-ledger" ? "active" : ""}
          onClick={() => setTab("product-ledger")}
        >
          {" "}
          {t("Product ledger")}{" "}
        </button>
        <button
          type="button"
          className={tab === "transfers" ? "active" : ""}
          onClick={() => setTab("transfers")}
        >
          {" "}
          {t("Transfers")}{" "}
        </button>
        <button
          type="button"
          className={tab === "algo" ? "active" : ""}
          onClick={() => setTab("algo")}
        >
          {" "}
          {t("Algo orders")}{" "}
        </button>
        <button
          type="button"
          className={tab === "triggers" ? "active" : ""}
          onClick={() => setTab("triggers")}
        >
          {" "}
          {t("Conditional orders")}{" "}
        </button>
        <button
          type="button"
          className={tab === "advanced" ? "active" : ""}
          onClick={() => setTab("advanced")}
        >
          {" "}
          {t("Advanced actions")}{" "}
        </button>
      </div>
      <Panel>
        {tab === "advanced" ? (
          <AdvancedTradingActions
            session={session}
            productLine={productLine}
            instrumentId={instrumentId}
            symbol={
              marketOptions?.line === productLine
                ? (marketOptions.items.find((market) => market.instrumentId === instrumentId)
                    ?.symbol ?? "—")
                : "—"
            }
            onDone={(value) => setActionMessage(value)}
          />
        ) : error ? (
          <StateView kind="error" message={error} retry={() => load()} />
        ) : loading || snapshotPending ? (
          <StateView kind="loading" message="Loading order state" />
        ) : displayRows.length === 0 ? (
          <StateView
            kind="empty"
            message={
              tab === "open"
                ? "No open orders returned by the trading service."
                : tab === "history"
                  ? "No historical orders returned by the trading service."
                  : tab === "fills"
                    ? "No private trade fills returned by the trading service."
                    : tab === "ledger"
                      ? "No account ledger entries returned by the account service."
                      : tab === "product-ledger"
                        ? "No product ledger entries returned by the account service."
                        : tab === "transfers"
                          ? "No transfer records returned by the account service."
                          : tab === "algo"
                            ? "No open algorithmic orders returned by the trading service."
                            : "No open conditional orders returned by the trading service."
            }
          />
        ) : tab === "ledger" || tab === "product-ledger" || tab === "transfers" ? (
          <RecordTable
            rows={displayRows}
            mode={tab}
            assetScales={assetScales}
            productLine={productLine}
          />
        ) : tab === "history" ? (
          <OrderHistoryTable
            rows={displayRows}
            markets={markets}
            scales={assetScales}
            productLine={productLine}
          />
        ) : tab === "fills" ? (
          <TradeFillTable rows={displayRows} markets={markets} scales={assetScales} />
        ) : tab === "algo" ? (
          <AlgoTable
            rows={displayRows}
            productLine={productLine}
            onDone={(message) => {
              setActionMessage(message)
              load()
            }}
          />
        ) : tab === "triggers" ? (
          <TriggerTable
            rows={displayRows}
            productLine={productLine}
            onDone={(value) => {
              setActionMessage(value)
              load()
            }}
          />
        ) : (
          <OrderTable
            markets={markets}
            assetScales={assetScales}
            commandPending={commandPending}
            rows={displayRows}
            canCancel={tab === "open"}
            productLine={productLine}
            onDone={(message) => {
              setActionMessage(message)
              load()
            }}
          />
        )}
      </Panel>
      {(tab === "fills" || tab === "history") &&
      records.scope === queryScope &&
      records.nextCursor &&
      !error ? (
        <Button tone="outline" loading={loading} onClick={() => load(true)}>
          {t("Load more")}
        </Button>
      ) : null}
    </div>
  )
}
