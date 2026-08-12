import { Eye, EyeOff, PieChart, Plus, Send, Shuffle } from "lucide-react"
import { useEffect, useState } from "react"
import { loadBalances } from "../../api/endpoints"
import { mapBalance } from "../../api/mappers"
import { AssetIcon, Button, Panel, Price, StateView } from "../../components/ui/Primitives"
import { config } from "../../lib/config"
import { demoBalances } from "../../lib/demo"
import { formatUsd } from "../../lib/format"
import { loadSession } from "../../state/session"
import type { Balance } from "../../types/domain"

export function AssetsPage() {
  const [balances, setBalances] = useState<readonly Balance[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const session = loadSession()
  useEffect(() => {
    if (!session) return
    void loadBalances()
      .then((rows) => setBalances(rows.map(mapBalance)))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "账户服务暂不可用"),
      )
  }, [session])
  const demo = config.demoDataEnabled && balances.length === 0 && !session
  const rows = balances.length > 0 ? balances : demo ? demoBalances : []
  const total = rows.reduce((sum, balance) => sum + (balance.estimatedUsd ?? 0), 0)
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
            {rows.slice(0, 3).map((balance, index) => (
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
            {rows.length > 0 ? (
              rows.map((balance) => (
                <tr key={balance.asset}>
                  <td>
                    <span className="market-name">
                      <AssetIcon asset={balance.asset} />
                      <strong>{balance.asset}</strong>
                      <span className="muted">Wallet balance</span>
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
