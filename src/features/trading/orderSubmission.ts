import { placeBatchTriggerOrders, placeOrder, placeTriggerOrder } from "../../api/endpoints"
import { apiErrorMessage } from "../../api/errors"
import type { ApiBalance } from "../../api/types"
import { t } from "../../i18n"
import {
  decimalProductExceedsUnits,
  decimalToStepUnits,
  decimalToUnits,
  isPositiveDecimal,
} from "../../lib/units"
import {
  type Market,
  type OrderSide,
  type OrderType,
  PRODUCT_LINES,
  type ProductLine,
} from "../../types/domain"
import { marketQuantitySpec } from "./marketQuantity"
import { orderPositionSide } from "./orderCapacity"
import type { TradingOrderSettings } from "./TradingAccountControls"
import { canSubmitTradingOrder, canSubmitTriggerOrder } from "./tradingAvailability"
import { closeSideForPosition, selectTriggerPosition, signedPositionSteps } from "./triggerOrder"

/** User input only; no React setters, transport state, or page context. */
export interface OrderTicket {
  readonly side: OrderSide
  readonly orderType: OrderType
  readonly ticketAction: "OPEN" | "CLOSE"
  readonly quantity: string
  readonly price: string
  readonly useBbo: boolean
  readonly bboPriceMode: string
  readonly spotTimeInForce: "GTC" | "IOC" | "FOK" | "GTX"
  readonly triggerPrice: string
  readonly triggerType: "STOP_LOSS" | "TAKE_PROFIT"
  readonly triggerPriceSource: "MARK" | "LAST" | "INDEX"
  readonly triggerExecutionType: "LIMIT" | "MARKET"
  readonly protectionMode: "SINGLE" | "OCO"
  readonly takeProfitTriggerPrice: string
  readonly takeProfitLimitPrice: string
  readonly takeProfitExecutionType: "LIMIT" | "MARKET"
}

export interface OrderAccount {
  readonly userId: string | number | undefined
  readonly ready: boolean
  readonly balance: ApiBalance | null
  readonly positions: readonly Record<string, unknown>[]
  readonly settings: TradingOrderSettings
  readonly leverageReady: boolean
}

export interface PreparedOrderSubmission {
  readonly kind: "order" | "trigger" | "oco"
  readonly productLine: ProductLine
  readonly body: Readonly<Record<string, unknown>>
}

