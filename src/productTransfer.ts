import type { Balance } from "./types";

export function availableUnitsForAsset(balances: readonly Balance[], asset: string): number {
  return balances.find((item) => item.asset.toUpperCase() === asset.toUpperCase())?.availableUnits ?? 0;
}

export function isCompletedProductTransfer(status: string | undefined): boolean {
  return status?.toUpperCase() === "COMPLETED";
}

export function productTransferErrorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "status" in reason
    && typeof reason.status === "number" && reason.status >= 400 && reason.status < 500
    && ![408, 409, 425, 429].includes(reason.status)) {
    return "划转未完成，请查看资金记录后再决定下一步";
  }
  return "划转结果未知，请勿重复提交，请查看资金记录";
}
