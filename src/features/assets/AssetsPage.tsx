import { Eye, EyeOff, FileText, PieChart, Plus, Send, Shuffle } from "lucide-react"
import { useEffect, useState } from "react"
import {
  loadAccountLedger,
  loadAssetScales,
  loadBalances,
  loadUsdValuation,
} from "../../api/endpoints"
import { mapBalance } from "../../api/mappers"
import type { ApiBalance } from "../../api/types"
import { AssetIcon, Button, Panel, Price, StateView } from "../../components/ui/Primitives"
import { config } from "../../lib/config"
import { demoBalances } from "../../lib/demo"
import { formatUsd } from "../../lib/format"
import { signedUnitsToDecimal, stepUnitsToDecimal } from "../../lib/units"
import { useSession } from "../../state/session"
import type { Balance } from "../../types/domain"

type LedgerRow = Readonly<Record<string, unknown> & { readonly amountUnits?: string | number }>

export function AssetsPage({ account }: { readonly account: string | null }) {
  const [balances, setBalances] = useState<readonly Balance[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ledger, setLedger] = useState<readonly LedgerRow[]>([])
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const session = useSession()
  useEffect(() => {
    if (!session) return
    setLoading(true)
    void Promise.allSettled([
      loadBalances("SPOT"),
      loadBalances("LINEAR_PERPETUAL"),
      loadBalances("INVERSE_PERPETUAL"),
      loadBalances("LINEAR_DELIVERY"),
      loadBalances("INVERSE_DELIVERY"),
      loadBalances("OPTION"),
      loadBalances(undefined, "FUNDING"),
      loadAssetScales(),
      loadAccountLedger(),
    ])
      .then((results) => {
        const balanceResults = results.slice(0, 7)
        const scaleResult = results[7]
        const ledgerResult = results[8]
        const assetScales = scaleResult?.status === "fulfilled" ? scaleResult.value : {}
        const rawRows = balanceResults.flatMap((result) => {
          if (result.status !== "fulfilled") return []
          if (!Array.isArray(result.value)) return []
          const value = result.value as readonly ApiBalance[]
          return value.filter(isBalanceRow)
        })
        if (rawRows.length === 0) {
          const rejected = balanceResults.find((result) => result.status === "rejected")
          throw rejected?.status === "rejected" ? rejected.reason : new Error("账户服务暂不可用")
        }
        setLedger(ledgerResult?.status === "fulfilled" ? ledgerResult.value : [])
        setAssetScales(assetScales)
        setLedgerError(ledgerResult?.status === "rejected" ? readError(ledgerResult.reason) : null)
        void Promise.all(rawRows.map((row) => mapBalanceWithUsd(row, assetScales))).then(
          setBalances,
        )
        setError(null)
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "账户服务暂不可用"),
      )
      .finally(() => setLoading(false))
  }, [session])
  const demo = config.demoDataEnabled && balances.length === 0 && !session
  const allRows = balances.length > 0 ? balances : demo ? demoBalances : []
  const rows = allRows.filter((balance) => accountMatches(balance, account))
  const hasUsdValuation = rows.some((balance) => balance.estimatedUsd !== null)
  const total = hasUsdValuation
    ? rows.reduce((sum, balance) => sum + (balance.estimatedUsd ?? 0), 0)
    : null
  const distribution = aggregateAssets(rows)
  const hasDistribution = distribution.length > 0 && total !== null && total > 0
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>Asset Overview</h1>
          <p>Review account balances and move funds with explicit confirmation.</p>
        </div>
        <Button tone="outline" onClick={() => setHidden(!hidden)}>
          {hidden ? <Eye size={16} /> : <EyeOff size={16} />} {hidden ? "Show" : "Hide"}
        </Button>
      </div>
      {demo ? (
        <div className="demo-banner">演示数据：未登录，资产数字仅用于本地视觉检查。</div>
      ) : null}
      {error && rows.length === 0 ? (
        <Panel>
          <StateView kind="error" message={error} retry={() => window.location.reload()} />
        </Panel>
      ) : null}
      <div className="asset-overview-grid">
        <Panel className="balance-hero">
          <div className="eyebrow">ACCOUNT BALANCE</div>
          <div className="balance-number mono">
            {hidden
              ? "••••••"
              : session || demo
                ? total === null
                  ? "—"
                  : formatUsd(total)
                : "Log in to view"}{" "}
            <small>{total === null ? "Backend valuation unavailable" : "USD"}</small>
          </div>
          <div className="balance-actions">
            <Button
              onClick={() => {
                window.location.href = "/assets/deposit"
              }}
            >
              <Plus size={16} /> Deposit
            </Button>
            <Button
              tone="outline"
              onClick={() => {
                window.location.href = "/assets/withdraw"
              }}
            >
              <Send size={16} /> Withdraw
            </Button>
            <Button
              tone="outline"
              onClick={() => {
                window.location.href = "/assets/transfer"
              }}
            >
              <Shuffle size={16} /> Transfer
            </Button>
          </div>
        </Panel>
        <Panel className="distribution">
          <h2>Asset distribution</h2>
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
              kind={session ? "empty" : "error"}
              message={
                session
                  ? "Asset distribution is unavailable until balances are returned."
                  : "Sign in to view your asset distribution."
              }
            />
          )}
        </Panel>
      </div>
      {ledgerError ? (
        <div className="inline-error" role="alert">
          资金账本暂不可用：{ledgerError}
        </div>
      ) : null}
      <div className="asset-overview-grid">
        <Panel>
          <div className="panel-heading">
            <h2>Funding ledger</h2>
            <FileText size={18} />
          </div>
          {ledger.length === 0 ? (
            <StateView
              kind="empty"
              message="No funding ledger entries returned by the account service."
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
            View full transaction history
          </a>
        </Panel>
        <Panel>
          <div className="panel-heading">
            <h2>Account totals</h2>
            <span className="muted">Live balances</span>
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
        <h2>My Accounts</h2>
      </div>
      {loading || rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table asset-account-table">
            <thead>
              <tr>
                <th>Account</th>
                <th className="number">Balance (USD)</th>
                <th className="number">Available</th>
                <th className="number">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
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
                        Move funds
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

function isBalanceRow(row: ApiBalance): row is ApiBalance {
  return "asset" in row
}

async function mapBalanceWithUsd(
  raw: ApiBalance,
  assetScales: Readonly<Record<string, string>>,
): Promise<Balance> {
  const balance = mapBalance(raw, assetScales)
  const scale = assetScales[raw.asset]
  const available =
    raw.availableUnits !== undefined && scale
      ? stepUnitsToDecimal(raw.availableUnits, "1", scale)
      : raw.free === undefined
        ? "0"
        : String(raw.free)
  const locked =
    raw.lockedUnits !== undefined && scale
      ? stepUnitsToDecimal(raw.lockedUnits, "1", scale)
      : raw.locked === undefined
        ? "0"
        : String(raw.locked)
  const amount = decimalAdd(available, locked)
  try {
    const valuation = await loadUsdValuation(amount, raw.asset)
    const estimatedUsd = Number(valuation.convertedAmount)
    return Number.isFinite(estimatedUsd) ? { ...balance, estimatedUsd } : balance
  } catch {
    return balance
  }
}

function decimalAdd(left: string, right: string): string {
  const [leftWhole, leftFraction = ""] = left.split(".")
  const [rightWhole, rightFraction = ""] = right.split(".")
  const digits = Math.max(leftFraction.length, rightFraction.length)
  const leftValue = BigInt(`${leftWhole}${leftFraction.padEnd(digits, "0")}`)
  const rightValue = BigInt(`${rightWhole}${rightFraction.padEnd(digits, "0")}`)
  const total = leftValue + rightValue
  if (digits === 0) return total.toString()
  const normalized = total.toString().padStart(digits + 1, "0")
  return `${normalized.slice(0, -digits)}.${normalized.slice(-digits).replace(/0+$/, "")}`.replace(
    /\.$/,
    "",
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
