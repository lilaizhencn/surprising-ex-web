import { ArrowRight, Globe2, Search, ShieldCheck, Zap } from "lucide-react"
import { useEffect, useState } from "react"
import { loadMarkets } from "../../api/endpoints"
import { mapMarket } from "../../api/mappers"
import {
  AssetIcon,
  Button,
  Panel,
  Price,
  Sparkline,
  StateView,
} from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import { demoMarkets, demoTrend } from "../../lib/demo"
import { formatPercent } from "../../lib/format"
import { type Market, PRODUCT_LINES } from "../../types/domain"

export function HomePage() {
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void loadMarkets(PRODUCT_LINES.usdMPerpetual)
      .then((rows) =>
        setMarkets(
          rows
            .map(mapMarket)
            .filter((market) => market.productLine === PRODUCT_LINES.usdMPerpetual),
        ),
      )
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : t("Market data unavailable")),
      )
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
  const displayed = source
    .filter((market) => market.symbol.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 3)
  return (
    <div className="home-page">
      <section className="hero container">
        <div className="hero-copy">
          <h1>{t("The Trusted Gateway to Digital Assets.")}</h1>
          <p>
            {" "}
            {t(
              "Secure, transparent, and high-performance infrastructure for institutional and retail traders.",
            )}{" "}
          </p>
          <div className="hero-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search coins, tokens, pairs...")}
              aria-label={t("Search coins, tokens, pairs")}
            />
          </div>
          <div className="cluster hero-actions">
            <Button
              onClick={() => {
                window.location.href = "/trade/usd-perpetual"
              }}
            >
              {" "}
              {t("Start Trading")} <ArrowRight size={16} />
            </Button>
            <Button
              tone="outline"
              onClick={() => {
                window.location.href = "/markets"
              }}
            >
              {" "}
              {t("View Markets")}{" "}
            </Button>
          </div>
        </div>
      </section>
      {config.demoDataEnabled && markets.length === 0 ? (
        <div className="container demo-banner">
          {" "}
          {t("Demo data: market data is disconnected; local visual checks only.")}{" "}
        </div>
      ) : null}
      <section className="section container">
        <div className="section-title">
          <h2>{t("Top Assets")}</h2>
          <a className="route-link" href="/markets">
            {" "}
            {t("View all")}{" "}
          </a>
        </div>
        {error && !config.demoDataEnabled ? (
          <StateView kind="error" message={error} />
        ) : (
          <div className="grid-3">
            {displayed.map((market) => (
              <Panel className="asset-card" key={market.symbol}>
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
                {markets.length === 0 && config.demoDataEnabled ? (
                  <Sparkline values={demoTrend} positive={(market.change24h ?? 0) >= 0} />
                ) : (
                  <span className="subtle trend-unavailable">{t("Trend unavailable")}</span>
                )}
              </Panel>
            ))}
          </div>
        )}
      </section>
      <section className="section container">
        <div className="section-title">
          <h2>{t("Institutional Grade")}</h2>
        </div>
        <div className="grade-grid">
          <Panel>
            <ShieldCheck size={26} />
            <h3>{t("Security First Architecture")}</h3>
            <p>
              {" "}
              {t(
                "Multi-signature cold storage, rigorous testing, and anomaly detection keep the account state explicit.",
              )}{" "}
            </p>
          </Panel>
          <Panel>
            <Zap size={26} />
            <h3>{t("Professional Efficiency")}</h3>
            <p>
              {" "}
              {t(
                "Structured market data and precise order state help traders act without losing context.",
              )}{" "}
            </p>
          </Panel>
          <Panel className="grade-wide">
            <Globe2 size={26} />
            <h3>{t("Global Accessibility")}</h3>
            <p>
              {" "}
              {t(
                "One clear interface for public market reading, trading products, and account operations.",
              )}{" "}
            </p>
          </Panel>
        </div>
      </section>
    </div>
  )
}