/** Validate financial units and position ownership before any request is sent. */
export function prepareOrderSubmission(
  market: {
    readonly current: Market | null
    readonly productLine: ProductLine
    readonly assetScales: Readonly<Record<string, string>>
    readonly referencePrice: number | null
  },
  account: OrderAccount,
  ticket: OrderTicket,
  requestId: string = crypto.randomUUID(),
): PreparedOrderSubmission {
  if (!account.ready) throw new Error(t("Account syncing"))
  const { current, productLine, assetScales, referencePrice: latestPrice } = market
  const { balance, positions, settings: orderSettings, leverageReady } = account
  const {
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
  } = ticket
  if (current && current.productLine !== productLine)
    throw new Error(t("Trading is not enabled for this contract."))
  const deliveryProduct =
    productLine === PRODUCT_LINES.usdMDelivery || productLine === PRODUCT_LINES.coinMDelivery
  const optionProduct = productLine === PRODUCT_LINES.option
  const closingTicket = productLine !== PRODUCT_LINES.spot && ticketAction === "CLOSE"
  const triggerSupported = productLine !== PRODUCT_LINES.spot
  const activeTriggerPosition = selectTriggerPosition(
    positions,
    current?.instrumentId,
    orderSettings.marginMode,
    orderSettings.positionMode,
    orderSettings.positionSide,
  )
  const triggerCloseSide = activeTriggerPosition
    ? closeSideForPosition(activeTriggerPosition)
    : null
  if (
    !(orderType === "STOP"
      ? canSubmitTriggerOrder(current)
      : canSubmitTradingOrder(current, closingTicket))
  ) {
    throw new Error(
      t(
        deliveryProduct && current?.status === "SETTLING"
          ? "This contract is settling. Only direct reduce-only orders are allowed."
          : "Trading is not enabled for this contract.",
      ),
    )
  }
  if (account.userId === undefined) {
    throw new Error(t("Please sign in before placing an order."))
  }
  if (!current || !isPositiveDecimal(quantity)) {
    throw new Error(t("Please enter a valid quantity."))
  }
  if (orderType === "STOP" && !triggerSupported) {
    throw new Error(t("Spot positions do not support TP/SL. Use a limit or market order."))
  }
  if (orderType === "STOP" && !triggerCloseSide) {
    throw new Error(t("Open a position in this pair before setting TP/SL."))
  }
  if (orderType === "STOP" && triggerCloseSide !== side) {
    throw new Error(
      triggerCloseSide === "SELL"
        ? t("Select Sell to close your long position before setting TP/SL.")
        : t("Select Buy to close your short position before setting TP/SL."),
    )
  }
  const executionType = orderType === "STOP" ? triggerExecutionType : orderType
  if (executionType !== "MARKET" && !useBbo && !isPositiveDecimal(price)) {
    throw new Error(t("Limit orders require a valid price."))
  }
  if (orderType === "STOP" && !isPositiveDecimal(triggerPrice)) {
    throw new Error(t("Trigger orders require a valid trigger price."))
  }
  if (
    productLine !== PRODUCT_LINES.spot &&
    orderType !== "STOP" &&
    !optionProduct &&
    !(deliveryProduct && closingTicket) &&
    !leverageReady
  ) {
    throw new Error(t("Wait for account leverage settings before submitting."))
  }
  let quantitySteps: string
  let priceTicks: string | 0
  {
    const baseScale = assetScales[current.baseAsset]
    const quoteScale = assetScales[current.quoteAsset]
    if (
      (productLine === PRODUCT_LINES.spot && !baseScale) ||
      ((orderType === "STOP" || executionType !== "MARKET" || side === "BUY") && !quoteScale)
    ) {
      throw new Error(t("Asset precision is not loaded. Order not submitted."))
    }
    if (!current.quantityStepUnits) {
      throw new Error(t("Quantity step is not loaded. Order not submitted."))
    }
    if (executionType !== "MARKET" && !current.priceTickUnits) {
      throw new Error(t("Price tick is not loaded. Order not submitted."))
    }
    if (orderType === "STOP" && !current.priceTickUnits) {
      throw new Error(t("Trigger price tick is not loaded. Order not submitted."))
    }
    const quantitySpec = marketQuantitySpec(current, assetScales)
    quantitySteps = decimalToStepUnits(quantity, quantitySpec.unitSize, quantitySpec.scale)
    if (productLine !== PRODUCT_LINES.spot && orderType !== "STOP" && ticketAction === "CLOSE") {
      const position = selectTriggerPosition(
        positions,
        current.instrumentId,
        orderSettings.marginMode,
        orderSettings.positionMode,
        orderPositionSide(orderSettings.positionMode, "CLOSE", side),
      )
      if (
        !position ||
        closeSideForPosition(position) !== side ||
        BigInt(quantitySteps) >
          (signedPositionSteps(position) < 0n
            ? -signedPositionSteps(position)
            : signedPositionSteps(position))
      )
        throw new Error(t("Close quantity exceeds the selected position."))
    }

    if (orderType === "STOP" && activeTriggerPosition) {
      const positionCapacity = signedPositionSteps(activeTriggerPosition)
      const absoluteCapacity = positionCapacity < 0n ? -positionCapacity : positionCapacity
      if (BigInt(quantitySteps) > absoluteCapacity) {
        throw new Error(t("TP/SL quantity cannot exceed the current position."))
      }
    }
    priceTicks =
      executionType === "MARKET" || useBbo
        ? 0
        : decimalToStepUnits(price, current.priceTickUnits ?? "", quoteScale ?? "")

    if (orderType !== "STOP" && productLine === PRODUCT_LINES.spot && !(useBbo && side === "BUY")) {
      const balanceScale = balance ? assetScales[balance.asset] : undefined
      if (!balance || !balanceScale) {
        throw new Error(
          t("Available balance or asset precision is not loaded. Order not submitted."),
        )
      }
      const availableUnits =
        balance.availableUnits ??
        (balance.free === undefined
          ? undefined
          : decimalToUnits(String(balance.free), balanceScale))
      const referencePrice = executionType === "MARKET" ? latestPrice : price
      if (side === "BUY" && referencePrice === null) {
        throw new Error(
          t("Market reference price is unavailable. Cannot validate available balance."),
        )
      }
      if (availableUnits === undefined) {
        throw new Error(t("Balance units are unavailable. Order not submitted."))
      }
      const exceedsBalance =
        side === "SELL"
          ? decimalProductExceedsUnits(quantity, "1", availableUnits, balanceScale)
          : decimalProductExceedsUnits(
              quantity,
              String(referencePrice),
              availableUnits,
              balanceScale,
            )
      if (exceedsBalance) {
        throw new Error(t("Insufficient available balance. Order not submitted."))
      }
    }
  }
  if (orderType === "STOP") {
    const leg = {
      userId: account.userId,
      clientTriggerOrderId: `web-trigger-${requestId}`,
      instrumentId: current.instrumentId,
      side,
      triggerType,
      priceSource: triggerPriceSource,
      triggerPriceTicks: decimalToStepUnits(
        triggerPrice,
        current.priceTickUnits ?? "",
        assetScales[current.quoteAsset] ?? "",
      ),
      orderType: triggerExecutionType,
      timeInForce: triggerExecutionType === "MARKET" ? "IOC" : "GTC",
      priceTicks,
      quantitySteps,
      marginMode: orderSettings.marginMode,
      positionSide: orderSettings.positionSide,
    }
    if (protectionMode === "OCO") {
      const takeProfitTicks = decimalToStepUnits(
        takeProfitTriggerPrice,
        current.priceTickUnits ?? "",
        assetScales[current.quoteAsset] ?? "",
      )
      if (
        BigInt(takeProfitTicks) <= 0n ||
        (side === "SELL"
          ? BigInt(takeProfitTicks) <= BigInt(leg.triggerPriceTicks)
          : BigInt(takeProfitTicks) >= BigInt(leg.triggerPriceTicks))
      ) {
        throw new Error(
          t("Take-profit and stop-loss prices are in the wrong order for this position."),
        )
      }
      const ocoGroupId = `web-oco-${requestId}`
      return {
        kind: "oco",
        productLine: productLine,
        body: {
          atomic: true,
          orders: [
            {
              ...leg,
              ocoGroupId,
              triggerType: "TAKE_PROFIT",
              clientTriggerOrderId: `web-tp-${requestId}`,
              triggerPriceTicks: takeProfitTicks,
              orderType: takeProfitExecutionType,
              timeInForce: takeProfitExecutionType === "MARKET" ? "IOC" : "GTC",
              priceTicks:
                takeProfitExecutionType === "MARKET"
                  ? 0
                  : decimalToStepUnits(
                      takeProfitLimitPrice,
                      current.priceTickUnits ?? "",
                      assetScales[current.quoteAsset] ?? "",
                    ),
            },
            { ...leg, ocoGroupId, triggerType: "STOP_LOSS" },
          ],
        },
      }
    }
    return { kind: "trigger", productLine: productLine, body: leg }
  } else {
    return {
      kind: "order",
      productLine: productLine,
      body: {
        userId: account.userId,
        clientOrderId: `web-${requestId}`,
        instrumentId: current.instrumentId,
        side,
        orderType,
        ...(useBbo ? { bboPriceMode } : {}),
        timeInForce:
          productLine === PRODUCT_LINES.spot
            ? spotTimeInForce
            : orderType === "MARKET"
              ? "IOC"
              : "GTC",
        priceTicks,
        quantitySteps,
        marginMode: orderSettings.marginMode,
        positionSide:
          productLine === PRODUCT_LINES.spot
            ? "NET"
            : orderPositionSide(orderSettings.positionMode, ticketAction, side),
        reduceOnly: productLine !== PRODUCT_LINES.spot && ticketAction === "CLOSE",
        postOnly: productLine === PRODUCT_LINES.spot && spotTimeInForce === "GTX",
      },
    }
  }
}

