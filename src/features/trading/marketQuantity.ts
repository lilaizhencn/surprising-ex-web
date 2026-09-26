import { t } from "../../i18n"
import { type Market, PRODUCT_LINES } from "../../types/domain"

/** Convert displayed base quantity to the same contract steps used by matching and risk. */
export function marketQuantitySpec(
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): { unitSize: string; scale: string } {
  if (market.productLine === PRODUCT_LINES.usdMPerpetual) {
    const multiplier = market.contractMultiplierPpm
    if (!multiplier || !Number.isSafeInteger(multiplier) || multiplier <= 0) {
      throw new Error(t("Contract size is unavailable. Cannot convert quantity."))
    }
    return { unitSize: String(multiplier), scale: "1000000" }
  }
  const scale = assetScales[market.baseAsset]
  if (!market.quantityStepUnits || !scale) {
    throw new Error(t("Quantity precision is unavailable. Cannot convert quantity."))
  }
  return { unitSize: market.quantityStepUnits, scale }
}
