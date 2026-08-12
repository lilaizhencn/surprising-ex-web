import { HelpCircle } from "lucide-react";
import type { Balance } from "../types";
import { UiButton } from "./UiPrimitives";

export function AssetTabs({ active, language = "zh-CN" }: { active: string; language?: "zh-CN" | "en-US" }) {
  const tabs = language === "en-US"
    ? ["Overview", "Funding", "Trading", "Earn", "Analytics", "Orders", "Fees", "Statements", "Proof of reserves"]
    : ["资产总览", "资金账户", "交易账户", "金融账户", "资产分析", "订单中心", "手续费", "账户结单", "储备金证明报告"];
  return <nav className="asset-tabs" aria-label={language === "en-US" ? "Asset navigation" : "资产导航"}>{tabs.map((tab) => (
    <button aria-label={tab === active ? tab : language === "en-US" ? `${tab}, unavailable` : `${tab}，暂未开放`} className={tab === active ? "active" : ""} disabled={tab !== active} key={tab} title={tab === active ? undefined : language === "en-US" ? `${tab} unavailable` : `${tab}暂未开放`} type="button">{tab}</button>
  ))}</nav>;
}

export function AssetIcon({ symbol }: { symbol: string }) {
  return <span className={`asset-icon asset-${symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}`}>{symbol.slice(0, 1)}</span>;
}

export function SupportBubble({ onOpen, language = "zh-CN" }: { onOpen: () => void; language?: "zh-CN" | "en-US" }) {
  return <UiButton variant="quiet" className="support-bubble" type="button" aria-label={language === "en-US" ? "Open help center" : "打开帮助中心"} onClick={onOpen}><HelpCircle size={24} /></UiButton>;
}

export function fundingAssets(balances: Balance[]): Balance[] {
  return balances;
}

export function assetName(symbol: string): string {
  const names: Record<string, string> = {
    BTC: "Bitcoin",
    ETH: "Ethereum",
    SPEX: "Surprising EX",
    USDT: "USDT",
    USDC: "USD Coin",
    SHIB: "Shiba Inu",
    NIGHT: "Midnight",
    A: "Vaulta"
  };
  return names[symbol] ?? symbol;
}
