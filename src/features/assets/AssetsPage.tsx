import { ArrowRight, Eye, EyeOff, Plus, RefreshCw, Send, Shuffle } from "lucide-react"
import { useEffect, useState } from "react"
import { loadAssetScales } from "../../api/endpoints"
import { productLineLabels } from "../../components/layout/navigation"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import {
  AssetIcon,
  Button,
  IconButton,
  Panel,
  SearchField,
  StateView,
} from "../../components/ui/Primitives"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { useRealtimeAssets } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoBalances } from "../../lib/demo"
import { readStoredValue, writeStoredValue } from "../../lib/storage"
import { useSession } from "../../state/session"
import { type Balance, PRODUCT_LINES } from "../../types/domain"
import {
  aggregateAssets,
  allocationGradient,
  allocationSegments,
  assetAmount,
  assetUsd,
  productAccountKey,
  productAccounts,
} from "./assetPortfolio"
import "./AssetsPage.css"

const privacyKey = "surprising-ex.assets-hidden"

export function AssetsPage({ account }: { readonly account: string | null }) {
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(() => readStoredValue(privacyKey) === "true")
  const [loading, setLoading] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [query, setQuery] = useState("")
  const [hideZero, setHideZero] = useState(false)
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const session = useSession()
  const realtime = useRealtimeAssets(session, assetScales)
  const overview = !account || account === "overview"
  const selectedLine = Object.values(PRODUCT_LINES).find(
    (line) => productAccountKey(line) === account,
  )
  const demo = config.demoDataEnabled && !session
  const products = demo ? [PRODUCT_LINES.spot] : realtime.products
  const readyProducts = demo ? [PRODUCT_LINES.spot] : realtime.readyProducts
  const scopeProducts = selectedLine
    ? products.filter((line) => line === selectedLine)
    : overview
      ? products
      : []
  const allReady =
    scopeProducts.length > 0 && scopeProducts.every((line) => readyProducts.includes(line))
  const scopeUnavailable = Boolean(
    !overview && (!selectedLine || (products.length > 0 && !products.includes(selectedLine))),
  )
  const allRows = session
    ? realtime.balances
    : demo
      ? demoBalances.map((row) => ({ ...row, accountType: "SPOT" }))
      : []
  const rows = allRows.filter((row) =>
    scopeProducts.some(
      (line) => productAccounts[line] === row.accountType && readyProducts.includes(line),
    ),
  )
  const balances = aggregateAssets(rows)
  const error = metadataError ?? realtime.error
  const total =
    allReady && !metadataError && balances.every((row) => row.estimatedUsd !== null)
      ? balances.reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0)
      : null
  const allocation = allReady && total !== null ? allocationSegments(balances) : []
  const negativeEquity = balances.some((row) => row.estimatedUsd !== null && row.estimatedUsd < 0)
  const waiting = !scopeUnavailable && !error && !allReady
  const filtered = balances.filter(
    (row) =>
      row.asset.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!hideZero || row.available !== 0 || row.locked !== 0 || row.estimatedUsd !== 0),
  )

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    setLoading(true)
    void loadAssetScales(controller.signal)
      .then(
        (scales) => {
          if (!controller.signal.aborted) {
            setAssetScales(scales)
            setMetadataError(null)
          }
        },
        (reason) => {
          if (!controller.signal.aborted)
            setMetadataError(
              reason instanceof Error ? reason.message : t("Asset service unavailable"),
            )
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [session, refreshVersion])

  const refresh = () => {
    setRefreshVersion((version) => version + 1)
    realtime.refresh()
  }
  const amount = (balance: Balance, kind: "available" | "locked" | "total") =>
    hidden ? "••••••" : metadataError ? "—" : assetAmount(balance, kind)
  const usd = (value: number | null) => (hidden ? "••••••" : metadataError ? "—" : assetUsd(value))
  const actions = (asset?: string) => {
    const queryString = asset ? `?asset=${encodeURIComponent(asset)}` : ""
    const transferQuery = selectedLine
      ? `${queryString || "?"}${queryString ? "&" : ""}from=${productAccounts[selectedLine]}`
      : queryString
    return (
      <>
        <a href={`/assets/deposit${queryString}`}>
          <Plus size={15} aria-hidden="true" />
          {t("Deposit")}
        </a>
        <a href={`/assets/withdraw${queryString}`}>
          <Send size={15} aria-hidden="true" />
          {t("Withdraw")}
        </a>
        <a href={`/assets/transfer${transferQuery}`}>
          <Shuffle size={15} aria-hidden="true" />
          {t("Transfer")}
        </a>
      </>
    )
  }

  return (
    <div className="account-content assets-page">
      <div className="page-heading">
        <div>
          <h1>
            {overview
              ? t("Overview")
              : selectedLine
                ? `${t(productLineLabels[selectedLine])} ${t("Assets")}`
                : t("Assets")}
          </h1>
          <p>{t("Balances, equity and account activity in one place.")}</p>
        </div>
        <div className="assets-page-controls">
          <IconButton
            label={hidden ? "Show balances" : "Hide balances"}
            aria-pressed={hidden}
            onClick={() => {
              const next = !hidden
              setHidden(next)
              writeStoredValue(privacyKey, String(next))
            }}
          >
            {hidden ? <Eye size={20} /> : <EyeOff size={20} />}
          </IconButton>
          <IconButton
            label="Refresh balances"
            disabled={loading}
            aria-busy={loading}
            onClick={refresh}
          >
            <RefreshCw size={19} className={loading ? "spin" : undefined} />
          </IconButton>
        </div>
      </div>
      <div className="assets-scope-toolbar">
        <DropdownSelect
          aria-label={t("Asset account")}
          value={overview ? "overview" : (account ?? "overview")}
          onChange={(event) => {
            const next = event.target.value
            if (
              next === "overview" ||
              Object.values(PRODUCT_LINES).some((line) => productAccountKey(line) === next)
            )
              navigateInApplication(next === "overview" ? "/assets" : `/assets?account=${next}`)
          }}
        >
          <option value="overview">{t("All accounts")}</option>
          {Object.values(PRODUCT_LINES).map((line) => (
            <option key={line} value={productAccountKey(line)}>
              {t(productLineLabels[line])}
            </option>
          ))}
        </DropdownSelect>
        <span className={`assets-sync-state${allReady ? " synced" : ""}`} role="status">
          {t(
            allReady
              ? "Account data synced"
              : scopeUnavailable
                ? "Account unavailable"
                : "Syncing account data",
          )}
        </span>
      </div>
      {demo ? (
        <div className="demo-banner">
          {t("Demo data: balances are for local visual checks only.")}
        </div>
      ) : null}
      {!overview && !selectedLine ? (
        <Panel>
          <StateView
            kind="error"
            message="Unknown asset account. Choose an account to continue."
            retry={() => navigateInApplication("/assets")}
            retryLabel="View all accounts"
          />
        </Panel>
      ) : (
        <>
          {error ? (
            <div className="assets-data-alert" role="alert">
              <span>{error}</span>
              <Button tone="ghost" loading={loading} onClick={refresh}>
                {t("Retry")}
              </Button>
            </div>
          ) : null}
          {!allReady && readyProducts.length > 0 && !scopeUnavailable ? (
            <p className="assets-partial-note">
              {t(
                "Some accounts are still syncing. Only loaded balances are shown; the total remains unavailable.",
              )}
            </p>
          ) : null}
          <div className="asset-overview-grid">
            <Panel className="balance-hero">
              <div className="eyebrow">{t("Estimated equity")}</div>
              <div className="balance-number mono">
                {hidden ? (
                  <span role="img" aria-label={t("Balances hidden")}>
                    ••••••
                  </span>
                ) : total !== null ? (
                  assetUsd(total)
                ) : waiting ? (
                  <span className="asset-value-skeleton" aria-hidden="true" />
                ) : (
                  t("Valuation unavailable")
                )}
              </div>
              <p className="assets-valuation-note">
                {t("USD estimates include unrealized PnL for derivatives.")}
              </p>
              <div className="balance-actions">{actions()}</div>
            </Panel>
            <Panel className="distribution">
              <h2>{t("Asset distribution")}</h2>
              {hidden ? (
                <div className="assets-private-state" role="status">
                  <EyeOff size={25} aria-hidden="true" />
                  <p>{t("Balances and allocation are hidden.")}</p>
                </div>
              ) : allocation.length > 0 ? (
                <div className="asset-distribution-content">
                  <div
                    className="donut"
                    style={{ background: allocationGradient(allocation) }}
                    role="img"
                    aria-label={t("Asset distribution")}
                  >
                    <span>
                      <strong>
                        {balances.filter((row) => (row.estimatedUsd ?? 0) > 0).length}
                      </strong>
                      <small>{t("Assets")}</small>
                    </span>
                  </div>
                  <div className="distribution-rows">
                    {allocation.map((segment) => (
                      <div className="distribution-row" key={segment.asset}>
                        <span className="distribution-asset">
                          <i className="dot" style={{ background: segment.color }} />
                          {t(segment.asset)}
                        </span>
                        <span className="distribution-value">
                          <strong>{segment.percent.toFixed(1)}%</strong>
                          <small className="mono">{assetUsd(segment.value)}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : waiting ? (
                <div
                  className="asset-distribution-skeleton"
                  role="status"
                  aria-label={t("Loading balances")}
                >
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <StateView
                  kind={total === null || scopeUnavailable ? "error" : "empty"}
                  message={
                    scopeUnavailable
                      ? "This product account is not enabled."
                      : total === null
                        ? "Asset valuation is unavailable. Balances can still be reviewed below."
                        : negativeEquity
                          ? "Allocation is unavailable for portfolios with negative equity."
                          : "No positive asset value to display yet."
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
                  <ArrowRight size={15} aria-hidden="true" />
                </a>
              </div>
              <div className="asset-product-grid">
                {Object.values(PRODUCT_LINES).map((line) => {
                  const ready = readyProducts.includes(line)
                  const lineRows = allRows.filter(
                    (row) => row.accountType === productAccounts[line],
                  )
                  const value =
                    ready && !metadataError && lineRows.every((row) => row.estimatedUsd !== null)
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
                        {hidden ? "••••••" : !ready ? "—" : assetUsd(value)}
                      </strong>
                      <small>
                        {t(
                          ready
                            ? "Account data synced"
                            : products.includes(line)
                              ? "Syncing"
                              : products.length
                                ? "Not enabled"
                                : "Loading",
                        )}
                      </small>
                    </a>
                  )
                })}
              </div>
            </section>
          ) : null}
          <section className="assets-balance-section">
            <div className="assets-balance-heading">
              <h2>{t("Currency asset details")}</h2>
              <div className="assets-balance-filters">
                <SearchField value={query} onChange={setQuery} placeholder={t("Search assets")} />
                <label className="assets-zero-filter">
                  <input
                    type="checkbox"
                    checked={hideZero}
                    onChange={(event) => setHideZero(event.target.checked)}
                  />
                  {t("Hide zero balances")}
                </label>
              </div>
            </div>
            {filtered.length > 0 ? (
              <>
                <div className="table-wrap assets-desktop-balances">
                  <table className="data-table asset-account-table">
                    <thead>
                      <tr>
                        <th scope="col">{t("Asset")}</th>
                        <th scope="col" className="number">
                          {t("Total balance")}
                        </th>
                        <th scope="col" className="number">
                          {t("Available")}
                        </th>
                        <th scope="col" className="number">
                          {t("Frozen")}
                        </th>
                        <th scope="col" className="number">
                          {t("Estimated value (USD)")}
                        </th>
                        <th scope="col">{t("Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((balance) => (
                        <tr key={balance.asset}>
                          <td>
                            <span className="market-name">
                              <AssetIcon asset={balance.asset} />
                              <strong>{balance.asset}</strong>
                            </span>
                          </td>
                          <td className="number mono">{amount(balance, "total")}</td>
                          <td className="number mono">{amount(balance, "available")}</td>
                          <td className="number mono">{amount(balance, "locked")}</td>
                          <td className="number mono">{usd(balance.estimatedUsd)}</td>
                          <td>
                            <div className="asset-row-actions">{actions(balance.asset)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="assets-mobile-balances">
                  {filtered.map((balance) => (
                    <li className="asset-balance-card" key={balance.asset}>
                      <div className="asset-balance-card-heading">
                        <span className="market-name">
                          <AssetIcon asset={balance.asset} />
                          <strong>{balance.asset}</strong>
                        </span>
                        <span className="mono">{usd(balance.estimatedUsd)}</span>
                      </div>
                      <dl>
                        {(["total", "available", "locked"] as const).map((kind) => (
                          <div
                            key={kind}
                            data-wide={amount(balance, kind).length >= 16 || undefined}
                          >
                            <dt>
                              {t(
                                kind === "total"
                                  ? "Total balance"
                                  : kind === "available"
                                    ? "Available"
                                    : "Frozen",
                              )}
                            </dt>
                            <dd className="mono">{amount(balance, kind)}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="asset-row-actions">{actions(balance.asset)}</div>
                    </li>
                  ))}
                </ul>
              </>
            ) : waiting && balances.length === 0 ? (
              <Panel>
                <StateView kind="loading" message="Loading balances" />
              </Panel>
            ) : (
              <Panel>
                <StateView
                  kind={(error && !allReady) || scopeUnavailable ? "error" : "empty"}
                  message={
                    query || hideZero
                      ? "No assets match the current filters."
                      : scopeUnavailable
                        ? "This product account is not enabled."
                        : !allReady
                          ? "Account balances are not available yet."
                          : "No balances returned by the account service."
                  }
                  retry={
                    query || hideZero
                      ? () => {
                          setQuery("")
                          setHideZero(false)
                        }
                      : undefined
                  }
                  retryLabel="Reset filters"
                />
              </Panel>
            )}
          </section>
        </>
      )}
    </div>
  )
}
