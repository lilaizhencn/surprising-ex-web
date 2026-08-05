import { ArrowDownUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { submitProductTransfer } from "../api/surprising";
import { availableUnitsForAsset } from "../productTransfer";
import type { AuthSession, Balance, ProductAccountType } from "../types";
import { AssetIcon, assetName } from "./AssetPrimitives";

const ACCOUNT_OPTIONS: Array<{ value: ProductAccountType; label: string }> = [
  { value: "SPOT", label: "资金账户" },
  { value: "USDT_PERPETUAL", label: "U本位永续" },
  { value: "COIN_PERPETUAL", label: "币本位永续" },
  { value: "USDT_DELIVERY", label: "U本位交割" },
  { value: "COIN_DELIVERY", label: "币本位交割" },
  { value: "OPTION", label: "期权账户" }
];

export function ProductTransferDialog({ session, balances, onClose, onCompleted }: {
  session: AuthSession;
  balances: Balance[];
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [sourceAccountType, setSourceAccountType] = useState<ProductAccountType>("SPOT");
  const [targetAccountType, setTargetAccountType] = useState<ProductAccountType>("USDT_PERPETUAL");
  const [asset, setAsset] = useState(() => balances.find((item) => item.availableUnits > 0)?.asset ?? "USDT");
  const [amount, setAmount] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const available = useMemo(
    () => availableUnitsForAsset(balances, asset),
    [asset, balances]
  );

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, [amount, asset, sourceAccountType, targetAccountType]);

  function swapAccounts() {
    setSourceAccountType(targetAccountType);
    setTargetAccountType(sourceAccountType);
  }

  async function submit() {
    setError("");
    setNotice("");
    if (sourceAccountType === targetAccountType) {
      setError("来源和目标账户不能相同");
      return;
    }
    const amountUnits = decimalToUnits(amount);
    if (!amountUnits || amountUnits <= 0) {
      setError("请输入有效划转数量，最多支持 8 位小数");
      return;
    }
    if (sourceAccountType === "SPOT" && amountUnits > available) {
      setError(`可用余额不足，当前最多 ${unitsToDisplay(available)}`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitProductTransfer(session, {
        sourceAccountType,
        targetAccountType,
        asset,
        amountUnits,
        idempotencyKey
      });
      setNotice(`划转已完成${result.transferId ? `，流水号 ${result.transferId}` : ""}`);
      onCompleted();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "划转失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-panel transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title">
      <header className="transfer-dialog-header"><div><small>账户资金管理</small><h2 id="transfer-dialog-title">资金划转</h2></div><button className="icon-button" type="button" aria-label="关闭资金划转" onClick={onClose}><X size={18} /></button></header>
      <p className="security-muted">产品账户之间即时划转，不需要额外验证；服务端使用幂等键避免重复扣款。</p>
      <div className="transfer-route">
        <label>从<select value={sourceAccountType} onChange={(event) => setSourceAccountType(event.target.value as ProductAccountType)}>{ACCOUNT_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <button className="transfer-swap" type="button" aria-label="交换划转方向" onClick={swapAccounts}><ArrowDownUp size={18} /></button>
        <label>到<select value={targetAccountType} onChange={(event) => setTargetAccountType(event.target.value as ProductAccountType)}>{ACCOUNT_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      </div>
      <label className="transfer-field">币种<select value={asset} onChange={(event) => setAsset(event.target.value)}>{balances.map((item) => <option value={item.asset} key={item.asset}>{item.asset} · {assetName(item.asset)}</option>)}</select></label>
      <label className="transfer-field">数量<input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="请输入划转数量" /><span>可用 {sourceAccountType === "SPOT" ? unitsToDisplay(available) : "由目标账户实时校验"} {asset}</span></label>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="transfer-success" role="status"><AssetIcon symbol={asset} />{notice}</p>}
      <button className="primary-button" type="button" disabled={submitting || Boolean(notice)} onClick={() => void submit()}>{submitting ? "提交中…" : "确认划转"}</button>
    </section>
  </div>;
}

function decimalToUnits(value: string): number {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(normalized)) return 0;
  const [whole, fraction = ""] = normalized.split(".");
  const units = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
  return units <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(units) : 0;
}

function unitsToDisplay(units: number): string {
  return (units / 100_000_000).toLocaleString("en-US", { maximumFractionDigits: 8 });
}
