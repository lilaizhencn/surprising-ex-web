import { ArrowDownUp, Copy, Info, ShieldCheck } from "lucide-react"
import QRCode from "qrcode"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  createDepositAddress,
  createTransfer,
  createWithdrawal,
  loadBalances,
  loadDepositHistory,
  loadWalletChains,
  loadWithdrawalHistory,
} from "../../api/endpoints"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { loadSession } from "../../state/session"

type RecordRow = Readonly<Record<string, unknown>>
type RequestState = "idle" | "loading" | "success" | "error"

export function FundingPage({ mode }: { readonly mode: "deposit" | "withdraw" | "transfer" }) {
  const session = loadSession()
  const [asset, setAsset] = useState("BTC")
  const [network, setNetwork] = useState("")
  const [address, setAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [source, setSource] = useState("FUNDING")
  const [target, setTarget] = useState("SPOT")
  const [chains, setChains] = useState<readonly RecordRow[]>([])
  const [balances, setBalances] = useState<readonly RecordRow[]>([])
  const [records, setRecords] = useState<readonly RecordRow[]>([])
  const [depositAddress, setDepositAddress] = useState<RecordRow | null>(null)
  const [depositQr, setDepositQr] = useState("")
  const [state, setState] = useState<RequestState>("idle")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!session) return
    void Promise.all([
      loadWalletChains(),
      loadBalances(),
      mode === "deposit" ? loadDepositHistory(asset) : loadWithdrawalHistory(asset),
    ])
      .then(([chainRows, balanceRows, recordRows]) => {
        setChains(chainRows)
        setBalances(balanceRows)
        setRecords(recordRows)
        setNetwork((current) => current || chainName(chainRows[0]) || "")
      })
      .catch((reason: unknown) => setMessage(readError(reason)))
  }, [asset, mode, session])

  useEffect(() => {
    const value = depositAddress
      ? text(depositAddress, "address") || text(depositAddress, "depositAddress")
      : ""
    if (!value) {
      setDepositQr("")
      return
    }
    let active = true
    const rootStyles = getComputedStyle(document.documentElement)
    const darkColor = rootStyles.getPropertyValue("--color-ink").trim()
    const lightColor = rootStyles.getPropertyValue("--color-surface").trim()
    void QRCode.toDataURL(value, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: darkColor, light: lightColor },
    }).then((dataUrl) => {
      if (active) setDepositQr(dataUrl)
    })
    return () => {
      active = false
    }
  }, [depositAddress])

  const available = useMemo(() => {
    const balance = balances.find((row) => text(row, "asset").toUpperCase() === asset)
    return text(balance, "available") || text(balance, "availableUnits") || text(balance, "free")
  }, [asset, balances])

  const submit = async () => {
    if (!session) {
      setState("error")
      setMessage("请先登录后再进行资金操作。")
      return
    }
    if (mode === "deposit") {
      if (!network) {
        setState("error")
        setMessage("请选择充值网络。")
        return
      }
      setState("loading")
      try {
        const response = await createDepositAddress(network)
        setDepositAddress(response)
        setState("success")
        setMessage("充值地址已由托管钱包服务返回，请核对网络后使用。")
      } catch (reason: unknown) {
        setState("error")
        setMessage(readError(reason))
      }
      return
    }
    if (mode === "withdraw") {
      if (!network || !address.trim() || !amount || Number(amount) <= 0) {
        setState("error")
        setMessage("请完整填写网络、地址和有效数量。")
        return
      }
      if (!emailCode.trim() || !totpCode.trim()) {
        setState("error")
        setMessage("提现需要邮箱验证码和 TOTP 验证码。")
        return
      }
      setState("loading")
      try {
        const reference = `withdraw-${crypto.randomUUID()}`
        const response = await createWithdrawal(
          network,
          asset,
          address.trim(),
          amount,
          reference,
          emailCode.trim(),
          totpCode.trim(),
        )
        setState("success")
        setMessage(`提现请求已受理，状态：${response.status}。`)
        setAddress("")
        setAmount("")
        setEmailCode("")
        setTotpCode("")
      } catch (reason: unknown) {
        setState("error")
        setMessage(readError(reason))
      }
      return
    }
    if (!amount || Number(amount) <= 0 || source === target) {
      setState("error")
      setMessage(source === target ? "来源和目标账户不能相同。" : "请输入有效划转数量。")
      return
    }
    setState("loading")
    try {
      const key = `transfer-${crypto.randomUUID()}`
      const response = await createTransfer(
        source,
        target,
        asset,
        Math.round(Number(amount) * 100_000_000),
        key,
      )
      setState("success")
      setMessage(`划转请求已受理，状态：${response.status}。`)
      setAmount("")
    } catch (reason: unknown) {
      setState("error")
      setMessage(readError(reason))
    }
  }

  if (!session)
    return (
      <FundingLayout
        title={titleFor(mode)}
        description="Sign in to access custody and account funding services."
      >
        <Panel>
          <StateView
            kind="error"
            message="Sign in to continue. Funding operations never use demo success states."
          />
          <a className="route-link" href="/auth/login">
            Go to login
          </a>
        </Panel>
      </FundingLayout>
    )

  if (mode === "deposit")
    return (
      <FundingLayout
        title="Deposit Crypto"
        description="Receive digital assets through a network returned by the custody service."
      >
        <Panel>
          <h2>1. Select asset & network</h2>
          <div className="grid-2">
            <Field label="Asset">
              <select value={asset} onChange={(event) => setAsset(event.target.value)}>
                <option>BTC</option>
                <option>ETH</option>
                <option>USDT</option>
              </select>
            </Field>
            <Field label="Network">
              <select value={network} onChange={(event) => setNetwork(event.target.value)}>
                <option value="">Select network</option>
                {chains.map((chain) => (
                  <option key={chainName(chain)} value={chainName(chain)}>
                    {chainName(chain)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>
        <Panel>
          <h2>2. Deposit details</h2>
          {depositAddress ? (
            <div className="deposit-address">
              {depositQr ? (
                <img className="qr-code" src={depositQr} alt="Deposit address QR code" />
              ) : (
                <div className="qr-placeholder" role="status">
                  Generating QR code…
                </div>
              )}
              <div className="address-value">
                <strong>
                  {text(depositAddress, "address") ||
                    text(depositAddress, "depositAddress") ||
                    "Address returned without display field"}
                </strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Copy deposit address"
                  onClick={() =>
                    void copyText(
                      text(depositAddress, "address") || text(depositAddress, "depositAddress"),
                    )
                  }
                >
                  <Copy size={16} />
                </button>
                <small>
                  Network: {network} · Memo/Tag:{" "}
                  {text(depositAddress, "memo") || text(depositAddress, "tag") || "Not required"}
                </small>
              </div>
            </div>
          ) : (
            <StateView kind="empty" message="Select a network, then load a custody address." />
          )}
          <div className="notice">
            <Info size={18} /> Only send {asset} through the selected network. Network mismatches
            can permanently lose funds.
          </div>
        </Panel>
        <RecordPanel title="Deposit history" records={records} />
        <ActionSummary
          title="Deposit status"
          message={message}
          state={state}
          onSubmit={submit}
          action="Load deposit address"
        />
      </FundingLayout>
    )

  if (mode === "withdraw")
    return (
      <FundingLayout
        title="Withdraw Crypto"
        description="Submit a verified withdrawal request to the custody service."
      >
        <Panel>
          <h2>1. Transfer details</h2>
          <div className="grid-2">
            <Field label="Asset">
              <select value={asset} onChange={(event) => setAsset(event.target.value)}>
                <option>BTC</option>
                <option>ETH</option>
                <option>USDT</option>
              </select>
            </Field>
            <Field label="Network">
              <select value={network} onChange={(event) => setNetwork(event.target.value)}>
                <option value="">Select network</option>
                {chains.map((chain) => (
                  <option key={chainName(chain)} value={chainName(chain)}>
                    {chainName(chain)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Recipient address">
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Enter or paste wallet address"
              aria-label="Recipient wallet address"
            />
          </Field>
        </Panel>
        <Panel>
          <div className="row-between">
            <h2>2. Withdrawal amount</h2>
            <span className="muted">
              Available: {available || "—"} {asset}
            </span>
          </div>
          <div className="number-input">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              aria-label="Withdrawal amount"
            />
            <span>{asset}</span>
          </div>
          <p className="muted">
            Fees, minimums, limits, KYC and risk approval are enforced by the backend.
          </p>
        </Panel>
        <Panel>
          <h2>3. Security verification</h2>
          <div className="grid-2">
            <Field label="Email code">
              <input
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Authenticator code">
              <input
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
        </Panel>
        <RecordPanel title="Withdrawal history" records={records} />
        <ActionSummary
          title="Summary"
          message={message}
          state={state}
          onSubmit={submit}
          action="Submit withdrawal"
        />
      </FundingLayout>
    )

  return (
    <FundingLayout
      title="Internal Transfer"
      description="Move funds between product accounts with an idempotent request."
    >
      <Panel>
        <h2>Transfer accounts</h2>
        <div className="grid-2">
          <Field label="From">
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option>FUNDING</option>
              <option>SPOT</option>
              <option>USDT_PERPETUAL</option>
              <option>COIN_PERPETUAL</option>
              <option>USDT_DELIVERY</option>
              <option>COIN_DELIVERY</option>
              <option>OPTION</option>
            </select>
          </Field>
          <Field label="To">
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option>SPOT</option>
              <option>FUNDING</option>
              <option>USDT_PERPETUAL</option>
              <option>COIN_PERPETUAL</option>
              <option>USDT_DELIVERY</option>
              <option>COIN_DELIVERY</option>
              <option>OPTION</option>
            </select>
          </Field>
        </div>
        <button
          type="button"
          className="swap-button"
          onClick={() => {
            const current = source
            setSource(target)
            setTarget(current)
          }}
        >
          <ArrowDownUp size={18} /> Swap accounts
        </button>
        <Field label={`Amount (${asset})`}>
          <div className="number-input">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Transfer amount in ${asset}`}
            />
            <span>{asset}</span>
          </div>
        </Field>
      </Panel>
      <ActionSummary
        title="Transfer status"
        message={message}
        state={state}
        onSubmit={submit}
        action="Confirm transfer"
      />
    </FundingLayout>
  )
}

function FundingLayout({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly children: ReactNode
}) {
  return (
    <div className="container section funding-page">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <ShieldCheck size={28} color="var(--color-primary)" />
      </div>
      <div className="funding-layout">
        <div className="stack">{children}</div>
        <Panel className="security-tips">
          <h2>
            <ShieldCheck size={20} /> Security tips
          </h2>
          <ul>
            <li>Verify the recipient and network before confirming.</li>
            <li>High-risk operations require backend security checks.</li>
            <li>Unknown results must be confirmed before retrying.</li>
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function RecordPanel({
  title,
  records,
}: {
  readonly title: string
  readonly records: readonly RecordRow[]
}) {
  return (
    <Panel>
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="muted">Backend records</span>
      </div>
      {records.length === 0 ? (
        <StateView kind="empty" message="No records returned by the custody service." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={text(record, "id") || text(record, "withdrawalId") || String(index)}>
                  <td className="mono">
                    {text(record, "id") ||
                      text(record, "depositId") ||
                      text(record, "withdrawalId") ||
                      "—"}
                  </td>
                  <td>{text(record, "asset") || text(record, "assetSymbol") || "—"}</td>
                  <td className="mono">{text(record, "amount") || "—"}</td>
                  <td>{text(record, "status") || "—"}</td>
                  <td>{text(record, "createdAt") || text(record, "updatedAt") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function ActionSummary({
  title,
  message,
  state,
  onSubmit,
  action,
}: {
  readonly title: string
  readonly message: string
  readonly state: RequestState
  readonly onSubmit: () => void
  readonly action: string
}) {
  return (
    <Panel className="action-summary">
      <h2>{title}</h2>
      {message ? (
        <p className={state === "success" ? "positive" : "negative"} role="status">
          {message}
        </p>
      ) : (
        <p className="muted">No request submitted.</p>
      )}
      <Button loading={state === "loading"} onClick={() => void onSubmit()}>
        {action}
      </Button>
    </Panel>
  )
}

function titleFor(mode: "deposit" | "withdraw" | "transfer") {
  return mode === "deposit"
    ? "Deposit Crypto"
    : mode === "withdraw"
      ? "Withdraw Crypto"
      : "Internal Transfer"
}
function chainName(record: RecordRow | undefined): string {
  return text(record, "chain") || text(record, "chainId") || text(record, "name") || ""
}
function text(record: RecordRow | null | undefined, key: string): string {
  const value = record?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "资金服务暂不可用，请稍后重试。"
}
async function copyText(value: string) {
  if (value && navigator.clipboard) await navigator.clipboard.writeText(value)
}
