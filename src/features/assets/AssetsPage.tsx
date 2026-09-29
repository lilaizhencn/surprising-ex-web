import { Eye, EyeOff, PieChart, Plus, Send, Shuffle } from "lucide-react"
import { useEffect, useState } from "react"
import { loadAssetScales } from "../../api/endpoints"
import { productLineLabels } from "../../components/layout/navigation"
import { AssetIcon, Button, Panel, Price, StateView } from "../../components/ui/Primitives"
import { useRealtimeAssets } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoBalances } from "../../lib/demo"
import { formatUsd } from "../../lib/format"
import { useSession } from "../../state/session"
import { type Balance, PRODUCT_LINES, type ProductLine } from "../../types/domain"

const productAccounts: Readonly<Record<ProductLine, string>> = {
  SPOT: "SPOT",
  LINEAR_PERPETUAL: "USDT_PERPETUAL",
  INVERSE_PERPETUAL: "COIN_PERPETUAL",
  LINEAR_DELIVERY: "USDT_DELIVERY",
  INVERSE_DELIVERY: "COIN_DELIVERY",
  OPTION: "OPTION",
}
const assetColors = ["#5b8def", "#31c48d", "#f59e0b", "#9b7ae4", "#ef6c78", "#64748b"]

export function AssetsPage({ account }: { readonly account: string | null }) {
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(false)
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const session = useSession()
  const realtime = useRealtimeAssets(session, assetScales)
  useEffect(() => {
    if (!session) return
    let cancelled = false
    setLoading(true)
    void loadAssetScales()
      .then((scaleResult) => {
        if (cancelled) return
        setAssetScales(scaleResult)
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
  const segments = hasDistribution ? distributionSegments(distribution, total) : []
  const overview = !account || account === "overview"
  const selectedLine = (Object.keys(PRODUCT_LINES) as (keyof typeof PRODUCT_LINES)[])
    .map((key) => PRODUCT_LINES[key])
    .find((line) => productAccountKey(line) === account)
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>
            {overview
              ? t("Overview")
              : selectedLine
                ? `${t(productLineLabels[selectedLine])} ${t("Assets")}`
                : t("Assets")}
          </h1>
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
              <div
                className="donut"
                style={{ background: donutGradient(segments) }}
                aria-label={t("Asset distribution")}
                role="img"
              >
                <span>
                  <PieChart size={30} />
                </span>
              </div>
              <div className="distribution-rows">
                {segments.map((segment) => (
                  <div key={segment.asset}>
                    <span>
                      <i className="dot" style={{ background: segment.color }} />
                      {segment.asset}
                    </span>
                    <strong>{`${segment.percent.toFixed(1)}%`}</strong>
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
      {overview ? (
        <section className="section-block">
          <div className="panel-heading">
            <h2>{t("Assets by product line")}</h2>
            <a className="route-link" href="/assets/ledger">
              {t("View ledger")}
            </a>
          </div>
          <div className="asset-product-grid">
            {(Object.values(PRODUCT_LINES) as ProductLine[]).map((line) => {
              const lineRows = allRows.filter((row) => row.accountType === productAccounts[line])
              const available = demo || realtime.products.includes(line)
              const value = lineRows.every((row) => row.estimatedUsd !== null)
                ? lineRows.reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0)
                : null
              return (
                <a
                  className="asset-product-card"
                  href={`/assets?account=${productAccountKey(line)}`}
                  key={line}
                >
                  <span>{t(productLineLabels[line])}</span>
                  <strong className="mono">
                    {hidden ? "••••" : !available ? "—" : formatUsd(value)}
                  </strong>
                  <small>
                    {available
                      ? `${lineRows.length} ${t("Assets")}`
                      : t("Product line unavailable")}
                  </small>
                </a>
              )
            })}
          </div>
        </section>
      ) : null}
      <div className="asset-overview-grid">
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
  return (Object.values(PRODUCT_LINES) as ProductLine[]).some(
    (line) => productAccountKey(line) === account && balance.accountType === productAccounts[line],
  )
}

function productAccountKey(line: ProductLine): string {
  const keys: Record<ProductLine, string> = {
    SPOT: "spot",
    LINEAR_PERPETUAL: "usd-perpetual",
    INVERSE_PERPETUAL: "coin-perpetual",
    LINEAR_DELIVERY: "usd-delivery",
    INVERSE_DELIVERY: "coin-delivery",
    OPTION: "options",
  }
  return keys[line]
}

type DistributionSegment = { asset: string; percent: number; color: string }

function distributionSegments(rows: readonly Balance[], total: number): DistributionSegment[] {
  const largest = rows.slice(0, 5)
  const remainder = rows.slice(5).reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0)
  const segments = largest.map((row, index) => ({
    asset: row.asset,
    percent: ((row.estimatedUsd ?? 0) / total) * 100,
    color: assetColors[index] ?? "#64748b",
  }))
  if (remainder > 0)
    segments.push({ asset: "Other", percent: (remainder / total) * 100, color: "#64748b" })
  return segments
}

function donutGradient(segments: readonly DistributionSegment[]): string {
  let start = 0
  return `conic-gradient(${segments
    .map((segment) => {
      const end = start + segment.percent
      const stop = `${segment.color} ${start}% ${end}%`
      start = end
      return stop
    })
    .join(", ")})`
}
