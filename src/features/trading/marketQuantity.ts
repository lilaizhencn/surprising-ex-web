import { type Market, PRODUCT_LINES } from "../../types/domain"

/** Convert displayed base quantity to the same contract steps used by matching and risk. */
export function marketQuantitySpec(
  market: Market,
  assetScales: Readonly<Record<string, string>>,
): { unitSize: string; scale: string } {
  if (market.productLine === PRODUCT_LINES.usdMPerpetual) {
    const multiplier = market.contractMultiplierPpm
    if (!multiplier || !Number.isSafeInteger(multiplier) || multiplier <= 0) {
      throw new Error("合约面值尚未加载，无法换算数量。")
    }
    return { unitSize: String(multiplier), scale: "1000000" }
  }
  const scale = assetScales[market.baseAsset]
  if (!market.quantityStepUnits || !scale) {
    throw new Error("交易对数量精度尚未加载，无法换算数量。")
  }
  return { unitSize: market.quantityStepUnits, scale }
}
