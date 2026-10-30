import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Copy,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ApiError } from "../../api/client"
import {
  createWithdrawal,
  issueSecurityChallenge,
  loadAssetScales,
  loadBalances,
  loadRuntimeProducts,
  loadWithdrawalSubmission,
  quoteWithdrawal,
} from "../../api/endpoints"
import { type FundingAsset, loadFundingAssets } from "../../api/funding"
import type { ApiWithdrawalSubmission, AuthSession } from "../../api/types"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { StandardDialog } from "../../components/ui/StandardDialog"
import { t } from "../../i18n"
import { decimalToUnits, signedUnitsToDecimal } from "../../lib/units"
import { loadSession, useSession } from "../../state/session"
import { FundingAssetSelect } from "./FundingAssetSelect"
import { WithdrawalHistory } from "./WithdrawalHistory"
import { withdrawalAmount } from "./withdrawalAmount"
import {
  clearWithdrawalIntent,
  confirmedWithdrawalIntent,
  readWithdrawalIntent,
  saveWithdrawalIntent,
  type WithdrawalIntent,
  withdrawalIntentChanged,
  withdrawalIntentKey,
  withdrawalRecorded,
  withWithdrawalLock,
} from "./withdrawalIntent"
import "./WithdrawPage.css"

type Row = Readonly<Record<string, unknown>>
type Read<T> = { key: string; value?: T; error?: string }
type Recovery = { intent: WithdrawalIntent | null; error: string }
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : t("Funding service unavailable. Please retry later.")

export function WithdrawPage() {
  const session = useSession()
  return session ? (
    <WithdrawalForm key={String(session.user.userId)} session={session} />
  ) : (
    <div className="container section withdraw-page">
      <Panel>
        <h1>{t("Withdraw Crypto")}</h1>
        <p>{t("Sign in to access custody and account funding services.")}</p>
        <a className="button button-primary" href="/auth/login">
          {t("Go to login")}
        </a>
      </Panel>
    </div>
  )
}

