import { t } from "../i18n"
import { ApiError } from "./client"
import { GenericObjectSchema } from "./types"

export class PendingTradingCommand extends ApiError {
  constructor(
    readonly commandId?: string,
    message = t("Order result is pending. Do not submit it again."),
  ) {
    super(message, 202)
  }
}

export function isDefinitiveOrderRejection(reason: unknown): boolean {
  if (!(reason instanceof ApiError)) return false
  const receipt = GenericObjectSchema.safeParse(reason.payload)
  if (
    receipt.success &&
    typeof receipt.data["commandId"] === "string" &&
    typeof receipt.data["code"] === "string" &&
    (receipt.data["outcome"] === "NOT_ACCEPTED" ||
      (receipt.data["outcome"] === "TERMINAL" && receipt.data["code"] !== "NONE"))
  )
    return true
  return (
    reason.status >= 400 && reason.status < 500 && ![408, 409, 425, 429].includes(reason.status)
  )
}
