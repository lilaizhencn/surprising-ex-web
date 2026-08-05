import assert from "node:assert/strict";
import test from "node:test";
import { localized, localizedNotice } from "../src/localized.ts";

test("selects English copy for en-US", () => {
  assert.equal(localized("en-US", "暂无委托", "No open orders"), "No open orders");
  assert.equal(localizedNotice("en-US", "交易对服务暂不可用，请稍后重试"), "Market service is unavailable. Please try again later.");
});

test("preserves Chinese copy for zh-CN", () => {
  assert.equal(localized("zh-CN", "暂无委托", "No open orders"), "暂无委托");
  assert.equal(localizedNotice("zh-CN", "交易对服务暂不可用，请稍后重试"), "交易对服务暂不可用，请稍后重试");
});
