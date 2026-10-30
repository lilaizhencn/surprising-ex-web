import { useEffect, useState } from "react"
import {
  canQueryOptionReference,
  freshOptionReference,
  loadOptionReference,
  type OptionReference,
} from "../../api/optionQuote"
import { Panel } from "../../components/ui/Primitives"
import { t, useLocale } from "../../i18n"
import { unitsToDecimal } from "../../lib/units"
import type { Market } from "../../types/domain"

export function optionChain(markets: readonly Market[], selected: Market) {
  const expiry = Date.parse(selected.expiryTime ?? "")
  if (
    !selected.underlyingInstrumentId ||
    !selected.underlyingProductLine ||
    !Number.isFinite(expiry)
  )
    return []
  const rows = new Map<string, { strike: string; calls: Market[]; puts: Market[] }>()
  for (const market of markets) {
    if (
      market.productLine !== "OPTION" ||
      market.underlyingInstrumentId !== selected.underlyingInstrumentId ||
      market.underlyingProductLine !== selected.underlyingProductLine ||
      market.quoteAsset !== selected.quoteAsset ||
      market.settleAsset !== selected.settleAsset ||
      Date.parse(market.expiryTime ?? "") !== expiry ||
      !/^[1-9]\d*$/.test(market.strikePriceUnits ?? "") ||
      !["CALL", "PUT"].includes(market.optionType ?? "")
    )
      continue
    const strike = market.strikePriceUnits as string
    const row = rows.get(strike) ?? { strike, calls: [], puts: [] }
    const contracts = market.optionType === "CALL" ? row.calls : row.puts
    contracts.push(market)
    rows.set(strike, row)
  }
  return [...rows.values()].sort((a, b) =>
    BigInt(a.strike) < BigInt(b.strike) ? -1 : BigInt(a.strike) > BigInt(b.strike) ? 1 : 0,
  )
}

export function OptionMarketPanel({
  market,
  markets,
  scales,
  onSelect,
}: {
  readonly market: Market
  readonly markets: readonly Market[]
  readonly scales: Readonly<Record<string, string>>
  readonly onSelect: (instrumentId: string) => void
}) {
  useLocale()
  const [quote, setQuote] = useState<OptionReference | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(clock)
  }, [])
  useEffect(() => {
    let disposed = false
    let timer = 0
    const abort = new AbortController()
    const refresh = async () => {
      if (!canQueryOptionReference(market)) {
        setQuote(null)
        return
      }
      try {
        const loaded = await loadOptionReference(market, abort.signal)
        if (!disposed) setQuote(loaded)
      } catch {
        if (!disposed) setQuote(null)
      }
      if (!disposed) timer = window.setTimeout(() => void refresh(), 2000)
    }
    void refresh()
    return () => {
      disposed = true
      abort.abort()
      window.clearTimeout(timer)
    }
  }, [market])
  const current = freshOptionReference(quote, market, now) ? quote : null
  const greeks = current?.greeks
  const value = (number: number | undefined, digits = 6) =>
    number == null ? "—" : number.toLocaleString(undefined, { maximumFractionDigits: digits })
  const price = (number: number | undefined) =>
    `${value(number, market.pricePrecision)} ${market.quoteAsset}`
  const chain = optionChain(markets, market)
  return (
    <Panel dense className="option-market-panel">
      <h3>{t("Option market reference")}</h3>
      <div className="contract-detail-grid" data-reference-instrument={current?.instrumentId ?? ""}>
        <Metric label={t("Underlying index")} value={price(current?.underlyingIndexPrice)} />
        <Metric label={t("Same-expiry forward")} value={price(current?.sameExpiryForwardPrice)} />
        <Metric label={t("Premium quote")} value={price(current?.premiumPrice)} />
        <Metric label={t("Intrinsic value")} value={price(current?.intrinsicValue)} />
        <Metric
          label={t("Implied volatility")}
          value={greeks ? `${value(greeks.impliedVolatility * 100, 3)}%` : "—"}
        />
        <Metric label={t("Forward Delta")} value={value(greeks?.forwardDelta)} />
        <Metric label={t("Forward Gamma")} value={value(greeks?.forwardGamma, 10)} />
        <Metric
          label={t("Vega / 1% volatility")}
          value={`${value(greeks?.vegaPerVolPoint, Math.max(6, market.pricePrecision))} ${market.quoteAsset}`}
        />
        <Metric
          label={t("Theta / day")}
          value={`${value(greeks?.thetaPerDay, Math.max(6, market.pricePrecision))} ${market.quoteAsset}`}
        />
      </div>
      <p className="muted contract-help">
        {t("Black-76 reference; zero discount rate; per 1 underlying unit.")} {market.baseAsset}
      </p>
      <p className="muted contract-help" role="status">
        {current
          ? greeks
            ? `${t("As of")} ${new Date(current.asOf).toLocaleTimeString()}`
            : t("This quote has no implied volatility under the reference model.")
          : t("Option reference is unavailable or stale.")}
      </p>
      <h3>{t("Same-expiry option chain")}</h3>
      <div className="option-chain-row option-chain-heading">
        <span>CALL</span>
        <span>{t("Strike price")}</span>
        <span>PUT</span>
      </div>
      {chain.map((row) => (
        <div className="option-chain-row" key={row.strike}>
          <Contracts contracts={row.calls} selected={market.instrumentId} onSelect={onSelect} />
          <span className="mono">
            {scales[market.quoteAsset]
              ? unitsToDecimal(row.strike, scales[market.quoteAsset] ?? "")
              : "—"}
          </span>
          <Contracts contracts={row.puts} selected={market.instrumentId} onSelect={onSelect} />
        </div>
      ))}
      {!chain.length ? <p className="muted">{t("No matching option contracts.")}</p> : null}
    </Panel>
  )
}
function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="contract-detail">
      <span className="muted">{t(label)}</span>
      <strong className="mono">{value}</strong>
    </div>
  )
}
function Contracts({
  contracts,
  selected,
  onSelect,
}: {
  readonly contracts: readonly Market[]
  readonly selected: string
  readonly onSelect: (id: string) => void
}) {
  return (
    <div>
      {contracts.length ? (
        contracts.map((market) => (
          <button
            type="button"
            className="option-chain-contract"
            key={market.instrumentId}
            aria-pressed={market.instrumentId === selected}
            onClick={() => onSelect(market.instrumentId)}
          >
            {market.symbol}
            <small>{market.status}</small>
          </button>
        ))
      ) : (
        <span className="muted">—</span>
      )}
    </div>
  )
}
