import type { Balance } from "../types";
import { assetName } from "./AssetPrimitives";
import type { WalletChain } from "../api/wallet";

export interface FundingAssetOption {
  asset: string;
  name: string;
  balance?: Balance;
}

export function chainKeyFor(chain: WalletChain): string {
  return `${chain.chain}/${chain.network}`;
}

export function fundingAssetOptions(balances: Balance[], chains: WalletChain[]): FundingAssetOption[] {
  const options = new Map<string, FundingAssetOption>();
  balances.forEach((balance) => {
    const asset = balance.asset.toUpperCase();
    options.set(asset, { asset, name: assetName(asset), balance });
  });
  chains.flatMap((chain) => chain.assetSymbols).forEach((symbol) => {
    const asset = symbol.toUpperCase();
    if (asset && !options.has(asset)) options.set(asset, { asset, name: assetName(asset) });
  });
  return [...options.values()].sort((left, right) => left.asset.localeCompare(right.asset));
}

export function chainsForAsset(chains: WalletChain[], asset: string, withdrawal: boolean): WalletChain[] {
  return chains.filter((chain) => chain.assetSymbols.includes(asset.toUpperCase())
    && (!withdrawal || chain.withdrawalEnabled));
}

export function chainLabel(chain: WalletChain, asset: string): string {
  const network = chain.network ? ` · ${chain.network}` : "";
  return `${chain.chain}${network} · ${asset}`;
}

export function chainSymbol(chain: WalletChain): string {
  return chain.nativeSymbol || chain.chain.slice(0, 3);
}

export function networkEta(chain: WalletChain): string {
  if (chain.family.toLowerCase().includes("evm")) return "约 7 分钟";
  if (chain.family.toLowerCase().includes("bitcoin")) return "约 30 分钟";
  return "约 1 分钟";
}

export function minimumAmount(asset: string, chain: WalletChain): string {
  const token = chain.tokens.find((item) => item.symbol === asset.toUpperCase());
  return token?.minDeposit ? `${token.minDeposit} ${asset}` : `0.01 ${asset}`;
}

export function formatFundingTime(value: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
}
