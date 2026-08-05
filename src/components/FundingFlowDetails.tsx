import { QRCodeSVG } from "qrcode.react";
import type { AuthSession } from "../types";
import type { WalletAddress, WalletChain } from "../api/wallet";
import { AssetIcon } from "./AssetPrimitives";
import { FundingAddress, FundingMemo } from "./FundingFlowParts";
import { chainLabel, minimumAmount } from "./funding";

export function FundingDetails({
  mode,
  language,
  asset,
  chain,
  address,
  toAddress,
  amount,
  emailCode,
  totpCode,
  sendingCode,
  submitting,
  session,
  onCopyAddress,
  onToAddressChange,
  onAmountChange,
  onEmailCodeChange,
  onTotpCodeChange,
  onSendCode,
  onSubmit
}: {
  mode: "deposit" | "withdraw";
  language: "zh-CN" | "en-US";
  asset: string;
  chain: WalletChain;
  address: WalletAddress | null;
  toAddress: string;
  amount: string;
  emailCode: string;
  totpCode: string;
  sendingCode: boolean;
  submitting: boolean;
  session: AuthSession | null;
  onCopyAddress: () => void;
  onToAddressChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onEmailCodeChange: (value: string) => void;
  onTotpCodeChange: (value: string) => void;
  onSendCode: () => void;
  onSubmit: () => void;
}) {
  const text = (zh: string, en: string) => language === "en-US" ? en : zh;
  if (mode === "deposit") {
    return <div className="funding-detail">
      <div className="pc-qr">{address ? <QRCodeSVG value={address.address} size={112} includeMargin /> : null}<AssetIcon symbol={asset} /></div>
      {address ? <FundingAddress language={language} address={address.address} onCopy={onCopyAddress} /> : null}
      {address ? <FundingMemo memo={address.memo} /> : null}
    </div>;
  }
  return <div className="withdraw-detail">
    <p className="funding-network-note"><span className="funding-network-chain">{chainLabel(chain, asset)}</span> · <span className="no-wrap">{text("提现从资金账户扣除", "Withdrawal is deducted from Funding")}</span></p>
    <label>{text("提币地址", "Withdrawal address")}<input value={toAddress} onChange={(event) => onToAddressChange(event.target.value)} placeholder={text("请输入或粘贴地址", "Enter or paste address")} autoComplete="off" /></label>
    <label>{text("提币数量", "Withdrawal amount")}<input value={amount} onChange={(event) => onAmountChange(event.target.value)} placeholder={`${text("最低", "Minimum")} ${minimumAmount(asset, chain)}`} inputMode="decimal" /></label>
    <div className="security-code-grid">
      <label>{text("邮箱验证码", "Email code")}<input value={emailCode} onChange={(event) => onEmailCodeChange(event.target.value)} placeholder={text("如需验证请输入", "Enter if required")} inputMode="numeric" /></label>
      <button type="button" className="secondary-flow-button" disabled={!session || sendingCode} onClick={onSendCode}>{sendingCode ? text("发送中…", "Sending…") : text("发送验证码", "Send code")}</button>
      <label>{text("2FA 验证码", "2FA code")}<input value={totpCode} onChange={(event) => onTotpCodeChange(event.target.value)} placeholder={text("未绑定可留空", "Leave blank if not bound")} inputMode="numeric" /></label>
    </div>
    <button className="primary-flow-button" type="button" disabled={!session || submitting} onClick={onSubmit}>{submitting ? text("提交中…", "Submitting…") : text("提交提币", "Submit withdrawal")}</button>
  </div>;
}
