import { ArrowRight, Globe2, Search, ShieldCheck, Zap } from "lucide-react"
import { useEffect, useState } from "react"
import { loadMarkets } from "../../api/endpoints"
import { mapMarket } from "../../api/mappers"
import { Footer } from "../../components/layout/Footer"
import {
  AssetIcon,
  Button,
  Panel,
  Price,
  Sparkline,
  StateView,
} from "../../components/ui/Primitives"
import { config } from "../../lib/config"
import { demoMarkets, demoTrend } from "../../lib/demo"
import { formatPercent } from "../../lib/format"
import type { Market } from "../../types/domain"

export function HomePage() {
  const [markets, setMarkets] = useState<readonly Market[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void loadMarkets()
      .then((rows) => setMarkets(rows.map(mapMarket)))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "行情服务暂不可用"),
      )
  }, [])
  const displayed =
    markets.length > 0 ? markets.slice(0, 3) : config.demoDataEnabled ? demoMarkets.slice(0, 3) : []
  return (
    <div className="home-page">
      <section className="hero container">
        <div className="hero-copy">
          <h1>The Trusted Gateway to Digital Assets.</h1>
          <p>
            Secure, transparent, and high-performance infrastructure for institutional and retail
            traders.
          </p>
          <div className="hero-search">
            <Search size={18} />
            <input
              placeholder="Search coins, tokens, pairs..."
              aria-label="Search coins, tokens, pairs"
            />
          </div>
          <div className="cluster hero-actions">
            <Button
              onClick={() => {
                window.location.href = "/trade/spot"
              }}
            >
              Start Trading <ArrowRight size={16} />
            </Button>
            <Button
              tone="outline"
              onClick={() => {
                window.location.href = "/markets"
              }}
            >
              View Markets
            </Button>
          </div>
        </div>
      </section>
      {config.demoDataEnabled && markets.length === 0 ? (
        <div className="container demo-banner">
          演示数据：后端行情未连接，当前仅用于本地视觉检查。
        </div>
      ) : null}
      <section className="section container">
        <div className="section-title">
          <h2>Top Assets</h2>
          <a className="route-link" href="/markets">
            View all
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
                <Sparkline
                  values={config.demoDataEnabled ? demoTrend : [0, 1]}
                  positive={(market.change24h ?? 0) >= 0}
                />
              </Panel>
            ))}
          </div>
        )}
      </section>
      <section className="section container">
        <div className="section-title">
          <h2>Institutional Grade</h2>
        </div>
        <div className="grade-grid">
          <Panel>
            <ShieldCheck size={26} />
            <h3>Security First Architecture</h3>
            <p>
              Multi-signature cold storage, rigorous testing, and anomaly detection keep the account
              state explicit.
            </p>
          </Panel>
          <Panel>
            <Zap size={26} />
            <h3>Professional Efficiency</h3>
            <p>
              Structured market data and precise order state help traders act without losing
              context.
            </p>
          </Panel>
          <Panel className="grade-wide">
            <Globe2 size={26} />
            <h3>Global Accessibility</h3>
            <p>
              One clear interface for public market reading, trading products, and account
              operations.
            </p>
          </Panel>
        </div>
      </section>
      <Footer />
    </div>
  )
}
