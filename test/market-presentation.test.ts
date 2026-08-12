import assert from "node:assert/strict";
import test from "node:test";
import { marketFavoriteKey, marketProductForPresentation, marketTickerIsReady, mergeMarketSnapshots } from "../src/marketPresentation.ts";
import type { Market } from "../src/types.ts";

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

test("fallback market keys stay scoped to the instrument product", () => {
  const linear = { symbol: "BTC-USDT", instrumentType: "PERPETUAL", contractType: "LINEAR", settleAsset: "USDT", baseAsset: "BTC" };
  const spot = { symbol: "BTC-USDT", instrumentType: "SPOT", contractType: "SPOT", settleAsset: "USDT", baseAsset: "BTC" };

  assert.equal(marketFavoriteKey(linear), "linear:BTC-USDT");
  assert.equal(marketFavoriteKey(spot), "spot:BTC-USDT");
});

test("preserves a newer market snapshot when an older list response completes", () => {
  const current = { symbol: "BTC-USDT", baseAsset: "BTC", quoteAsset: "USDT", displayName: "BTC", lastPriceTicks: 70000, markPriceTicks: 70000, indexPriceTicks: 70000, change24hPpm: 12000, volume24hUnits: 900, fundingRatePpm: 0, maxLeverage: 10, tickerReady: true, dataSource: "live" } satisfies Market;
  const incoming = { ...current, displayName: "BTC updated", lastPriceTicks: 65000, markPriceTicks: 0, indexPriceTicks: 0, change24hPpm: 1000, volume24hUnits: 100, tickerReady: false };

  assert.equal(mergeMarketSnapshots([current], [incoming], true)[0].lastPriceTicks, 70000);
  assert.equal(mergeMarketSnapshots([current], [incoming], true)[0].displayName, "BTC updated");
  assert.equal(mergeMarketSnapshots([current], [incoming], false)[0].lastPriceTicks, 65000);
});

test("live market data is not replaced by a fallback instrument snapshot", () => {
  const live = { symbol: "BTC-USDT", baseAsset: "BTC", quoteAsset: "USDT", displayName: "BTC", lastPriceTicks: 70000, markPriceTicks: 70000, indexPriceTicks: 70000, change24hPpm: 12000, volume24hUnits: 900, fundingRatePpm: 0, maxLeverage: 10, tickerReady: true, dataSource: "live" } satisfies Market;
  const fallback = { ...live, dataSource: "fallback" } satisfies Market;

  assert.equal(mergeMarketSnapshots([live], [fallback], true)[0].dataSource, "live");
  assert.equal(mergeMarketSnapshots([live], [fallback], true)[0].lastPriceTicks, 70000);
});

test("a live instrument without ticker data does not inherit fallback ticker values", () => {
  const fallback = { symbol: "BTC-USDT", baseAsset: "BTC", quoteAsset: "USDT", displayName: "BTC fallback", lastPriceTicks: 70000, markPriceTicks: 70000, indexPriceTicks: 70000, change24hPpm: 12000, volume24hUnits: 900, fundingRatePpm: 0, maxLeverage: 10, tickerReady: true, dataSource: "fallback" } satisfies Market;
  const liveInstrument = { ...fallback, displayName: "BTC live", lastPriceTicks: 0, markPriceTicks: 0, indexPriceTicks: 0, change24hPpm: 0, volume24hUnits: 0, tickerReady: false, dataSource: "live" } satisfies Market;

  const merged = mergeMarketSnapshots([fallback], [liveInstrument], true)[0];
  assert.equal(merged.dataSource, "live");
  assert.equal(merged.tickerReady, false);
  assert.equal(merged.lastPriceTicks, 0);
});
