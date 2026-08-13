import { RefreshCw, Settings2, ShieldAlert } from "lucide-react"
import { useEffect, useState } from "react"
import {
  adjustPositionMargin,
  loadAccountRisk,
  loadLeverageSetting,
  loadPositionMargin,
  loadPositionMode,
  loadPositionRisk,
  updateLeverageSetting,
  updatePositionMode,
} from "../../api/endpoints"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { decimalToUnits, signedUnitsToDecimal, stepUnitsToDecimal } from "../../lib/units"
import type { ProductLine } from "../../types/domain"

type MarginMode = "CROSS" | "ISOLATED"
type PositionMode = "ONE_WAY" | "HEDGE"
type PositionSide = "NET" | "LONG" | "SHORT"

export type TradingOrderSettings = Readonly<{
  marginMode: MarginMode
  positionMode: PositionMode
  positionSide: PositionSide
}>

type Props = Readonly<{
  readonly userId: string | number | undefined
  readonly symbol: string
  readonly productLine: ProductLine
  readonly positions: readonly Record<string, unknown>[]
  readonly settleAsset: string
  readonly assetScale: string | undefined
  readonly refreshToken: string | null
  readonly priceTickUnits: string | undefined
  readonly priceScale: string | undefined
  readonly quantityStepUnits: string | undefined
  readonly quantityScale: string | undefined
  readonly onSettingsChange: (settings: TradingOrderSettings) => void
}>

