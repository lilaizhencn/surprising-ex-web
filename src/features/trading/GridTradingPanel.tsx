import { useEffect, useState } from "react"
import "./GridTradingPanel.css"
import {
  createGridStrategy,
  type GridStrategyRecord,
  loadGridStrategies,
  stopGridStrategy,
} from "../../api/endpoints"
import type { AuthSession } from "../../api/types"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { decimalToStepUnits, stepUnitsToDecimal } from "../../lib/units"
import type { Market, ProductLine } from "../../types/domain"

export function GridTradingPanel({
  current,
  productLine,
  session,
  assetScales,
  marketQuote,
  onNotice,
}: {
  readonly current: Market | null
  readonly productLine: ProductLine
  readonly session: AuthSession | null
  readonly assetScales: Readonly<Record<string, string>>
  readonly marketQuote: number | null
  readonly onNotice: (message: string, failed?: boolean) => void
}) {
  const [lowerPrice, setLowerPrice] = useState("")
  const [upperPrice, setUpperPrice] = useState("")
  const [gridCount, setGridCount] = useState(10)
  const [isArithmetic, setIsArithmetic] = useState(true)
  const [totalInvestment, setTotalInvestment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [strategies, setStrategies] = useState<readonly GridStrategyRecord[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [stoppingId, setStoppingId] = useState<number | null>(null)

  const quoteAsset = current?.quoteAsset ?? "USDT"
  const priceTickUnits = current?.priceTickUnits ?? "100"
  const quoteScale = current ? (assetScales[current.quoteAsset] ?? "2") : "2"

  const reloadStrategies = async () => {
    if (!session) return
    setLoadingList(true)
    try {
      const list = await loadGridStrategies()
      setStrategies(list)
    } catch {
      // 忽略短暂请求失败
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    if (session) {
      void reloadStrategies()
    } else {
      setStrategies([])
    }
  }, [session?.user.userId])

  const handleCreate = async () => {
    if (!session) {
      onNotice(t("Login required to create grid strategy"), true)
      return
    }
    if (!current) {
      onNotice(t("Select a market first"), true)
      return
    }
    const low = Number(lowerPrice)
    const high = Number(upperPrice)
    const invest = Number(totalInvestment)
    if (!Number.isFinite(low) || low <= 0) {
      onNotice(t("Invalid lower price"), true)
      return
    }
    if (!Number.isFinite(high) || high <= low) {
      onNotice(t("Upper price must be greater than lower price"), true)
      return
    }
    if (gridCount < 2 || gridCount > 150) {
      onNotice(t("Grid count must be between 2 and 150"), true)
      return
    }
    if (!Number.isFinite(invest) || invest <= 0) {
      onNotice(t("Invalid investment amount"), true)
      return
    }

    setSubmitting(true)
    try {
      const lowerPriceTicks = decimalToStepUnits(lowerPrice, priceTickUnits, quoteScale)
      const upperPriceTicks = decimalToStepUnits(upperPrice, priceTickUnits, quoteScale)
      const totalInvestmentUnits = decimalToStepUnits(totalInvestment, "1", quoteScale)
      const currentTicks = marketQuote
        ? Number(decimalToStepUnits(String(marketQuote), priceTickUnits, quoteScale))
        : 0

      await createGridStrategy(
        {
          instrumentId: current.instrumentId,
          productLine: current.productLine,
          lowerPriceTicks,
          upperPriceTicks,
          gridCount,
          totalInvestmentUnits,
          isArithmetic,
        },
        currentTicks,
      )

      onNotice(t("Grid strategy created and deployed successfully!"))
      setLowerPrice("")
      setUpperPrice("")
      setTotalInvestment("")
      await reloadStrategies()
    } catch (err: unknown) {
      onNotice(err instanceof Error ? err.message : t("Failed to create grid strategy"), true)
    } finally {
      setSubmitting(false)
    }
  }

  const handleStop = async (strategyId: number) => {
    setStoppingId(strategyId)
    try {
      await stopGridStrategy(strategyId)
      onNotice(t("Grid strategy stopped and orders canceled."))
      await reloadStrategies()
    } catch (err: unknown) {
      onNotice(err instanceof Error ? err.message : t("Failed to stop grid strategy"), true)
    } finally {
      setStoppingId(null)
    }
  }

  return (
    <div className="grid-bot-panel">
      <div className="grid-form-card">
        <div className="grid-form-header">
          <h3>{t("Grid Trading Bot")}</h3>
          <span className="badge-tech">{current?.symbol ?? "BTC/USDT"}</span>
        </div>

        <div className="grid-mode-selector">
          <button
            type="button"
            className={isArithmetic ? "active" : ""}
            onClick={() => setIsArithmetic(true)}
          >
            {t("Arithmetic (Equal Step)")}
          </button>
          <button
            type="button"
            className={!isArithmetic ? "active" : ""}
            onClick={() => setIsArithmetic(false)}
          >
            {t("Geometric (Equal Ratio)")}
          </button>
        </div>

        <div className="grid-inputs-row">
          <Field label={t("Lower Price")}>
            <div className="number-input">
              <input
                value={lowerPrice}
                onChange={(e) => setLowerPrice(e.target.value)}
                placeholder={marketQuote ? (marketQuote * 0.9).toFixed(2) : "0.00"}
                inputMode="decimal"
              />
              <span className="unit">{quoteAsset}</span>
            </div>
          </Field>
          <Field label={t("Upper Price")}>
            <div className="number-input">
              <input
                value={upperPrice}
                onChange={(e) => setUpperPrice(e.target.value)}
                placeholder={marketQuote ? (marketQuote * 1.1).toFixed(2) : "0.00"}
                inputMode="decimal"
              />
              <span className="unit">{quoteAsset}</span>
            </div>
          </Field>
        </div>

        <div className="grid-inputs-row">
          <Field label={t("Grids (2 - 150)")}>
            <div className="number-input">
              <input
                type="number"
                min={2}
                max={150}
                value={gridCount}
                onChange={(e) => setGridCount(Number(e.target.value))}
              />
              <span className="unit">{t("Grids")}</span>
            </div>
          </Field>
          <Field label={t("Total Investment")}>
            <div className="number-input">
              <input
                value={totalInvestment}
                onChange={(e) => setTotalInvestment(e.target.value)}
                placeholder="100.00"
                inputMode="decimal"
              />
              <span className="unit">{quoteAsset}</span>
            </div>
          </Field>
        </div>

        <Button
          tone="positive"
          loading={submitting}
          disabled={!session || submitting}
          onClick={() => void handleCreate()}
        >
          {session ? t("Create Strategy Bot") : t("Login to Trade")}
        </Button>
      </div>

      <div className="grid-list-card">
        <div className="grid-list-header">
          <h4>{t("Active Strategies")}</h4>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => void reloadStrategies()}
            disabled={loadingList}
          >
            {loadingList ? t("Loading...") : t("Refresh")}
          </button>
        </div>

        {strategies.length === 0 ? (
          <div className="empty-strategies">
            <p>{t("No active grid strategies. Deploy one to auto-trade 24/7.")}</p>
          </div>
        ) : (
          <div className="strategy-table-wrapper">
            <table className="strategy-table">
              <thead>
                <tr>
                  <th>{t("Pair")}</th>
                  <th>{t("Range")}</th>
                  <th>{t("Grids")}</th>
                  <th>{t("Invested")}</th>
                  <th>{t("Matched Trades")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Action")}</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((st) => {
                  const isRunning = st.status === "RUNNING"
                  const low = stepUnitsToDecimal(st.lowerPriceTicks, priceTickUnits, quoteScale)
                  const high = stepUnitsToDecimal(st.upperPriceTicks, priceTickUnits, quoteScale)
                  const invest = stepUnitsToDecimal(st.totalInvestmentUnits, "1", quoteScale)
                  return (
                    <tr key={st.strategyId}>
                      <td className="symbol-cell">{st.instrumentId}</td>
                      <td>
                        {low} - {high}
                      </td>
                      <td>{st.gridCount}</td>
                      <td>
                        {invest} {quoteAsset}
                      </td>
                      <td className="profit-cell">
                        {st.matchedTradeCount} {t("trades")}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${isRunning ? "status-running" : "status-stopped"}`}
                        >
                          {st.status}
                        </span>
                      </td>
                      <td>
                        {isRunning ? (
                          <button
                            type="button"
                            className="stop-btn"
                            disabled={stoppingId === st.strategyId}
                            onClick={() => void handleStop(st.strategyId)}
                          >
                            {stoppingId === st.strategyId ? t("Stopping...") : t("Stop & Cancel")}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
