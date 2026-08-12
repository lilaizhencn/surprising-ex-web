import assert from "node:assert/strict";
import test from "node:test";
import { marketFavoriteKey, marketProductForPresentation, marketTickerIsReady } from "../src/marketPresentation.ts";

test("favorite keys preserve product-line isolation for identical symbols", () => {
  const spot = { symbol: "BTC-USDT", instrumentType: "SPOT", contractType: "SPOT", settleAsset: "USDT", baseAsset: "BTC" };
  const perpetual = { symbol: "BTC-USDT", instrumentType: "LINEAR", contractType: "LINEAR_PERPETUAL", settleAsset: "USDT", baseAsset: "BTC" };

  assert.equal(marketProductForPresentation(spot), "spot");
  assert.equal(marketProductForPresentation(perpetual), "linear");
  assert.notEqual(marketFavoriteKey(spot), marketFavoriteKey(perpetual));
});

test("ticker readiness is explicit rather than inferred from zero defaults", () => {
  assert.equal(marketTickerIsReady({ tickerReady: false }), false);
  assert.equal(marketTickerIsReady({}), false);
  assert.equal(marketTickerIsReady({ tickerReady: true }), true);
});
