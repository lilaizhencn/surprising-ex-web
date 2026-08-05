import type { AuthSession } from "../types";
import { request } from "./client";

export interface WalletToken {
  symbol: string;
  standard: string;
  decimals: number;
  minDeposit: string;
}

export interface WalletChain {
  chain: string;
  network: string;
  family: string;
  nativeSymbol: string;
  assetSymbols: string[];
  tokens: WalletToken[];
  enabled: boolean;
  withdrawalEnabled: boolean;
  status: string;
}

export interface WalletAddress {
  id: string;
  chain: string;
  network: string;
  address: string;
  memo: string;
}

export interface WalletFundingRecord {
  id: string;
  chain: string;
  network: string;
  assetSymbol: string;
  amount: string;
  status: string;
  address: string;
  toAddress: string;
  txHash: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletWithdrawalSubmission {
  id: string;
  withdrawalId: string;
  status: string;
  success: boolean;
}

export async function loadWalletChains(session: AuthSession): Promise<WalletChain[]> {
  const payload = await request<unknown>("/api/v1/wallet/chains", {}, session);
  return arrayValue(payload).map(normalizeWalletChain).filter((chain) => chain.enabled);
}

export async function createWalletAddress(session: AuthSession, chain: WalletChain): Promise<WalletAddress> {
  const payload = await request<unknown>("/api/v1/wallet/addresses", {
    method: "POST",
    body: JSON.stringify({ chain: chain.chain, addressVersion: 1 })
  }, session);
  return normalizeWalletAddress(payload, chain);
}

export async function loadWalletDeposits(
  session: AuthSession,
  chain: string,
  assetSymbol: string,
  limit = 50
): Promise<WalletFundingRecord[]> {
  return loadWalletRecords(session, "/api/v1/wallet/deposits", chain, assetSymbol, limit);
}

export async function loadWalletWithdrawals(
  session: AuthSession,
  chain: string,
  assetSymbol: string,
  limit = 50
): Promise<WalletFundingRecord[]> {
  return loadWalletRecords(session, "/api/v1/wallet/withdrawals", chain, assetSymbol, limit);
}

export async function submitWalletWithdrawal(
  session: AuthSession,
  input: {
    chain: WalletChain;
    assetSymbol: string;
    toAddress: string;
    amount: string;
    externalReference: string;
    idempotencyKey: string;
    emailCode?: string;
    totpCode?: string;
  }
): Promise<WalletWithdrawalSubmission> {
  const headers = new Headers({ "Idempotency-Key": input.idempotencyKey });
  if (input.emailCode?.trim()) headers.set("X-Security-Email-Code", input.emailCode.trim());
  if (input.totpCode?.trim()) headers.set("X-Security-TOTP-Code", input.totpCode.trim());
  const payload = await request<unknown>("/api/v1/wallet/withdrawals", {
    method: "POST",
    headers,
    body: JSON.stringify({
      chain: input.chain.chain,
      assetSymbol: input.assetSymbol,
      toAddress: input.toAddress.trim(),
      amount: input.amount.trim(),
      externalReference: input.externalReference
    })
  }, session);
  const record = objectValue(payload);
  return {
    id: stringValue(record.id),
    withdrawalId: stringValue(record.withdrawalId),
    status: stringValue(record.status, "PENDING"),
    success: record.success === true
  };
}

async function loadWalletRecords(
  session: AuthSession,
  path: string,
  chain: string,
  assetSymbol: string,
  limit: number
): Promise<WalletFundingRecord[]> {
  const params = new URLSearchParams({
    chain,
    asset: assetSymbol,
    limit: String(Math.max(1, Math.min(limit, 200)))
  });
  const payload = await request<unknown>(`${path}?${params.toString()}`, {}, session);
  return arrayValue(payload).map(normalizeFundingRecord);
}

function normalizeWalletChain(value: unknown): WalletChain {
  const record = objectValue(value);
  const tokens = arrayValue(record.tokens).map((token) => {
    const item = objectValue(token);
    return {
      symbol: stringValue(item.symbol).toUpperCase(),
      standard: stringValue(item.standard),
      decimals: numberValue(item.decimals),
      minDeposit: stringValue(item.minDeposit)
    };
  }).filter((token) => token.symbol);
  const nativeSymbol = stringValue(record.nativeSymbol).toUpperCase();
  const assetSymbols = uniqueStrings([
    ...stringArray(record.assetSymbols),
    nativeSymbol,
    ...tokens.map((token) => token.symbol)
  ]);
  return {
    chain: stringValue(record.chain).toUpperCase(),
    network: stringValue(record.network),
    family: stringValue(record.family),
    nativeSymbol,
    assetSymbols,
    tokens,
    enabled: record.enabled !== false,
    withdrawalEnabled: record.withdrawalEnabled === true || record.withdrawEnabled === true,
    status: stringValue(record.status, "OPEN")
  };
}

function normalizeWalletAddress(value: unknown, chain: WalletChain): WalletAddress {
  const record = objectValue(value);
  const address = stringValue(record.address, stringValue(record.walletAddress));
  if (!address) throw new Error("钱包未返回充值地址");
  return {
    id: stringValue(record.id, stringValue(record.addressId)),
    chain: chain.chain,
    network: chain.network,
    address,
    memo: stringValue(record.memo, stringValue(record.tag))
  };
}

function normalizeFundingRecord(value: unknown): WalletFundingRecord {
  const record = objectValue(value);
  return {
    id: stringValue(record.id, stringValue(record.orderNo, stringValue(record.withdrawalId))),
    chain: stringValue(record.chain).toUpperCase(),
    network: stringValue(record.network),
    assetSymbol: stringValue(record.assetSymbol, stringValue(record.asset)).toUpperCase(),
    amount: stringValue(record.amount, stringValue(record.amountString)),
    status: stringValue(record.status, "UNKNOWN"),
    address: stringValue(record.address),
    toAddress: stringValue(record.toAddress),
    txHash: stringValue(record.txHash, stringValue(record.transactionHash)),
    memo: stringValue(record.memo),
    createdAt: stringValue(record.createdAt, stringValue(record.created_at)),
    updatedAt: stringValue(record.updatedAt, stringValue(record.updated_at))
  };
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return arrayValue(value).map((item) => stringValue(item).toUpperCase()).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stringValue(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
