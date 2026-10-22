import { CircleHelp } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  checkOrderSubmission,
  continueCancellationPlan,
  loadEffectiveTradingFee,
  loadOrderPriceProtection,
  PendingTradingCommand,
} from "../../api/endpoints"
import type {
  ApiBalance,
  ApiOrder,
  ApiOrderBook,
  ApiOrderBookLevel,
  AuthSession,
} from "../../api/types"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { decimalToStepUnits, stepUnitsToDecimal, unitsToDecimal } from "../../lib/units"
import {
  clearPendingCommand,
  type PendingOrderCommand,
  readPendingCommand,
  savePendingCommand,
} from "../../state/pendingOrders"
import { loadSession } from "../../state/session"
import {
  type Market,
  type OrderSide,
  type OrderType,
  PRODUCT_LINES,
  type ProductLine,
} from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"
import {
  contractOpeningCapacity,
  deliveryFee,
  optionPremiumTerms,
  orderPositionSide,
  spotFeeReserve,
  spotOrderQuantity,
  spotReferenceTicks,
} from "./orderCapacity"
import {
  type PreparedOrderSubmission,
  prepareOrderSubmission,
  submitPreparedOrder,
} from "./orderSubmission"
import type { TradingOrderSettings } from "./TradingAccountControls"
import { type LeverageSettings, TradingTicketControls } from "./TradingTicketControls"
import { displayPrice, formatTradeQuantity, isDollarQuote } from "./tradeFormatting"
import { canSubmitTradingOrder, canSubmitTriggerOrder } from "./tradingAvailability"
import {
  closeSideForPosition,
  positionPercentageSteps,
  positionQuantityPercentage,
  selectTriggerPosition,
  signedPositionSteps,
  triggerConditionText,
} from "./triggerOrder"
/** Owns editable order intent; keystrokes never update the chart or account page state. */
export function TradingOrderTicket({
  current,
  productLine,
  session,
  accountReady,
  assetScales,
  marketQuote,
  book,
  balances,
  positions,
  openOrders,
  orderSettings,
  onSettingsChange,
  leverageSetting,
  onLeverageChange: handleLeverageChange,
  pendingCommand,
  selectedBookPrice,
  onRefresh,
  onNotice,
}: {
  readonly current: Market | null
  readonly productLine: ProductLine
  readonly session: AuthSession | null
  readonly accountReady: boolean
  readonly assetScales: Readonly<Record<string, string>>
  readonly marketQuote: number | null
  readonly book: ApiOrderBook | null
  readonly balances: readonly ApiBalance[]
  readonly positions: readonly Record<string, unknown>[]
  readonly openOrders: readonly ApiOrder[]
  readonly orderSettings: TradingOrderSettings
  readonly onSettingsChange: (settings: TradingOrderSettings) => void
  readonly leverageSetting: LeverageSettings | null
  readonly onLeverageChange: (settings: LeverageSettings | null) => void
  readonly pendingCommand: PendingOrderCommand | null
  readonly selectedBookPrice: {
    readonly price: string
    readonly instrumentId: string
    readonly productLine: ProductLine
    readonly userId: string
  } | null
  readonly onRefresh: () => void
  readonly onNotice: (message: string, failed?: boolean) => void
}) {
  const optionProduct = productLine === PRODUCT_LINES.option
  const deliveryProduct =
    productLine === PRODUCT_LINES.usdMDelivery || productLine === PRODUCT_LINES.coinMDelivery
  const pendingForUser =
    pendingCommand !== null && pendingCommand.userId === String(session?.user.userId ?? "")
  const [side, setSide] = useState<OrderSide>("BUY")
  const [orderType, setOrderType] = useState<OrderType>("LIMIT")
  const [spotTimeInForce, setSpotTimeInForce] = useState<"GTC" | "IOC" | "FOK" | "GTX">("GTC")
  const [bboEnabled, setBboEnabled] = useState(false)
  const [bboPriceMode, setBboPriceMode] = useState("OPPONENT_1")
  const useBbo = orderType === "LIMIT" && bboEnabled
  const [price, setPrice] = useState("")
  const priceInitialized = useRef(false)
  const [triggerPrice, setTriggerPrice] = useState("")
  const [protectionMode, setProtectionMode] = useState<"SINGLE" | "OCO">("SINGLE")
  const [takeProfitTriggerPrice, setTakeProfitTriggerPrice] = useState("")
  const [takeProfitLimitPrice, setTakeProfitLimitPrice] = useState("")
  const [takeProfitExecutionType, setTakeProfitExecutionType] = useState<"LIMIT" | "MARKET">(
    "MARKET",
  )
  const [triggerType, setTriggerType] = useState<"STOP_LOSS" | "TAKE_PROFIT">("STOP_LOSS")
  const [triggerPriceSource, setTriggerPriceSource] = useState<"MARK" | "LAST" | "INDEX">("MARK")
  const [triggerExecutionType, setTriggerExecutionType] = useState<"LIMIT" | "MARKET">("MARKET")
  const [quantity, setQuantity] = useState("")
  const [percentage, setPercentage] = useState(0)
  const [spotSlippagePpm, setSpotSlippagePpm] = useState<number>()
  const [ticketAction, setTicketAction] = useState<"OPEN" | "CLOSE">("OPEN")
  const [userFees, setUserFees] = useState<Record<string, unknown> | null>(null)
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const balance = useMemo(() => {
    if (!accountReady) return null
    const asset =
      productLine === PRODUCT_LINES.spot
        ? side === "SELL"
          ? current?.baseAsset
          : current?.quoteAsset
        : (current?.settleAsset ?? current?.quoteAsset)
    return asset
      ? (balances.find((row) => row.asset.toUpperCase() === asset.toUpperCase()) ?? null)
      : null
  }, [accountReady, balances, current, side, productLine])
  useEffect(() => {
    let cancelled = false
    setUserFees(null)
    setSpotSlippagePpm(undefined)
    const userId = session?.user.userId
    const instrumentId = current?.instrumentId
    if (!userId || !instrumentId) return
    const refresh = () =>
      void Promise.all([
        loadEffectiveTradingFee(userId, instrumentId, productLine, current?.changeId),
        productLine === PRODUCT_LINES.spot
          ? loadOrderPriceProtection(productLine)
          : Promise.resolve(null),
      ])
        .then(([fee, policy]) => {
          if (!cancelled) {
            setUserFees(fee)
            setSpotSlippagePpm(policy?.marketMaxSlippagePpm)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setUserFees(null)
            setSpotSlippagePpm(undefined)
          }
        })
    refresh()
    const timer = productLine === PRODUCT_LINES.spot ? setInterval(refresh, 10000) : undefined
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [session?.user.userId, current?.instrumentId, current?.changeId, productLine])
  const openingCapacity = (direction: OrderSide) => {
    if (!accountReady) return ""
    if (deliveryProduct && current?.status !== "TRADING") return "0"
    if (!current || !leverageSetting || !userFees) return ""
    const bboActive = orderType === "LIMIT" && useBbo
    const sameSide = bboActive && bboPriceMode.startsWith("SAME_SIDE_")
    const levels = (direction === "BUY") !== sameSide ? book?.asks : book?.bids
    const level = levels?.[bboActive && bboPriceMode.endsWith("_5") ? 4 : 0]
    return (
      contractOpeningCapacity({
        market: current,
        scales: assetScales,
        availableUnits: balance?.availableUnits,
        referencePrice:
          orderType === "LIMIT" && !useBbo ? price : level ? String(levelPrice(level)) : "",
        marginRatePpm: leverageSetting.initialMarginRatePpm,
        feeRatePpm: numberValue(userFees, "takerFeeRatePpm") ?? undefined,
        positions,
        orders: openOrders,
        side: direction,
      }) ?? ""
    )
  }
  const spotCapacity = (percent: number) =>
    current
      ? spotOrderQuantity({
          market: current,
          scales: assetScales,
          availableUnits: balance?.availableUnits,
          referenceTicks: spotReferenceTicks({
            market: current,
            scales: assetScales,
            book,
            price,
            side,
            orderType,
            bboMode: useBbo ? bboPriceMode : null,
            slippagePpm: spotSlippagePpm,
          }),
          feeRatePpm: numberValue(userFees, "takerFeeRatePpm") ?? undefined,
          percentage: percent,
          side,
        })
      : null
  const triggerSupported = productLine !== PRODUCT_LINES.spot
  const activeTriggerPosition = useMemo(
    () =>
      accountReady
        ? selectTriggerPosition(
            positions,
            current?.instrumentId,
            orderSettings.marginMode,
            orderSettings.positionMode,
            orderSettings.positionSide,
          )
        : null,
    [accountReady, current?.instrumentId, orderSettings, positions],
  )
  const closingTicket = productLine !== PRODUCT_LINES.spot && ticketAction === "CLOSE"
  const closingCapacity = (direction: OrderSide) => {
    if (!session || !current || !accountReady) return "—"
    const position = selectTriggerPosition(
      positions,
      current.instrumentId,
      orderSettings.marginMode,
      orderSettings.positionMode,
      orderPositionSide(orderSettings.positionMode, "CLOSE", direction),
    )
    return position && closeSideForPosition(position) === direction
      ? positionPercentageSteps(signedPositionSteps(position), 100).toString()
      : "0"
  }
  const deliveryFeeEstimate = () => {
    if (!current) return "—"
    const direction =
      closingTicket && activeTriggerPosition
        ? (closeSideForPosition(activeTriggerPosition) ?? side)
        : side
    const bboActive = orderType === "LIMIT" && useBbo
    const sameSide = bboActive && bboPriceMode.startsWith("SAME_SIDE_")
    const levels = (direction === "BUY") !== sameSide ? book?.asks : book?.bids
    const level = levels?.[bboActive && bboPriceMode.endsWith("_5") ? 4 : 0]
    const reference =
      orderType === "LIMIT" && !useBbo ? price : level ? String(levelPrice(level)) : ""
    const fee = deliveryFee(
      current,
      assetScales,
      reference,
      quantity,
      numberValue(userFees, "takerFeeRatePpm"),
    )
    return fee === null ? "—" : `${fee} ${current.settleAsset ?? current.quoteAsset}`
  }
  const optionTerms = (direction: OrderSide) => {
    if (!current || !optionProduct) return null
    const bboActive = orderType === "LIMIT" && useBbo
    const sameSide = bboActive && bboPriceMode.startsWith("SAME_SIDE_")
    const levels = (direction === "BUY") !== sameSide ? book?.asks : book?.bids
    const level = levels?.[bboActive && bboPriceMode.endsWith("_5") ? 4 : 0]
    const reference =
      orderType === "LIMIT" && !useBbo ? price : level ? String(levelPrice(level)) : ""
    return optionPremiumTerms(
      current,
      assetScales,
      reference,
      quantity,
      numberValue(userFees, "takerFeeRatePpm"),
    )
  }
  let closePercentage = 0
  if (closingTicket && activeTriggerPosition && current) {
    try {
      const spec = marketQuantitySpec(current, assetScales)
      closePercentage = positionQuantityPercentage(
        signedPositionSteps(activeTriggerPosition),
        BigInt(decimalToStepUnits(quantity || "0", spec.unitSize, spec.scale)),
      )
    } catch {
      // Invalid manual quantities are rejected by the existing submit validation.
    }
  }
  useEffect(() => {
    setQuantity("")
    setPercentage(0)
  }, [
    current?.instrumentId,
    productLine,
    session?.user.userId,
    ticketAction,
    orderSettings.marginMode,
    orderSettings.positionSide,
    orderSettings.positionMode,
    orderType,
    side,
    bboEnabled,
    bboPriceMode,
  ])
  const triggerCloseSide = activeTriggerPosition
    ? closeSideForPosition(activeTriggerPosition)
    : null
  useEffect(() => {
    if (orderType !== "STOP") return
    setTicketAction("CLOSE")
    if (triggerCloseSide) setSide(triggerCloseSide)
  }, [orderType, triggerCloseSide])
  useEffect(() => {
    if (!triggerSupported && orderType === "STOP") setOrderType("LIMIT")
  }, [orderType, triggerSupported])
  const setOrderPercentage = (next: number) => {
    setPercentage(next)
    if (!current || next === 0) {
      setQuantity("")
      return
    }
    if (closingTicket && activeTriggerPosition) {
      const closeSteps = positionPercentageSteps(signedPositionSteps(activeTriggerPosition), next)
      try {
        const quantitySpec = marketQuantitySpec(current, assetScales)
        setQuantity(
          closeSteps > 0n
            ? stepUnitsToDecimal(closeSteps.toString(), quantitySpec.unitSize, quantitySpec.scale)
            : "",
        )
      } catch {
        setQuantity("")
      }
      return
    }
    if (productLine !== PRODUCT_LINES.spot || !balance) {
      setQuantity("")
      return
    }
    const value = spotCapacity(next)
    setQuantity(value && value !== "0" ? value : "")
  }

  useEffect(() => {
    setQuantity("")
    setPercentage(0)
    setBboEnabled(false)
    setSpotTimeInForce("GTC")
    setOrderType("LIMIT")
  }, [current?.instrumentId, productLine])

  useEffect(() => {
    if (!current || priceInitialized.current) return
    const quote = marketQuote
    const quoteScale = Number(assetScales[current.quoteAsset])
    const priceTick = Number(current.priceTickUnits)
    if (!quote || !Number.isFinite(quoteScale) || quoteScale <= 0 || !priceTick) return
    const step = priceTick / quoteScale
    const ticks = Math.round(quote / step)
    if (!Number.isSafeInteger(ticks) || ticks <= 0) return
    priceInitialized.current = true
    setPrice(
      stepUnitsToDecimal(
        String(ticks),
        current.priceTickUnits ?? "",
        assetScales[current.quoteAsset] ?? "",
      ),
    )
  }, [assetScales, current, marketQuote])

  useEffect(() => {
    if (
      !selectedBookPrice ||
      selectedBookPrice.instrumentId !== current?.instrumentId ||
      selectedBookPrice.productLine !== productLine ||
      selectedBookPrice.userId !== String(session?.user.userId ?? "")
    )
      return
    if (orderType === "STOP") {
      setTriggerPrice(selectedBookPrice.price)
      return
    }
    setBboEnabled(false)
    setOrderType("LIMIT")
    priceInitialized.current = true
    setPrice(selectedBookPrice.price)
  }, [selectedBookPrice])
  const active = useRef(true)
  const submitting = useRef(false)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const ownsCurrentSession = () =>
    active.current &&
    String(loadSession()?.user.userId ?? "") === String(session?.user.userId ?? "")
  const submit = async (requestedSide: OrderSide = side) => {
    const side = requestedSide
    if (submitting.current) return
    if (pendingForUser) {
      onNotice(t("Order result is pending. Do not submit it again."))
      return
    }
    let command: PreparedOrderSubmission
    try {
      command = prepareOrderSubmission(
        {
          current,
          productLine: productLine,
          assetScales,
          referencePrice: current ? marketQuote : null,
        },
        {
          userId: session?.user.userId,
          ready: accountReady,
          balance,
          positions,
          settings: orderSettings,
          leverageReady: leverageSetting !== null,
        },
        {
          side,
          orderType,
          ticketAction,
          quantity,
          price,
          useBbo,
          bboPriceMode,
          spotTimeInForce,
          triggerPrice,
          triggerType,
          triggerPriceSource,
          triggerExecutionType,
          protectionMode,
          takeProfitTriggerPrice,
          takeProfitLimitPrice,
          takeProfitExecutionType,
        },
      )
    } catch (reason: unknown) {
      setSubmitState("error")
      onNotice(reason instanceof Error ? reason.message : t("Invalid quantity precision."), true)
      return
    }
    if (!session) return
    submitting.current = true
    setSubmitState("loading")
    try {
      const receipt = await submitPreparedOrder(command)
      if (!ownsCurrentSession()) return
      onNotice(receipt.message, !receipt.accepted)
      if (!receipt.accepted) {
        setSubmitState("error")
        return
      }
      setSubmitState("success")
      setQuantity("")
      setPercentage(0)
      setTriggerPrice("")
      setTakeProfitTriggerPrice("")
      setTakeProfitLimitPrice("")
      onRefresh()
    } catch (reason: unknown) {
      if (!ownsCurrentSession()) return
      if (reason instanceof PendingTradingCommand) {
        const userId = String(session.user.userId)
        if (!readPendingCommand(userId) && reason.commandId) {
          savePendingCommand({ commandId: reason.commandId, productLine: productLine, userId })
        }
        setSubmitState("idle")
        onNotice(reason.message)
        return
      }
      setSubmitState("error")
      onNotice(orderType === "STOP" ? triggerSubmitError(reason) : readError(reason), true)
    } finally {
      submitting.current = false
    }
  }
  const checkPendingCommand = async () => {
    if (!pendingCommand || !pendingForUser || submitting.current) return
    const pending = pendingCommand
    let settledState: "idle" | "error" = "idle"
    submitting.current = true
    setSubmitState("loading")
    try {
      if (pending.cancelPlan) {
        const result = await continueCancellationPlan(pending)
        if (!ownsCurrentSession()) return
        if (result.failed) settledState = "error"
        onNotice(result.message, Boolean(result.failed))
        onRefresh()
        return
      }
      const result = await checkOrderSubmission(pending)
      if (!ownsCurrentSession()) return
      if (result !== "pending") {
        clearPendingCommand(pending)
        onNotice(
          t(
            pending.amendRequestId
              ? result === "confirmed"
                ? "Amendment processing confirmed. Check both order states."
                : "Amendment was rejected. Check the original order state."
              : pending.cancelOrderId
                ? result === "confirmed"
                  ? "Cancellation processing confirmed. Check the latest order state."
                  : "Cancellation was rejected. Check the latest order state."
                : result === "confirmed"
                  ? "Order processing confirmed. Check the latest account state."
                  : "Order was not accepted. Check your order state.",
          ),
        )
        onRefresh()
      } else onNotice(t("Order result is pending. Do not submit it again."))
    } catch (reason) {
      if (!ownsCurrentSession()) return
      settledState = "error"
      onNotice(readError(reason), true)
    } finally {
      submitting.current = false
      if (ownsCurrentSession()) setSubmitState(settledState)
    }
  }
  return (
    <aside className="trade-ticket">
      <div className="ticket-tabs">
        {(productLine === PRODUCT_LINES.spot
          ? (["BUY", "SELL"] as const)
          : (["OPEN", "CLOSE"] as const)
        ).map((action) => (
          <button
            type="button"
            key={action}
            className={
              (action === "BUY" || action === "OPEN" ? "buy" : "sell") +
              (action === side || action === ticketAction ? " active" : "")
            }
            onClick={() => {
              if (action === "BUY" || action === "SELL") setSide(action)
              else {
                if (action === "OPEN" && orderType === "STOP") setOrderType("LIMIT")
                setTicketAction(action)
              }
            }}
          >
            {t(
              action === "BUY"
                ? "Buy"
                : action === "SELL"
                  ? "Sell"
                  : action === "OPEN"
                    ? "Open position"
                    : "Close position",
            )}
          </button>
        ))}
      </div>
      {optionProduct ? (
        <DropdownSelect
          aria-label={t("Margin mode")}
          value={orderSettings.marginMode}
          onChange={(event) =>
            onSettingsChange({
              ...orderSettings,
              marginMode: event.target.value === "ISOLATED" ? "ISOLATED" : "CROSS",
            })
          }
        >
          <option value="CROSS">{t("Cross")}</option>
          <option value="ISOLATED">{t("Isolated")}</option>
        </DropdownSelect>
      ) : (
        productLine !== PRODUCT_LINES.spot &&
        current && (
          <TradingTicketControls
            key={`${productLine}:${current.instrumentId}:${session?.user.userId ?? "guest"}`}
            userId={session?.user.userId}
            instrumentId={current.instrumentId}
            productLine={productLine}
            canChangeLeverage={!(deliveryProduct && current?.status !== "TRADING")}
            onMarginModeChange={
              deliveryProduct
                ? (marginMode) => onSettingsChange({ ...orderSettings, marginMode })
                : undefined
            }
            marginMode={orderSettings.marginMode}
            onChange={handleLeverageChange}
          />
        )
      )}
      <div className="order-type-tabs">
        {(triggerSupported
          ? (["LIMIT", "MARKET", "STOP"] as const)
          : (["LIMIT", "MARKET"] as const)
        ).map((type) => (
          <button
            type="button"
            className={orderType === type ? "active" : ""}
            key={type}
            onClick={() => {
              setOrderType(type)
              if (productLine === PRODUCT_LINES.spot) {
                setSpotTimeInForce(type === "MARKET" ? "IOC" : "GTC")
                setBboEnabled(false)
              }
            }}
          >
            {t(type === "STOP" ? "TP / SL" : type)}
          </button>
        ))}
      </div>
      {productLine === PRODUCT_LINES.spot && (
        <Field label={t("Time in force")}>
          <DropdownSelect
            aria-label={t("Time in force")}
            value={spotTimeInForce}
            onChange={(event) => setSpotTimeInForce(event.target.value as typeof spotTimeInForce)}
          >
            {(orderType === "MARKET" ? ["IOC", "FOK"] : ["GTC", "IOC", "FOK", "GTX"]).map(
              (value) => (
                <option key={value} value={value}>
                  {value === "GTX" ? t("Post only") : value}
                </option>
              ),
            )}
          </DropdownSelect>
          <small className="muted">
            {t(
              spotTimeInForce === "GTC"
                ? "Keep open until filled or canceled"
                : spotTimeInForce === "IOC"
                  ? "Fill available quantity and cancel the remainder"
                  : spotTimeInForce === "FOK"
                    ? "Fill the entire quantity immediately or cancel"
                    : "Only add liquidity; reject an order that would execute immediately",
            )}
          </small>
        </Field>
      )}
      {orderType === "STOP" ? (
        <>
          <fieldset className="protection-mode" aria-label={t("Protection mode")}>
            {(["SINGLE", "OCO"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={protectionMode === mode}
                onClick={() => {
                  setProtectionMode(mode)
                  if (mode === "OCO") setTriggerType("STOP_LOSS")
                }}
              >
                {t(mode === "SINGLE" ? "One-way trigger" : "Two-way (OCO)")}
              </button>
            ))}
          </fieldset>
          <Field
            label={
              <span className="label-with-help">
                {t("Trigger type")}
                <span className="trigger-help">
                  <button
                    type="button"
                    className="trigger-help-button"
                    aria-label={t("Trigger rules")}
                    aria-describedby="trigger-rules"
                  >
                    <CircleHelp size={14} />
                  </button>
                  <span role="tooltip" id="trigger-rules" className="trigger-tooltip">
                    {protectionMode === "OCO"
                      ? t(
                          "Set both take-profit and stop-loss trigger and order prices. When one triggers, its order is submitted and the other leg is canceled.",
                        )
                      : t(
                          "Set a trigger price and an order price. When the trigger condition is met, the system submits your order.",
                        )}
                    <br />
                    {protectionMode === "OCO"
                      ? `${t("Stop loss")}: ${triggerConditionText(side, "STOP_LOSS", triggerPriceSource)} · ${t("Take profit")}: ${triggerConditionText(side, "TAKE_PROFIT", triggerPriceSource)}`
                      : triggerConditionText(side, triggerType, triggerPriceSource)}
                    <br />
                    {t("Reduces the position after triggering; never opens a new position.")}
                  </span>
                </span>
              </span>
            }
          >
            {protectionMode === "OCO" ? (
              <div className="protection-leg-title">{t("Stop loss")}</div>
            ) : (
              <DropdownSelect
                aria-label={t("Trigger type")}
                value={triggerType}
                onChange={(event) =>
                  setTriggerType(event.target.value === "TAKE_PROFIT" ? "TAKE_PROFIT" : "STOP_LOSS")
                }
              >
                <option value="STOP_LOSS">{t("Stop loss")}</option>
                <option value="TAKE_PROFIT">{t("Take profit")}</option>
              </DropdownSelect>
            )}
          </Field>
          <div className="trigger-price-source">
            <span>{t("Trigger source")}</span>
            <DropdownSelect
              aria-label={t("Trigger source")}
              value={triggerPriceSource}
              onChange={(event) =>
                setTriggerPriceSource(event.target.value as "MARK" | "LAST" | "INDEX")
              }
            >
              <option value="MARK">{t("Mark price")}</option>
              <option value="LAST">{t("Last traded price")}</option>
              <option value="INDEX" disabled={productLine === PRODUCT_LINES.spot}>
                {t("Index price")}
              </option>
            </DropdownSelect>
          </div>
          {triggerCloseSide && triggerCloseSide !== side ? (
            <button
              type="button"
              className="trigger-side-action"
              onClick={() => setSide(triggerCloseSide)}
            >
              {t("Switch to")} {triggerCloseSide === "SELL" ? t("Close long") : t("Close short")}
            </button>
          ) : null}
          <Field label={t("Trigger price")}>
            <div className="number-input">
              <input
                value={triggerPrice}
                onChange={(event) => setTriggerPrice(event.target.value)}
                inputMode="decimal"
                placeholder={t("Enter trigger price")}
                aria-label={t("TP/SL trigger price")}
              />
              <span>{current?.quoteAsset ?? "USDT"}</span>
            </div>
          </Field>
          <Field
            label={t("Execution")}
            hint={
              triggerExecutionType === "MARKET"
                ? t("Close at market after triggering")
                : t("Place a limit close order after triggering")
            }
          >
            <DropdownSelect
              aria-label={t("Execution")}
              value={triggerExecutionType}
              onChange={(event) =>
                setTriggerExecutionType(event.target.value === "LIMIT" ? "LIMIT" : "MARKET")
              }
            >
              <option value="MARKET">{t("Market")}</option>
              <option value="LIMIT">{t("Limit")}</option>
            </DropdownSelect>
          </Field>
        </>
      ) : null}
      {orderType !== "MARKET" && (orderType !== "STOP" || triggerExecutionType === "LIMIT") ? (
        <Field label={orderType === "STOP" ? t("Limit price") : t("Price")}>
          <div className="limit-price-control">
            {useBbo ? (
              <DropdownSelect
                value={bboPriceMode}
                aria-label={t("BBO price mode")}
                onChange={(event) => setBboPriceMode(event.target.value)}
              >
                <option value="OPPONENT_1">{t("Opponent 1")}</option>
                <option value="OPPONENT_5">{t("Opponent 5")}</option>
                <option value="SAME_SIDE_1">{t("Same side 1")}</option>
                <option value="SAME_SIDE_5">{t("Same side 5")}</option>
              </DropdownSelect>
            ) : (
              <div className="number-input">
                <input
                  value={price}
                  onChange={(event) => {
                    priceInitialized.current = true
                    setPrice(event.target.value)
                    setPercentage(0)
                  }}
                  aria-label={t("Limit price")}
                  inputMode="decimal"
                />
                <span>{current?.quoteAsset ?? "USDT"}</span>
              </div>
            )}
            {orderType === "LIMIT" ? (
              <div className="bbo-toggle-wrap">
                <button
                  type="button"
                  className="bbo-toggle"
                  aria-pressed={bboEnabled}
                  aria-describedby="bbo-explanation"
                  onClick={() => setBboEnabled(!bboEnabled)}
                >
                  {t("BBO")}
                </button>
                <div id="bbo-explanation" role="tooltip" className="bbo-tooltip">
                  {t(
                    "BBO quickly sets a limit order price from the order book. Same side uses your trading direction; opponent uses the opposite side. 1 selects the best price level and 5 selects the fifth best. The server selects the price when you submit; the order does not track later book changes.",
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </Field>
      ) : null}
      {orderType === "STOP" && protectionMode === "OCO" ? (
        <div className="protection-second-leg">
          <strong className="protection-leg-title">{t("Take profit")}</strong>
          <Field label={t("Trigger price")}>
            <div className="number-input">
              <input
                value={takeProfitTriggerPrice}
                onChange={(event) => setTakeProfitTriggerPrice(event.target.value)}
                inputMode="decimal"
                aria-label={t("Take-profit trigger price")}
              />
              <span>{current?.quoteAsset ?? "USDT"}</span>
            </div>
          </Field>
          <Field label={t("Execution")}>
            <DropdownSelect
              value={takeProfitExecutionType}
              aria-label={t("Take-profit execution")}
              onChange={(event) =>
                setTakeProfitExecutionType(event.target.value === "LIMIT" ? "LIMIT" : "MARKET")
              }
            >
              <option value="MARKET">{t("Market")}</option>
              <option value="LIMIT">{t("Limit")}</option>
            </DropdownSelect>
          </Field>
          {takeProfitExecutionType === "LIMIT" ? (
            <Field label={t("Limit price")}>
              <div className="number-input">
                <input
                  value={takeProfitLimitPrice}
                  onChange={(event) => setTakeProfitLimitPrice(event.target.value)}
                  inputMode="decimal"
                  aria-label={t("Take-profit limit price")}
                />
                <span>{current?.quoteAsset ?? "USDT"}</span>
              </div>
            </Field>
          ) : null}
        </div>
      ) : null}
      {closingTicket && orderSettings.positionMode === "HEDGE" ? (
        <Field label={t("Close position")}>
          <DropdownSelect
            aria-label={t("Close position")}
            value={orderSettings.positionSide}
            onChange={(event) =>
              onSettingsChange({
                ...orderSettings,
                positionSide: event.target.value === "SHORT" ? "SHORT" : "LONG",
              })
            }
          >
            <option value="LONG">{t("Long")}</option>
            <option value="SHORT">{t("Short")}</option>
          </DropdownSelect>
        </Field>
      ) : null}
      <Field
        label={closingTicket ? t("Close quantity") : t("Quantity")}
        {...(orderType === "STOP" ? { hint: t("Cannot exceed the current position size") } : {})}
      >
        <div className="number-input">
          <input
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value)
              setPercentage(0)
            }}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={orderType === "STOP" ? t("TP/SL close quantity") : t("Order quantity")}
          />
          <span>
            {productLine === PRODUCT_LINES.spot
              ? (current?.baseAsset ?? t("Asset"))
              : t("Contracts")}
          </span>
        </div>
      </Field>
      {productLine === PRODUCT_LINES.spot || closingTicket ? (
        <div className="slider-row">
          <span>0%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={closingTicket ? closePercentage : percentage}
            disabled={
              closingTicket
                ? !session || !activeTriggerPosition
                : !session || spotCapacity(100) === null
            }
            aria-valuetext={`${closingTicket ? closePercentage : percentage}%`}
            onChange={(event) => setOrderPercentage(Number(event.target.value))}
            aria-label={t("Order percentage")}
          />
          <span>{closingTicket ? `${closePercentage}%` : "100%"}</span>
        </div>
      ) : null}
      <div className={`ticket-summary${optionProduct ? " ticket-summary--option" : ""}`}>
        <span>{t("Available")}</span>
        <span className="mono">
          {session
            ? `${deliveryProduct || optionProduct ? (balanceAmount(balance, assetScales) ?? "—") : displayPrice(balanceAmount(balance, assetScales) ?? "", isDollarQuote(balance?.asset ?? current?.quoteAsset))} ${balance?.asset ?? current?.quoteAsset ?? ""}`
            : t("Login required")}
        </span>
        {optionProduct && current && orderType !== "STOP" ? (
          <>
            <span>{t("Buy premium and fee")}</span>
            <span className="mono">
              {optionTerms("BUY")?.buyDebit ?? "—"} {current.settleAsset}
            </span>
            <span>{t("Sell premium after fee")}</span>
            <span className="mono">
              {optionTerms("SELL")?.sellCredit ?? "—"} {current.settleAsset}
            </span>
            <span>{t("Seller margin")}</span>
            <span>{t("Assessed from current option risk when submitted")}</span>
          </>
        ) : null}
        <span>
          {t(productLine === PRODUCT_LINES.spot && side === "BUY" ? "Fee reserve" : "Est. fee")}
        </span>
        <span className="mono">
          {productLine === PRODUCT_LINES.spot && current
            ? `${spotFeeReserve(current, assetScales, spotReferenceTicks({ market: current, scales: assetScales, book, price, side, orderType, bboMode: useBbo ? bboPriceMode : null, slippagePpm: spotSlippagePpm }), quantity, numberValue(userFees, "takerFeeRatePpm") ?? undefined) ?? "—"} ${current.quoteAsset}`
            : (deliveryProduct || optionProduct) && orderType === "STOP"
              ? t("At execution")
              : optionProduct
                ? `${optionTerms(side)?.fee ?? "—"} ${current?.settleAsset ?? ""}`
                : deliveryProduct
                  ? deliveryFeeEstimate()
                  : estimatedFee(
                      current,
                      price,
                      quantity,
                      numberValue(userFees, "takerFeeRatePpm"),
                    )}
        </span>
        {(deliveryProduct || optionProduct) && (closingTicket || orderType === "STOP") ? (
          <>
            <span>{t("Available to close short")}</span>
            <span className="mono">
              {closingCapacity("BUY")} {t("Contracts")}
            </span>
            <span>{t("Available to close long")}</span>
            <span className="mono">
              {closingCapacity("SELL")} {t("Contracts")}
            </span>
          </>
        ) : (
          productLine !== PRODUCT_LINES.spot &&
          !optionProduct &&
          orderType !== "STOP" && (
            <>
              <span
                title={t(
                  "Estimate based on available margin, leverage, fees and position limits; final admission is checked by the matching service.",
                )}
              >
                {t("Est. max long")}
              </span>
              <span className="mono">
                {formatTradeQuantity(openingCapacity("BUY"))} {t("Contracts")}
              </span>
              <span>{t("Est. max short")}</span>
              <span className="mono">
                {formatTradeQuantity(openingCapacity("SELL"))} {t("Contracts")}
              </span>
            </>
          )
        )}
        <span>{t("Maker / Taker fee")}</span>
        <span className="mono">
          {userFees
            ? `${Number(((numberValue(userFees, "makerFeeRatePpm") ?? 0) / 10000).toFixed(4))}% / ${Number(((numberValue(userFees, "takerFeeRatePpm") ?? 0) / 10000).toFixed(4))}%`
            : "—"}
        </span>
      </div>
      {session && !accountReady && <p role="status">{t("Account syncing")}</p>}
      {current && current.status !== "TRADING" && (
        <p role="status">
          {t(
            deliveryProduct && current?.status === "SETTLING"
              ? "This contract is settling. Open orders are disabled; close or cancel existing orders."
              : current.status === "CLOSED"
                ? "This contract has ended. View historical records."
                : current.status === "PRE_TRADING"
                  ? "This contract is listed. Trading will open soon."
                  : "Trading is paused for this contract.",
          )}
        </p>
      )}
      {pendingForUser && (
        <div role="status">
          <p>
            {t(
              pendingCommand?.cancelPlan
                ? "Cancellation results are pending. Check and continue the original request."
                : "Order result is pending. Do not submit it again.",
            )}
          </p>
          <Button loading={submitState === "loading"} onClick={() => void checkPendingCommand()}>
            {t(
              pendingCommand?.cancelPlan
                ? "Check and continue cancellations"
                : pendingCommand?.amendRequestId
                  ? "Check amendment result"
                  : pendingCommand?.cancelOrderId || pendingCommand?.cancelTriggerOrderId
                    ? "Check cancellation result"
                    : "Check order result",
            )}
          </Button>
        </div>
      )}
      {!session ? (
        <a className="ticket-sign-in" href="/auth/login">
          {t("Log in to trade")}
        </a>
      ) : productLine !== PRODUCT_LINES.spot && orderType !== "STOP" ? (
        <div className="ticket-order-actions">
          <Button
            tone="positive"
            loading={submitState === "loading"}
            disabled={
              !accountReady ||
              pendingForUser ||
              !canSubmitTradingOrder(current, closingTicket) ||
              (closingTicket && triggerCloseSide !== "BUY")
            }
            onClick={() => void submit("BUY")}
          >
            {session
              ? t(
                  optionProduct
                    ? ticketAction === "OPEN"
                      ? "Buy option"
                      : "Buy to close"
                    : ticketAction === "OPEN"
                      ? "Open long"
                      : "Close short",
                )
              : t("Log in to trade")}
          </Button>
          <Button
            tone="negative"
            loading={submitState === "loading"}
            disabled={
              !accountReady ||
              pendingForUser ||
              !canSubmitTradingOrder(current, closingTicket) ||
              (closingTicket && triggerCloseSide !== "SELL")
            }
            onClick={() => void submit("SELL")}
          >
            {session
              ? t(
                  optionProduct
                    ? ticketAction === "OPEN"
                      ? "Sell option"
                      : "Sell to close"
                    : ticketAction === "OPEN"
                      ? "Open short"
                      : "Close long",
                )
              : t("Log in to trade")}
          </Button>
        </div>
      ) : (
        <Button
          tone={side === "BUY" ? "positive" : "negative"}
          loading={submitState === "loading"}
          disabled={
            !accountReady ||
            pendingForUser ||
            !(orderType === "STOP"
              ? canSubmitTriggerOrder(current)
              : canSubmitTradingOrder(current, false))
          }
          onClick={() => void submit(orderType === "STOP" ? (triggerCloseSide ?? side) : side)}
        >
          {session && orderType === "STOP"
            ? `${protectionMode === "OCO" ? t("Set TP/SL pair") : triggerType === "STOP_LOSS" ? t("Set stop loss") : t("Set take profit")}（${side === "SELL" ? t("Sell to close") : t("Buy to close")}）`
            : session
              ? `${side === "BUY" ? t("Buy") : t("Sell")} ${productLine === PRODUCT_LINES.spot ? (current?.baseAsset ?? t("Asset")) : t("Contracts")}`
              : t("Log in to trade")}
        </Button>
      )}
      <a className="route-link ticket-login" href={session ? "/orders" : "/auth/register"}>
        {session ? t("Manage orders") : t("Create an account")}
      </a>
    </aside>
  )
}
function balanceAmount(
  balance: ApiBalance | null,
  assetScales: Readonly<Record<string, string>>,
): string | null {
  if (!balance) return null
  const direct = numericValue(balance.free)
  if (direct !== null) return String(balance.free)
  const scale = assetScales[balance.asset]
  if (balance.availableUnits === undefined || scale === undefined) return null
  return unitsToDecimal(balance.availableUnits, scale)
}

function estimatedFee(
  market: Market | null,
  price: string,
  quantity: string,
  rate: number | null,
): string {
  const priceValue = Number(price)
  const quantityValue = Number(quantity)
  if (
    rate === null ||
    !Number.isFinite(priceValue) ||
    !Number.isFinite(quantityValue) ||
    priceValue <= 0 ||
    quantityValue <= 0
  ) {
    return "—"
  }
  const contractSize =
    market?.productLine === PRODUCT_LINES.spot
      ? 1
      : market?.productLine === PRODUCT_LINES.usdMPerpetual ||
          market?.productLine === PRODUCT_LINES.usdMDelivery
        ? (market.contractMultiplierPpm ?? 0) / 1_000_000
        : 0
  if (contractSize <= 0) return "—"
  const fee = ((priceValue * quantityValue * contractSize * rate) / 1_000_000).toFixed(8)
  return `${displayPrice(fee, isDollarQuote(market?.quoteAsset))} ${market?.quoteAsset ?? ""}`
}

function numericValue(value: string | number | undefined): number | null {
  if (value === undefined) return null
  const result = typeof value === "number" ? value : Number(value)
  return Number.isFinite(result) ? result : null
}

function numberValue(row: Record<string, unknown> | null, key: string): number | null {
  const value = row?.[key]
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : t("Trading service is unavailable. Please retry later.")
}
function triggerSubmitError(reason: unknown): string {
  const message = readError(reason)
  const explanations: Record<string, string> = {
    TRIGGER_POSITION_REQUIRED: "Open a position in this pair before setting TP/SL.",
    TRIGGER_SIDE_NOT_REDUCING: "Select the side that closes your current position.",
    TRIGGER_CLOSE_CAPACITY_EXCEEDED:
      "TP/SL quantity exceeds the position available to close, including existing close orders.",
    POSITION_MARGIN_ADJUSTMENT_INVALID: "TP/SL margin mode must match the current position.",
    POSITION_MODE_MISMATCH: "TP/SL position side must match your account position mode.",
    INVALID_COMMAND:
      "TP/SL request is invalid. Check trigger price, execution price, quantity and position settings.",
  }
  const code = Object.keys(explanations).find((key) => message.includes(key))
  return code ? t(explanations[code] ?? message) : message
}

function levelPrice(level: ApiOrderBookLevel): number {
  return Number(Array.isArray(level) ? level[0] : level.priceTicks)
}
