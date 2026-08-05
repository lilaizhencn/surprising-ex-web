import assert from "node:assert/strict";
import test from "node:test";
import { availableUnitsForAsset } from "../src/productTransfer.ts";

test("uses only available balance when frozen funds are present", () => {
  assert.equal(availableUnitsForAsset([
    { accountType: "SPOT", asset: "USDT", availableUnits: 180_000_000_000, lockedUnits: 12_000_000_000, equityUnits: 192_000_000_000 }
  ], "usdt"), 180_000_000_000);
});
