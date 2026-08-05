import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { issueSecurityChallenge } from "../api/surprising";
import { createWalletAddress, loadWalletChains, loadWalletDeposits, loadWalletWithdrawals, submitWalletWithdrawal, type WalletAddress, type WalletChain, type WalletFundingRecord } from "../api/wallet";
import type { AuthSession, Balance } from "../types";
import { AssetIcon, AssetTabs, SupportBubble } from "./AssetPrimitives";
import { FundingDetails } from "./FundingFlowDetails";
import { FundingRecords, FundingStep, FaqCard, InfoPair, WalletError, copyValue } from "./FundingFlowParts";
import { chainKeyFor, chainLabel, chainSymbol, chainsForAsset, fundingAssetOptions, minimumAmount, networkEta } from "./funding";

export function FundingFlowPage({
  mode,
  language,
  balances,
  session,
  onBack,
  onShowAsset,
  onFundingBalanceRefresh,
  onHelp
}: {
  mode: "deposit" | "withdraw";
  language: "zh-CN" | "en-US";
  balances: Balance[];
  session: AuthSession | null;
  onBack: () => void;
  onShowAsset: () => void;
  onFundingBalanceRefresh: () => void;
  onHelp: () => void;
}) {
  const text = (zh: string, en: string) => language === "en-US" ? en : zh;
  const [chains, setChains] = useState<WalletChain[]>([]);
  const [asset, setAsset] = useState("");
  const [chainKey, setChainKey] = useState("");
  const [openPicker, setOpenPicker] = useState<"asset" | "network" | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [address, setAddress] = useState<WalletAddress | null>(null);
  const [records, setRecords] = useState<WalletFundingRecord[]>([]);
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loadingChains, setLoadingChains] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [recordsRefresh, setRecordsRefresh] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [idempotencyKeyPersisted, setIdempotencyKeyPersisted] = useState(true);

  const title = mode === "deposit" ? text("充币", "Deposit") : text("提币", "Withdraw");
  const assetOptions = useMemo(() => fundingAssetOptions(balances, chains), [balances, chains]);
  const networkOptions = useMemo(
    () => chainsForAsset(chains, asset, mode === "withdraw"),
    [asset, chains, mode]
  );
  const selectedChain = networkOptions.find((chain) => chainKeyFor(chain) === chainKey) ?? null;
  const withdrawalDraftStorageKey = useMemo(() => {
    if (mode !== "withdraw" || !session) return "";
    return `surprising-ex.withdrawal-idempotency.${session.user.userId}.${draftFingerprint({
      asset,
      chainKey,
      toAddress: toAddress.trim(),
      amount: amount.trim()
    })}`;
  }, [amount, asset, chainKey, mode, session?.user.userId, toAddress]);

  useEffect(() => {
    if (!withdrawalDraftStorageKey) return;
    const storedKey = readStoredWithdrawalKey(withdrawalDraftStorageKey) ?? crypto.randomUUID();
    setIdempotencyKey(storedKey);
    setIdempotencyKeyPersisted(writeStoredWithdrawalKey(withdrawalDraftStorageKey, storedKey));
  }, [withdrawalDraftStorageKey]);

  useEffect(() => {
    if (!session) {
      setChains([]);
      setLoadingChains(false);
      setError("");
      return;
    }
    let cancelled = false;
    setLoadingChains(true);
    setError("");
    void loadWalletChains(session).then((nextChains) => {
      if (!cancelled) setChains(nextChains);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : text("钱包网络配置暂不可用", "Wallet network configuration is unavailable"));
    }).finally(() => {
      if (!cancelled) setLoadingChains(false);
    });
    return () => { cancelled = true; };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!assetOptions.some((item) => item.asset === asset)) setAsset("");
  }, [asset, assetOptions]);

  useEffect(() => {
    const first = networkOptions[0];
    if (!networkOptions.some((chain) => chainKeyFor(chain) === chainKey)) {
      setChainKey(first ? chainKeyFor(first) : "");
      setShowDetails(false);
      setAddress(null);
    }
  }, [chainKey, networkOptions]);

  useEffect(() => {
    if (!session || !asset || !selectedChain) {
      setRecords([]);
      setLoadingRecords(false);
      return;
    }
    let cancelled = false;
    setLoadingRecords(true);
    const loader = mode === "deposit" ? loadWalletDeposits : loadWalletWithdrawals;
    void loader(session, selectedChain.chain, asset).then((nextRecords) => {
      if (!cancelled) setRecords(nextRecords);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : text("钱包记录暂不可用", "Wallet records are unavailable"));
    }).finally(() => {
      if (!cancelled) setLoadingRecords(false);
    });
    return () => { cancelled = true; };
  }, [asset, mode, recordsRefresh, selectedChain?.chain, selectedChain?.network, session?.accessToken]);

  function selectAsset(nextAsset: string) {
    setAsset(nextAsset);
    setChainKey("");
    setAddress(null);
    setShowDetails(false);
    setOpenPicker("network");
  }

  function selectChain(nextChain: WalletChain) {
    setChainKey(chainKeyFor(nextChain));
    setAddress(null);
    setShowDetails(false);
    setOpenPicker(null);
  }

  async function continueFlow() {
    if (!session) {
      setError(text("请先登录后使用资金账户", "Log in to use the funding account"));
      return;
    }
    if (!selectedChain || !asset) {
      setError(text("请选择币种和钱包网络", "Select an asset and wallet network"));
      return;
    }
    setError("");
    setNotice("");
    setLoadingDetails(true);
    try {
      if (mode === "deposit") setAddress(await createWalletAddress(session, selectedChain));
      setShowDetails(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : text("钱包地址暂不可用", "Wallet address is unavailable"));
    } finally {
      setLoadingDetails(false);
    }
  }

  async function sendWithdrawalCode() {
    if (!session) return;
    setSendingCode(true);
    setError("");
    try {
      const challenge = await issueSecurityChallenge(session, "WITHDRAWAL");
      setNotice(`${text("验证码已发送至", "A code was sent to")} ${challenge.destination}，${text("有效期至", "expires at")} ${new Date(challenge.expiresAt).toLocaleTimeString(language === "en-US" ? "en-US" : "zh-CN", { hour12: false })}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : text("验证码发送失败", "Failed to send code"));
    } finally {
      setSendingCode(false);
    }
  }

  async function submitWithdrawal() {
    if (!session || !selectedChain || !asset) return;
    if (!idempotencyKeyPersisted) {
      setError(text("当前浏览器无法保存提现幂等凭证，请启用本地存储后重试", "This browser cannot save the withdrawal idempotency key. Enable local storage and retry."));
      return;
    }
    if (!toAddress.trim() || !amount.trim()) {
      setError(text("请输入提币地址和数量", "Enter a withdrawal address and amount"));
      return;
    }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await submitWalletWithdrawal(session, {
        chain: selectedChain,
        assetSymbol: asset,
        toAddress,
        amount,
        externalReference: `web-withdrawal:${idempotencyKey}`,
        idempotencyKey,
        emailCode,
        totpCode
      });
      setNotice(`${text("提币请求已受理", "Withdrawal request accepted")}: ${response.status}`);
      setRecordsRefresh((value) => value + 1);
      const rotatedKey = rotateWithdrawalKey(withdrawalDraftStorageKey);
      setIdempotencyKey(rotatedKey.key);
      setIdempotencyKeyPersisted(rotatedKey.persisted);
      onFundingBalanceRefresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : text("提币请求失败", "Withdrawal request failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="funding-page">
    <AssetTabs active={text("资金账户", "Funding")} language={language} />
    <div className="funding-layout">
      <div className="funding-main">
        <button className="funding-back" type="button" onClick={onBack}>{text("资产总览", "Overview")}</button>
        <h1>{title}</h1>
        {!session && <WalletError message={mode === "deposit" ? text("登录后才能生成真实钱包地址。", "Log in to generate a real deposit address.") : text("登录后才能提交提币。", "Log in to submit a withdrawal.")} />}
        <WalletError message={error} />
        {notice && <p className="funding-notice" role="status">{notice}</p>}
        <div className={showDetails ? "funding-steps completed" : "funding-steps"}>
          <FundingStep index={1} done={Boolean(asset)} active={openPicker === "asset"} label={text("选择币种", "Select asset")}>
            <button className="funding-select" type="button" disabled={!session || loadingChains} onClick={() => setOpenPicker(openPicker === "asset" ? null : "asset")}>
              {asset ? <AssetIcon symbol={asset} /> : <span className="asset-icon asset-placeholder">?</span>}
              <span>{loadingChains ? text("同步支持资产…", "Syncing supported assets…") : asset || text("请选择币种", "Select an asset")}</span><ChevronDown size={16} />
            </button>
            {openPicker === "asset" && <div className="funding-picker">
              {assetOptions.map((item) => <button className={item.asset === asset ? "active" : ""} type="button" key={item.asset} onClick={() => selectAsset(item.asset)}>
                <AssetIcon symbol={item.asset} /><span>{item.asset}</span><small>{item.name}</small>
              </button>)}
            </div>}
          </FundingStep>

          <FundingStep index={2} done={Boolean(selectedChain)} active={openPicker === "network"} label={text("选择网络", "Select network")}>
            <button className="funding-select" type="button" disabled={!asset} onClick={() => asset && setOpenPicker(openPicker === "network" ? null : "network")}>
              {selectedChain ? <AssetIcon symbol={chainSymbol(selectedChain)} /> : <span className="asset-icon asset-placeholder">?</span>}
              <span>{selectedChain ? chainLabel(selectedChain, asset) : text("请先选择币种", "Select an asset first")}</span><ChevronDown size={16} />
            </button>
            {openPicker === "network" && <div className="funding-picker network-picker">
              {networkOptions.map((chain) => <button className={chainKeyFor(chain) === chainKey ? "active" : ""} type="button" key={chainKeyFor(chain)} onClick={() => selectChain(chain)}>
                <AssetIcon symbol={chainSymbol(chain)} /><span>{chainLabel(chain, asset)}</span><small>{networkEta(chain, language)} · {text("最低", "Minimum")} {minimumAmount(asset, chain)}</small>
              </button>)}
            </div>}
          </FundingStep>

          <FundingStep index={3} active={showDetails} label={`${title} ${text("详情", "details")}`}>
            {showDetails && selectedChain ? <FundingDetails
              mode={mode}
              language={language}
              asset={asset}
              chain={selectedChain}
              address={address}
              toAddress={toAddress}
              amount={amount}
              emailCode={emailCode}
              totpCode={totpCode}
              sendingCode={sendingCode}
              submitting={submitting}
              session={session}
              onCopyAddress={() => address && copyValue(address.address)}
              onToAddressChange={setToAddress}
              onAmountChange={setAmount}
              onEmailCodeChange={setEmailCode}
              onTotpCodeChange={setTotpCode}
              onSendCode={() => void sendWithdrawalCode()}
              onSubmit={() => void submitWithdrawal()}
            /> : <button className="primary-flow-button" type="button" disabled={!session || !asset || !selectedChain || loadingDetails} onClick={() => void continueFlow()}>
              {loadingDetails ? text("连接钱包…", "Connecting wallet…") : text("继续", "Continue")}
            </button>}
          </FundingStep>
        </div>

        {showDetails && selectedChain && <div className="funding-info-grid">
          <InfoPair label={`${text("最低", "Minimum ")}${title}${text("金额", " amount")}`} value={minimumAmount(asset, selectedChain)} />
          <InfoPair label={`${title}${text("账户", " account")}`} value={text("资金账户 / Spot", "Funding / Spot")} />
          <InfoPair label={`${title}${text("到账时间", " ETA")}`} value={networkEta(selectedChain, language)} />
          <InfoPair label={mode === "deposit" ? text("入账规则", "Credit rule") : text("手续费", "Fee")} value={mode === "deposit" ? text("确认后自动入现货账户", "Credited to Spot after confirmations") : text("按钱包与风控配置计算", "Calculated by wallet and risk controls")} />
          <InfoPair label={text("网络状态", "Network status")} value={selectedChain.status} />
        </div>}
        <FundingRecords language={language} asset={asset || null} mode={mode} records={records} loading={loadingRecords} onShowAsset={onShowAsset} onRefresh={() => setRecordsRefresh((value) => value + 1)} />
      </div>
      <FaqCard language={language} title={text("常见问题", "FAQ")} />
    </div>
    <SupportBubble language={language} onOpen={onHelp} />
  </section>;
}

function draftFingerprint(value: { asset: string; chainKey: string; toAddress: string; amount: string }): string {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function readStoredWithdrawalKey(storageKey: string): string | null {
  try {
    const sessionKey = sessionStorage.getItem(storageKey);
    if (sessionKey) return sessionKey;
  } catch {
  }
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeStoredWithdrawalKey(storageKey: string, value: string): boolean {
  try {
    sessionStorage.setItem(storageKey, value);
    return true;
  } catch {
    try {
      localStorage.setItem(storageKey, value);
      return true;
    } catch {
      return false;
    }
  }
}

function rotateWithdrawalKey(storageKey: string): { key: string; persisted: boolean } {
  const nextKey = crypto.randomUUID();
  return { key: nextKey, persisted: storageKey ? writeStoredWithdrawalKey(storageKey, nextKey) : false };
}