/** Keep receipt semantics beside the request, independently of page rendering. */
export async function submitPreparedOrder(
  command: PreparedOrderSubmission,
): Promise<{ readonly accepted: boolean; readonly message: string }> {
  if (command.kind === "oco") {
    const response = await placeBatchTriggerOrders(command.body, command.productLine)
    if (response["completed"] !== 2 || response["failed"] !== 0)
      throw new Error(t("OCO pair was not accepted."))
    return { accepted: true, message: t("Take-profit and stop-loss accepted together.") }
  }
  if (command.kind === "trigger") {
    const response = await placeTriggerOrder(command.body, command.productLine)
    if (response.status !== "PENDING" && response.status !== "TRIGGERING")
      return { accepted: false, message: apiErrorMessage({ code: response.rejectReason }, 409) }
    return { accepted: true, message: `${t("Trigger order accepted")}: ${response.status}` }
  }
  const response = await placeOrder(command.body, command.productLine)
  if (response.status === "REJECTED")
    return { accepted: false, message: apiErrorMessage({ code: response.rejectReason }, 409) }
  if (!["PENDING_RESERVE", "ACCEPTED", "PARTIALLY_FILLED", "FILLED"].includes(response.status))
    return { accepted: false, message: `${t("Order not accepted")}: ${response.status}` }
  return { accepted: true, message: `${t("Order accepted")}: ${response.status}` }
}