function WithdrawalForm({ session }: { readonly session: AuthSession }) {
  const userId = String(session.user.userId)
  const [requestedAsset] = useState(
    () => new URLSearchParams(window.location.search).get("asset")?.toUpperCase() ?? "",
  )
  const [selection, setSelection] = useState({ asset: requestedAsset, network: "" })
  const [address, setAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [catalog, setCatalog] = useState<Read<readonly FundingAsset[]> | null>(null)
  const [cash, setCash] = useState<Read<{
    rows: readonly Row[]
    scales: Readonly<Record<string, string>>
  }> | null>(null)
  const [revision, setRevision] = useState(0)
  const [recovery, setRecovery] = useState<Recovery>(() => readRecovery(userId))
  const pending = recovery.intent
  const recorded = pending ? withdrawalRecorded(pending) : false
  const rejected =
    pending?.rejected || ["REJECTED", "REFUNDED"].includes(pending?.receipt?.status ?? "")
  const [review, setReview] = useState<WithdrawalIntent | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const receiptHeading = useRef<HTMLHeadingElement | null>(null)
  const alive = useRef(true)
  const quoteController = useRef<AbortController | null>(null)
  const reviewOpener = useRef<HTMLElement | null>(null)
  const outcomeController = useRef<AbortController | null>(null)
  const [message, setMessage] = useState("")
  const [challengeBusy, setChallengeBusy] = useState(false)
  const challengeFlight = useRef(false)
  const [challengeMessage, setChallengeMessage] = useState("")
  const token = session.accessToken
  const readScope = `${token}:${revision}`
  const assets = catalog?.key === readScope ? (catalog.value ?? []) : []
  const asset = pending?.asset ?? selection.asset
  const selectedAsset = assets.find((row) => row.asset === asset)
  const network = selectedAsset?.networks.find((row) => row.networkCode === selection.network)
  const balances = cash?.key === readScope ? cash.value : undefined
  const scale = balances?.scales[asset]
  const balance = balances?.rows.find((row) => row["asset"] === asset)
  const rawAvailable = balance?.["availableUnits"]
  let availableUnits: string | null = null
  try {
    if (balances && scale)
      availableUnits =
        typeof rawAvailable === "string" || typeof rawAvailable === "number"
          ? String(rawAvailable)
          : balance
            ? /^0*(?:\.0*)?$/.test(String(balance["free"]))
              ? "0"
              : decimalToUnits(String(balance["free"]), scale)
            : "0"
  } catch {
    /* Missing or malformed cash must not become a zero balance. */
  }
  const available =
    availableUnits !== null && scale ? signedUnitsToDecimal(availableUnits, scale) : "—"
  const catalogError = catalog?.key === readScope ? catalog.error : ""
  const cashError = cash?.key === readScope ? cash.error : ""

  useEffect(() => {
    alive.current = true
    const sync = () => setRecovery(readRecovery(userId))
    const storage = (event: StorageEvent) => {
      if (event.key === withdrawalIntentKey(userId) || event.key === null) sync()
    }
    window.addEventListener("storage", storage)
    window.addEventListener(withdrawalIntentChanged, sync)
    return () => {
      alive.current = false
      quoteController.current?.abort()
      outcomeController.current?.abort()
      window.removeEventListener("storage", storage)
      window.removeEventListener(withdrawalIntentChanged, sync)
    }
  }, [userId])

  useEffect(() => {
    const controller = new AbortController()
    setCatalog({ key: readScope })
    void loadFundingAssets("withdraw", controller.signal).then(
      (rows) => {
        if (controller.signal.aborted) return
        setCatalog({ key: readScope, value: rows })
        setSelection((current) => {
          const row = current.asset ? rows.find((row) => row.asset === current.asset) : rows[0]
          const currentNetwork = row?.networks.find(
            (network) => network.networkCode === current.network,
          )
          return {
            asset: row?.asset ?? current.asset,
            network:
              currentNetwork?.networkCode ??
              (!current.network && row?.networks.length === 1
                ? (row.networks[0]?.networkCode ?? "")
                : ""),
          }
        })
      },
      (error) => {
        if (!controller.signal.aborted) setCatalog({ key: readScope, error: errorText(error) })
      },
    )
    return () => controller.abort()
  }, [readScope])

  useEffect(() => {
    const controller = new AbortController()
    setCash({ key: readScope })
    void Promise.all([
      loadBalances("SPOT", "FUNDING", controller.signal),
      loadAssetScales(controller.signal),
      loadRuntimeProducts(controller.signal),
    ]).then(
      ([rows, scales, products]) => {
        if (!products.includes("SPOT")) {
          if (!controller.signal.aborted)
            setCash({
              key: readScope,
              error: t("The SPOT funding account is not enabled for withdrawals."),
            })
          return
        }
        if (!controller.signal.aborted) setCash({ key: readScope, value: { rows, scales } })
      },
      (error) => {
        if (!controller.signal.aborted) setCash({ key: readScope, error: errorText(error) })
      },
    )
    return () => controller.abort()
  }, [readScope])

  useEffect(() => {
    if (recovery.error || (pending && review && pending.reference !== review.reference))
      setReview(null)
  }, [pending, review, recovery.error])
  useEffect(() => {
    if (pending && !busy && !review) {
      receiptHeading.current?.focus({ preventScroll: true })
      receiptHeading.current?.scrollIntoView({ block: "start" })
    }
  }, [pending, busy, review])
  async function copyReference(reference: string) {
    try {
      await navigator.clipboard.writeText(reference)
      setMessage(t("Copied"))
    } catch {
      setMessage(t("Copy failed. Copy the reference manually."))
    }
  }

  async function openReview() {
    reviewOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setMessage("")
    const controller = new AbortController()
    quoteController.current = controller
    try {
      if (
        !selectedAsset ||
        !network ||
        !scale ||
        availableUnits === null ||
        catalogError ||
        cashError ||
        recovery.error
      )
        throw new Error(t("Wait for the asset, network and available balance to load."))
      const normalizedAddress = address.trim()
      if (!normalizedAddress || normalizedAddress.length > 160)
        throw new Error(t("Enter a recipient address of up to 160 characters."))
      if (!/^\d{6}$/.test(emailCode.trim()) || !/^\d{6}$/.test(totpCode.trim()))
        throw new Error(t("Enter the six-digit email and authenticator codes."))
      const normalizedAmount = withdrawalAmount(
        amount,
        scale,
        network.minWithdrawal,
        availableUnits,
      )
      const quote = await quoteWithdrawal(
        network.networkCode,
        asset,
        normalizedAmount,
        controller.signal,
      )
      if (controller.signal.aborted || !alive.current) return
      const gross = BigInt(decimalToUnits(quote.amount, scale))
      const received = BigInt(decimalToUnits(quote.receivedAmount, scale))
      const fee = /^0*(?:\.0*)?$/.test(quote.fee) ? 0n : BigInt(decimalToUnits(quote.fee, scale))
      if (
        quote.asset !== asset ||
        quote.chain !== network.networkCode ||
        gross !== BigInt(decimalToUnits(normalizedAmount, scale)) ||
        gross !== fee + received
      )
        throw new Error(t("The withdrawal quote is invalid. Refresh before continuing."))
      setReview({
        userId,
        reference: `withdraw-${crypto.randomUUID()}`,
        asset,
        network: network.networkCode,
        address: normalizedAddress,
        amount: quote.amount,
        fee: quote.fee,
        receivedAmount: quote.receivedAmount,
        networkRevision: quote.networkRevision,
        createdAt: new Date().toISOString(),
      })
    } catch (error) {
      if (alive.current && !controller.signal.aborted) setMessage(errorText(error))
    } finally {
      if (quoteController.current === controller) quoteController.current = null
      inFlight.current = false
      if (alive.current) setBusy(false)
    }
  }

  async function refreshOutcome() {
    setRevision((value) => value + 1)
    if (!pending || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const controller = new AbortController()
      outcomeController.current = controller
      const response = await loadWithdrawalSubmission(pending.reference, controller.signal)
      if (
        !alive.current ||
        controller.signal.aborted ||
        String(loadSession()?.user.userId) !== userId
      )
        return
      await withWithdrawalLock(userId, async () => {
        if (readWithdrawalIntent(userId)?.reference !== pending.reference) return
        saveWithdrawalIntent(confirmedWithdrawalIntent(pending, response))
      })
      if (alive.current) setMessage("")
    } catch (error) {
      if (alive.current) setMessage(errorText(error))
    } finally {
      outcomeController.current = null
      inFlight.current = false
      if (alive.current) {
        setBusy(false)
        setRecovery(readRecovery(userId))
      }
    }
  }

  async function send(intent: WithdrawalIntent, retry: boolean) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setMessage("")
    let firstAttempt = false
    let didSend = false
    try {
      if (!retry && (!/^\d{6}$/.test(emailCode.trim()) || !/^\d{6}$/.test(totpCode.trim())))
        throw new Error(t("Enter the six-digit email and authenticator codes."))
      await withWithdrawalLock(userId, async () => {
        if (String(loadSession()?.user.userId) !== userId)
          throw new Error(t("Your session has expired. Please sign in again."))
        const saved = readWithdrawalIntent(userId)
        if (
          retry
            ? saved?.reference !== intent.reference || (saved && withdrawalRecorded(saved))
            : saved !== null
        )
          throw new Error(t("Another withdrawal is already recorded. Review the original request."))
        if (!retry) {
          saveWithdrawalIntent(intent)
          firstAttempt = true
        }
        let response: ApiWithdrawalSubmission
        try {
          didSend = true
          response = await createWithdrawal(
            intent.network,
            intent.asset,
            intent.address,
            intent.amount,
            intent.reference,
            emailCode.trim(),
            totpCode.trim(),
            intent.networkRevision,
          )
        } catch (error) {
          // A first, explicitly rejected HTTP request is different from a failed replay of an unknown result.
          if (
            firstAttempt &&
            error instanceof ApiError &&
            [400, 403, 422, 423, 428].includes(error.status) &&
            error.payload !== null
          )
            saveWithdrawalIntent({ ...intent, rejected: true })
          throw error
        }
        saveWithdrawalIntent(confirmedWithdrawalIntent(intent, response))
        if (alive.current) {
          setEmailCode("")
          setTotpCode("")
          setRevision((value) => value + 1)
        }
      })
    } catch (error) {
      if (alive.current) setMessage(errorText(error))
    } finally {
      inFlight.current = false
      if (alive.current) {
        if (didSend) {
          setEmailCode("")
          setTotpCode("")
        }
        setReview(null)
        setBusy(false)
        setRecovery(readRecovery(userId))
      }
    }
  }

  async function startNew() {
    if (!pending || inFlight.current) return
    setBusy(true)
    inFlight.current = true
    try {
      await withWithdrawalLock(userId, async () => clearWithdrawalIntent(pending))
      setAddress("")
      setAmount("")
      setEmailCode("")
      setTotpCode("")
      setMessage("")
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      inFlight.current = false
      setBusy(false)
      setRecovery(readRecovery(userId))
    }
  }

  async function sendCode() {
    if (challengeFlight.current) return
    challengeFlight.current = true
    setChallengeBusy(true)
    setChallengeMessage("")
    try {
      await issueSecurityChallenge("WITHDRAWAL")
      if (alive.current)
        setChallengeMessage(t("Verification code sent. Complete verification before it expires."))
    } catch (error) {
      if (alive.current) setChallengeMessage(errorText(error))
    } finally {
      challengeFlight.current = false
      if (alive.current) setChallengeBusy(false)
    }
  }

  const security = (
    <Panel className="withdraw-security">
      <div className="withdraw-panel-title">
        <ShieldCheck size={19} aria-hidden="true" />
        <h2>{t("Security verification")}</h2>
      </div>
      <p className="muted">
        {t("Email and authenticator codes are required. They are never saved with your request.")}
      </p>
      <div className="grid-2">
        <Field label={t("Email code")}>
          <input
            aria-label={t("Email code")}
            value={emailCode}
            onChange={(event) => setEmailCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
          />
        </Field>
        <Field label={t("Authenticator code")}>
          <input
            aria-label={t("Authenticator code")}
            value={totpCode}
            onChange={(event) => setTotpCode(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
          />
        </Field>
      </div>
      <div className="withdraw-code-action">
        <Button tone="outline" loading={challengeBusy} onClick={() => void sendCode()}>
          {t("Send email code")}
        </Button>
        {challengeMessage ? <p role="status">{challengeMessage}</p> : null}
      </div>
    </Panel>
  )

  return (
    <div className="container section withdraw-page">
      <a className="route-link withdraw-back" href="/assets">
        <ArrowLeft size={16} aria-hidden="true" />
        {t("Back to assets")}
      </a>
      <div className="page-heading">
        <div>
          <h1>{t("Withdraw Crypto")}</h1>
          <p>{t("Choose a network, review the details and track the original request.")}</p>
        </div>
        <ShieldCheck size={26} aria-hidden="true" />
      </div>
      <div className="withdraw-layout">
        <div className="withdraw-main">
          {recovery.error ? (
            <Panel>
              <StateView
                kind="error"
                message={recovery.error}
                retry={() => setRecovery(readRecovery(userId))}
              />
            </Panel>
          ) : pending ? (
            <Panel
              className={`withdraw-receipt ${rejected ? "rejected" : recorded ? "recorded" : "unconfirmed"}`}
            >
              <div className="withdraw-receipt-title">
                {recorded && !rejected ? (
                  <CheckCircle2 size={25} aria-hidden="true" />
                ) : (
                  <CircleAlert size={25} aria-hidden="true" />
                )}
                <div>
                  <h2 ref={receiptHeading} tabIndex={-1}>
                    {t(
                      pending.rejected ||
                        pending.receipt?.status === "REJECTED" ||
                        pending.receipt?.status === "REFUNDED"
                        ? "Withdrawal request rejected"
                        : withdrawalRecorded(pending)
                          ? "Withdrawal request recorded"
                          : "Withdrawal result needs confirmation",
                    )}
                  </h2>
                  <p>
                    {t(
                      withdrawalRecorded(pending)
                        ? "A recorded request does not mean the blockchain transfer is complete."
                        : "Keep this reference. Retrying sends the original request, using the same details and reference.",
                    )}
                  </p>
                </div>
              </div>
              <WithdrawalDetails intent={pending} />
              <div className="withdraw-reference">
                <span>{t("Request reference")}</span>
                <code>{pending.reference}</code>
                <Button
                  tone="ghost"
                  aria-label={t("Copy request reference")}
                  onClick={() => void copyReference(pending.reference)}
                >
                  <Copy size={16} aria-hidden="true" />
                </Button>
              </div>
              <p role="status" className="withdraw-status">
                {t("Submission status")}:{" "}
                <strong>
                  {pending.rejected
                    ? t("Request rejected")
                    : (pending.receipt?.status ?? t("Not confirmed"))}
                </strong>
              </p>
              <div className="withdraw-receipt-actions">
                <Button tone="outline" onClick={() => void refreshOutcome()} disabled={busy}>
                  <RefreshCw size={16} aria-hidden="true" />
                  {t("Refresh records")}
                </Button>
                {withdrawalRecorded(pending) ? (
                  <Button key="start-new-withdrawal" onClick={() => void startNew()} loading={busy}>
                    {t("Start a new withdrawal")}
                  </Button>
                ) : null}
              </div>
            </Panel>
          ) : (
            <>
              <Panel>
                <div className="withdraw-panel-title">
                  <span className="withdraw-step">1</span>
                  <h2>{t("Recipient and network")}</h2>
                </div>
                {catalogError ? (
                  <StateView
                    kind="error"
                    message={catalogError}
                    retry={() => setRevision((value) => value + 1)}
                  />
                ) : catalog?.key !== readScope || !catalog.value ? (
                  <StateView kind="loading" message="Loading assets…" />
                ) : assets.length === 0 ? (
                  <StateView kind="empty" message="No withdrawal assets are currently available." />
                ) : (
                  <fieldset disabled={busy} className="withdraw-fields">
                    {!selectedAsset && asset ? (
                      <p role="status" className="withdraw-network-note">
                        {t("This asset is not enabled for withdrawals. Select an available asset.")}
                      </p>
                    ) : null}
                    <div className="grid-2">
                      <Field label={t("Asset")}>
                        <FundingAssetSelect
                          assets={assets}
                          value={asset}
                          onChange={(value) => {
                            const next = assets.find((row) => row.asset === value)
                            setSelection({
                              asset: value,
                              network:
                                next?.networks.length === 1
                                  ? (next.networks[0]?.networkCode ?? "")
                                  : "",
                            })
                            setAmount("")
                            setAddress("")
                            setMessage("")
                          }}
                        />
                      </Field>
                      <Field label={t("Network")}>
                        <DropdownSelect
                          aria-label={t("Network")}
                          value={selection.network}
                          onChange={(event) => {
                            setSelection((current) => ({ ...current, network: event.target.value }))
                            setMessage("")
                          }}
                        >
                          <option value="">{t("Select network")}</option>
                          {selectedAsset?.networks.map((row) => (
                            <option key={row.networkCode} value={row.networkCode}>
                              {`${row.displayName} (${row.networkCode})`}
                            </option>
                          ))}
                        </DropdownSelect>
                      </Field>
                    </div>
                    <Field label={t("Recipient address")}>
                      <input
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        aria-label={t("Recipient wallet address")}
                        placeholder={t("Enter or paste wallet address")}
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={160}
                      />
                    </Field>
                    <p className="withdraw-network-note">
                      <CircleAlert size={16} aria-hidden="true" />
                      {t(
                        "Use the same network as the receiving wallet. Transfers to the wrong network may be lost.",
                      )}
                    </p>
                  </fieldset>
                )}
              </Panel>
              <Panel>
                <div className="withdraw-panel-title">
                  <span className="withdraw-step">2</span>
                  <h2>{t("Withdrawal amount")}</h2>
                </div>
                <div className="withdraw-available">
                  <span>{t("Available")}</span>
                  <strong className="mono">
                    {available} {asset}
                  </strong>
                  <Button
                    tone="ghost"
                    disabled={busy}
                    aria-label={t("Refresh balance")}
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                  </Button>
                </div>
                {cashError ? (
                  <p className="negative" role="alert">
                    {cashError}
                  </p>
                ) : null}
                <Field label={`${t("Amount")} (${asset || "—"})`}>
                  <div className="number-input">
                    <input
                      value={amount}
                      disabled={busy}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      aria-label={t("Withdrawal amount")}
                      placeholder="0.00"
                    />
                    <span>{asset}</span>
                  </div>
                </Field>
                <dl className="withdraw-limits">
                  <div>
                    <dt>{t("Minimum withdrawal")}</dt>
                    <dd className="mono">{network ? `${network.minWithdrawal} ${asset}` : "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("Platform withdrawal fee")}</dt>
                    <dd className="mono">{network ? `${network.withdrawalFee} ${asset}` : "—"}</dd>
                  </div>
                </dl>
                <p className="muted">
                  {t("Final fees, limits and withdrawal eligibility are confirmed by the service.")}
                </p>
              </Panel>
            </>
          )}
          {!recovery.error && (!pending || !withdrawalRecorded(pending)) ? (
            <fieldset className="withdraw-fields" disabled={busy}>
              {security}
              <Panel className="withdraw-submit">
                {message ? (
                  <p role="alert" className="negative">
                    {message}
                  </p>
                ) : null}
                <Button
                  key={pending ? "retry-original-withdrawal" : "review-new-withdrawal"}
                  loading={busy}
                  disabled={
                    !pending &&
                    (!selectedAsset ||
                      !network ||
                      !scale ||
                      availableUnits === null ||
                      !!catalogError ||
                      !!cashError)
                  }
                  onClick={() => (pending ? void send(pending, true) : void openReview())}
                >
                  {t(pending ? "Retry original withdrawal" : "Review withdrawal")}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Button>
                <p>
                  {t(
                    "Withdrawals use the SPOT funding balance. Product balances must be transferred first.",
                  )}
                </p>
              </Panel>
            </fieldset>
          ) : message ? (
            <p className="withdraw-notice" role="status">
              {message}
            </p>
          ) : null}
          <WithdrawalHistory
            asset={asset}
            refreshVersion={revision}
            onRefresh={() => setRevision((value) => value + 1)}
            busy={busy}
          />
        </div>
        <aside className="withdraw-side">
          <Panel>
            <ShieldCheck size={24} aria-hidden="true" />
            <h2>{t("Before you withdraw")}</h2>
            <ol>
              <li>{t("Check the asset, network and recipient address.")}</li>
              <li>{t("Review the minimum amount and configured fee.")}</li>
              <li>{t("Keep the request reference until the result is confirmed.")}</li>
            </ol>
            <a
              className="route-link"
              href={`/assets/transfer?asset=${encodeURIComponent(asset)}&from=SPOT`}
            >
              {t("Transfer funds to the funding account")}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </Panel>
        </aside>
      </div>
      {review ? (
        <StandardDialog
          returnFocus={reviewOpener.current}
          title={t("Review withdrawal")}
          subtitle={t("Check the complete recipient address and network before confirming.")}
          onClose={() => setReview(null)}
          closeDisabled={busy}
          className="withdraw-review"
        >
          <WithdrawalDetails intent={review} />
          <p className="muted">
            {t(
              "The platform fee is included in the total debit. Blockchain Gas is accounted separately.",
            )}
          </p>
          <p className="withdraw-network-note">
            {t("The transfer cannot be reversed after it is broadcast.")}
          </p>
          <div className="withdraw-dialog-actions">
            <Button tone="outline" onClick={() => setReview(null)} disabled={busy}>
              {t("Back")}
            </Button>
            <Button loading={busy} onClick={() => void send(review, false)}>
              {t("Confirm withdrawal")}
            </Button>
          </div>
        </StandardDialog>
      ) : null}
    </div>
  )
}

function WithdrawalDetails({ intent }: { readonly intent: WithdrawalIntent }) {
  return (
    <dl className="withdraw-details">
      <div>
        <dt>{t("Asset")}</dt>
        <dd>{intent.asset}</dd>
      </div>
      <div>
        <dt>{t("Network")}</dt>
        <dd>{intent.network}</dd>
      </div>
      <div>
        <dt>{t("Total debit")}</dt>
        <dd className="mono">
          {intent.amount} {intent.asset}
        </dd>
      </div>
      <div>
        <dt>{t("Platform withdrawal fee")}</dt>
        <dd className="mono">
          {intent.fee} {intent.asset}
        </dd>
      </div>
      <div>
        <dt>{t("Recipient receives")}</dt>
        <dd className="mono">
          {intent.receivedAmount} {intent.asset}
        </dd>
      </div>
      <div className="withdraw-wide">
        <dt>{t("Recipient address")}</dt>
        <dd className="mono">{intent.address}</dd>
      </div>
    </dl>
  )
}
function readRecovery(userId: string): Recovery {
  try {
    return { intent: readWithdrawalIntent(userId), error: "" }
  } catch {
    return {
      intent: null,
      error: t(
        "The saved withdrawal reference cannot be read. Check the original request before submitting again.",
      ),
    }
  }
}
