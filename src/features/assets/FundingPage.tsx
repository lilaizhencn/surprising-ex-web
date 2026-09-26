import { ArrowDownUp, Copy, Info, ShieldCheck } from "lucide-react"
import QRCode from "qrcode"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  createDepositAddress,
  createTransfer,
  createWithdrawal,
  issueSecurityChallenge,
  loadAssetScales,
  loadBalances,
  loadDepositHistory,
  loadTransferHistory,
  loadWalletChains,
  loadWithdrawalHistory,
} from "../../api/endpoints"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { decimalToUnits, isPositiveDecimal, unitsToDecimal } from "../../lib/units"
import { useSession } from "../../state/session"
import type { ProductLine } from "../../types/domain"
import { PRODUCT_LINES } from "../../types/domain"

type RecordRow = Readonly<Record<string, unknown>>
type RequestState = "idle" | "loading" | "success" | "error"

export function FundingPage({ mode }: { readonly mode: "deposit" | "withdraw" | "transfer" }) {
  const session = useSession()
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
  const [transferRecords, setTransferRecords] = useState<readonly RecordRow[]>([])
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [depositAddress, setDepositAddress] = useState<RecordRow | null>(null)
  const [depositQr, setDepositQr] = useState("")
  const [state, setState] = useState<RequestState>("idle")
  const [message, setMessage] = useState("")
  const [challengeLoading, setChallengeLoading] = useState(false)
  const [challengeMessage, setChallengeMessage] = useState("")

  useEffect(() => {
    if (!session) return
    void Promise.all([
      loadWalletChains(),
      loadFundingBalances(),
      mode === "deposit"
        ? loadDepositHistory(asset)
        : mode === "withdraw"
          ? loadWithdrawalHistory(asset)
          : Promise.resolve([] as readonly RecordRow[]),
      mode === "transfer"
        ? loadAllTransferHistory(asset)
        : Promise.resolve([] as readonly RecordRow[]),
      loadAssetScales(),
    ])
      .then(([chainRows, balanceRows, recordRows, transferRows, scales]) => {
        setChains(chainRows)
        setBalances(balanceRows)
        setRecords(recordRows)
        setTransferRecords(transferRows)
        setAssetScales(scales)
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
    const free = text(balance, "free")
    if (free) return free
    const availableUnits = valueAt(balance, "availableUnits")
    const scale = assetScales[asset]
    return (typeof availableUnits === "string" || typeof availableUnits === "number") && scale
      ? unitsToDecimal(availableUnits, scale)
      : ""
  }, [asset, assetScales, balances])

  const submit = async () => {
    if (!session) {
      setState("error")
      setMessage(t("Please sign in before funding operations."))
      return
    }
    if (mode === "deposit") {
      if (!network) {
        setState("error")
        setMessage(t("Select a deposit network."))
        return
      }
      setState("loading")
      try {
        const response = await createDepositAddress(network)
        setDepositAddress(response)
        setState("success")
        setMessage(t("Deposit address received. Verify the network before using it."))
      } catch (reason: unknown) {
        setState("error")
        setMessage(readError(reason))
      }
      return
    }
    if (mode === "withdraw") {
      if (!network || !address.trim() || !isPositiveDecimal(amount)) {
        setState("error")
        setMessage(t("Enter a network, address and valid amount."))
        return
      }
      if (!emailCode.trim() || !totpCode.trim()) {
        setState("error")
        setMessage(t("Withdrawals require email and authenticator codes."))
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
        const accepted = requestStatusAccepted(response.status)
        setState(accepted ? "success" : "error")
        setMessage(
          accepted
            ? `${t("Withdrawal request accepted")}: ${response.status}`
            : `${t("Withdrawal not confirmed")}: ${response.status}`,
        )
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
    if (!isPositiveDecimal(amount) || source === target) {
      setState("error")
      setMessage(
        source === target
          ? t("Source and destination accounts must differ.")
          : t("Enter a valid transfer amount."),
      )
      return
    }
    setState("loading")
    try {
      const key = `transfer-${crypto.randomUUID()}`
      const scale = assetScales[asset]
      if (!scale) throw new Error(t("Asset precision is unavailable. Transfer not submitted."))
      const response = await createTransfer(
        source,
        target,
        asset,
        decimalToUnits(amount, scale),
        key,
        emailCode.trim(),
        totpCode.trim(),
      )
      const accepted = requestStatusAccepted(response.status)
      setState(accepted ? "success" : "error")
      setMessage(
        accepted
          ? `${t("Transfer request accepted")}: ${response.status}`
          : `${t("Transfer not confirmed")}: ${response.status}`,
      )
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
        description={t("Sign in to access custody and account funding services.")}
      >
        <Panel>
          <StateView
            kind="error"
            message="Sign in to continue. Funding operations never use demo success states."
          />
          <a className="route-link" href="/auth/login">
            {" "}
            {t("Go to login")}{" "}
          </a>
        </Panel>
      </FundingLayout>
    )

  if (mode === "deposit")
    return (
      <FundingLayout
        title={t("Deposit Crypto")}
        description={t("Receive digital assets through a network returned by the custody service.")}
      >
        <Panel>
          <h2>{t("1. Select asset & network")}</h2>
          <div className="grid-2">
            <Field label={t("Asset")}>
              <DropdownSelect value={asset} onChange={(event) => setAsset(event.target.value)}>
                <option>BTC</option>
                <option>ETH</option>
                <option>USDT</option>
              </DropdownSelect>
            </Field>
            <Field label={t("Network")}>
              <DropdownSelect value={network} onChange={(event) => setNetwork(event.target.value)}>
                <option value="">{t("Select network")}</option>
                {chains.map((chain) => (
                  <option key={chainName(chain)} value={chainName(chain)}>
                    {chainName(chain)}
                  </option>
                ))}
              </DropdownSelect>
            </Field>
          </div>
        </Panel>
        <Panel>
          <h2>{t("2. Deposit details")}</h2>
          {depositAddress ? (
            <div className="deposit-address">
              {depositQr ? (
                <img className="qr-code" src={depositQr} alt="Deposit address QR code" />
              ) : (
                <div className="qr-placeholder" role="status">
                  {" "}
                  {t("Generating QR code…")}{" "}
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
                  aria-label={t("Copy deposit address")}
                  onClick={() =>
                    void copyText(
                      text(depositAddress, "address") || text(depositAddress, "depositAddress"),
                    )
                  }
                >
                  <Copy size={16} />
                </button>
                <small>
                  {" "}
                  {t("Network:")} {network} {t("· Memo/Tag:")}{" "}
                  {text(depositAddress, "memo") || text(depositAddress, "tag") || "Not required"}
                </small>
              </div>
            </div>
          ) : (
            <StateView kind="empty" message="Select a network, then load a custody address." />
          )}
          <div className="notice">
            <Info size={18} /> {t("Only send")} {asset}{" "}
            {t("through the selected network. Network mismatches can permanently lose funds.")}{" "}
          </div>
        </Panel>
        <RecordPanel title={t("Deposit history")} records={records} />
        <ActionSummary
          title={t("Deposit status")}
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
        title={t("Withdraw Crypto")}
        description={t("Submit a verified withdrawal request to the custody service.")}
      >
        <Panel>
          <h2>{t("1. Transfer details")}</h2>
          <div className="grid-2">
            <Field label={t("Asset")}>
              <DropdownSelect value={asset} onChange={(event) => setAsset(event.target.value)}>
                <option>BTC</option>
                <option>ETH</option>
                <option>USDT</option>
              </DropdownSelect>
            </Field>
            <Field label={t("Network")}>
              <DropdownSelect value={network} onChange={(event) => setNetwork(event.target.value)}>
                <option value="">{t("Select network")}</option>
                {chains.map((chain) => (
                  <option key={chainName(chain)} value={chainName(chain)}>
                    {chainName(chain)}
                  </option>
                ))}
              </DropdownSelect>
            </Field>
          </div>
          <Field label={t("Recipient address")}>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={t("Enter or paste wallet address")}
              aria-label={t("Recipient wallet address")}
            />
          </Field>
        </Panel>
        <Panel>
          <div className="row-between">
            <h2>{t("2. Withdrawal amount")}</h2>
            <span className="muted">
              {" "}
              {t("Available:")} {available || "—"} {asset}
            </span>
          </div>
          <div className="number-input">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              aria-label={t("Withdrawal amount")}
            />
            <span>{asset}</span>
          </div>
          <p className="muted">
            {" "}
            {t("Fees, minimums, limits, KYC and risk approval are enforced by the backend.")}{" "}
          </p>
        </Panel>
        <Panel>
          <h2>{t("3. Security verification")}</h2>
          <div className="grid-2">
            <Field label={t("Email code")}>
              <input
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label={t("Authenticator code")}>
              <input
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="inline-form">
            <Button
              tone="ghost"
              loading={challengeLoading}
              onClick={() => void sendChallenge("WITHDRAWAL")}
            >
              {" "}
              {t("Send email code")}{" "}
            </Button>
            {challengeMessage ? <small>{challengeMessage}</small> : null}
          </div>
        </Panel>
        <RecordPanel title={t("Withdrawal history")} records={records} />
        <ActionSummary
          title={t("Summary")}
          message={message}
          state={state}
          onSubmit={submit}
          action="Submit withdrawal"
        />
      </FundingLayout>
    )

  return (
    <FundingLayout
      title={t("Internal Transfer")}
      description={t("Move funds between product accounts with an idempotent request.")}
    >
      <Panel>
        <h2>{t("Transfer accounts")}</h2>
        <div className="grid-2">
          <Field label={t("From")}>
            <DropdownSelect value={source} onChange={(event) => setSource(event.target.value)}>
              <option>{t("FUNDING")}</option>
              <option>{t("SPOT")}</option>
              <option>{t("USDT_PERPETUAL")}</option>
              <option>{t("COIN_PERPETUAL")}</option>
              <option>{t("USDT_DELIVERY")}</option>
              <option>{t("COIN_DELIVERY")}</option>
              <option>{t("OPTION")}</option>
            </DropdownSelect>
          </Field>
          <Field label={t("To")}>
            <DropdownSelect value={target} onChange={(event) => setTarget(event.target.value)}>
              <option>{t("SPOT")}</option>
              <option>{t("FUNDING")}</option>
              <option>{t("USDT_PERPETUAL")}</option>
              <option>{t("COIN_PERPETUAL")}</option>
              <option>{t("USDT_DELIVERY")}</option>
              <option>{t("COIN_DELIVERY")}</option>
              <option>{t("OPTION")}</option>
            </DropdownSelect>
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
          <ArrowDownUp size={18} /> {t("Swap accounts")}{" "}
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
      <Panel>
        <h2>{t("Security verification")}</h2>
        <p className="muted">
          {t("Large transfers may require an email code and authenticator code.")}
        </p>
        <div className="grid-2">
          <Field label={t("Email code")}>
            <input
              value={emailCode}
              onChange={(event) => setEmailCode(event.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label={t("Authenticator code")}>
            <input
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value)}
              inputMode="numeric"
            />
          </Field>
        </div>
        <div className="inline-form">
          <Button
            tone="ghost"
            loading={challengeLoading}
            onClick={() => void sendChallenge("LARGE_TRANSFER")}
          >
            {" "}
            {t("Send email code")}{" "}
          </Button>
          {challengeMessage ? <small>{challengeMessage}</small> : null}
        </div>
      </Panel>
      <ActionSummary
        title={t("Transfer status")}
        message={message}
        state={state}
        onSubmit={submit}
        action="Confirm transfer"
      />
      <RecordPanel title={t("Transfer history")} records={transferRecords} />
    </FundingLayout>
  )

  function sendChallenge(sceneCode: "WITHDRAWAL" | "LARGE_TRANSFER") {
    setChallengeLoading(true)
    setChallengeMessage("")
    return issueSecurityChallenge(sceneCode)
      .then(() =>
        setChallengeMessage(t("Verification code sent. Complete verification before it expires.")),
      )
      .catch((reason: unknown) => setChallengeMessage(readError(reason)))
      .finally(() => setChallengeLoading(false))
  }
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
            <ShieldCheck size={20} /> {t("Security tips")}{" "}
          </h2>
          <ul>
            <li>{t("Verify the recipient and network before confirming.")}</li>
            <li>{t("High-risk operations require backend security checks.")}</li>
            <li>{t("Unknown results must be confirmed before retrying.")}</li>
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
        <span className="muted">{t("Backend records")}</span>
      </div>
      {records.length === 0 ? (
        <StateView kind="empty" message="No records returned by the custody service." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t("Asset")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Status")}</th>
                <th>{t("Created")}</th>
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
        <p className="muted">{t("No request submitted.")}</p>
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
  return reason instanceof Error
    ? reason.message
    : t("Funding service unavailable. Please retry later.")
}

function valueAt(record: RecordRow | null | undefined, key: string): unknown {
  return record === null || record === undefined ? undefined : Reflect.get(record, key)
}

function requestStatusAccepted(status: string): boolean {
  return [
    "PENDING",
    "PENDING_APPROVAL",
    "PROCESSING",
    "DEBIT_UNKNOWN",
    "DEBITED",
    "SUBMITTED",
    "BROADCAST_UNKNOWN",
    "SOURCE_DEBITED",
    "TARGET_CREDIT_UNKNOWN",
    "COMPLETED",
  ].includes(status.trim().toUpperCase())
}

async function copyText(value: string) {
  if (value && navigator.clipboard) await navigator.clipboard.writeText(value)
}

async function loadFundingBalances(): Promise<readonly RecordRow[]> {
  return loadBalances(PRODUCT_LINES.spot, "FUNDING")
}

async function loadAllTransferHistory(asset: string): Promise<readonly RecordRow[]> {
  const productLines: readonly ProductLine[] = [
    PRODUCT_LINES.spot,
    PRODUCT_LINES.usdMPerpetual,
    PRODUCT_LINES.coinMPerpetual,
    PRODUCT_LINES.usdMDelivery,
    PRODUCT_LINES.coinMDelivery,
    PRODUCT_LINES.option,
  ]
  const rows = await Promise.all(productLines.map((line) => loadTransferHistory(line, asset)))
  return rows.flat()
}
