import assert from "node:assert/strict";
import test from "node:test";
import { applyMarketPriceTicks, priceFromTicks } from "../src/valuation.ts";

test("converts backend price ticks using the market tick unit", () => {
  assert.equal(priceFromTicks({ priceTickUnits: 1_000_000 }, 7_000_000), 70_000);
});

test("updates only the market symbol returned by the spot order book", () => {
  const markets = [
    { symbol: "BTC-USDT-SPOT", lastPriceTicks: 1, markPriceTicks: 1, indexPriceTicks: 1 },
    { symbol: "BTC-USDT", lastPriceTicks: 2, markPriceTicks: 2, indexPriceTicks: 2 },
  ];
  const next = applyMarketPriceTicks(markets, new Map([["BTC-USDT-SPOT", 7_000_000]]));
  assert.equal(next[0].lastPriceTicks, 7_000_000);
  assert.equal(next[1].lastPriceTicks, 2);
});
