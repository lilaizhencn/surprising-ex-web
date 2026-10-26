import { ArrowDownUp, ShieldCheck } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  createTransfer,
  createWithdrawal,
  issueSecurityChallenge,
  loadAssetScales,
  loadBalances,
  loadTransferHistory,
  loadWithdrawalHistory,
} from "../../api/endpoints"
import { type FundingAsset, loadFundingAssets } from "../../api/funding"
import { productLineLabels } from "../../components/layout/navigation"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { decimalToUnits, isPositiveDecimal, signedUnitsToDecimal } from "../../lib/units"
import { useSession } from "../../state/session"
import type { ProductLine } from "../../types/domain"
import { PRODUCT_LINES } from "../../types/domain"
import { productAccounts } from "./assetPortfolio"
import { DepositPage } from "./DepositPage"
import { FundingAssetSelect } from "./FundingAssetSelect"

type RecordRow = Readonly<Record<string, unknown>>
type RequestState = "idle" | "loading" | "success" | "error"

export function FundingPage({ mode }: { readonly mode: "deposit" | "withdraw" | "transfer" }) {
  return mode === "deposit" ? <DepositPage /> : <FundingForm mode={mode} />
}

function FundingForm({ mode }: { readonly mode: "withdraw" | "transfer" }) {
  const session = useSession()
  const [requestedAsset] = useState(
    () => new URLSearchParams(window.location.search).get("asset")?.toUpperCase() ?? "",
  )
  const [asset, setAsset] = useState(requestedAsset || "BTC")
  const [network, setNetwork] = useState("")
  const [address, setAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [source, setSource] = useState(() => {
    const value = new URLSearchParams(window.location.search).get("from") ?? "FUNDING"
    return transferAccounts.includes(value) ? value : "FUNDING"
  })
  const [target, setTarget] = useState(source === "FUNDING" ? "SPOT" : "FUNDING")
  const [chains, setChains] = useState<readonly RecordRow[]>([])
  const [balanceRead, setBalanceRead] = useState<{
    scope: string
    rows: readonly RecordRow[]
    error: string
    loading: boolean
  } | null>(null)
  const balanceScope = `${session?.user.userId ?? ""}:${mode === "transfer" ? source : "FUNDING"}`
  const balances = balanceRead?.scope === balanceScope ? balanceRead.rows : []
  const balanceLoading = balanceRead?.scope !== balanceScope || balanceRead.loading
  const balanceError = balanceRead?.scope === balanceScope ? balanceRead.error : ""
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState("")
  const [precisionError, setPrecisionError] = useState("")
  const submitting = useRef(false)
  const submission = useRef<{ signature: string; key: string } | null>(null)
  const [records, setRecords] = useState<readonly RecordRow[]>([])
  const [transferRecords, setTransferRecords] = useState<readonly RecordRow[]>([])
  const [assetScales, setAssetScales] = useState<Readonly<Record<string, string>>>({})
  const [fundingAssets, setFundingAssets] = useState<readonly FundingAsset[]>([])
  const [state, setState] = useState<RequestState>("idle")
  const [message, setMessage] = useState("")
  const [challengeLoading, setChallengeLoading] = useState(false)
  const [challengeMessage, setChallengeMessage] = useState("")

  useEffect(() => {
    if (!session) return
    const abort = new AbortController()
    const account = mode === "transfer" ? source : "FUNDING"
    const line =
      (Object.keys(productAccounts) as ProductLine[]).find(
        (line) => productAccounts[line] === account,
      ) ?? PRODUCT_LINES.spot
    setBalanceRead({ scope: balanceScope, rows: [], error: "", loading: true })
    void loadBalances(line, account, abort.signal).then(
      (rows) => {
        if (!abort.signal.aborted)
          setBalanceRead({ scope: balanceScope, rows, error: "", loading: false })
      },
      (reason) => {
        if (!abort.signal.aborted)
          setBalanceRead({
            scope: balanceScope,
            rows: [],
            error: readError(reason),
            loading: false,
          })
      },
    )
    return () => abort.abort()
  }, [balanceScope, mode, source, session, refreshVersion])

  useEffect(() => {
    const abort = new AbortController()
    setAssetScales({})
    setPrecisionError("")
    void loadAssetScales(abort.signal).then(
      (rows) => {
        if (!abort.signal.aborted) setAssetScales(rows)
      },
      (reason) => {
        if (!abort.signal.aborted) setPrecisionError(readError(reason))
      },
    )
    return () => abort.abort()
  }, [refreshVersion])

  useEffect(() => {
    if (!session) return
    const abort = new AbortController()
    setRecords([])
    setTransferRecords([])
    setHistoryLoading(true)
    setHistoryError("")
    const read =
      mode === "withdraw"
        ? loadWithdrawalHistory(asset, undefined, abort.signal)
        : loadAllTransferHistory(asset, abort.signal)
    void read.then(
      (rows) => {
        if (abort.signal.aborted) return
        if (mode === "withdraw") setRecords(rows)
        else setTransferRecords(rows)
        setHistoryLoading(false)
      },
      (reason) => {
        if (!abort.signal.aborted) {
          setHistoryError(readError(reason))
          setHistoryLoading(false)
        }
      },
    )
    return () => abort.abort()
  }, [asset, mode, session, refreshVersion])

  useEffect(() => {
    if (!session || mode !== "withdraw") return
    const abort = new AbortController()
    void loadFundingAssets("withdraw", abort.signal).then(
      (rows) => {
        if (abort.signal.aborted) return
        setFundingAssets(rows)
        const selected = rows.find((row) => row.asset === requestedAsset) ?? rows[0]
        setAsset(selected?.asset ?? "")
        setChains(selected?.networks ?? [])
        setNetwork(selected?.networks.length === 1 ? (selected.networks[0]?.networkCode ?? "") : "")
      },
      (reason) => {
        if (!abort.signal.aborted) setMessage(readError(reason))
      },
    )
    return () => abort.abort()
  }, [requestedAsset, session, mode])

  const available = useMemo(() => {
    if (balanceLoading || balanceError) return "—"
    const balance = balances.find((row) => text(row, "asset").toUpperCase() === asset)
    const units = valueAt(balance, "availableUnits")
    const scale = assetScales[asset]
    if (!scale) return "—"
    if (!balance) return "0"
    if (typeof units === "string" || typeof units === "number")
      return signedUnitsToDecimal(units, scale)
    return text(balance, "free") || "—"
  }, [asset, assetScales, balances, balanceLoading, balanceError])

  function requestKey() {
    const signature = JSON.stringify([
      session?.user.userId,
      mode,
      source,
      target,
      asset,
      amount,
      network,
      address.trim(),
    ])
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: `${mode}-${crypto.randomUUID()}` }
    return submission.current.key
  }

  const submit = async () => {
    if (submitting.current) return
    if (!session) {
      setState("error")
      setMessage(t("Please sign in before funding operations."))
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
      submitting.current = true
      setState("loading")
      try {
        const reference = requestKey()
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
        if (accepted && !response.status.includes("UNKNOWN")) {
          submission.current = null
          setAddress("")
          setAmount("")
          setEmailCode("")
          setTotpCode("")
        }
        setRefreshVersion((value) => value + 1)
      } catch (reason: unknown) {
        setState("error")
        setMessage(readError(reason))
      } finally {
        submitting.current = false
      }
      return
    }
    if (!assetScales[asset] || balanceLoading || balanceError || precisionError) return
    if (!isPositiveDecimal(amount) || source === target) {
      setState("error")
      setMessage(
        source === target
          ? t("Source and destination accounts must differ.")
          : t("Enter a valid transfer amount."),
      )
      return
    }
    submitting.current = true
    setState("loading")
    try {
      const key = requestKey()
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
      if (accepted && !response.status.includes("UNKNOWN")) {
        submission.current = null
        setAmount("")
        setEmailCode("")
        setTotpCode("")
      }
      setRefreshVersion((value) => value + 1)
    } catch (reason: unknown) {
      setState("error")
      setMessage(readError(reason))
    } finally {
      submitting.current = false
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

  if (mode === "withdraw")
    return (
      <FundingLayout
        busy={state === "loading"}
        title={t("Withdraw Crypto")}
        description={t("Submit a verified withdrawal request to the custody service.")}
      >
        <Panel>
          <h2>{t("1. Transfer details")}</h2>
          <div className="grid-2">
            <Field label={t("Asset")}>
              <FundingAssetSelect
                assets={fundingAssets}
                value={asset}
                onChange={(value) => {
                  const row = fundingAssets.find((item) => item.asset === value)
                  setAsset(value)
                  setChains(row?.networks ?? [])
                  setNetwork(row?.networks.length === 1 ? (row.networks[0]?.networkCode ?? "") : "")
                }}
              />
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
        <RecordPanel
          title={t("Withdrawal history")}
          records={records}
          scales={assetScales}
          loading={historyLoading}
          error={historyError}
        />
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
      busy={state === "loading"}
      title={t("Internal Transfer")}
      description={t("Move funds between product accounts with an idempotent request.")}
    >
      <Panel>
        <h2>{t("Transfer accounts")}</h2>
        <div className="grid-2">
          <Field label={t("From")}>
            <DropdownSelect
              aria-label={t("Source account")}
              value={source}
              onChange={(event) => {
                setSource(event.target.value)
                setAmount("")
                setMessage("")
              }}
            >
              {transferAccounts.map((account) => (
                <option key={account} value={account}>
                  {accountLabel(account)}
                </option>
              ))}
            </DropdownSelect>
          </Field>
          <Field label={t("To")}>
            <DropdownSelect
              aria-label={t("Destination account")}
              value={target}
              onChange={(event) => {
                setTarget(event.target.value)
                setMessage("")
              }}
            >
              {transferAccounts.map((account) => (
                <option key={account} value={account}>
                  {accountLabel(account)}
                </option>
              ))}
            </DropdownSelect>
          </Field>
        </div>
        <Field label={t("Asset")}>
          <DropdownSelect
            aria-label={t("Asset")}
            value={asset}
            onChange={(event) => setAsset(event.target.value)}
          >
            {[
              ...new Set(
                [
                  asset,
                  ...Object.keys(assetScales),
                  ...balances.map((row) => text(row, "asset").toUpperCase()),
                ].filter(Boolean),
              ),
            ]
              .sort()
              .map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
          </DropdownSelect>
        </Field>
        <button
          type="button"
          className="swap-button"
          onClick={() => {
            const current = source
            setSource(target)
            setTarget(current)
            setAmount("")
            setMessage("")
          }}
        >
          <ArrowDownUp size={18} /> {t("Swap accounts")}{" "}
        </button>
        <div className="row-between funding-available" role="status">
          <span>
            {t("Available:")} <strong className="mono">{available}</strong> {asset}
          </span>
          <Button
            tone="ghost"
            loading={balanceLoading}
            onClick={() => setRefreshVersion((value) => value + 1)}
          >
            {t("Refresh")}
          </Button>
        </div>
        {balanceError || precisionError ? (
          <p className="negative" role="alert">
            {balanceError || precisionError}
          </p>
        ) : null}
        <Field label={`${t("Amount")} (${asset})`}>
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
        disabled={balanceLoading || !!balanceError || !assetScales[asset] || !!precisionError}
        action="Confirm transfer"
      />
      <RecordPanel
        title={t("Transfer history")}
        records={transferRecords}
        scales={assetScales}
        loading={historyLoading}
        error={historyError}
      />
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
  busy = false,
}: {
  readonly busy?: boolean
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
        <fieldset className="stack funding-form-fields" disabled={busy} aria-busy={busy}>
          {children}
        </fieldset>
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
  scales,
  loading,
  error,
}: {
  readonly loading: boolean
  readonly error: string
  readonly title: string
  readonly scales: Readonly<Record<string, string>>
  readonly records: readonly RecordRow[]
}) {
  const transfers = records.some((row) => text(row, "sourceAccountType"))
  return (
    <Panel>
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="muted">{t("Backend records")}</span>
      </div>
      {loading ? (
        <StateView kind="loading" message="Loading records" />
      ) : error ? (
        <StateView kind="error" message={error} />
      ) : records.length === 0 ? (
        <StateView kind="empty" message="No records returned by the custody service." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t("Asset")}</th>
                {transfers ? <th>{t("Transfer route")}</th> : null}
                <th>{t("Amount")}</th>
                <th>{t("Status")}</th>
                <th>{t("Created")}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr
                  key={
                    text(record, "id") ||
                    (text(record, "transferId")
                      ? [
                          text(record, "transferId"),
                          text(record, "sourceAccountType"),
                          text(record, "targetAccountType"),
                          text(record, "referenceId"),
                          text(record, "createdAt"),
                        ].join(":")
                      : "") ||
                    text(record, "withdrawalId") ||
                    String(index)
                  }
                >
                  <td className="mono">
                    {text(record, "id") ||
                      text(record, "transferId") ||
                      text(record, "depositId") ||
                      text(record, "withdrawalId") ||
                      "—"}
                  </td>
                  <td>{text(record, "asset") || text(record, "assetSymbol") || "—"}</td>
                  {transfers ? (
                    <td>
                      {accountLabel(text(record, "sourceAccountType"))} →{" "}
                      {accountLabel(text(record, "targetAccountType"))}
                    </td>
                  ) : null}
                  <td className="mono">
                    {text(record, "amount") ||
                      (text(record, "amountUnits") && scales[text(record, "asset")]
                        ? signedUnitsToDecimal(
                            text(record, "amountUnits"),
                            scales[text(record, "asset")] ?? "1",
                          )
                        : "—")}
                  </td>
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
  disabled = false,
}: {
  readonly title: string
  readonly message: string
  readonly state: RequestState
  readonly onSubmit: () => void
  readonly disabled?: boolean
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
      <Button disabled={disabled} loading={state === "loading"} onClick={() => void onSubmit()}>
        {t(action)}
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
  return (
    text(record, "networkCode") ||
    text(record, "chain") ||
    text(record, "chainId") ||
    text(record, "name") ||
    ""
  )
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
    "DEBITED",
    "SUBMITTED",
    "SOURCE_DEBITED",
    "COMPLETED",
  ].includes(status.trim().toUpperCase())
}

const transferAccounts = ["FUNDING", ...Object.values(productAccounts)]
function accountLabel(account: string) {
  if (account === "FUNDING") return t("Funding account")
  const line = (Object.keys(productAccounts) as ProductLine[]).find(
    (line) => productAccounts[line] === account,
  )
  return line ? t(productLineLabels[line]) : account
}

async function loadAllTransferHistory(
  asset: string,
  signal: AbortSignal,
): Promise<readonly RecordRow[]> {
  const productLines: readonly ProductLine[] = [
    PRODUCT_LINES.spot,
    PRODUCT_LINES.usdMPerpetual,
    PRODUCT_LINES.coinMPerpetual,
    PRODUCT_LINES.usdMDelivery,
    PRODUCT_LINES.coinMDelivery,
    PRODUCT_LINES.option,
  ]
  const rows = await Promise.all(
    productLines.map((line) => loadTransferHistory(line, asset, signal)),
  )
  const unique = new Map<string, RecordRow>()
  for (const row of rows.flat())
    unique.set(
      JSON.stringify([
        row.transferId,
        row.sourceAccountType,
        row.targetAccountType,
        row.asset,
        row.referenceId,
        row.createdAt,
      ]),
      row,
    )
  return [...unique.values()].sort((left, right) =>
    text(right, "createdAt").localeCompare(text(left, "createdAt")),
  )
}
