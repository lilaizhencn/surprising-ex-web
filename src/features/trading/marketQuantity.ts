import { t } from "../../i18n"
import { type Market, PRODUCT_LINES } from "../../types/domain"

/** Derivative quantity steps are whole contracts; spot steps are base-asset units. */
export function marketQuantitySpec(
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): { unitSize: string; scale: string } {
  if (market.productLine !== PRODUCT_LINES.spot) return { unitSize: "1", scale: "1" }
  const scale = assetScales[market.baseAsset]
  if (!market.quantityStepUnits || !scale) {
    throw new Error(t("Quantity precision is unavailable. Cannot convert quantity."))
  }
  return { unitSize: market.quantityStepUnits, scale }
}
