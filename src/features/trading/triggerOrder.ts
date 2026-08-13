import type { OrderSide } from "../../types/domain"

export type TriggerPositionMode = "ONE_WAY" | "HEDGE"
export type TriggerPositionSide = "NET" | "LONG" | "SHORT"

export function selectTriggerPosition(
  positions: readonly Record<string, unknown>[],
  symbol: string | undefined,
  marginMode: string,
  positionMode: TriggerPositionMode,
  positionSide: TriggerPositionSide,
): Record<string, unknown> | null {
  if (!symbol) return null
  const expectedPositionSide = positionMode === "HEDGE" ? positionSide : "NET"
  return (
    positions.find(
      (position) =>
        text(position, "symbol") === symbol &&
        text(position, "marginMode") === marginMode &&
        text(position, "positionSide") === expectedPositionSide &&
        signedPositionSteps(position) !== 0n,
    ) ?? null
  )
}

export function signedPositionSteps(position: Record<string, unknown>): bigint {
  const raw = Reflect.get(position, "signedQuantitySteps")
  if (typeof raw === "number" && Number.isSafeInteger(raw)) return BigInt(raw)
  if (typeof raw === "string" && /^-?\d+$/.test(raw)) return BigInt(raw)
  return 0n
}

export function closeSideForPosition(position: Record<string, unknown>): OrderSide | null {
  const signed = signedPositionSteps(position)
  return signed > 0n ? "SELL" : signed < 0n ? "BUY" : null
}

export function triggerConditionText(
  side: OrderSide,
  triggerType: "STOP_LOSS" | "TAKE_PROFIT",
): string {
  const greaterOrEqual =
    (triggerType === "TAKE_PROFIT" && side === "SELL") ||
    (triggerType === "STOP_LOSS" && side === "BUY")
  return greaterOrEqual ? "标记价格 ≥ 触发价时触发" : "标记价格 ≤ 触发价时触发"
}

function text(row: Record<string, unknown>, key: string): string {
  const value = Reflect.get(row, key)
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
