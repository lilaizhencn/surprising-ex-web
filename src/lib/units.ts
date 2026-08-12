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
    throw new Error("数量超过资产精度，未提交。")
  }
  const units = numerator / divisor
  if (units <= 0n || units > 9223372036854775807n) {
    throw new Error("数量超出可提交的整数范围，未提交。")
  }
  return units.toString()
}

export function decimalProductExceedsUnits(
  left: string,
  right: string,
  availableUnits: string | number | undefined,
  scale: UnitScale | undefined,
): boolean {
  if (availableUnits === undefined || scale === undefined) return false
  try {
    const leftDecimal = parseDecimal(left)
    const rightDecimal = parseDecimal(right)
    const available = integerToBigInt(availableUnits)
    const product = leftDecimal.coefficient * rightDecimal.coefficient * scaleToBigInt(scale)
    const divisor = ten(leftDecimal.fractionDigits + rightDecimal.fractionDigits)
    return product > available * divisor
  } catch {
    return false
  }
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

function parseDecimal(value: string): Decimal {
  const normalized = value.trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error("请输入有效的十进制数量。")
  }
  const [integerPart, fractionPart = ""] = normalized.split(".")
  const digits = `${integerPart || "0"}${fractionPart}`.replace(/^0+(?=\d)/, "")
  return { coefficient: BigInt(digits || "0"), fractionDigits: fractionPart.length }
}

function scaleToBigInt(scale: UnitScale): bigint {
  const normalized =
    typeof scale === "number"
      ? scale.toLocaleString("fullwide", {
          useGrouping: false,
          maximumFractionDigits: 0,
        })
      : scale.trim()
  if (!/^\d+$/.test(normalized) || normalized === "0") {
    throw new Error("资产精度规格无效，未提交。")
  }
  return BigInt(normalized)
}

function integerToBigInt(value: string | number): bigint {
  const normalized =
    typeof value === "number"
      ? value.toLocaleString("fullwide", {
          useGrouping: false,
          maximumFractionDigits: 0,
        })
      : value.trim()
  if (!/^\d+$/.test(normalized)) throw new Error("余额单位无效。")
  return BigInt(normalized)
}

function ten(exponent: number): bigint {
  return 10n ** BigInt(exponent)
}
