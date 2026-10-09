import { t } from "../i18n"
import translations from "../i18n/zh.json"

// Public messages are deliberately bounded: arbitrary server/driver exception text is diagnostic data.
const messages: Record<string, string> = {}
function register(codes: string, message: string) {
  for (const code of codes.split(" ")) messages[code] = message
}
register(
  "LEVERAGE_UPDATE_BLOCKED",
  "Close positions and cancel open orders before changing leverage.",
)
register(
  "LEVERAGE_EXCEEDS_INSTRUMENT_LIMIT LEVERAGE_EXCEEDS_RISK_BRACKET",
  "The selected leverage exceeds the contract or position limit.",
)
register(
  "OPTION_LEVERAGE_UNSUPPORTED",
  "Leverage adjustment is unavailable for this option contract.",
)
register("LEVERAGE_REPRICE_REQUIRES_CROSS", "Margin repricing requires cross margin.")
register(
  "LEVERAGE_REPRICE_INCREASE_BLOCKED",
  "Only lowering leverage is supported while repricing margin.",
)
register(
  "INSUFFICIENT_BALANCE INSUFFICIENT_AVAILABLE_BALANCE INSUFFICIENT_LOCKED_BALANCE POSITION_MARGIN_INSUFFICIENT",
  "Insufficient available balance.",
)
register(
  "POSITION_MODE_SWITCH_BLOCKED",
  "Close positions and cancel open orders before changing position mode.",
)
register(
  "POSITION_NOT_FOUND REDUCE_ONLY_REQUIRES_POSITION_STATE TRIGGER_POSITION_REQUIRED",
  "The position is no longer open. Refresh and try again.",
)
register(
  "ORDER_NOT_FOUND ENTITY_NOT_FOUND TRIGGER_ORDER_NOT_FOUND CANCEL_ALL_AFTER_NOT_FOUND",
  "The requested order or record is no longer available.",
)
register(
  "MARK_PRICE_NOT_FOUND MARK_PRICE_MISSING MARK_PRICE_UNAVAILABLE STALE_MARK_PRICE OPTION_RISK_PRICE_MISSING",
  "A current reference price is unavailable. Please try again shortly.",
)
register("LIFECYCLE_IN_PROGRESS", "Settlement is in progress. Please try again shortly.")
register(
  "RISK_BRACKET_EXCEEDED POSITION_NOTIONAL_LIMIT_EXCEEDED OPEN_INTEREST_LIMIT_EXCEEDED",
  "This order exceeds the position or market risk limit. Reduce the quantity and try again.",
)
register(
  "REDUCE_ONLY_CAPACITY_EXCEEDED TRIGGER_CLOSE_CAPACITY_EXCEEDED TRIGGER_SIDE_NOT_REDUCING",
  "The closing quantity or direction conflicts with the current position or existing close orders.",
)
register(
  "SELF_TRADE_PREVENTED",
  "This order would trade with your own order. Cancel the conflicting order first.",
)
register(
  "INSTRUMENT_NOT_TRADING INSTRUMENT_SETTLED MARKET_ORDER_DISABLED ORDER_TYPE_DISABLED TIME_IN_FORCE_DISABLED POST_ONLY_DISABLED REDUCE_ONLY_DISABLED",
  "The selected order type or contract is currently unavailable for trading.",
)
register(
  "DUPLICATE_ORDER_ID DUPLICATE_CLIENT_ORDER_ID DUPLICATE_CLIENT_TRIGGER_ORDER_ID DUPLICATE_CLIENT_ALGO_ORDER_ID IDEMPOTENCY_CONFLICT",
  "This request conflicts with an earlier request. Check its result before submitting again.",
)
register(
  "MATCHING_BACKPRESSURE EXPORT_BACKLOG_FULL MATCHING_PENDING PENDING_TRANSFER_CAPACITY_FULL",
  "The service is busy. Please check your orders before trying again.",
)
register(
  "RESULT_UNKNOWN_OUTSIDE_RETENTION RESULT_UNKNOWN",
  "The result is not yet confirmed. Check your orders or settings before submitting again.",
)
register(
  "INVALID_COMMAND INVALID_MESSAGE MATCHING_REJECTED",
  "The request could not be completed. Refresh your account and check the requested settings.",
)
register(
  "PRODUCT_LINE_MISMATCH INSTRUMENT_ORDER_MISMATCH POSITION_MODE_MISMATCH",
  "The contract or account mode has changed. Refresh the page and try again.",
)
register("INVALID_ORDER_PRICE", "Please enter a valid price within the contract limits.")
register("REQUEST_NOT_ACCEPTED", "The request was not accepted. Please try again shortly.")

const validationMessages: Record<string, string> = {
  "leveragePpm exceeds instrument max leverage":
    messages["LEVERAGE_EXCEEDS_INSTRUMENT_LIMIT"] ?? "",
  "leveragePpm must be at least 1x": "Please enter leverage within the allowed range.",
}

export function apiErrorMessage(payload: unknown, status: number, mutating = false): string {
  const row = record(payload) ? payload : {}
  const fields = [
    row["code"],
    row["errorCode"],
    row["resultCode"],
    row["detail"],
    row["message"],
    row["error"],
    row["errorMessage"],
  ]
  for (const value of fields) {
    if (typeof value !== "string") continue
    for (const token of value.match(/\b[A-Z][A-Z_]{2,}\b/g) ?? []) {
      if (messages[token]) return t(messages[token])
    }
    if (validationMessages[value]) return t(validationMessages[value])
  }
  // Only explicitly translated product messages are allowed through, never an arbitrary stack/SQL/HTTP body.
  for (const value of fields) {
    if (
      typeof value === "string" &&
      Object.hasOwn(translations, value) &&
      !/Aeron|API |HTTP|SQL|Kafka|Redis|Exception/i.test(value)
    )
      return t(value)
  }
  if (status === 401) return t("Your session has expired. Please sign in again.")
  if (status === 403) return t("You do not have permission to perform this action.")
  if (status === 429) return t("Too many requests. Please wait a moment and try again.")
  if (status === 408 || status === 504)
    return t(
      "The result is not yet confirmed. Check your orders or settings before submitting again.",
    )
  if (status >= 500)
    return mutating
      ? t("The result is not yet confirmed. Check your orders or settings before submitting again.")
      : t("The service is temporarily unavailable. Please try again shortly.")
  if (status === 404) return t("The requested order or record is no longer available.")
  return t(
    "The request could not be completed. Refresh your account and check the requested settings.",
  )
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
