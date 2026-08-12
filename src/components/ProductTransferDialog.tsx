import { ArrowDownUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { issueSecurityChallenge, submitProductTransfer } from "../api/surprising";
import { ApiError } from "../api/client";
import { availableUnitsForAsset, isCompletedProductTransfer, productTransferErrorMessage } from "../productTransfer";
import type { AuthSession, Balance, ProductAccountType } from "../types";
import { AssetIcon, assetName } from "./AssetPrimitives";
import { UiButton, UiField } from "./UiPrimitives";

const ACCOUNT_OPTIONS: Array<{ value: ProductAccountType; label: string }> = [
  { value: "SPOT", label: "资金账户" },
  { value: "USDT_PERPETUAL", label: "U本位永续" },
  { value: "COIN_PERPETUAL", label: "币本位永续" },
  { value: "USDT_DELIVERY", label: "U本位交割" },
  { value: "COIN_DELIVERY", label: "币本位交割" },
  { value: "OPTION", label: "期权账户" }
];

export function ProductTransferDialog({ session, balances, initialAsset, initialSourceAccountType = "SPOT", initialTargetAccountType = "USDT_PERPETUAL", onClose, onCompleted }: {
  session: AuthSession;
  balances: Balance[];
  initialAsset?: string;
  initialSourceAccountType?: ProductAccountType;
  initialTargetAccountType?: ProductAccountType;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [sourceAccountType, setSourceAccountType] = useState<ProductAccountType>(initialSourceAccountType);
  const [targetAccountType, setTargetAccountType] = useState<ProductAccountType>(initialTargetAccountType);
  const [asset, setAsset] = useState(() => initialAsset ?? balances.find((item) => item.availableUnits > 0)?.asset ?? balances[0]?.asset ?? "USDT");
  const [amount, setAmount] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [outcomeLocked, setOutcomeLocked] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const available = useMemo(
    () => availableUnitsForAsset(balances, asset),
    [asset, balances]
  );

  useEffect(() => {
    if (outcomeLocked) return;
    setIdempotencyKey(crypto.randomUUID());
  }, [amount, asset, outcomeLocked, sourceAccountType, targetAccountType]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), select:not([disabled]), input:not([disabled])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

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
        idempotencyKey,
        emailCode,
        totpCode
      });
      onCompleted();
      if (!isCompletedProductTransfer(result.status)) {
        setOutcomeLocked(true);
        const status = result.status?.toUpperCase();
        setError(status?.includes("UNKNOWN") || status === "PENDING" || status === "SOURCE_DEBITED" || status === "COMPENSATION_REQUIRED"
          ? `划转处理中${result.transferId ? `，流水号 ${result.transferId}` : ""}，请勿重复提交`
          : `划转未完成${result.transferId ? `，流水号 ${result.transferId}` : ""}，请查看资金记录`);
        return;
      }
      setNotice(`划转已完成${result.transferId ? `，流水号 ${result.transferId}` : ""}`);
    } catch (reason: unknown) {
      if (reason instanceof ApiError && reason.status === 428) {
        setVerificationRequired(true);
        try {
          const challenge = await issueSecurityChallenge(session, "LARGE_TRANSFER");
          setNotice(`大额划转需要验证，验证码已发送至 ${challenge.destination}`);
        } catch {
          setError("验证码发送失败，请稍后重试");
        }
        return;
      }
      setOutcomeLocked(true);
      setError(productTransferErrorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="modal-panel transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title">
      <header className="transfer-dialog-header"><div><small>账户资金管理</small><h2 id="transfer-dialog-title">资金划转</h2></div><button ref={closeRef} className="icon-button" type="button" aria-label="关闭资金划转" onClick={onClose}><X size={18} /></button></header>
      <p className="security-muted">产品账户之间即时划转，小额无需额外验证；大额划转会按 USDT 估值要求邮箱验证，绑定 2FA 后还需动态验证码。</p>
      <div className="transfer-route">
        <UiField label="从" className="transfer-field transfer-route-field"><select disabled={outcomeLocked} value={sourceAccountType} onChange={(event) => { const next = ACCOUNT_OPTIONS.find((item) => item.value === event.target.value)?.value; if (next) setSourceAccountType(next); }}>{ACCOUNT_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></UiField>
        <button className="transfer-swap" type="button" aria-label="交换划转方向" disabled={outcomeLocked} onClick={swapAccounts}><ArrowDownUp size={18} /></button>
        <UiField label="到" className="transfer-field transfer-route-field"><select disabled={outcomeLocked} value={targetAccountType} onChange={(event) => { const next = ACCOUNT_OPTIONS.find((item) => item.value === event.target.value)?.value; if (next) setTargetAccountType(next); }}>{ACCOUNT_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></UiField>
      </div>
      <UiField label="币种" className="transfer-field"><select disabled={outcomeLocked} value={asset} onChange={(event) => setAsset(event.target.value)}>{balances.map((item) => <option value={item.asset} key={item.asset}>{item.asset} · {assetName(item.asset)}</option>)}</select></UiField>
      <UiField label="数量" hint={`可用 ${sourceAccountType === "SPOT" ? unitsToDisplay(available) : "由目标账户实时校验"} ${asset}`} className="transfer-field"><input disabled={outcomeLocked} value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="请输入划转数量" /></UiField>
      {verificationRequired && <div className="security-code-grid"><UiField label="邮箱验证码"><input disabled={outcomeLocked} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="请输入 6 位验证码" /></UiField><UiField label="2FA 验证码"><input disabled={outcomeLocked} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="未绑定可留空" /></UiField></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="transfer-success" role="status"><AssetIcon symbol={asset} />{notice}</p>}
      <UiButton variant="primary" className="primary-button" type="button" busy={submitting} disabled={Boolean(notice) || outcomeLocked} onClick={() => void submit()}>{outcomeLocked ? "请查看资金记录" : "确认划转"}</UiButton>
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
