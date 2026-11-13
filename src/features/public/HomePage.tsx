import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Globe2,
  Lock,
  QrCode,
  Repeat,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react"
import { useEffect, useState } from "react"
import { loadAssetScales, loadMarkets } from "../../api/endpoints"
import { mapMarket } from "../../api/mappers"
import { MarketSkeleton } from "../../components/market/MarketSkeleton"
import { AssetIcon, Panel, Price, Sparkline, StateView } from "../../components/ui/Primitives"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { useRealtimeFeed } from "../../hooks/useRealtime"
import { marketWithLiveQuote } from "../../hooks/useRealtimeAssets"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoMarkets, demoTrend } from "../../lib/demo"
import { formatPercent } from "../../lib/format"
import { type Market, PRODUCT_LINES } from "../../types/domain"
import "./HomePage.css"

function formatAppPrice(price: string | number | null | undefined): string {
  if (price === null || price === undefined || price === "") return "--"
  const num = Number(price)
  if (Number.isNaN(num)) return String(price)
  if (num >= 1000) {
    return num.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
  }
  if (num >= 1) {
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  }
  return num.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

export function HomePage() {
  const [loaded, setLoaded] = useState(false)
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [emailInput, setEmailInput] = useState("")
  const [showQrModal, setShowQrModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const [rows, scales] = await Promise.all([
          loadMarkets(PRODUCT_LINES.usdMPerpetual, controller.signal, true, true),
          loadAssetScales(),
        ])
        if (controller.signal.aborted) return
        setMarkets(
          rows
            .map(mapMarket)
            .filter((market) => market.productLine === PRODUCT_LINES.usdMPerpetual),
        )
        setAssetScales(scales)
        setError(null)
      } catch (reason: unknown) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : t("Market data unavailable"))
      } finally {
        if (!controller.signal.aborted) setLoaded(true)
        pending = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 10000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])

  const source =
    markets.length > 0
      ? markets
      : config.demoDataEnabled
        ? demoMarkets.map((market) => ({
            ...market,
            productLine: PRODUCT_LINES.usdMPerpetual,
            settleAsset: market.quoteAsset,
            maxLeverage: 125,
          }))
        : []

  const featured = source
    .slice()
    .sort((left, right) => (right.quoteVolume24h ?? 0) - (left.quoteVolume24h ?? 0))
    .slice(0, 3)

  const realtime = useRealtimeFeed(
    null,
    featured.flatMap((market) =>
      ["trades", "mark"].map((channel) => ({
        channel,
        productLine: PRODUCT_LINES.usdMPerpetual,
        instrumentId: market.instrumentId,
      })),
    ),
  )

  const displayed = featured.map((market) =>
    marketWithLiveQuote(market, realtime.events, assetScales),
  )

  const handleRegisterWithEmail = () => {
    const trimmed = emailInput.trim()
    if (trimmed) {
      navigateInApplication(`/auth/register?email=${encodeURIComponent(trimmed)}`)
    } else {
      navigateInApplication("/auth/register")
    }
  }

  return (
    <div className="home-page">
      {/* OKX-Style Hero Section with App Mockup */}
      <section className="okx-hero container">
        <div className="okx-hero-glow-left" />
        <div className="okx-hero-glow-right" />

        <div className="okx-hero-content">
          {/* Left Column: Headlines, Email Input, Action Buttons, Trust Badges */}
          <div className="okx-hero-left">
            <div className="okx-badge-pill">
              <span className="okx-badge-dot" />
              <span>{t("Aeron Cluster 3.0 • Sub-50µs Latency")}</span>
            </div>

            <h1 className="okx-hero-title">
              {t("Faster, better, stronger than your average crypto exchange")}
            </h1>

            <p className="okx-hero-subtitle">
              {t(
                "Institutional-grade Aeron cluster matching engine, deterministic multi-sig custody, and sub-50µs execution latency designed for high-frequency traders and global institutions.",
              )}
            </p>

            <div className="okx-hero-cta-box">
              <div className="okx-input-group">
                <input
                  type="email"
                  placeholder={t("Enter email address")}
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    )
                      handleRegisterWithEmail()
                  }}
                  aria-label={t("Enter email address")}
                />
                <button type="button" className="okx-btn-primary" onClick={handleRegisterWithEmail}>
                  {t("Sign up")}
                </button>
              </div>

              <div className="okx-cta-secondary">
                <button
                  type="button"
                  className="okx-btn-download"
                  onClick={() => setShowQrModal(true)}
                >
                  <QrCode size={17} />
                  <span>{t("Download app")}</span>
                </button>
                <button
                  type="button"
                  className="okx-btn-trade"
                  onClick={() => {
                    navigateInApplication("/trade/usd-perpetual")
                  }}
                >
                  <span>{t("Start Trading")}</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>

            {/* Trust and Performance Row */}
            <div className="okx-trust-row">
              <div className="okx-trust-item">
                <ShieldCheck size={20} className="okx-trust-icon" />
                <div>
                  <strong>100%</strong>
                  <span>{t("Proof of Reserves")}</span>
                </div>
              </div>
              <div className="okx-trust-item">
                <Zap size={20} className="okx-trust-icon" />
                <div>
                  <strong>&lt; 50µs</strong>
                  <span>{t("Ultra-low Latency")}</span>
                </div>
              </div>
              <div className="okx-trust-item">
                <Lock size={20} className="okx-trust-icon" />
                <div>
                  <strong>Multi-Sig</strong>
                  <span>{t("Cold Custody")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: High-Fidelity App Phone Showcase */}
          <div className="okx-hero-right">
            <div className="okx-phone-wrapper">
              <div className="okx-phone-glow" />
              <div className="okx-phone-frame">
                {/* Dynamic Island */}
                <div className="okx-phone-island">
                  <div className="okx-island-camera" />
                  <div className="okx-island-sensor" />
                </div>

                {/* Phone Screen UI */}
                <div className="okx-phone-screen">
                  {/* Status Bar */}
                  <div className="okx-app-status-bar">
                    <span className="okx-app-time">09:41</span>
                    <div className="okx-app-status-icons">
                      <span className="okx-app-signal">5G</span>
                      <div className="okx-app-battery">
                        <span className="okx-battery-fill" />
                      </div>
                    </div>
                  </div>

                  {/* App Header */}
                  <div className="okx-app-header">
                    <div className="okx-app-user-pill">
                      <span className="okx-app-avatar">S</span>
                      <span className="okx-app-verified">✓</span>
                    </div>
                    <div className="okx-app-mode-switch">
                      <span className="active">{t("Exchange")}</span>
                      <span>{t("Web3")}</span>
                    </div>
                    <div className="okx-app-header-icons">
                      <ShieldCheck size={14} />
                    </div>
                  </div>

                  {/* Asset Balance Card */}
                  <div className="okx-app-asset-card">
                    <div className="okx-app-asset-label">
                      <span>{t("Est total value")}</span>
                      <span className="okx-eye-icon">USD</span>
                    </div>
                    <div className="okx-app-asset-val">
                      <span className="val-main">$89,642.50</span>
                      <span className="val-currency">USD</span>
                    </div>
                    <div className="okx-app-asset-change">
                      <span className="change-text">Today +$3,421.80 (+3.98%)</span>
                      <svg className="spark-svg" viewBox="0 0 70 18" aria-hidden="true">
                        <path
                          d="M 0,14 Q 18,16 32,8 T 52,6 T 70,2"
                          fill="none"
                          stroke="#00E08F"
                          strokeWidth="2"
                        />
                        <path
                          d="M 0,14 Q 18,16 32,8 T 52,6 T 70,2 L 70,18 L 0,18 Z"
                          fill="rgba(0, 224, 143, 0.12)"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Quick Action 4-Icon Hub */}
                  <div className="okx-app-quick-actions">
                    <div className="quick-action-item">
                      <div className="action-circle bg-green">
                        <ArrowDownLeft size={16} />
                      </div>
                      <span>{t("Deposit")}</span>
                    </div>
                    <div className="quick-action-item">
                      <div className="action-circle bg-purple">
                        <ArrowUpRight size={16} />
                      </div>
                      <span>{t("Withdraw")}</span>
                    </div>
                    <div className="quick-action-item">
                      <div className="action-circle bg-blue">
                        <Repeat size={16} />
                      </div>
                      <span>{t("Transfer")}</span>
                    </div>
                    <div className="quick-action-item">
                      <div className="action-circle bg-yellow">
                        <Clock size={16} />
                      </div>
                      <span>{t("History")}</span>
                    </div>
                  </div>

                  {/* Allocation Bar */}
                  <div className="okx-app-allocation">
                    <div className="alloc-head">
                      <span>{t("Allocation")}</span>
                      <span className="alloc-more">›</span>
                    </div>
                    <div className="alloc-bar">
                      <span className="bar-funding" style={{ width: "45%" }} />
                      <span className="bar-trading" style={{ width: "35%" }} />
                      <span className="bar-earn" style={{ width: "20%" }} />
                    </div>
                    <div className="alloc-legend">
                      <span>
                        <i className="dot-funding" /> {t("Perpetual")}
                      </span>
                      <span>
                        <i className="dot-trading" /> {t("Spot")}
                      </span>
                      <span>
                        <i className="dot-earn" /> {t("Custody")}
                      </span>
                    </div>
                  </div>

                  {/* Real-time Watchlist in App */}
                  <div className="okx-app-markets">
                    <div className="markets-head">
                      <span>{t("Hot Markets")}</span>
                      <span className="market-more">{t("24h Change")}</span>
                    </div>
                    <div className="app-market-list">
                      {displayed.length > 0 ? (
                        displayed.slice(0, 3).map((item) => (
                          <div key={item.symbol} className="app-market-row">
                            <div className="m-left">
                              <strong>{item.baseAsset}</strong>
                              <small>/USDT</small>
                            </div>
                            <div className="m-mid mono">
                              ${formatAppPrice(item.price ?? "75640.8")}
                            </div>
                            <div
                              className={`m-badge ${
                                (item.change24h ?? 0) >= 0 ? "positive" : "negative"
                              }`}
                            >
                              {formatPercent(item.change24h ?? 0)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="app-market-row">
                            <div className="m-left">
                              <strong>BTC</strong>
                              <small>/USDT</small>
                            </div>
                            <div className="m-mid mono">$75,640.8</div>
                            <div className="m-badge positive">+2.84%</div>
                          </div>
                          <div className="app-market-row">
                            <div className="m-left">
                              <strong>ETH</strong>
                              <small>/USDT</small>
                            </div>
                            <div className="m-mid mono">$2,740.20</div>
                            <div className="m-badge positive">+1.92%</div>
                          </div>
                          <div className="app-market-row">
                            <div className="m-left">
                              <strong>SOL</strong>
                              <small>/USDT</small>
                            </div>
                            <div className="m-mid mono">$188.45</div>
                            <div className="m-badge positive">+5.45%</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* App Tabbar */}
                  <div className="okx-app-tabbar">
                    <span className="tab-item active">{t("Home")}</span>
                    <span className="tab-item">{t("Markets")}</span>
                    <span className="tab-item tab-trade-center">{t("Trade")}</span>
                    <span className="tab-item">{t("Futures")}</span>
                    <span className="tab-item">{t("Assets")}</span>
                  </div>
                </div>
              </div>

              {/* Floating Speed Widget */}
              <div className="okx-floating-badge">
                <div className="floating-badge-icon">
                  <Zap size={16} />
                </div>
                <div className="floating-badge-text">
                  <strong>Aeron Cluster</strong>
                  <span>⚡ 38µs Ultra Latency</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QR Code Download App Modal */}
      {showQrModal ? (
        <div className="okx-qr-modal-backdrop">
          <button
            type="button"
            className="okx-qr-backdrop-close"
            onClick={() => setShowQrModal(false)}
            aria-label={t("Close modal")}
          />
          <div
            className="okx-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("Download app")}
          >
            <button
              type="button"
              className="okx-qr-close"
              onClick={() => setShowQrModal(false)}
              aria-label={t("Close")}
            >
              <X size={18} />
            </button>
            <h3>{t("Download Surprising EX App")}</h3>
            <p>
              {t(
                "Scan the QR code to trade crypto anywhere, anytime with institutional-grade speed.",
              )}
            </p>
            <div className="okx-qr-code-box">
              {/* High precision SVG QR Code pattern */}
              <svg
                width="160"
                height="160"
                viewBox="0 0 100 100"
                fill="#000000"
                aria-label="QR Code"
              >
                <path d="M0,0 h30 v30 h-30 z M6,6 h18 v18 h-18 z M10,10 h10 v10 h-10 z" />
                <path d="M70,0 h30 v30 h-30 z M76,6 h18 v18 h-18 z M80,10 h10 v10 h-10 z" />
                <path d="M0,70 h30 v30 h-30 z M6,76 h18 v18 h-18 z M10,80 h10 v10 h-10 z" />
                <rect x="38" y="6" width="6" height="6" />
                <rect x="52" y="6" width="8" height="6" />
                <rect x="42" y="16" width="16" height="6" />
                <rect x="36" y="26" width="8" height="6" />
                <rect x="48" y="26" width="14" height="6" />
                <rect x="6" y="38" width="8" height="6" />
                <rect x="18" y="38" width="10" height="6" />
                <rect x="34" y="38" width="6" height="6" />
                <rect x="44" y="36" width="12" height="12" />
                <rect x="60" y="38" width="10" height="6" />
                <rect x="74" y="38" width="8" height="6" />
                <rect x="88" y="38" width="6" height="6" />
                <rect x="10" y="48" width="16" height="6" />
                <rect x="30" y="48" width="8" height="6" />
                <rect x="64" y="48" width="12" height="6" />
                <rect x="80" y="48" width="14" height="6" />
                <rect x="6" y="58" width="12" height="6" />
                <rect x="22" y="58" width="8" height="6" />
                <rect x="34" y="54" width="8" height="12" />
                <rect x="48" y="54" width="14" height="6" />
                <rect x="68" y="58" width="6" height="6" />
                <rect x="78" y="58" width="16" height="6" />
                <rect x="38" y="70" width="8" height="6" />
                <rect x="50" y="70" width="12" height="6" />
                <rect x="66" y="70" width="10" height="6" />
                <rect x="80" y="70" width="8" height="6" />
                <rect x="36" y="80" width="14" height="6" />
                <rect x="54" y="80" width="8" height="6" />
                <rect x="66" y="80" width="14" height="6" />
                <rect x="84" y="80" width="10" height="6" />
                <rect x="40" y="90" width="10" height="6" />
                <rect x="54" y="90" width="12" height="6" />
                <rect x="70" y="90" width="8" height="6" />
                <rect x="82" y="90" width="12" height="6" />
              </svg>
            </div>
            <div className="okx-qr-platforms">
              <span className="okx-platform-tag">iOS TestFlight</span>
              <span className="okx-platform-tag">Android APK</span>
              <span className="okx-platform-tag">macOS / Windows</span>
            </div>
          </div>
        </div>
      ) : null}

      {config.demoDataEnabled && markets.length === 0 ? (
        <div className="container demo-banner">
          {t("Demo data: market data is disconnected; local visual checks only.")}
        </div>
      ) : null}

      {/* Second Section: Top Assets / Build Your Portfolio */}
      <section className="section container">
        <div className="section-title">
          <div>
            <h2>{t("Top Assets")}</h2>
            <p style={{ color: "#8C8CA0", fontSize: "14px", marginTop: "4px" }}>
              {t("Trade with deep liquidity, tight spreads, and instant execution.")}
            </p>
          </div>
          <a className="route-link" href="/markets">
            {t("View all")}
          </a>
        </div>
        {error && !config.demoDataEnabled ? (
          <StateView kind="error" message={error} />
        ) : !loaded && displayed.length === 0 ? (
          <MarketSkeleton cards />
        ) : (
          <div className="grid-3">
            {displayed.map((market) => (
              <a
                className="panel asset-card"
                key={market.symbol}
                href="/trade/usd-perpetual"
                style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}
              >
                <div className="asset-card-head">
                  <div className="market-name">
                    <AssetIcon asset={market.baseAsset} />
                    <div>
                      <strong>{market.baseAsset}</strong>
                      <span>{market.quoteAsset}</span>
                    </div>
                  </div>
                  <span
                    className={
                      market.change24h !== null && market.change24h >= 0
                        ? "positive mono"
                        : "negative mono"
                    }
                  >
                    {formatPercent(market.change24h)}
                  </span>
                </div>
                <Price value={market.price} prefix="$" />
                {market.priceSource === "mark" ? (
                  <small className="muted">{t("Mark price")}</small>
                ) : null}
                {market.trend && market.trend.length > 1 ? (
                  <Sparkline values={market.trend} positive={(market.change24h ?? 0) >= 0} />
                ) : markets.length === 0 && config.demoDataEnabled ? (
                  <Sparkline values={demoTrend} positive={(market.change24h ?? 0) >= 0} />
                ) : null}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Third Section: Institutional Grade Security & Architecture */}
      <section className="section container">
        <div className="section-title">
          <h2>{t("Institutional Grade")}</h2>
        </div>
        <div className="grade-grid">
          <Panel>
            <ShieldCheck size={26} />
            <h3>{t("Security First Architecture")}</h3>
            <p>
              {t(
                "Multi-signature cold storage, rigorous testing, and anomaly detection keep the account state explicit.",
              )}
            </p>
          </Panel>
          <Panel>
            <Zap size={26} />
            <h3>{t("Professional Efficiency")}</h3>
            <p>
              {t(
                "Structured market data and precise order state help traders act without losing context.",
              )}
            </p>
          </Panel>
          <Panel className="grade-wide">
            <Globe2 size={26} />
            <h3>{t("Global Accessibility")}</h3>
            <p>
              {t(
                "One clear interface for public market reading, trading products, and account operations.",
              )}
            </p>
          </Panel>
        </div>
      </section>
    </div>
  )
}
