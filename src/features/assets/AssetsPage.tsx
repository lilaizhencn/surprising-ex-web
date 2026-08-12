import { Eye, EyeOff, PieChart, Plus, Send, Shuffle } from "lucide-react"
import { useEffect, useState } from "react"
import { loadAssetScales, loadBalances, loadMarkets } from "../../api/endpoints"
import { mapBalance, mapMarket } from "../../api/mappers"
import type { ApiBalance, ApiMarket } from "../../api/types"
import { AssetIcon, Button, Panel, Price, StateView } from "../../components/ui/Primitives"
import { config } from "../../lib/config"
import { demoBalances } from "../../lib/demo"
import { formatUsd } from "../../lib/format"
import { loadSession } from "../../state/session"
import type { Balance, Market } from "../../types/domain"

export function AssetsPage() {
  const [balances, setBalances] = useState<readonly Balance[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(false)
  const session = loadSession()
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
      loadMarkets(),
      loadAssetScales(),
    ])
      .then((results) => {
        const balanceResults = results.slice(0, 6)
        const scaleResult = results[7]
        const assetScales = scaleResult?.status === "fulfilled" ? scaleResult.value : {}
        const rows = balanceResults.flatMap((result) => {
          if (result.status !== "fulfilled") return []
          if (!Array.isArray(result.value)) return []
          const value = result.value as readonly (ApiBalance | ApiMarket)[]
          return value.filter(isBalanceRow).map((row) => mapBalance(row, assetScales))
        })
        const marketResult = results[6]
        const marketRows =
          marketResult?.status === "fulfilled"
            ? marketResult.value.filter(isMarketRow).map(mapMarket)
            : []
        if (rows.length === 0) {
          const rejected = balanceResults.find((result) => result.status === "rejected")
          throw rejected?.status === "rejected" ? rejected.reason : new Error("账户服务暂不可用")
        }
        setBalances(rows.map((row) => withUsdEstimate(row, marketRows)))
        setError(null)
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "账户服务暂不可用"),
      )
      .finally(() => setLoading(false))
  }, [session])
  const demo = config.demoDataEnabled && balances.length === 0 && !session
  const rows = balances.length > 0 ? balances : demo ? demoBalances : []
  const total = rows.reduce((sum, balance) => sum + (balance.estimatedUsd ?? 0), 0)
  const distribution = aggregateAssets(rows)
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
          <div className="eyebrow">ESTIMATED BALANCE</div>
          <div className="balance-number mono">
            {hidden ? "••••••" : session || demo ? formatUsd(total) : "Log in to view"}{" "}
            <small>USD</small>
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
                <strong>
                  {total > 0 ? `${Math.round(((balance.estimatedUsd ?? 0) / total) * 100)}%` : "—"}
                </strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="section-title">
        <h2>My Accounts</h2>
      </div>
      <div className="table-wrap">
        <table className="data-table">
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
            ) : (
              <tr>
                <td colSpan={4}>
                  <StateView
                    kind={session ? "empty" : "error"}
                    message={
                      session
                        ? "No balances returned by the account service."
                        : "Sign in to view your assets."
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function withUsdEstimate(balance: Balance, markets: readonly Market[]): Balance {
  if (balance.available === null || balance.locked === null) {
    return { ...balance, estimatedUsd: null }
  }
  const amount = balance.available + balance.locked
  const asset = balance.asset.toUpperCase()
  if (["USD", "USDT", "USDC"].includes(asset)) {
    return { ...balance, estimatedUsd: amount }
  }
  const market = markets.find(
    (candidate) =>
      candidate.baseAsset.toUpperCase() === asset &&
      ["USD", "USDT", "USDC"].includes(candidate.quoteAsset.toUpperCase()) &&
      candidate.price !== null,
  )
  return {
    ...balance,
    estimatedUsd: market?.price === null || !market ? null : amount * market.price,
  }
}

function isBalanceRow(row: ApiBalance | ApiMarket): row is ApiBalance {
  return "asset" in row
}

function isMarketRow(row: ApiBalance | ApiMarket): row is ApiMarket {
  return "symbol" in row
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
