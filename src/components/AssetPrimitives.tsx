import { HelpCircle } from "lucide-react";
import type { Balance } from "../types";

export function AssetTabs({ active }: { active: string }) {
  const tabs = ["资产总览", "资金账户", "交易账户", "金融账户", "资产分析", "订单中心", "手续费", "账户结单", "储备金证明报告"];
  return <nav className="asset-tabs" aria-label="资产导航">{tabs.map((tab) => (
    <button className={tab === active ? "active" : ""} key={tab} type="button">{tab}</button>
  ))}</nav>;
}

export function AssetIcon({ symbol }: { symbol: string }) {
  return <span className={`asset-icon asset-${symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}`}>{symbol.slice(0, 1)}</span>;
}

export function SupportBubble() {
  return <button className="support-bubble" type="button" aria-label="打开帮助中心"><HelpCircle size={24} /></button>;
}

export function fundingAssets(balances: Balance[]): Balance[] {
  if (balances.length) return balances;
  return [
    { accountType: "FUNDING", asset: "SPEX", availableUnits: 13_500_000_009, lockedUnits: 0, equityUnits: 13_500_000_009 },
    { accountType: "FUNDING", asset: "BTC", availableUnits: 1_954_640, lockedUnits: 0, equityUnits: 1_954_640 },
    { accountType: "FUNDING", asset: "A", availableUnits: 67_170_000, lockedUnits: 0, equityUnits: 67_170_000 },
    { accountType: "FUNDING", asset: "NIGHT", availableUnits: 128_768_890, lockedUnits: 0, equityUnits: 128_768_890 },
    { accountType: "FUNDING", asset: "ETH", availableUnits: 5, lockedUnits: 0, equityUnits: 5 },
    { accountType: "FUNDING", asset: "SHIB", availableUnits: 92_099_162, lockedUnits: 0, equityUnits: 92_099_162 }
  ];
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
