import { useEffect, useRef, useState } from "react"
import {
  loadAccountLedgerPage,
  loadAssetScales,
  loadDepositHistory,
  loadFundingPaymentsPage,
  loadMarkets,
  loadMyTrades,
  loadOrderHistory,
  loadProductLedgerPage,
  loadTransferHistoryPage,
  loadWithdrawalHistory,
} from "../../api/endpoints"
import { productLineLabels } from "../../components/layout/navigation"
import { DatePicker } from "../../components/ui/DatePicker"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { AssetIcon, Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"
import { PRODUCT_LINES, type ProductLine } from "../../types/domain"
import { units } from "../trading/TradingAccountTables"

type Category =
  | "funding-ledger"
  | "product-ledger"
  | "delivery-ledger"
  | "transfer"
  | "deposit"
  | "withdrawal"
  | "external-transfer"
  | "funding-payment"
  | "order"
  | "trade"
type Row = Readonly<Record<string, unknown>> & {
  amount?: unknown
  amountUnits?: unknown
  balanceAfterUnits?: unknown
  createdAt?: unknown
  entryId?: unknown
  id?: unknown
  orderId?: unknown
  paymentId?: unknown
  quantitySteps?: unknown
  reason?: unknown
  referenceId?: unknown
  referenceType?: unknown
  status?: unknown
  transactionId?: unknown
  transferId?: unknown
  updatedAt?: unknown
  asset?: unknown
  currency?: unknown
  instrumentId?: unknown
}

export function LedgerPage() {
  const session = useSession()
  const requestVersion = useRef(0)
  const [initial] = useState(() => new URLSearchParams(window.location.search))
  const [category, setCategory] = useState<Category>(() =>
    initial.get("category") === "delivery-ledger" ? "delivery-ledger" : "funding-ledger",
  )
  const [line, setLine] = useState<ProductLine>(() =>
    initial.get("category") === "delivery-ledger"
      ? initial.get("productLine") === PRODUCT_LINES.coinMDelivery
        ? PRODUCT_LINES.coinMDelivery
        : PRODUCT_LINES.usdMDelivery
      : PRODUCT_LINES.spot,
  )
  const [asset, setAsset] = useState("")
  const [instrumentId, setInstrumentId] = useState("")
  const [referenceType, setReferenceType] = useState("")
  const [status, setStatus] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [rows, setRows] = useState<readonly Row[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [markets, setMarkets] = useState<readonly { instrumentId: string; symbol: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [_referenceOptions, setReferenceOptions] = useState<readonly string[]>([])
  useEffect(() => {
    void loadAssetScales().then(setAssetScales, () => {})
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void loadMarkets(line, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted)
          setMarkets(rows.map((row) => ({ instrumentId: row.instrumentId, symbol: row.symbol })))
      },
      () => {
        if (!controller.signal.aborted) setMarkets([])
      },
    )
    return () => controller.abort()
  }, [line])
  const fetchPage = async (
    cursor?: string,
  ): Promise<{ rows: readonly Row[]; nextCursor: string | null }> => {
    if (category === "funding-ledger") {
      const page = await loadAccountLedgerPage(asset, referenceType, cursor)
      return { rows: page.entries, nextCursor: page.nextCursor }
    }
    if (category === "product-ledger" || category === "delivery-ledger") {
      const page = await loadProductLedgerPage(
        line,
        asset,
        category === "delivery-ledger" ? "DELIVERY_SETTLEMENT" : referenceType,
        cursor,
      )
      return { rows: page.entries, nextCursor: page.nextCursor }
    }
    if (category === "transfer") {
      const page = await loadTransferHistoryPage(line, asset, cursor)
      return { rows: page.transfers, nextCursor: page.nextCursor }
    }
    if (category === "funding-payment") {
      if (!session) return { rows: [], nextCursor: null }
      const page = await loadFundingPaymentsPage(
        session.user.userId,
        instrumentId.trim(),
        line,
        cursor,
      )
      return { rows: page.payments, nextCursor: page.nextCursor }
    }
    if (cursor) return { rows: [], nextCursor: null }
    if (category === "external-transfer") {
      const [deposits, withdrawals] = await Promise.all([
        loadDepositHistory(asset),
        loadWithdrawalHistory(asset),
      ])
      const rows: Row[] = [
        ...deposits.map((row) => ({ ...row, referenceType: "DEPOSIT" })),
        ...withdrawals.map((row) => ({ ...row, referenceType: "WITHDRAWAL" })),
      ]
      rows.sort(
        (left, right) =>
          Date.parse(String(right.createdAt ?? "")) - Date.parse(String(left.createdAt ?? "")),
      )
      return { rows, nextCursor: null }
    }
    const result: readonly Row[] =
      category === "deposit"
        ? await loadDepositHistory(asset)
        : category === "withdrawal"
          ? await loadWithdrawalHistory(asset)
          : category === "trade" && session
            ? await loadMyTrades(session.user.userId, instrumentId, line)
            : await loadOrderHistory(instrumentId, line, dateStart(from), dateEnd(to))
    return { rows: result, nextCursor: null }
  }
  useEffect(() => {
    ++requestVersion.current
    if (!session) return
    let active = true
    setLoading(true)
    setError("")
    setRows([])
    setNextCursor(null)
    void fetchPage()
      .then(
        (page) => {
          if (active) {
            setRows(page.rows)
            setNextCursor(page.nextCursor)
          }
        },
        (reason: unknown) => {
          if (active) {
            setRows([])
            setError(
              reason instanceof Error
                ? reason.message
                : t("Request failed. Please try again later."),
            )
          }
        },
      )
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [session, category, line, revision])
  const loadMore = () => {
    if (!nextCursor || loading) return
    const version = requestVersion.current
    setLoading(true)
    void fetchPage(nextCursor)
      .then(
        (page) => {
          if (version !== requestVersion.current) return
          setRows((current) => [...current, ...page.rows])
          setNextCursor(page.nextCursor)
        },
        (reason: unknown) => {
          if (version === requestVersion.current)
            setError(
              reason instanceof Error
                ? reason.message
                : t("Request failed. Please try again later."),
            )
        },
      )
      .finally(() => {
        if (version === requestVersion.current) setLoading(false)
      })
  }
  const visible = rows.filter((row) => {
    const created = new Date(String(row.createdAt ?? row.updatedAt ?? ""))
    if (from && (!Number.isFinite(created.getTime()) || created.getTime() < (dateStart(from) ?? 0)))
      return false
    if (to && (!Number.isFinite(created.getTime()) || created.getTime() > (dateEnd(to) ?? 0)))
      return false
    if (asset && String(row.asset ?? row.currency ?? "").toUpperCase() !== asset.toUpperCase())
      return false
    if (
      instrumentId &&
      !String(row.instrumentId ?? "").includes(instrumentId.trim()) &&
      category !== "funding-payment"
    )
      return false
    if (status && String(row.status ?? "").toUpperCase() !== status.toUpperCase()) return false
    if (
      referenceType &&
      String(row.referenceType ?? "").toUpperCase() !== referenceType.toUpperCase()
    )
      return false
    return true
  })
  const referenceTypes = [
    ...new Set(rows.map((row) => String(row.referenceType ?? "")).filter(Boolean)),
  ]
  const statuses = [...new Set(rows.map((row) => String(row.status ?? "")).filter(Boolean))]
  const showReferenceType = ["funding-ledger", "product-ledger"].includes(category)
  const showStatus =
    ["transfer", "deposit", "withdrawal", "external-transfer", "order", "trade"].includes(
      category,
    ) && statuses.length > 0
  useEffect(() => {
    if (!showReferenceType) return
    setReferenceOptions((current) => [...new Set([...current, ...referenceTypes])])
  }, [showReferenceType, referenceTypes.join("|")])
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>{t("Ledger")}</h1>
          <p>{t("Search account movements by product line, type, and time.")}</p>
        </div>
      </div>
      <Panel>
        <div className="ledger-filters">
          <Field label={t("Record type")}>
            <DropdownSelect
              aria-label={t("Record type")}
              value={category}
              onChange={(event) => {
                const next = event.target.value as Category
                setCategory(next)
                if (
                  next === "delivery-ledger" &&
                  line !== PRODUCT_LINES.usdMDelivery &&
                  line !== PRODUCT_LINES.coinMDelivery
                )
                  setLine(PRODUCT_LINES.usdMDelivery)
                if (
                  next === "funding-payment" &&
                  line !== PRODUCT_LINES.usdMPerpetual &&
                  line !== PRODUCT_LINES.coinMPerpetual
                )
                  setLine(PRODUCT_LINES.usdMPerpetual)
                setReferenceType("")
                setStatus("")
                setInstrumentId("")
              }}
            >
              <option value="funding-ledger">{t("Funding account ledger")}</option>
              <option value="product-ledger">{t("Product account ledger")}</option>
              <option value="delivery-ledger">{t("Delivery cash ledger")}</option>
              <option value="transfer">{t("Internal transfers")}</option>
              <option value="deposit">{t("Deposits")}</option>
              <option value="withdrawal">{t("Withdrawals")}</option>
              <option value="external-transfer">{t("External transfers")}</option>
              <option value="funding-payment">{t("Funding payments")}</option>
              <option value="order">{t("Orders")}</option>
              <option value="trade">{t("Trades")}</option>
            </DropdownSelect>
          </Field>
          {!["funding-ledger", "deposit", "withdrawal", "external-transfer"].includes(category) ? (
            <Field label={t("Product line")}>
              <DropdownSelect
                aria-label={t("Product line")}
                value={line}
                onChange={(event) => setLine(event.target.value as ProductLine)}
              >
                {(Object.values(PRODUCT_LINES) as ProductLine[])
                  .filter((value) =>
                    category === "delivery-ledger"
                      ? value === PRODUCT_LINES.usdMDelivery ||
                        value === PRODUCT_LINES.coinMDelivery
                      : category === "funding-payment"
                        ? value === PRODUCT_LINES.usdMPerpetual ||
                          value === PRODUCT_LINES.coinMPerpetual
                        : true,
                  )
                  .map((value) => (
                    <option key={value} value={value}>
                      {t(productLineLabels[value])}
                    </option>
                  ))}
              </DropdownSelect>
            </Field>
          ) : null}
          <Field label={t("Asset")}>
            <DropdownSelect
              aria-label={t("Asset")}
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
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
                .map((value) => (
                  <option key={value} value={value} data-search={value}>
                    {value}
                  </option>
                ))}
            </DropdownSelect>
          </Field>
          {["order", "trade", "funding-payment"].includes(category) ? (
            <Field label={t("Trading pair")}>
              <DropdownSelect
                aria-label={t("Trading pair")}
                value={instrumentId}
                onChange={(event) => setInstrumentId(event.target.value)}
                searchable
                searchPlaceholder={t("Search trading pair")}
                noResultsLabel={t("No matches")}
              >
                <option value="">{t("All pairs")}</option>
                {markets.map((market) => (
                  <option
                    key={market.instrumentId}
                    value={market.instrumentId}
                    data-search={market.symbol}
                  >
                    {market.symbol} · {market.instrumentId}
                  </option>
                ))}
              </DropdownSelect>
            </Field>
          ) : null}
          {showReferenceType ? (
            <Field label={t("Reference type")}>
              <DropdownSelect
                aria-label={t("Reference type")}
                value={referenceType}
                onChange={(event) => setReferenceType(event.target.value)}
              >
                <option value="">{t("All types")}</option>
                {referenceTypes.map((value) => (
                  <option key={value} value={value}>
                    {t(referenceTypeLabel(value))}
                  </option>
                ))}
              </DropdownSelect>
            </Field>
          ) : null}
          {showStatus ? (
            <Field label={t("Status")}>
              <DropdownSelect
                aria-label={t("Status")}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">{t("All statuses")}</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {t(statusLabel(value))}
                  </option>
                ))}
              </DropdownSelect>
            </Field>
          ) : null}
          <Field label={t("From")}>
            <DatePicker
              label={t("From")}
              value={from}
              onChange={setFrom}
              min="2000-01-01"
              max={todayDate()}
            />
          </Field>
          <Field label={t("To")}>
            <DatePicker
              label={t("To")}
              value={to}
              onChange={setTo}
              min="2000-01-01"
              max={todayDate()}
            />
          </Field>
          <Button loading={loading} onClick={() => setRevision((value) => value + 1)}>
            {t("Search")}
          </Button>
        </div>
      </Panel>
      {error ? (
        <Panel>
          <StateView kind="error" message={error} retry={() => setRevision((value) => value + 1)} />
        </Panel>
      ) : null}
      {loading ? (
        <Panel>
          <StateView kind="loading" message={t("Loading records")} />
        </Panel>
      ) : visible.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Time")}</th>
                <th>{t("Type")}</th>
                <th>{t("Asset")}</th>
                <th>{t("Amount")}</th>
                {showStatus ? <th>{t("Status")}</th> : null}
                {category === "delivery-ledger" ? <th>{t("Instrument ID")}</th> : null}
                {category === "delivery-ledger" ? <th>{t("Balance after")}</th> : null}
                <th>{t("Reference")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr
                  key={String(
                    row.entryId ??
                      row.transferId ??
                      row.paymentId ??
                      row.orderId ??
                      row.id ??
                      index,
                  )}
                >
                  <td>{formatDate(row.createdAt ?? row.updatedAt)}</td>
                  <td>
                    {t(referenceTypeLabel(String(row.referenceType ?? row.reason ?? category)))}
                  </td>
                  <td>{String(row.asset ?? row.currency ?? "—")}</td>
                  <td className="mono">
                    {row.amountUnits != null
                      ? units(row.amountUnits, String(row.asset ?? ""), assetScales)
                      : String(row.amount ?? row.quantitySteps ?? "—")}
                  </td>
                  {showStatus ? <td>{t(statusLabel(String(row.status ?? "")))}</td> : null}
                  {category === "delivery-ledger" ? (
                    <td className="mono">{String(row.instrumentId ?? "—")}</td>
                  ) : null}
                  {category === "delivery-ledger" ? (
                    <td className="mono">
                      {units(row.balanceAfterUnits, String(row.asset ?? ""), assetScales)}
                    </td>
                  ) : null}
                  <td className="mono">
                    {String(
                      row.referenceId ??
                        row.transactionId ??
                        row.instrumentId ??
                        row.orderId ??
                        "—",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!loading && !error && visible.length === 0 ? (
        <Panel>
          <StateView
            kind="empty"
            message={t(
              category === "delivery-ledger"
                ? "No delivery cash movements."
                : "No records match these filters.",
            )}
          />
        </Panel>
      ) : null}
      {nextCursor ? (
        <div className="ledger-load-more">
          <Button tone="outline" loading={loading} onClick={loadMore}>
            {t("Load more")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function dateStart(value: string): number | undefined {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined
}
function dateEnd(value: string): number | undefined {
  return value ? new Date(`${value}T23:59:59.999`).getTime() : undefined
}
function todayDate(): string {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}
function referenceTypeLabel(value: string): string {
  if (value === "DELIVERY_SETTLEMENT") return "Delivery settlement"
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
function statusLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
function formatDate(value: unknown): string {
  const date = new Date(String(value ?? ""))
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "—"
}
