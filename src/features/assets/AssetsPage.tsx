import { ArrowRight, EyeOff, Plus, Send, Shuffle } from "lucide-react"
import { useEffect, useState } from "react"
import { loadAssetScales } from "../../api/endpoints"
import { productLineLabels } from "../../components/layout/navigation"
import { AssetIcon, Panel, SearchField, StateView } from "../../components/ui/Primitives"
import { useRealtimeAssets } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoBalances } from "../../lib/demo"
import { readStoredValue } from "../../lib/storage"
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
  const [hidden] = useState(() => readStoredValue(privacyKey) === "true")
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
  const transientValuationError =
    error === t("Valuation prices are unavailable or expired.") ||
    error === t("FX quote has expired")
  // Stay on the reserved skeleton until every in-scope snapshot is ready so partial
  // valuations cannot swap the overview, product cards, or balance list to a new height.
  const layoutPending =
    !demo && !scopeUnavailable && !metadataError && !allReady && (!error || transientValuationError)
  const alertError =
    error &&
    error !== t("The service returned an unexpected response. Please refresh and try again.") &&
    !(layoutPending && transientValuationError)
      ? error
      : null
  const filtered = balances.filter(
    (row) =>
      row.asset.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!hideZero || row.available !== 0 || row.locked !== 0 || row.estimatedUsd !== 0),
  )

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    void loadAssetScales(controller.signal).then(
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
    return () => controller.abort()
  }, [session])

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
        </div>
      </div>
      {demo ? (
        <div className="demo-banner">
          {t("Demo data: balances are for local visual checks only.")}
        </div>
      ) : null}
      {!overview && !selectedLine ? (
        <Panel>
          <StateView kind="error" message="Unknown asset account. Choose an account to continue." />
        </Panel>
      ) : (
        <>
          {alertError ? (
            <div className="assets-data-alert" role="alert">
              <span>{alertError}</span>
            </div>
          ) : null}
          <div className="asset-overview-grid">
            <Panel className="balance-hero">
              <div className="eyebrow">{t("Estimated equity")}</div>
              <div
                className={`balance-number mono${layoutPending || total !== null || hidden ? "" : " is-fallback"}`}
              >
                <span className="balance-number-value">
                  {hidden ? (
                    <span role="img" aria-label={t("Balances hidden")}>
                      ••••••
                    </span>
                  ) : total !== null ? (
                    assetUsd(total)
                  ) : layoutPending ? (
                    <span className="asset-value-skeleton" aria-hidden="true" />
                  ) : (
                    t("Valuation unavailable")
                  )}
                </span>
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
              ) : layoutPending ? (
                <div
                  className="asset-distribution-skeleton"
                  role="status"
                  aria-label={t("Loading balances")}
                >
                  <span />
                  <span />
                  <span />
                </div>
              ) : scopeUnavailable || negativeEquity ? (
                <StateView
                  kind={scopeUnavailable ? "error" : "empty"}
                  message={
                    scopeUnavailable
                      ? "This product account is not enabled."
                      : "Allocation is unavailable for portfolios with negative equity."
                  }
                />
              ) : (
                <div className="subtle">—</div>
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
          <section className="assets-balance-section" aria-busy={layoutPending || undefined}>
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
            {layoutPending || filtered.length > 0 ? (
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
                      {layoutPending
                        ? [0, 1, 2, 3].map((row) => (
                            <tr key={row}>
                              <td colSpan={6}>
                                <span className="asset-table-skeleton" />
                              </td>
                            </tr>
                          ))
                        : filtered.map((balance) => (
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
                  {layoutPending
                    ? [0, 1, 2, 3].map((row) => (
                        <li className="asset-balance-card asset-balance-skeleton-card" key={row}>
                          <span className="asset-table-skeleton" />
                          <span className="asset-table-skeleton" />
                          <span className="asset-table-skeleton" />
                        </li>
                      ))
                    : filtered.map((balance) => (
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
            ) : query || hideZero || scopeUnavailable ? (
              <Panel>
                <StateView
                  kind={scopeUnavailable ? "error" : "empty"}
                  message={
                    query || hideZero
                      ? "No assets match the current filters."
                      : "This product account is not enabled."
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
            ) : (
              <Panel>
                <div className="subtle">—</div>
              </Panel>
            )}
          </section>
        </>
      )}
    </div>
  )
}
