import type { Balance } from "./types";

export function availableUnitsForAsset(balances: Balance[], asset: string): number {
  return balances.find((item) => item.asset.toUpperCase() === asset.toUpperCase())?.availableUnits ?? 0;
}
