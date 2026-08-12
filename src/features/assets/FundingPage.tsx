import { ArrowDownUp, ChevronDown, Info, ShieldCheck } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import { createTransfer } from "../../api/endpoints"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { loadSession } from "../../state/session"

export function FundingPage({ mode }: { readonly mode: "deposit" | "withdraw" | "transfer" }) {
  const session = loadSession()
  const [asset, setAsset] = useState("BTC")
  const [network, setNetwork] = useState("Bitcoin")
  const [address, setAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [source, setSource] = useState("FUNDING")
  const [target, setTarget] = useState("SPOT")
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const submit = async () => {
    if (!session) {
      setState("error")
      setMessage("请先登录后再进行资金操作。")
      return
    }
    if (mode === "transfer") {
      if (!amount || Number(amount) <= 0) {
        setState("error")
        setMessage("请输入有效划转数量。")
        return
      }
      setState("loading")
      try {
        const key = `transfer-${Date.now()}`
        const response = await createTransfer(
          source,
          target,
          asset,
          Number(amount) * 100_000_000,
          key,
        )
        setState("success")
        setMessage(`划转请求已受理，状态：${String(response["status"] ?? "PENDING")}。`)
      } catch (reason: unknown) {
        setState("error")
        setMessage(reason instanceof Error ? reason.message : "划转失败，结果需要重新确认。")
      }
      return
    }
    setState("error")
    setMessage("钱包地址/提现规则的最终 DTO 尚未在当前 Gateway 合同中确认，页面不会伪造成功结果。")
  }
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
                <option>Bitcoin</option>
                <option>Ethereum</option>
                <option>TRON</option>
              </select>
            </Field>
          </div>
        </Panel>
        <Panel>
          <h2>2. Deposit details</h2>
          <StateView
            kind="empty"
            message="等待后端返回充值地址、Memo/Tag、最小充值量和确认次数。"
          />
          <div className="notice">
            <Info size={18} />
            不要向未确认的网络地址转入资金。
          </div>
        </Panel>
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
        description="Send digital assets to an external wallet or internal account."
      >
        <Panel>
          <h2>1. Select asset</h2>
          <Field label="Asset">
            <button type="button" className="select-control">
              <span>
                ₿ {asset}
                <small>Bitcoin</small>
              </span>
              <ChevronDown size={18} />
            </button>
          </Field>
        </Panel>
        <Panel>
          <h2>2. Transfer details</h2>
          <div className="segment-control">
            <button type="button" className="active">
              On-chain
            </button>
            <button type="button">Internal transfer</button>
          </div>
          <Field label="Network">
            <div className="network-grid">
              <button type="button" className="network-option active">
                Bitcoin<small>Fee: backend required</small>
              </button>
              <button type="button" className="network-option" disabled>
                BSC (BEP20)<small>Unavailable</small>
              </button>
            </div>
          </Field>
          <Field label="Recipient address">
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Enter or paste BTC address"
              aria-label="Recipient wallet address"
            />
          </Field>
        </Panel>
        <Panel>
          <div className="row-between">
            <h2>3. Withdrawal amount</h2>
            <span className="muted">Available: — {asset}</span>
          </div>
          <div className="number-input">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              aria-label="Withdrawal amount"
            />
            <span>{asset}</span>
          </div>
          <p className="muted">
            Minimum, fee, 24h limit and security verification are backend-controlled.
          </p>
        </Panel>
        <ActionSummary
          title="Summary"
          message={message}
          state={state}
          onSubmit={submit}
          action="Withdraw"
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
              <option>OPTION</option>
            </select>
          </Field>
          <Field label="To">
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option>SPOT</option>
              <option>FUNDING</option>
              <option>USDT_PERPETUAL</option>
              <option>COIN_PERPETUAL</option>
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

function ActionSummary({
  title,
  message,
  state,
  onSubmit,
  action,
}: {
  readonly title: string
  readonly message: string
  readonly state: "idle" | "loading" | "success" | "error"
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
      <Button
        loading={state === "loading"}
        disabled={state === "success"}
        onClick={() => void onSubmit()}
      >
        {action}
      </Button>
    </Panel>
  )
}
