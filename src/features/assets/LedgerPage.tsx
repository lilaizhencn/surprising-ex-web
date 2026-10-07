import { useEffect, useState } from "react"
import {
  loadAccountLedgerPage,
  loadAssetScales,
  loadDepositHistory,
  loadFundingPaymentsPage,
  loadMyTrades,
  loadOrderHistory,
  loadProductLedgerPage,
  loadTransferHistoryPage,
  loadWithdrawalHistory,
} from "../../api/endpoints"
import { productLineLabels } from "../../components/layout/navigation"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"
import { PRODUCT_LINES, type ProductLine } from "../../types/domain"
import { units } from "../trading/TradingAccountTables"

type Category =
  | "funding-ledger"
  | "product-ledger"
  | "transfer"
  | "deposit"
  | "withdrawal"
  | "external-transfer"
  | "funding-payment"
  | "order"
  | "trade"
type Row = Readonly<Record<string, unknown>>

export function LedgerPage() {
  const session = useSession()
  const [category, setCategory] = useState<Category>("funding-ledger")
  const [line, setLine] = useState<ProductLine>(PRODUCT_LINES.spot)
  const [asset, setAsset] = useState("")
  const [instrumentId, setInstrumentId] = useState("")
  const [referenceType, setReferenceType] = useState("")
  const [status, setStatus] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<readonly Row[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    void loadAssetScales().then(setAssetScales, () => {})
  }, [])
  const fetchPage = async (
    cursor?: string,
  ): Promise<{ rows: readonly Row[]; nextCursor: string | null }> => {
    if (category === "funding-ledger") {
      const page = await loadAccountLedgerPage(asset, referenceType, cursor)
      return { rows: page.entries, nextCursor: page.nextCursor }
    }
    if (category === "product-ledger") {
      const page = await loadProductLedgerPage(line, asset, referenceType, cursor)
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
          Date.parse(String(right.createdAt ?? "")) -
          Date.parse(String(left.createdAt ?? "")),
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
    if (!nextCursor) return
    setLoading(true)
    void fetchPage(nextCursor)
      .then(
        (page) => {
          setRows((current) => [...current, ...page.rows])
          setNextCursor(page.nextCursor)
        },
        (reason: unknown) =>
          setError(
            reason instanceof Error ? reason.message : t("Request failed. Please try again later."),
          ),
      )
      .finally(() => setLoading(false))
  }
  const visible = rows.filter((row) => {
    const created = new Date(String(row.createdAt ?? row.updatedAt ?? ""))
    if (from && (!Number.isFinite(created.getTime()) || created.getTime() < (dateStart(from) ?? 0)))
      return false
    if (to && (!Number.isFinite(created.getTime()) || created.getTime() > (dateEnd(to) ?? 0)))
      return false
    if (
      asset &&
      String(row.asset ?? row.currency ?? "").toUpperCase() !== asset.toUpperCase()
    )
      return false
    if (
      instrumentId &&
      !String(row.instrumentId ?? "").includes(instrumentId.trim()) &&
      category !== "funding-payment"
    )
      return false
    if (status && String(row["status"] ?? "").toUpperCase() !== status.toUpperCase()) return false
    if (
      referenceType &&
      category !== "funding-ledger" &&
      String(row["referenceType"] ?? "").toUpperCase() !== referenceType.toUpperCase()
    )
      return false
    return (
      !search ||
      Object.values(row).some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    )
  })
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
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              <option value="funding-ledger">{t("Funding account ledger")}</option>
              <option value="product-ledger">{t("Product account ledger")}</option>
              <option value="transfer">{t("Internal transfers")}</option>
              <option value="deposit">{t("Deposits")}</option>
              <option value="withdrawal">{t("Withdrawals")}</option>
              <option value="external-transfer">{t("External transfers")}</option>
              <option value="funding-payment">{t("Funding payments")}</option>
              <option value="order">{t("Orders")}</option>
              <option value="trade">{t("Trades")}</option>
            </select>
          </Field>
          {!["funding-ledger", "deposit", "withdrawal", "external-transfer"].includes(category) ? (
            <Field label={t("Product line")}>
              <select value={line} onChange={(event) => setLine(event.target.value as ProductLine)}>
                {(Object.values(PRODUCT_LINES) as ProductLine[]).map((value) => (
                  <option key={value} value={value}>
                    {t(productLineLabels[value])}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label={t("Asset")}>
            <input
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
              placeholder="USDT"
            />
          </Field>
          {["order", "trade", "funding-payment"].includes(category) ? (
            <Field label={t("Instrument ID")}>
              <input
                value={instrumentId}
                onChange={(event) => setInstrumentId(event.target.value)}
              />
            </Field>
          ) : null}
          {category === "funding-ledger" ? (
            <Field label={t("Reference type")}>
              <input
                value={referenceType}
                onChange={(event) => setReferenceType(event.target.value)}
              />
            </Field>
          ) : null}
          <Field label={t("Status")}>
            <input value={status} onChange={(event) => setStatus(event.target.value)} />
          </Field>
          <Field label={t("From")}>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label={t("To")}>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label={t("Search")}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("ID, reason, address...")}
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
                <th>{t("Status")}</th>
                <th>{t("Reference")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr
                  key={String(
                    row["entryId"] ??
                      row["transferId"] ??
                      row["paymentId"] ??
                      row["orderId"] ??
                      row["id"] ??
                      index,
                  )}
                >
                  <td>{formatDate(row["createdAt"] ?? row["updatedAt"])}</td>
                  <td>{String(row["referenceType"] ?? row["reason"] ?? category)}</td>
                  <td>{String(row["asset"] ?? row["currency"] ?? "—")}</td>
                  <td className="mono">
                    {row["amountUnits"] != null
                      ? units(row["amountUnits"], String(row["asset"] ?? ""), assetScales)
                      : String(row["amount"] ?? row["quantitySteps"] ?? "—")}
                  </td>
                  <td>{String(row["status"] ?? "—")}</td>
                  <td className="mono">
                    {String(
                      row["referenceId"] ??
                        row["transactionId"] ??
                        row["instrumentId"] ??
                        row["orderId"] ??
                        "—",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Panel>
          <StateView kind="empty" message={t("No records match these filters.")} />
        </Panel>
      )}
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
function formatDate(value: unknown): string {
  const date = new Date(String(value ?? ""))
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "—"
}
