import { Eye, EyeOff, FileText, PieChart, Plus, Send, Shuffle } from "lucide-react"
import { useEffect, useState } from "react"
import { loadAccountLedger, loadAssetScales } from "../../api/endpoints"
import { AssetIcon, Button, Panel, Price, StateView } from "../../components/ui/Primitives"
import { useRealtimeAssets } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoBalances } from "../../lib/demo"
import { formatUsd } from "../../lib/format"
import { signedUnitsToDecimal } from "../../lib/units"
import { useSession } from "../../state/session"
import type { Balance } from "../../types/domain"

type LedgerRow = Readonly<Record<string, unknown> & { readonly amountUnits?: string | number }>

export function AssetsPage({ account }: { readonly account: string | null }) {
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ledger, setLedger] = useState<readonly LedgerRow[]>([])
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const session = useSession()
  const realtime = useRealtimeAssets(session, assetScales)
  useEffect(() => {
    if (!session) return
    let cancelled = false
    setLoading(true)
    void Promise.allSettled([loadAssetScales(), loadAccountLedger()])
      .then(([scaleResult, ledgerResult]) => {
        if (cancelled) return
        if (scaleResult.status === "rejected") throw scaleResult.reason
        setAssetScales(scaleResult.value)
        setLedger(ledgerResult.status === "fulfilled" ? ledgerResult.value : [])
        setLedgerError(ledgerResult.status === "rejected" ? readError(ledgerResult.reason) : null)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : t("Asset service unavailable"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session])
  const demo = config.demoDataEnabled && !session
  const allRows = session ? realtime.balances : demo ? demoBalances : []
  const rows = allRows.filter((balance) => accountMatches(balance, account))
  const hasUsdValuation =
    (demo || (realtime.ready && !loading && !error)) &&
    rows.every((balance) => balance.estimatedUsd !== null)
  const total = hasUsdValuation
    ? rows.reduce((sum, balance) => sum + (balance.estimatedUsd ?? 0), 0)
    : null
  const distribution = aggregateAssets(rows)
  const hasDistribution = distribution.length > 0 && total !== null && total > 0
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>{t("Asset Overview")}</h1>
          <p>{t("Review account balances and move funds with explicit confirmation.")}</p>
        </div>
        <Button tone="outline" onClick={() => setHidden(!hidden)}>
          {hidden ? <Eye size={16} /> : <EyeOff size={16} />} {t(hidden ? "Show" : "Hide")}
        </Button>
      </div>
      {session && !realtime.ready ? (
        <div role="status">
          {" "}
          {t("Syncing assets")}
          {realtime.error ? `: ${realtime.error}` : ""}
        </div>
      ) : null}
      {demo ? (
        <div className="demo-banner">
          {t("Demo data: balances are for local visual checks only.")}
        </div>
      ) : null}
      {error && rows.length === 0 ? (
        <Panel>
          <StateView kind="error" message={error} retry={() => window.location.reload()} />
        </Panel>
      ) : null}
      <div className="asset-overview-grid">
        <Panel className="balance-hero">
          <div className="eyebrow">{t("ACCOUNT BALANCE")}</div>
          <div className="balance-number mono">
            {hidden
              ? "••••••"
              : session || demo
                ? total === null
                  ? "—"
                  : formatUsd(total)
                : "Log in to view"}{" "}
            <small>
              {total === null
                ? t(loading || !realtime.ready ? "Syncing assets" : "Valuation unavailable")
                : "USD"}
            </small>
          </div>
          <div className="balance-actions">
            <Button
              onClick={() => {
                window.location.href = "/assets/deposit"
              }}
            >
              <Plus size={16} /> {t("Deposit")}{" "}
            </Button>
            <Button
              tone="outline"
              onClick={() => {
                window.location.href = "/assets/withdraw"
              }}
            >
              <Send size={16} /> {t("Withdraw")}{" "}
            </Button>
            <Button
              tone="outline"
              onClick={() => {
                window.location.href = "/assets/transfer"
              }}
            >
              <Shuffle size={16} /> {t("Transfer")}{" "}
            </Button>
          </div>
        </Panel>
        <Panel className="distribution">
          <h2>{t("Asset distribution")}</h2>
          {hasDistribution ? (
            <>
              <div className="donut">
                <span>
                  <PieChart size={30} />
                </span>
              </div>
              <div className="distribution-rows">
                {distribution.slice(0, 3).map((balance, index) => (
                  <div key={balance.asset}>
                    <span>
                      <i className={`dot dot-${index}`} />
                      {balance.asset}
                    </span>
                    <strong>{`${Math.round(((balance.estimatedUsd ?? 0) / total) * 100)}%`}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <StateView
              kind={session && (loading || !realtime.ready) ? "loading" : "empty"}
              message={
                session
                  ? loading || !realtime.ready
                    ? "Syncing assets"
                    : total === null
                      ? "Valuation unavailable"
                      : "No assets to display yet."
                  : "Sign in to view your asset distribution."
              }
            />
          )}
        </Panel>
      </div>
      {ledgerError ? (
        <div className="inline-error" role="alert">
          {" "}
          {t("Funding ledger unavailable:")}
          {ledgerError}
        </div>
      ) : null}
      <div className="asset-overview-grid">
        <Panel>
          <div className="panel-heading">
            <h2>{t("Funding ledger")}</h2>
            <FileText size={18} />
          </div>
          {ledger.length === 0 ? (
            <StateView
              kind={loading ? "loading" : "empty"}
              message={loading ? "Loading funding history" : "No funding account activity yet."}
            />
          ) : (
            <div className="asset-ledger-list">
              {ledger.slice(0, 8).map((entry, index) => (
                <div className="asset-ledger-item" key={text(entry, "entryId") || String(index)}>
                  <div>
                    <strong>{text(entry, "referenceType") || "Account update"}</strong>
                    <small>
                      {text(entry, "asset")} · {text(entry, "createdAt") || "—"}
                    </small>
                  </div>
                  <b className="mono">{formatLedgerAmount(entry, assetScales)}</b>
                </div>
              ))}
            </div>
          )}
          <a className="route-link" href="/assets/orders">
            {" "}
            {t("View full transaction history")}{" "}
          </a>
        </Panel>
        <Panel>
          <div className="panel-heading">
            <h2>{t("Account totals")}</h2>
            <span className="muted">{t("Live balances")}</span>
          </div>
          {aggregateAssets(rows)
            .slice(0, 6)
            .map((balance) => (
              <div className="row-between" key={balance.asset}>
                <span>{balance.asset}</span>
                <strong className="mono">
                  {hidden ? "••••" : formatUsd(balance.estimatedUsd)}
                </strong>
              </div>
            ))}
        </Panel>
      </div>
      <div className="section-title">
        <h2>{t("My Accounts")}</h2>
      </div>
      {loading || !realtime.ready || rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table asset-account-table">
            <thead>
              <tr>
                <th>{t("Account")}</th>
                <th className="number">{t("Balance (USD)")}</th>
                <th className="number">{t("Available")}</th>
                <th className="number">{t("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {loading || (session && !realtime.ready) ? (
                <tr>
                  <td colSpan={4}>
                    <StateView kind="loading" message="Loading account balances" />
                  </td>
                </tr>
              ) : rows.length > 0 ? (
                rows.map((balance) => (
                  <tr key={`${balance.accountType ?? "ACCOUNT"}-${balance.asset}`}>
                    <td>
                      <span className="market-name">
                        <AssetIcon asset={balance.asset} />
                        <strong>{balance.asset}</strong>
                        <span className="muted">{accountLabel(balance.accountType)}</span>
                      </span>
                    </td>
                    <td className="number mono">
                      {hidden ? "••••" : formatUsd(balance.estimatedUsd)}
                    </td>
                    <td className="number mono">
                      {hidden ? "••••" : <Price value={balance.available} />}
                    </td>
                    <td className="number">
                      <a className="route-link" href="/assets/transfer">
                        {" "}
                        {t("Move funds")}{" "}
                      </a>
                    </td>
                  </tr>
                ))
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <Panel className="asset-account-empty">
          <StateView
            kind={session ? "empty" : "error"}
            message={
              session
                ? "No balances returned by the account service."
                : "Sign in to view your assets."
            }
          />
        </Panel>
      )}
    </div>
  )
}

function aggregateAssets(rows: readonly Balance[]): readonly Balance[] {
  const byAsset = new Map<string, Balance>()
  for (const row of rows) {
    const current = byAsset.get(row.asset) ?? {
      asset: row.asset,
      available: 0,
      locked: 0,
      estimatedUsd: 0,
    }
    byAsset.set(row.asset, {
      ...current,
      available: (current.available ?? 0) + (row.available ?? 0),
      locked: (current.locked ?? 0) + (row.locked ?? 0),
      estimatedUsd:
        current.estimatedUsd === null || row.estimatedUsd === null
          ? null
          : current.estimatedUsd + row.estimatedUsd,
    })
  }
  return [...byAsset.values()].sort(
    (left, right) => (right.estimatedUsd ?? 0) - (left.estimatedUsd ?? 0),
  )
}

function accountLabel(accountType: string | undefined): string {
  if (!accountType) return "Account balance"
  return accountType.replaceAll("_", " ")
}

function accountMatches(balance: Balance, account: string | null): boolean {
  if (!account || account === "overview") return true
  const type = (balance.accountType ?? "").toUpperCase()
  if (account === "spot") return type === "SPOT"
  if (account === "options") return type === "OPTION"
  if (account === "futures") return type.endsWith("PERPETUAL") || type.endsWith("DELIVERY")
  return true
}

function text(row: LedgerRow, key: string): string {
  const value = row[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

function formatLedgerAmount(row: LedgerRow, assetScales: Readonly<Record<string, string>>): string {
  const raw = row.amountUnits
  const asset = text(row, "asset")
  const scale = assetScales[asset]
  if ((typeof raw !== "string" && typeof raw !== "number") || !scale) {
    return raw === undefined ? "—" : `${String(raw)} units`
  }
  try {
    return `${signedUnitsToDecimal(raw, scale)} ${asset}`
  } catch {
    return `${String(raw)} units`
  }
}

function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Account ledger unavailable"
}
