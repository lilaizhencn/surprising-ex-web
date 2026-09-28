import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { loadLeverageSetting, updateLeverageSetting } from "../../api/endpoints"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { t } from "../../i18n"
import type { ProductLine } from "../../types/domain"

export type LeverageSettings = Readonly<{
  leveragePpm: number
  maxLeveragePpm: number
  initialMarginRatePpm: number
  marginMode: "CROSS" | "ISOLATED"
}>

export function TradingTicketControls({
  userId,
  instrumentId,
  productLine,
  marginMode,
  onChange,
}: {
  readonly userId: string | number | undefined
  readonly instrumentId: string
  readonly productLine: ProductLine
  readonly marginMode: "CROSS" | "ISOLATED"
  readonly onChange: (value: LeverageSettings | null) => void
}) {
  const [mode, setMode] = useState(marginMode)
  const [setting, setSetting] = useState<LeverageSettings | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [reload, setReload] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    setSetting(null)
    onChange(null)
    setMessage("")
    if (userId)
      void loadLeverageSetting(userId, instrumentId, productLine, mode)
        .then((row) => {
          if (cancelled) return
          const value = parseSetting(row)
          setSetting(value)
          onChange(value)
        })
        .catch((error: unknown) => {
          if (!cancelled)
            setMessage(error instanceof Error ? error.message : t("Settings unavailable"))
        })
    return () => {
      cancelled = true
    }
  }, [userId, instrumentId, productLine, mode, onChange, reload])
  const save = async () => {
    if (!userId || !setting) return
    const ppm = Number(draft) * 1_000_000
    if (!Number.isSafeInteger(ppm) || ppm < 1_000_000 || ppm > setting.maxLeveragePpm) {
      setMessage(t("Please enter leverage within the allowed range."))
      return
    }
    setSaving(true)
    setMessage("")
    try {
      const row = await updateLeverageSetting(
        userId,
        instrumentId,
        productLine,
        mode,
        ppm,
        "web trading ticket",
      )
      if (!mounted.current) return
      const value = parseSetting(row)
      setSetting(value)
      onChange(value)
      dialog.current?.close()
    } catch (error) {
      if (mounted.current)
        setMessage(error instanceof Error ? error.message : t("Settings unavailable"))
    } finally {
      if (mounted.current) setSaving(false)
    }
  }
  return (
    <>
      <div className="ticket-contract-settings">
        <DropdownSelect
          aria-label={t("Margin mode")}
          value={mode}
          onChange={(event) => {
            if (!saving) setMode(event.target.value === "ISOLATED" ? "ISOLATED" : "CROSS")
          }}
        >
          <option value="CROSS">{t("Cross")}</option>
          <option value="ISOLATED">{t("Isolated")}</option>
        </DropdownSelect>
        <button
          type="button"
          disabled={saving}
          aria-label={t("Adjust leverage")}
          onClick={() => {
            setDraft(setting ? String(setting.leveragePpm / 1_000_000) : "")
            setMessage("")
            dialog.current?.showModal()
          }}
        >
          {setting ? `${setting.leveragePpm / 1_000_000}×` : t("Leverage")} ▾
        </button>
      </div>
      {message && (
        <p className="form-message negative" role="status">
          {message}
        </p>
      )}
      <dialog
        ref={dialog}
        className="leverage-dialog"
        aria-labelledby="leverage-dialog-title"
        onCancel={(event) => {
          if (saving) event.preventDefault()
        }}
      >
        <div className="leverage-dialog-heading">
          <h2 id="leverage-dialog-title">{t("Adjust leverage")}</h2>
          <button
            type="button"
            disabled={saving}
            aria-label={t("Close")}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <p>
          {instrumentId} · {t(mode === "CROSS" ? "Cross" : "Isolated")}
        </p>
        {!setting ? (
          <div className="leverage-unavailable">
            <p>{userId ? t("Settings unavailable") : t("Log in to set leverage")}</p>
            {userId ? (
              <button type="button" onClick={() => setReload((value) => value + 1)}>
                {t("Retry")}
              </button>
            ) : (
              <a className="ticket-sign-in" href="/auth/login">
                {t("Log in to trade")}
              </a>
            )}
          </div>
        ) : (
          <>
            <p className="muted">
              {t(
                "This contract uses the same leverage for long and short positions in the selected margin mode.",
              )}
            </p>
            <label>
              {t("Leverage")} (1–{(setting?.maxLeveragePpm ?? 0) / 1_000_000}×)
              <input
                type="number"
                aria-label={t("Leverage multiplier")}
                min="1"
                max={(setting?.maxLeveragePpm ?? 0) / 1_000_000}
                step="0.01"
                value={draft}
                disabled={saving}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <div className="leverage-presets">
              {[1, 2, 3, 5, 10, 20, 30, 50, 100]
                .filter((n) => n * 1_000_000 <= (setting?.maxLeveragePpm ?? 0))
                .map((n) => (
                  <button
                    type="button"
                    key={n}
                    disabled={saving}
                    className={Number(draft) === n ? "active" : ""}
                    onClick={() => setDraft(String(n))}
                  >
                    {n}×
                  </button>
                ))}
            </div>
            {message && (
              <p className="form-message negative" role="alert">
                {message}
              </p>
            )}
            <div className="leverage-dialog-actions">
              <button type="button" disabled={saving} onClick={() => dialog.current?.close()}>
                {t("Cancel")}
              </button>
              <button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? t("Saving…") : t("Confirm")}
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  )
}

export function parseSetting(row: Record<string, unknown>): LeverageSettings {
  const value = {
    leveragePpm: Number(row["leveragePpm"]),
    maxLeveragePpm: Number(row["maxLeveragePpm"]),
    initialMarginRatePpm: Number(row["initialMarginRatePpm"]),
    marginMode: row["marginMode"],
  }
  if (
    ![value.leveragePpm, value.maxLeveragePpm, value.initialMarginRatePpm].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) ||
    value.leveragePpm > value.maxLeveragePpm ||
    (value.marginMode !== "CROSS" && value.marginMode !== "ISOLATED")
  )
    throw Error(t("Settings unavailable"))
  return { ...value, marginMode: value.marginMode }
}
