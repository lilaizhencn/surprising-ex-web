import { Eye, EyeOff, Plus, Send, Shuffle } from "lucide-react"
import { useEffect, useState } from "react"
import { loadAssetScales } from "../../api/endpoints"
import { productLineLabels } from "../../components/layout/navigation"
import { AssetIcon, Button, Panel, StateView } from "../../components/ui/Primitives"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { useRealtimeAssets } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoBalances } from "../../lib/demo"
import { formatPrice, formatUsd } from "../../lib/format"
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
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const session = useSession()
  const realtime = useRealtimeAssets(session, assetScales)
  useEffect(() => {
    if (!session) return
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    void loadAssetScales(controller.signal)
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
      controller.abort()
    }
  }, [session, refreshVersion])
  const demo = config.demoDataEnabled && !session
  const allRows = session ? realtime.balances : demo ? demoBalances : []
  const rows = allRows.filter((balance) => accountMatches(balance, account))
  const assetError = error ?? realtime.error
  const hasUsdValuation =
    (demo || (realtime.ready && !loading && !assetError)) &&
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
        </div>
        <Button tone="outline" onClick={() => setHidden(!hidden)}>
          {hidden ? <Eye size={16} /> : <EyeOff size={16} />} {t(hidden ? "Show" : "Hide")}
        </Button>
      </div>
      {demo ? (
        <div className="demo-banner">
          {t("Demo data: balances are for local visual checks only.")}
        </div>
      ) : null}
      {assetError ? (
        <Panel>
          <StateView
            kind={loading ? "loading" : "error"}
            message={assetError}
            retry={() => {
              setRefreshVersion((version) => version + 1)
              realtime.refresh()
            }}
          />
        </Panel>
      ) : null}
      <div className="asset-overview-grid">
        <Panel className="balance-hero">
          <div className="eyebrow">{t("ACCOUNT BALANCE")}</div>
          <div className="balance-number mono">
            {hidden ? (
              "••••••"
            ) : session || demo ? (
              total === null ? (
                assetError ? (
                  t("Valuation unavailable")
                ) : (
                  <span className="asset-value-skeleton" aria-hidden="true" />
                )
              ) : (
                formatUsd(total)
              )
            ) : (
              "Log in to view"
            )}{" "}
            {total !== null ? <small>USD</small> : null}
          </div>
          <div className="balance-actions">
            <Button
              onClick={() => {
                navigateInApplication("/assets/deposit")
              }}
            >
              <Plus size={16} /> {t("Deposit")}{" "}
            </Button>
            <Button
              tone="outline"
              onClick={() => {
                navigateInApplication("/assets/withdraw")
              }}
            >
              <Send size={16} /> {t("Withdraw")}{" "}
            </Button>
            <Button
              tone="outline"
              onClick={() => {
                navigateInApplication("/assets/transfer")
              }}
            >
              <Shuffle size={16} /> {t("Transfer")}{" "}
            </Button>
          </div>
        </Panel>
        <Panel className="distribution">
          <h2>{t("Asset distribution")}</h2>
          {hasDistribution ? (
            <div className="asset-distribution-content">
              <div
                className="donut"
                style={{ background: donutGradient(segments) }}
                aria-label={t("Asset distribution")}
                role="img"
              >
                <span>
                  <strong className="mono" title={hidden ? undefined : formatUsd(total)}>
                    {hidden ? "••••" : formatUsd(total)}
                  </strong>
                  <small>USD</small>
                </span>
              </div>
              <div className="distribution-rows">
                {segments.map((segment) => (
                  <div className="distribution-row" key={segment.asset}>
                    <span className="distribution-asset">
                      <i className="dot" style={{ background: segment.color }} />
                      <AssetIcon asset={segment.asset} />
                      {segment.asset}
                    </span>
                    <span className="distribution-value">
                      <strong>{`${segment.percent.toFixed(1)}%`}</strong>
                      <small className="mono">{hidden ? "••••" : formatUsd(segment.value)}</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : session && (loading || !realtime.ready) ? (
            <div className="asset-distribution-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <StateView
              kind={session ? "empty" : "error"}
              message={
                session ? "No assets to display yet." : "Sign in to view your asset distribution."
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
              const value =
                realtime.readyProducts.includes(line) &&
                !assetError &&
                lineRows.every((row) => row.estimatedUsd !== null)
                  ? lineRows.reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0)
                  : null
              return (
                <a
                  className="asset-product-card"
                  href={`/assets?account=${productAccountKey(line)}`}
                  key={line}
                >
                  <span>{t(productLineLabels[line])}</span>
                  <strong
                    className="mono"
                    title={hidden || value === null ? undefined : formatUsd(value)}
                  >
                    {hidden
                      ? "••••"
                      : value === null
                        ? t("Valuation unavailable")
                        : formatUsd(value)}
                  </strong>
                  <small>{`${lineRows.length} ${t("Assets")}`}</small>
                </a>
              )
            })}
          </div>
        </section>
      ) : null}
      <div className="section-title">
        <h2>{t("Currency asset details")}</h2>
      </div>
      {loading || !realtime.ready || rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table asset-account-table">
            <thead>
              <tr>
                <th>{t("Asset")}</th>
                <th className="number">{t("Total balance")}</th>
                <th className="number">{t("Available")}</th>
                <th className="number">{t("Estimated value (USD)")}</th>
                <th className="number">{t("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {loading || (session && !realtime.ready)
                ? [0, 1, 2].map((item) => (
                    <tr key={`asset-skeleton-${item}`}>
                      <td colSpan={5}>
                        <span className="asset-table-skeleton" />
                      </td>
                    </tr>
                  ))
                : rows.length > 0
                  ? aggregateAssets(rows).map((balance) => (
                      <tr key={balance.asset}>
                        <td>
                          <span className="market-name">
                            <AssetIcon asset={balance.asset} />
                            <strong>{balance.asset}</strong>
                          </span>
                        </td>
                        <td className="number mono">
                          {hidden
                            ? "••••"
                            : formatPrice(
                                balance.available === null || balance.locked === null
                                  ? null
                                  : balance.available + balance.locked,
                              )}
                        </td>
                        <td className="number mono">
                          {hidden ? "••••" : formatPrice(balance.available)}
                        </td>
                        <td className="number mono">
                          {hidden
                            ? "••••"
                            : balance.estimatedUsd === null
                              ? "—"
                              : formatUsd(balance.estimatedUsd)}
                        </td>
                        <td className="number">
                          <span className="asset-row-actions">
                            <a href={`/assets/deposit?asset=${encodeURIComponent(balance.asset)}`}>
                              <Plus size={14} /> {t("Deposit")}
                            </a>
                            <a href={`/assets/withdraw?asset=${encodeURIComponent(balance.asset)}`}>
                              <Send size={14} /> {t("Withdraw")}
                            </a>
                            <a href={`/assets/transfer?asset=${encodeURIComponent(balance.asset)}`}>
                              <Shuffle size={14} /> {t("Transfer")}
                            </a>
                          </span>
                        </td>
                      </tr>
                    ))
                  : null}
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
      available:
        current.available === null || row.available === null
          ? null
          : current.available + row.available,
      locked: current.locked === null || row.locked === null ? null : current.locked + row.locked,
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

type DistributionSegment = { asset: string; percent: number; color: string; value: number }

function distributionSegments(rows: readonly Balance[], total: number): DistributionSegment[] {
  const largest = rows.slice(0, 5)
  const remainder = rows.slice(5).reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0)
  const segments = largest.map((row, index) => ({
    asset: row.asset,
    percent: ((row.estimatedUsd ?? 0) / total) * 100,
    color: assetColors[index] ?? "#64748b",
    value: row.estimatedUsd ?? 0,
  }))
  if (remainder > 0)
    segments.push({
      asset: "Other",
      percent: (remainder / total) * 100,
      color: "#64748b",
      value: remainder,
    })
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
