import type { ReactNode } from "react";
import { Download, FileText, HelpCircle, Info } from "lucide-react";
import type { WalletFundingRecord } from "../api/wallet";
import { AssetIcon } from "./AssetPrimitives";
import { formatFundingTime } from "./funding";

export function FundingStep({
  index,
  label,
  done,
  active,
  children
}: {
  index: number;
  label: string;
  done?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return <section className={active ? "funding-step active" : "funding-step"}>
    <div className={done ? "step-index done" : "step-index"}>{done ? "✓" : index}</div>
    <div className="step-body"><h2>{label}</h2>{children}</div>
  </section>;
}

export function InfoPair({ label, value }: { label: string; value: string }) {
  return <div><span>{label} <Info size={13} /></span><strong>{value}</strong></div>;
}

export function FundingRecords({
  language,
  asset,
  mode,
  records,
  loading,
  onShowAsset,
  onRefresh
}: {
  language: "zh-CN" | "en-US";
  asset: string | null;
  mode: "deposit" | "withdraw";
  records: WalletFundingRecord[];
  loading: boolean;
  onShowAsset: () => void;
  onRefresh: () => void;
}) {
  const text = (zh: string, en: string) => language === "en-US" ? en : zh;
  const actionLabel = mode === "deposit" ? text("充币", "Deposit") : text("提币", "Withdraw");
  return <section className="funding-records">
    <div className="record-tabs">
      <button className="active" type="button">{asset ? `${asset} ${actionLabel}${text("记录", " records")}` : `${actionLabel}${text("记录", " records")}`}</button>
      <button type="button">{text("全部", "All ")}{actionLabel}{text("记录", " records")}</button>
    </div>
    <div className="record-actions">
      <button type="button" onClick={onRefresh}><Download size={14} />{text("刷新", "Refresh")}</button>
      <button type="button" onClick={onShowAsset}><FileText size={14} />{text("查看资产", "View assets")}</button>
    </div>
    {loading ? <div className="empty-ledger"><span className="funding-spinner" aria-hidden="true" /><strong>{text("同步钱包记录中", "Syncing wallet records")}</strong></div> : records.length === 0 ? (
      <div className="empty-ledger"><FileText size={54} /><strong>{text("暂无记录", "No records")}</strong><small>{asset ? text("链上记录确认后会显示在这里", "On-chain records appear here after confirmation") : text("选择币种后查看对应记录", "Select an asset to view its records")}</small></div>
    ) : <div className="record-table" role="table" aria-label={`${actionLabel}记录`}>
      <div className="record-table-head" role="row"><span>{text("时间", "Time")}</span><span>{text("网络", "Network")}</span><span>Transaction ID</span><span>{text("币种", "Asset")}</span><span>{text("数量", "Amount")}</span><span>{text("状态", "Status")}</span></div>
      {records.map((record) => <div className="record-table-row" key={record.id || `${record.createdAt}-${record.amount}`} role="row">
        <span>{formatFundingTime(record.createdAt)}</span>
        <span>{record.chain}{record.network ? ` · ${record.network}` : ""}</span>
        <span title={record.txHash || record.id}>{shortValue(record.txHash || record.id)}</span>
        <span>{record.assetSymbol || asset || "—"}</span>
        <span>{record.amount || "—"}</span>
        <span className={`funding-status funding-status-${statusTone(record.status)}`}>{record.status}</span>
      </div>)}
    </div>}
  </section>;
}

export function FaqCard({ title, language = "zh-CN" }: { title: string; language?: "zh-CN" | "en-US" }) {
  const text = (zh: string, en: string) => language === "en-US" ? en : zh;
  return <aside className="faq-card">
    <h3>{title}</h3>
    <p>{text("如何生成充值地址？", "How do I generate a deposit address?")}</p>
    <p>{text("为什么充值还没有到账？", "Why has my deposit not arrived?")}</p>
    <p>{text("提币需要哪些安全验证？", "What security checks does withdrawal require?")}</p>
    <p>{text("如何查看资金流水？", "How do I view the funding ledger?")}</p>
    <button type="button" className="faq-help" onClick={() => window.location.assign("/rules")}><HelpCircle size={15} /> {text("联系支持", "Contact support")}</button>
  </aside>;
}

export function copyValue(value: string): void {
  void navigator.clipboard?.writeText(value);
}

function shortValue(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function statusTone(status: string): "positive" | "warning" | "negative" | "neutral" {
  const normalized = status.toUpperCase();
  if (["COMPLETED", "CONFIRMED", "SUCCESS", "CREDITED"].includes(normalized)) return "positive";
  if (["FAILED", "REJECTED", "REFUNDED"].includes(normalized)) return "negative";
  if (["PENDING", "PROCESSING", "BROADCAST_UNKNOWN", "WAITING"].includes(normalized)) return "warning";
  return "neutral";
}

export function FundingAddress({ address, onCopy, language = "zh-CN" }: { address: string; onCopy: () => void; language?: "zh-CN" | "en-US" }) {
  return <div className="funding-address">
    <small>{language === "en-US" ? "Deposit address" : "充值地址"}</small>
    <strong>{address}</strong>
    <button type="button" aria-label={language === "en-US" ? "Copy deposit address" : "复制充值地址"} onClick={onCopy}>{language === "en-US" ? "Copy" : "复制"}</button>
  </div>;
}

export function FundingMemo({ memo }: { memo: string }) {
  return memo ? <p className="funding-memo">Memo / Tag：<strong>{memo}</strong></p> : null;
}

export function WalletError({ message }: { message: string }) {
  return message ? <p className="funding-error" role="alert">{message}</p> : null;
}
