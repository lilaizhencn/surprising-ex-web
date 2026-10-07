import { useEffect, useState } from "react"
import { issueMfaRecoveryChallenge, loadMfaRecovery, submitMfaRecovery } from "../../api/endpoints"
import { Button, Field, Panel } from "../../components/ui/Primitives"
import { t } from "../../i18n"

type RecordRow = Readonly<Record<string, unknown>> & {
  status?: unknown
  decisionReason?: unknown
  challengeId?: unknown
  destination?: unknown
  simulated?: unknown
}

export function MfaRecoveryPanel() {
  const [request, setRequest] = useState<RecordRow | null>(null)
  const [challenge, setChallenge] = useState<RecordRow | null>(null)
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const refresh = () =>
    void loadMfaRecovery().then(setRequest, (error: unknown) => setMessage(readError(error)))
  useEffect(() => {
    refresh()
  }, [])
  useEffect(() => {
    if (request?.status !== "PENDING") return
    const timer = window.setInterval(refresh, 10_000)
    return () => window.clearInterval(timer)
  }, [request?.status])

  async function begin() {
    setBusy(true)
    setMessage("")
    try {
      const response = await issueMfaRecoveryChallenge(password)
      setChallenge(response)
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    setBusy(true)
    setMessage("")
    try {
      const result = await submitMfaRecovery(Number(challenge?.challengeId), password, code, reason)
      setRequest(result)
      setChallenge(null)
      setCode("")
      setReason("")
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <h3>{t("Lost authenticator")}</h3>
      {request && request.status !== "REJECTED" ? (
        <p>
          {t("Recovery request status:")} {String(request.status)}
          {request.decisionReason ? ` · ${String(request.decisionReason)}` : ""}
        </p>
      ) : (
        <>
          {request?.status === "REJECTED" ? (
            <p>
              {t("Previous request was rejected:")} {String(request.decisionReason ?? "")}
            </p>
          ) : null}
          <p className="muted">
            {t(
              "Recovery requires verified KYC, your login password and a code sent to your available email or phone. An operator will review your submitted KYC documents.",
            )}
          </p>
          {!challenge ? (
            <>
              <Field label={t("Login Password")}>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <Button loading={busy} disabled={!password} onClick={() => void begin()}>
                {t("Send recovery code")}
              </Button>
            </>
          ) : (
            <>
              <p>
                {t("Code sent to:")} {String(challenge.destination ?? "")}
              </p>
              {challenge.simulated === true ? (
                <p className="verification-simulation-hint" role="status">
                  {t("Test environment: use 123456 for email or SMS verification.")}
                </p>
              ) : null}
              <Field label={t("Recovery verification code")}>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <Field label={t("Explain how you lost access")}>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                />
              </Field>
              <Button
                loading={busy}
                disabled={code.length !== 6 || reason.trim().length < 8}
                onClick={() => void submit()}
              >
                {t("Submit for manual review")}
              </Button>
            </>
          )}
        </>
      )}
      {message ? <p role="alert">{message}</p> : null}
    </Panel>
  )
}

function readError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : t("Security service unavailable. Please retry later.")
}
