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
  asset,
  mode,
  records,
  loading,
  onShowAsset,
  onRefresh
}: {
  asset: string | null;
  mode: "deposit" | "withdraw";
  records: WalletFundingRecord[];
  loading: boolean;
  onShowAsset: () => void;
  onRefresh: () => void;
}) {
  const actionLabel = mode === "deposit" ? "充币" : "提币";
  return <section className="funding-records">
    <div className="record-tabs">
      <button className="active" type="button">{asset ? `${asset} ${actionLabel}记录` : `${actionLabel}记录`}</button>
      <button type="button">全部{actionLabel}记录</button>
    </div>
    <div className="record-actions">
      <button type="button" onClick={onRefresh}><Download size={14} />刷新</button>
      <button type="button" onClick={onShowAsset}><FileText size={14} />查看资产</button>
    </div>
    {loading ? <div className="empty-ledger"><span className="funding-spinner" aria-hidden="true" /><strong>同步钱包记录中</strong></div> : records.length === 0 ? (
      <div className="empty-ledger"><FileText size={54} /><strong>暂无记录</strong><small>{asset ? "链上记录确认后会显示在这里" : "选择币种后查看对应记录"}</small></div>
    ) : <div className="record-table" role="table" aria-label={`${actionLabel}记录`}>
      <div className="record-table-head" role="row"><span>时间</span><span>网络</span><span>交易 ID</span><span>币种</span><span>数量</span><span>状态</span></div>
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

export function FaqCard({ title }: { title: string }) {
  return <aside className="faq-card">
    <h3>{title}</h3>
    <p>如何生成充值地址？</p>
    <p>为什么充值还没有到账？</p>
    <p>提币需要哪些安全验证？</p>
    <p>如何查看资金流水？</p>
    <button type="button" className="faq-help" onClick={() => window.location.assign("/rules")}><HelpCircle size={15} /> 联系支持</button>
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

export function FundingAddress({ address, onCopy }: { address: string; onCopy: () => void }) {
  return <div className="funding-address">
    <small>充值地址</small>
    <strong>{address}</strong>
    <button type="button" aria-label="复制充值地址" onClick={onCopy}>复制</button>
  </div>;
}

export function FundingMemo({ memo }: { memo: string }) {
  return memo ? <p className="funding-memo">Memo / Tag：<strong>{memo}</strong></p> : null;
}

export function WalletError({ message }: { message: string }) {
  return message ? <p className="funding-error" role="alert">{message}</p> : null;
}
