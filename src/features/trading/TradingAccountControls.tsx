import { RefreshCw, Settings2, ShieldAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { adjustPositionMargin, updatePositionMode } from "../../api/endpoints"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field, Panel } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { decimalToUnits, signedUnitsToDecimal, stepUnitsToDecimal } from "../../lib/units"
import { integer, type PrivateView } from "../../realtime"
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
  readonly marginMode: MarginMode
  readonly userId: string | number | undefined
  readonly symbol: string
  readonly productLine: ProductLine
  readonly positions: readonly Record<string, unknown>[]
  readonly settleAsset: string
  readonly assetScale: string | undefined
  readonly accountView: PrivateView | undefined
  readonly onRefresh: () => void
  readonly priceTickUnits: string | undefined
  readonly priceScale: string | undefined
  readonly quantityStepUnits: string | undefined
  readonly quantityScale: string | undefined
  readonly onSettingsChange: (settings: TradingOrderSettings) => void
}>

export function TradingAccountControls({
  marginMode,
  userId,
  symbol,
  productLine,
  positions,
  settleAsset,
  assetScale,
  accountView,
  onRefresh,
  priceTickUnits,
  priceScale,
  quantityStepUnits,
  quantityScale,
  onSettingsChange,
}: Props) {
  const [positionMode, setPositionMode] = useState<PositionMode>("ONE_WAY")
  const [positionSide, setPositionSide] = useState<PositionSide>("NET")
  const positionRisk = (accountView?.rows("risk") ?? [])
    .filter((row) => text(row, "symbol") === symbol)
    .filter((row) =>
      positions.some(
        (p) =>
          text(p, "symbol") === symbol && text(p, "positionSide") === text(row, "positionSide"),
      ),
    )
    .map((row) => ({
      ...positions.find(
        (p) =>
          text(p, "symbol") === symbol && text(p, "positionSide") === text(row, "positionSide"),
      ),
      ...row,
    }))
  const selectedPosition = positions.find(
    (row) =>
      text(row, "symbol") === symbol &&
      text(row, "positionSide") === positionSide &&
      text(row, "marginMode") === marginMode,
  )
  const selectedRisk = positionRisk.find((row) => text(row, "positionSide") === positionSide)
  const balance = accountView?.rows("balance").find((row) => text(row, "asset") === settleAsset)
  let walletBalanceUnits: string | undefined
  try {
    walletBalanceUnits = (
      integer(balance?.["availableUnits"]) + integer(balance?.["lockedUnits"])
    ).toString()
  } catch {
    /* Wait for a valid balance snapshot. */
  }
  const risk = accountView?.ready() ? { ...selectedRisk, walletBalanceUnits } : null
  const positionMargin = accountView?.ready()
    ? { marginUnits: selectedPosition?.["positionMarginUnits"] ?? "0" }
    : null
  const [marginAmount, setMarginAmount] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const snapshotMode = accountView?.positionMode

  useEffect(() => {
    if (!snapshotMode) return
    const nextMode = snapshotMode === "HEDGE" ? "HEDGE" : "ONE_WAY"
    setPositionMode(nextMode)
    setPositionSide((side) =>
      nextMode === "HEDGE"
        ? side === "NET"
          ? preferredHedgeSide(symbol, positions, [], side)
          : side
        : "NET",
    )
  }, [snapshotMode, symbol, positions])

  useEffect(() => {
    onSettingsChange({ marginMode, positionMode, positionSide })
  }, [marginMode, positionMode, positionSide, onSettingsChange])

  const savePositionMode = async (next: PositionMode) => {
    if (!userId) return
    setSaving(true)
    setMessage("")
    try {
      await updatePositionMode(userId, productLine, next, `position-mode-${crypto.randomUUID()}`)
      onRefresh()
      setMessage(
        t("Position mode submitted. Switching requires no conflicting positions or orders."),
      )
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
      setMessage(t("Please enter a valid margin amount."))
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
      setMessage(t("Position margin adjustment submitted."))
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
          <Settings2 size={17} /> {t("Account settings & risk")}{" "}
        </h2>
        <Button
          tone="ghost"
          onClick={() => {
            onRefresh()
          }}
          aria-label={t("Refresh settings")}
        >
          <RefreshCw size={15} /> {t("Refresh")}{" "}
        </Button>
      </div>
      <div className="trading-settings-grid">
        <Field label={t("Position mode")}>
          <DropdownSelect
            value={positionMode}
            onChange={(event) =>
              void savePositionMode(event.target.value === "HEDGE" ? "HEDGE" : "ONE_WAY")
            }
          >
            <option value="ONE_WAY">{t("One-way")}</option>
            <option value="HEDGE">{t("Hedge")}</option>
          </DropdownSelect>
        </Field>
        {positionMode === "HEDGE" ? (
          <Field label={t("TP/SL target side")}>
            <DropdownSelect
              value={positionSide}
              onChange={(event) => {
                const nextSide: PositionSide = event.target.value === "SHORT" ? "SHORT" : "LONG"
                setPositionSide(nextSide)
                onSettingsChange({ marginMode, positionMode, positionSide: nextSide })
              }}
            >
              <option value="LONG">{t("Long")}</option>
              <option value="SHORT">{t("Short")}</option>
            </DropdownSelect>
          </Field>
        ) : null}
        <Field label={`Position margin (${settleAsset})`}>
          <div className="inline-field">
            <input
              value={marginAmount}
              onChange={(event) => setMarginAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label={t("Position margin amount")}
            />
            <Button tone="positive" loading={saving} onClick={() => void adjustMargin("ADD")}>
              {" "}
              {t("Add")}{" "}
            </Button>
            <Button tone="negative" loading={saving} onClick={() => void adjustMargin("REDUCE")}>
              {" "}
              {t("Reduce")}{" "}
            </Button>
          </div>
        </Field>
      </div>
      <p className="muted">
        {accountView?.ready()
          ? `Selected position risk · ${symbol} · ${positionSide}`
          : t("Account syncing")}
      </p>
      <div className="risk-summary-grid">
        <RiskValue label={t("Status")} value={text(risk, "status")} />
        <RiskValue label={t("Margin ratio")} value={ppmToPercent(risk, "marginRatioPpm")} />
        <RiskValue
          label={t("Wallet balance")}
          value={unitsValue(risk, "walletBalanceUnits", assetScale, settleAsset)}
        />
        <RiskValue
          label={t("Equity")}
          value={unitsValue(risk, "equityUnits", assetScale, settleAsset)}
        />
        <RiskValue
          label={t("Unrealized PnL")}
          value={unitsValue(risk, "unrealizedPnlUnits", assetScale, settleAsset)}
        />
        <RiskValue
          label={t("Maintenance margin")}
          value={unitsValue(risk, "maintenanceMarginUnits", assetScale, settleAsset)}
        />
        <RiskValue
          label={t("Position margin")}
          value={unitsValue(positionMargin, "marginUnits", assetScale, settleAsset)}
        />
      </div>
      {positionRisk.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Position risk")}</th>
                <th>{t("Symbol")}</th>
                <th>{t("Size")}</th>
                <th>{t("Entry / mark")}</th>
                <th>{t("Margin ratio")}</th>
                <th>{t("Unrealized PnL")}</th>
                <th>{t("Liquidation price")}</th>
                <th>{t("Status")}</th>
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
        <ShieldAlert size={15} />{" "}
        {t("Derivative order settings are enforced by the account, order and risk services.")}{" "}
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
  return reason instanceof Error
    ? reason.message
    : t("Trading account service is unavailable. Please retry later.")
}
