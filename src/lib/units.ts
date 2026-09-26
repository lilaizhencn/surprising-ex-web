import { t } from "../i18n"
export type UnitScale = string | number

export function isPositiveDecimal(value: string): boolean {
  try {
    const decimal = parseDecimal(value)
    return decimal.coefficient > 0n
  } catch {
    return false
  }
}

type Decimal = Readonly<{
  coefficient: bigint
  fractionDigits: number
}>

export function decimalToUnits(value: string, scale: UnitScale): string {
  const decimal = parseDecimal(value)
  const scaleValue = scaleToBigInt(scale)
  const numerator = decimal.coefficient * scaleValue
  const divisor = ten(decimal.fractionDigits)
  if (numerator % divisor !== 0n) {
    throw new Error(t("Quantity exceeds asset precision."))
  }
  const units = numerator / divisor
  if (units <= 0n || units > 9223372036854775807n) {
    throw new Error(t("Quantity exceeds the allowed integer range."))
  }
  return units.toString()
}

export function decimalToStepUnits(
  value: string,
  unitSize: UnitScale,
  assetScale: UnitScale,
): string {
  const decimal = parseDecimal(value)
  const unit = scaleToBigInt(unitSize)
  const asset = scaleToBigInt(assetScale)
  const numerator = decimal.coefficient * asset
  const divisor = ten(decimal.fractionDigits) * unit
  if (numerator % divisor !== 0n) {
    throw new Error(t("Quantity does not match the minimum step."))
  }
  const steps = numerator / divisor
  if (steps <= 0n || steps > 9223372036854775807n) {
    throw new Error(t("Quantity exceeds the allowed integer range."))
  }
  return steps.toString()
}

export function decimalProductExceedsUnits(
  left: string,
  right: string,
  availableUnits: string | number | undefined,
  scale: UnitScale | undefined,
): boolean {
  if (availableUnits === undefined || scale === undefined) {
    throw new Error(t("Balance units or asset precision are unavailable."))
  }
  const leftDecimal = parseDecimal(left)
  const rightDecimal = parseDecimal(right)
  const available = integerToBigInt(availableUnits)
  const product = leftDecimal.coefficient * rightDecimal.coefficient * scaleToBigInt(scale)
  const divisor = ten(leftDecimal.fractionDigits + rightDecimal.fractionDigits)
  return product > available * divisor
}

export function unitsToDecimal(units: string | number, scale: UnitScale): string {
  const value = integerToBigInt(units)
  const scaleValue = scaleToBigInt(scale)
  const whole = value / scaleValue
  const remainder = value % scaleValue
  if (remainder === 0n) return whole.toString()
  const fraction = remainder
    .toString()
    .padStart(scaleValue.toString().length - 1, "0")
    .replace(/0+$/, "")
  return `${whole}.${fraction}`
}

export function addDecimalQuantities(left: string, right: string): string {
  const a = parseDecimal(left)
  const b = parseDecimal(right)
  const digits = Math.max(a.fractionDigits, b.fractionDigits)
  const total =
    a.coefficient * ten(digits - a.fractionDigits) + b.coefficient * ten(digits - b.fractionDigits)
  return unitsToDecimal(total.toString(), ten(digits).toString())
}

export function signedUnitsToDecimal(units: string | number, scale: UnitScale): string {
  const normalized = typeof units === "number" ? integerNumberAllowNegative(units) : units.trim()
  if (normalized.startsWith("-")) {
    return `-${unitsToDecimal(normalized.slice(1), scale)}`
  }
  return unitsToDecimal(normalized, scale)
}

export function stepUnitsToDecimal(
  steps: string | number,
  unitSize: UnitScale,
  assetScale: UnitScale,
): string {
  const totalUnits = integerToBigInt(steps) * scaleToBigInt(unitSize)
  return unitsToDecimal(totalUnits.toString(), assetScale)
}

function parseDecimal(value: string): Decimal {
  const normalized = value.trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error(t("Enter a valid decimal quantity."))
  }
  const [integerPart, fractionPart = ""] = normalized.split(".")
  const digits = `${integerPart || "0"}${fractionPart}`.replace(/^0+(?=\d)/, "")
  return { coefficient: BigInt(digits || "0"), fractionDigits: fractionPart.length }
}

function scaleToBigInt(scale: UnitScale): bigint {
  const normalized = typeof scale === "number" ? integerNumber(scale) : scale.trim()
  if (!/^\d+$/.test(normalized) || normalized === "0") {
    throw new Error(t("Invalid asset precision."))
  }
  return BigInt(normalized)
}

function integerToBigInt(value: string | number): bigint {
  const normalized = typeof value === "number" ? integerNumber(value) : value.trim()
  if (!/^\d+$/.test(normalized)) throw new Error(t("Invalid balance units."))
  return BigInt(normalized)
}

function integerNumber(value: number): string {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(t("Invalid integer units."))
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(t("Integer units must be transmitted as strings."))
  }
  return String(value)
}

function integerNumberAllowNegative(value: number): string {
  if (!Number.isFinite(value) || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new Error(t("Invalid integer units."))
  }
  return String(value)
}

function ten(exponent: number): bigint {
  return 10n ** BigInt(exponent)
}
