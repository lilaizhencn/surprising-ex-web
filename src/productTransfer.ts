import type { Balance } from "./types";

export function availableUnitsForAsset(balances: readonly Balance[], asset: string): number {
  return balances.find((item) => item.asset.toUpperCase() === asset.toUpperCase())?.availableUnits ?? 0;
}

export function isCompletedProductTransfer(status: string | undefined): boolean {
  return status?.toUpperCase() === "COMPLETED";
}