export function TradingAccountControls({
  userId,
  symbol,
  productLine,
  positions,
  settleAsset,
  assetScale,
  refreshToken,
  priceTickUnits,
  priceScale,
  quantityStepUnits,
  quantityScale,
  onSettingsChange,
}: Props) {
  const [marginMode, setMarginMode] = useState<MarginMode>("CROSS")
  const [positionMode, setPositionMode] = useState<PositionMode>("ONE_WAY")
  const [positionSide, setPositionSide] = useState<PositionSide>("NET")
  const [leverage, setLeverage] = useState("1")
  const [maxLeverage, setMaxLeverage] = useState("1")
  const [positionMargin, setPositionMargin] = useState<Record<string, unknown> | null>(null)
  const [risk, setRisk] = useState<Record<string, unknown> | null>(null)
  const [positionRisk, setPositionRisk] = useState<readonly Record<string, unknown>[]>([])
  const [marginAmount, setMarginAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!userId || productLine === "SPOT") return
    setLoading(true)
    setMessage("")
    void Promise.all([
      loadPositionMode(userId, productLine),
      loadLeverageSetting(userId, symbol, productLine, marginMode),
      loadPositionMargin(userId, symbol, productLine, marginMode),
      loadAccountRisk(userId, productLine, settleAsset),
      loadPositionRisk(userId, productLine),
    ])
      .then(([modeResult, leverageResult, marginResult, riskResult, positionRiskResult]) => {
        const nextMode = modeValue(modeResult)
        const nextMarginMode = marginValue(leverageResult) ?? marginMode
        const nextSide =
          nextMode === "HEDGE"
            ? preferredHedgeSide(symbol, positions, positionRiskResult, positionSide)
            : "NET"
        const nextLeverage = ppmToLeverage(leverageResult)
        setPositionMode(nextMode)
        setMarginMode(nextMarginMode)
        setPositionSide(nextSide)
        setLeverage(nextLeverage)
        setMaxLeverage(ppmToLeverage(leverageResult, "maxLeveragePpm"))
        setPositionMargin(marginResult)
        setRisk(riskResult)
        setPositionRisk(positionRiskResult)
        onSettingsChange({
          marginMode: nextMarginMode,
          positionMode: nextMode,
          positionSide: nextSide,
        })
      })
      .catch((reason: unknown) => setMessage(readError(reason)))
      .finally(() => setLoading(false))
  }, [
    marginMode,
    onSettingsChange,
    positions,
    productLine,
    refreshToken,
    settleAsset,
    symbol,
    userId,
  ])

  const saveLeverage = async () => {
    if (!userId || !Number.isFinite(Number(leverage)) || Number(leverage) <= 0) {
      setMessage("请输入有效杠杆倍数。")
      return
    }
    setSaving(true)
    setMessage("")
    try {
      await updateLeverageSetting(
        userId,
        symbol,
        productLine,
        marginMode,
        Math.round(Number(leverage) * 1_000_000),
        "web trading settings",
      )
      setMessage("杠杆设置已提交，最终状态以账户快照为准。")
    } catch (reason: unknown) {
      setMessage(readError(reason))
    } finally {
      setSaving(false)
    }
  }

  const saveMarginMode = async (next: MarginMode) => {
    setMarginMode(next)
    onSettingsChange({ marginMode: next, positionMode, positionSide })
    if (!userId) return
    setSaving(true)
    setMessage("")
    try {
      await updateLeverageSetting(
        userId,
        symbol,
        productLine,
        next,
        Math.round(Number(leverage) * 1_000_000),
        "web margin mode",
      )
      setMessage("保证金模式已提交。")
    } catch (reason: unknown) {
      setMessage(readError(reason))
    } finally {
      setSaving(false)
    }
  }

  const savePositionMode = async (next: PositionMode) => {
    if (!userId) return
    const nextSide: PositionSide = next === "HEDGE" ? "LONG" : "NET"
    setPositionMode(next)
    setPositionSide(nextSide)
    onSettingsChange({ marginMode, positionMode: next, positionSide: nextSide })
    setSaving(true)
    setMessage("")
    try {
      await updatePositionMode(userId, productLine, next, `position-mode-${crypto.randomUUID()}`)
      setMessage("持仓模式已提交。请在没有冲突持仓和挂单时切换。")
    } catch (reason: unknown) {
      setMessage(readError(reason))
    } finally {
      setSaving(false)
    }
  }

  const adjustMargin = async (direction: "ADD" | "REDUCE") => {
    if (
      !userId ||
      !assetScale ||
      !Number.isFinite(Number(marginAmount)) ||
      Number(marginAmount) <= 0
    ) {
      setMessage("请输入有效的保证金数量。")
      return
    }
    setSaving(true)
    setMessage("")
    try {
      const units = decimalToUnits(marginAmount, assetScale)
      const amountUnits = direction === "ADD" ? units : `-${units}`
      await adjustPositionMargin(
        userId,
        symbol,
        productLine,
        marginMode,
        positionSide,
        amountUnits,
        `position-margin-${crypto.randomUUID()}`,
        `web ${direction.toLowerCase()} position margin`,
      )
      setMarginAmount("")
      setMessage("仓位保证金调整已提交。")
    } catch (reason: unknown) {
      setMessage(readError(reason))
    } finally {
      setSaving(false)
    }
  }

  if (!userId || productLine === "SPOT") return null

  return (
    <Panel dense className="trading-account-controls">
      <div className="panel-heading">
        <h2>
          <Settings2 size={17} /> Account settings & risk
        </h2>
        <Button tone="ghost" onClick={() => window.location.reload()} aria-label="Refresh settings">
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>
      {loading ? <StateView kind="loading" message="Loading account settings and risk…" /> : null}
      <div className="trading-settings-grid">
        <Field label="Margin mode">
          <select
            value={marginMode}
            onChange={(event) =>
              void saveMarginMode(event.target.value === "ISOLATED" ? "ISOLATED" : "CROSS")
            }
          >
            <option value="CROSS">Cross</option>
            <option value="ISOLATED">Isolated</option>
          </select>
        </Field>
        <Field label="Position mode">
          <select
            value={positionMode}
            onChange={(event) =>
              void savePositionMode(event.target.value === "HEDGE" ? "HEDGE" : "ONE_WAY")
            }
          >
            <option value="ONE_WAY">One-way</option>
            <option value="HEDGE">Hedge</option>
          </select>
        </Field>
        {positionMode === "HEDGE" ? (
          <Field label="TP/SL target side">
            <select
              value={positionSide}
              onChange={(event) => {
                const nextSide: PositionSide = event.target.value === "SHORT" ? "SHORT" : "LONG"
                setPositionSide(nextSide)
                onSettingsChange({ marginMode, positionMode, positionSide: nextSide })
              }}
            >
              <option value="LONG">LONG / 多仓</option>
              <option value="SHORT">SHORT / 空仓</option>
            </select>
          </Field>
        ) : null}
        <Field label={`Leverage (max ${maxLeverage}x)`}>
          <div className="inline-field">
            <input
              value={leverage}
              onChange={(event) => setLeverage(event.target.value)}
              inputMode="decimal"
              aria-label="Leverage"
            />
            <Button tone="outline" loading={saving} onClick={() => void saveLeverage()}>
              Save
            </Button>
          </div>
        </Field>
        <Field label={`Position margin (${settleAsset})`}>
          <div className="inline-field">
            <input
              value={marginAmount}
              onChange={(event) => setMarginAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Position margin amount"
            />
            <Button tone="positive" loading={saving} onClick={() => void adjustMargin("ADD")}>
              Add
            </Button>
            <Button tone="negative" loading={saving} onClick={() => void adjustMargin("REDUCE")}>
              Reduce
            </Button>
          </div>
        </Field>
      </div>
      <div className="risk-summary-grid">
        <RiskValue label="Status" value={text(risk, "status")} />
        <RiskValue label="Margin ratio" value={ppmToPercent(risk, "marginRatioPpm")} />
        <RiskValue
          label="Wallet balance"
          value={unitsValue(risk, "walletBalanceUnits", assetScale, settleAsset)}
        />
        <RiskValue
          label="Equity"
          value={unitsValue(risk, "equityUnits", assetScale, settleAsset)}
        />
        <RiskValue
          label="Unrealized PnL"
          value={unitsValue(risk, "unrealizedPnlUnits", assetScale, settleAsset)}
        />
        <RiskValue
          label="Maintenance margin"
          value={unitsValue(risk, "maintenanceMarginUnits", assetScale, settleAsset)}
        />
        <RiskValue
          label="Position margin"
          value={unitsValue(positionMargin, "marginUnits", assetScale, settleAsset)}
        />
      </div>
      {positionRisk.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Position risk</th>
                <th>Symbol</th>
                <th>Size</th>
                <th>Entry / mark</th>
                <th>Margin ratio</th>
                <th>Unrealized PnL</th>
                <th>Liquidation price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {positionRisk.map((row, index) => (
                <tr key={text(row, "positionId") || `${text(row, "symbol")}-${index}`}>
                  <td>{text(row, "positionSide") || "NET"}</td>
                  <td>{text(row, "symbol") || "—"}</td>
                  <td className="mono">
                    {signedStepsValue(row, quantityStepUnits, quantityScale)}
                  </td>
                  <td className="mono">
                    {priceValue(row, "entryPriceTicks", priceTickUnits, priceScale)} /{" "}
                    {priceValue(row, "markPriceTicks", priceTickUnits, priceScale)}
                  </td>
                  <td className="mono">{ppmToPercent(row, "marginRatioPpm")}</td>
                  <td className="mono">
                    {unitsValue(
                      row,
                      "unrealizedPnlUnits",
                      assetScale,
                      text(row, "settleAsset") || settleAsset,
                    )}
                  </td>
                  <td className="mono">
                    {text(row, "liquidationPrice") ||
                      priceValue(row, "liquidationPriceTicks", priceTickUnits, priceScale)}
                  </td>
                  <td>{text(row, "status") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      <div className="settings-note">
        <ShieldAlert size={15} /> Derivative order settings are enforced by the account, order and
        risk services.
      </div>
    </Panel>
  )
}

function RiskValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="risk-value">
      <small>{label}</small>
      <strong className="mono">{value || "—"}</strong>
    </div>
  )
}

function modeValue(value: Record<string, unknown>): PositionMode {
  return text(value, "positionMode") === "HEDGE" ? "HEDGE" : "ONE_WAY"
}

function marginValue(value: Record<string, unknown>): MarginMode | null {
  return text(value, "marginMode") === "ISOLATED"
    ? "ISOLATED"
    : text(value, "marginMode") === "CROSS"
      ? "CROSS"
      : null
}

function positionSideValue(value: Record<string, unknown> | undefined): PositionSide {
  return text(value, "positionSide") === "SHORT" ? "SHORT" : "LONG"
}

function preferredHedgeSide(
  symbol: string,
  positions: readonly Record<string, unknown>[],
  riskRows: readonly Record<string, unknown>[],
  currentSide: PositionSide,
): PositionSide {
  const rows = [...positions, ...riskRows]
    .filter((row) => text(row, "symbol") === symbol)
    .filter((row) => text(row, "positionSide") === "LONG" || text(row, "positionSide") === "SHORT")
  const sides = new Set<PositionSide>(rows.map((row) => positionSideValue(row)))
  if (currentSide === "LONG" || currentSide === "SHORT") {
    if (sides.has(currentSide)) return currentSide
  }
  if (sides.size === 1) return [...sides][0] ?? "LONG"
  return "LONG"
}

function ppmToLeverage(value: Record<string, unknown>, key = "leveragePpm"): string {
  const ppm = numeric(value, key)
  return ppm === null ? "1" : (ppm / 1_000_000).toFixed(2).replace(/\.00$/, "")
}

function ppmToPercent(value: Record<string, unknown> | null, key: string): string {
  const ppm = numeric(value, key)
  return ppm === null ? "—" : `${(ppm / 10_000).toFixed(4)}%`
}

function unitsValue(
  value: Record<string, unknown> | null,
  key: string,
  scale: string | undefined,
  asset: string,
): string {
  const raw = value ? value[key] : undefined
  if ((typeof raw !== "string" && typeof raw !== "number") || !scale) return "—"
  try {
    return `${signedUnitsToDecimal(raw, scale)} ${asset}`
  } catch {
    return "—"
  }
}

function signedStepsValue(
  value: Record<string, unknown> & { readonly signedQuantitySteps?: string | number },
  unitSize: string | undefined,
  assetScale: string | undefined,
): string {
  const raw = value.signedQuantitySteps
  if ((typeof raw !== "string" && typeof raw !== "number") || !unitSize || !assetScale) {
    return text(value, "signedQuantitySteps") || "—"
  }
  try {
    const normalized = String(raw)
    const negative = normalized.startsWith("-")
    const magnitude = negative ? normalized.slice(1) : normalized
    return `${negative ? "-" : "+"}${stepUnitsToDecimal(magnitude, unitSize, assetScale)}`
  } catch {
    return String(raw)
  }
}

function priceValue(
  value: Record<string, unknown>,
  key: string,
  tickUnits: string | undefined,
  priceScale: string | undefined,
): string {
  const raw = value[key]
  if ((typeof raw !== "string" && typeof raw !== "number") || !tickUnits || !priceScale) {
    return typeof raw === "string" || typeof raw === "number" ? `ticks ${raw}` : "—"
  }
  try {
    return stepUnitsToDecimal(raw, tickUnits, priceScale)
  } catch {
    return `ticks ${raw}`
  }
}

function numeric(value: Record<string, unknown> | null, key: string): number | null {
  const raw = value?.[key]
  const number = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN
  return Number.isFinite(number) ? number : null
}

function text(value: Record<string, unknown> | null | undefined, key: string): string {
  const raw = value?.[key]
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : ""
}

function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "交易账户服务暂不可用，请稍后重试。"
}
