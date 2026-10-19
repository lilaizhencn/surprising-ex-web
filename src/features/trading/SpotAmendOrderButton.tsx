import "./SpotAmendOrderButton.css"
import { useEffect, useRef, useState } from "react"
import { amendOrder, PendingTradingCommand } from "../../api/endpoints"
import { Button, Field } from "../../components/ui/Primitives"
import { StandardDialog } from "../../components/ui/StandardDialog"
import { t } from "../../i18n"
import { stepUnitsToDecimal } from "../../lib/units"
import { loadSession, useSession } from "../../state/session"
import type { Market } from "../../types/domain"
import { spotAmendmentTerms } from "./orderCapacity"

export function SpotAmendOrderButton({
  row,
  market,
  scales,
  disabled,
  onNotice,
}: {
  readonly row: Readonly<Record<string, unknown>>
  readonly market: Market | undefined
  readonly scales: Readonly<Record<string, string>>
  readonly disabled: boolean
  readonly onNotice: (message: string, failed: boolean) => void
}) {
  const session = useSession(),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false)
  const [price, setPrice] = useState(""),
    [quantity, setQuantity] = useState(""),
    [error, setError] = useState("")
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    setEditing(false)
    setError("")
  }, [session?.user.userId, market?.instrumentId, row["orderId"]])
  if (
    market?.productLine !== "SPOT" ||
    row["orderType"] !== "LIMIT" ||
    !["OPEN", "NEW", "ACCEPTED", "PARTIALLY_FILLED"].includes(String(row["status"]))
  )
    return null
  const save = async () => {
    if (!session || busy || disabled) return
    const userId = String(session.user.userId)
    setError("")
    try {
      const terms = spotAmendmentTerms(market, scales, row, price, quantity)
      const key = `web-amend-${crypto.randomUUID()}`
      setBusy(true)
      const result = await amendOrder(
        {
          userId: session.user.userId,
          orderId: String(row["orderId"]),
          instrumentId: market.instrumentId,
          newClientOrderId: key,
          clientRequestId: key,
          ...terms,
          timeInForce: row["timeInForce"] ?? "GTC",
          postOnly: row["postOnly"] === true,
        },
        "SPOT",
      )
      if (!alive.current || String(loadSession()?.user.userId ?? "") !== userId) return
      setEditing(false)
      const replacement = result["replacementOrder"] as Record<string, unknown>
      onNotice(
        t(
          replacement["status"] === "REJECTED"
            ? "Replacement was rejected. Check both order states."
            : "Amendment processed. Check both order states.",
        ),
        replacement["status"] === "REJECTED",
      )
    } catch (reason) {
      if (!alive.current || String(loadSession()?.user.userId ?? "") !== userId) return
      const message =
        reason instanceof Error
          ? reason.message
          : t("Amendment result is unavailable. Please check again.")
      if (reason instanceof PendingTradingCommand) {
        setEditing(false)
        onNotice(message, false)
      } else setError(t(message))
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return (
    <>
      <button
        className="compact-cancel"
        type="button"
        disabled={disabled || busy || !session || market.status !== "TRADING"}
        onClick={() => {
          try {
            setPrice(
              stepUnitsToDecimal(
                String(row["priceTicks"]),
                market.priceTickUnits ?? "",
                scales[market.quoteAsset] ?? "",
              ),
            )
            setQuantity(
              stepUnitsToDecimal(
                String(row["remainingQuantitySteps"]),
                market.quantityStepUnits ?? "",
                scales[market.baseAsset] ?? "",
              ),
            )
            setError("")
            setEditing(true)
          } catch {
            onNotice(t("Trading precision is unavailable. Refresh before amending."), true)
          }
        }}
      >
        {t("Amend")}
      </button>
      {editing && (
        <StandardDialog
          className="spot-amend-dialog"
          title={t("Amend spot order")}
          subtitle={market.symbol}
          onClose={() => setEditing(false)}
          closeDisabled={busy}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <p>
              {t(
                "A successful amendment cancels the original and creates a replacement. Replacement quantity is independent of original fills.",
              )}
            </p>
            <Field label={t("Replacement price")}>
              <input
                aria-label={t("Replacement price")}
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={busy || disabled}
              />
            </Field>
            <Field label={t("Replacement quantity")}>
              <input
                aria-label={t("Replacement quantity")}
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={busy || disabled}
              />
            </Field>
            {error && (
              <p className="form-message" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || disabled}>
              {t("Confirm amendment")}
            </Button>
          </form>
        </StandardDialog>
      )}
    </>
  )
}
