import { t } from "../../i18n"
import { decimalProductExceedsUnits, decimalToUnits, unitsToDecimal } from "../../lib/units"

export function withdrawalAmount(
  value: string,
  scale: string,
  minimum: string,
  availableUnits: string,
): string {
  const units = decimalToUnits(value, scale)
  if (decimalProductExceedsUnits(minimum, "1", units, scale))
    throw new Error(t("The amount is below the network minimum."))
  if (!/^\d+$/.test(availableUnits) || BigInt(units) > BigInt(availableUnits))
    throw new Error(t("Insufficient available balance."))
  return unitsToDecimal(units, scale)
}
