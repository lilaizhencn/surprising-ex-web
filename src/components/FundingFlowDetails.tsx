import { QRCodeSVG } from "qrcode.react";
import type { AuthSession } from "../types";
import type { WalletAddress, WalletChain } from "../api/wallet";
import { AssetIcon } from "./AssetPrimitives";
import { FundingAddress, FundingMemo } from "./FundingFlowParts";
import { chainLabel, minimumAmount } from "./funding";

export function FundingDetails({
  mode,
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
  if (mode === "deposit") {
    return <div className="funding-detail">
      <div className="pc-qr">{address ? <QRCodeSVG value={address.address} size={112} includeMargin /> : null}<AssetIcon symbol={asset} /></div>
      {address ? <FundingAddress address={address.address} onCopy={onCopyAddress} /> : null}
      {address ? <FundingMemo memo={address.memo} /> : null}
    </div>;
  }
  return <div className="withdraw-detail">
    <p className="funding-network-note"><span className="funding-network-chain">{chainLabel(chain, asset)}</span> · <span className="no-wrap">提现从资金账户扣除</span></p>
    <label>提币地址<input value={toAddress} onChange={(event) => onToAddressChange(event.target.value)} placeholder="请输入或粘贴地址" autoComplete="off" /></label>
    <label>提币数量<input value={amount} onChange={(event) => onAmountChange(event.target.value)} placeholder={`最低 ${minimumAmount(asset, chain)}`} inputMode="decimal" /></label>
    <div className="security-code-grid">
      <label>邮箱验证码<input value={emailCode} onChange={(event) => onEmailCodeChange(event.target.value)} placeholder="如需验证请输入" inputMode="numeric" /></label>
      <button type="button" className="secondary-flow-button" disabled={!session || sendingCode} onClick={onSendCode}>{sendingCode ? "发送中…" : "发送验证码"}</button>
      <label>2FA 验证码<input value={totpCode} onChange={(event) => onTotpCodeChange(event.target.value)} placeholder="未绑定可留空" inputMode="numeric" /></label>
    </div>
    <button className="primary-flow-button" type="button" disabled={!session || submitting} onClick={onSubmit}>{submitting ? "提交中…" : "提交提币"}</button>
  </div>;
}
