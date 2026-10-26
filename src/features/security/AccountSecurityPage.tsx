import { ShieldCheck } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
  changePassword,
  issueSecurityChallenge,
  loadMfaStatus,
  loadSecurityScenes,
  updateSecurityScene,
} from "../../api/endpoints"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"
import { LoginVerificationSettings } from "./LoginVerificationSettings"
import { SecurityActionDialog } from "./SecurityActionDialog"
import { VerificationFields } from "./VerificationFields"
import "./SecurityPages.css"

type Scene = Awaited<ReturnType<typeof loadSecurityScenes>>[number]
type Action = { type: "password" } | { type: "scene"; scene: Scene }
export function AccountSecurityPage() {
  const session = useSession()
  return session ? (
    <AccountSecurityForUser key={String(session.user.userId)} />
  ) : (
    <div className="account-content">
      <h1>{t("Account security")}</h1>
      <Panel>
        <p>{t("Sign in to manage account security.")}</p>
        <a className="button button-primary" href="/auth/login">
          {t("Go to login")}
        </a>
      </Panel>
    </div>
  )
}
function AccountSecurityForUser() {
  const [scenes, setScenes] = useState<Scene[] | null>(null)
  const [mfa, setMfa] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const [action, setAction] = useState<Action | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [email, setEmail] = useState("")
  const [totp, setTotp] = useState("")
  const [message, setMessage] = useState("")
  const [info, setInfo] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState<"send" | "write" | "">("")
  const [writeBlocked, setWriteBlocked] = useState(false)
  const lifetime = useRef<AbortController | null>(null)
  const lock = useRef(false)
  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    return () => abort.abort()
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setScenes(null)
    setMfa(null)
    setError("")
    void Promise.allSettled([loadSecurityScenes(abort.signal), loadMfaStatus(abort.signal)]).then(
      ([preferences, security]) => {
        if (abort.signal.aborted) return
        const errors: string[] = []
        if (preferences.status === "fulfilled") setScenes(preferences.value)
        else errors.push(readError(preferences.reason))
        if (security.status === "fulfilled") setMfa(security.value.enabled)
        else errors.push(t("Security requirements are unavailable. Refresh before making changes."))
        if (preferences.status === "fulfilled" && security.status === "fulfilled")
          setWriteBlocked(false)
        setError(errors.join("\n"))
        setLoading(false)
      },
    )
    return () => abort.abort()
  }, [reload])
  const refresh = () => setReload((value) => value + 1)
  const clear = () => {
    setAction(null)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmation("")
    setEmail("")
    setTotp("")
    setMessage("")
    setInfo("")
  }
  const close = () => {
    if (!lock.current) clear()
  }
  const begin = (next: Action) => {
    if (lock.current || mfa === null || writeBlocked) return
    clear()
    setNotice("")
    setAction(next)
  }
  const send = async () => {
    const signal = lifetime.current?.signal
    if (!action || !signal || signal.aborted || lock.current) return
    lock.current = true
    setBusy("send")
    setMessage("")
    setInfo("")
    try {
      await issueSecurityChallenge(
        action.type === "password" ? "CHANGE_PASSWORD" : "SECURITY_SETTINGS",
        signal,
      )
      if (!signal.aborted) setInfo(t("Verification code sent. Check your email."))
    } catch (reason) {
      if (!signal.aborted) setMessage(readError(reason))
    } finally {
      lock.current = false
      if (!signal.aborted) setBusy("")
    }
  }
  const submit = async () => {
    const signal = lifetime.current?.signal
    if (!action || mfa === null || !signal || signal.aborted || lock.current || writeBlocked) return
    setMessage("")
    setInfo("")
    if (
      !email.trim() ||
      (mfa && !totp.trim()) ||
      (action.type === "password" && (!currentPassword || !newPassword || !confirmation))
    ) {
      setMessage(t("Complete the required fields."))
      return
    }
    if (action.type === "password" && newPassword !== confirmation) {
      setMessage(t("The new passwords do not match."))
      return
    }
    lock.current = true
    setBusy("write")
    try {
      if (action.type === "password")
        await changePassword(currentPassword, newPassword, email.trim(), totp.trim(), signal)
      else
        await updateSecurityScene(
          action.scene.sceneCode,
          !action.scene.enabled,
          email.trim(),
          totp.trim(),
          signal,
        )
      if (!signal.aborted) {
        clear()
        setNotice(t("Security setting updated."))
        refresh()
      }
    } catch (reason) {
      if (!signal.aborted) {
        setMessage(readError(reason))
        setEmail("")
        setTotp("")
        setWriteBlocked(true)
      }
    } finally {
      lock.current = false
      if (!signal.aborted) setBusy("")
    }
  }
  return (
    <div className="account-content security-tools-page">
      <div className="page-heading">
        <div>
          <h1>{t("Account security")}</h1>
          <p>{t("Review your bindings and change security settings with verification.")}</p>
        </div>
        <ShieldCheck size={28} aria-hidden="true" />
      </div>
      {error ? (
        <Panel>
          <StateView kind="error" message={error} retry={refresh} />
        </Panel>
      ) : null}
      {notice ? (
        <p role="status" className="security-notice">
          {notice}
        </p>
      ) : null}
      {writeBlocked && !action ? (
        <Panel>
          <p role="alert">
            {t("Refresh security settings and check the operation result before continuing.")}
          </p>
          <Button onClick={refresh} tone="outline">
            {t("Refresh and check")}
          </Button>
        </Panel>
      ) : null}
      <LoginVerificationSettings
        onChange={refresh}
        passwordActionDisabled={mfa === null || loading || writeBlocked || Boolean(busy)}
        onChangePassword={() => begin({ type: "password" })}
      />
      <section className="section-block">
        <div className="panel-heading">
          <h2>{t("Security preferences")}</h2>
          <Button tone="outline" loading={loading} disabled={Boolean(busy)} onClick={refresh}>
            {t("Refresh")}
          </Button>
        </div>
        <p className="muted">{t("Choose when additional verification is required.")}</p>
        {loading ? (
          <Panel>
            <div role="status" aria-busy="true">
              <StateView kind="loading" message="Loading security settings" />
              <span className="sr-only">{t("Loading security settings")}</span>
            </div>
          </Panel>
        ) : scenes && scenes.length ? (
          <div className="security-preference-list">
            {scenes.map((scene) => {
              const required = ["WITHDRAWAL", "API_WITHDRAWAL"].includes(scene.sceneCode)
              return (
                <Panel className="security-preference-card" key={scene.sceneCode}>
                  <div>
                    <strong>{t(sceneLabel(scene.sceneCode))}</strong>
                    <p>{t(required ? "Required" : scene.enabled ? "Enabled" : "Disabled")}</p>
                  </div>
                  <button
                    type="button"
                    className="security-toggle"
                    role="switch"
                    aria-checked={scene.enabled}
                    aria-label={t(sceneLabel(scene.sceneCode))}
                    disabled={required || mfa === null || writeBlocked || Boolean(busy)}
                    onClick={() => begin({ type: "scene", scene })}
                  >
                    <span />
                  </button>
                </Panel>
              )
            })}
          </div>
        ) : !error ? (
          <Panel>
            <StateView kind="empty" message="No security preferences are available." />
          </Panel>
        ) : null}
      </section>
      {action ? (
        <SecurityActionDialog
          title={t(
            action.type === "password" ? "Change password" : sceneLabel(action.scene.sceneCode),
          )}
          onClose={close}
          closeDisabled={Boolean(busy)}
        >
          <fieldset className="security-action-fields" disabled={Boolean(busy)}>
            {action.type === "password" ? (
              <>
                <Field label={t("Current password")}>
                  <input
                    aria-label={t("Current password")}
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </Field>
                <Field label={t("New password")}>
                  <input
                    aria-label={t("New password")}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field label={t("Confirm new password")}>
                  <input
                    aria-label={t("Confirm new password")}
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </Field>
              </>
            ) : (
              <div className="security-target">
                <strong>{t(sceneLabel(action.scene.sceneCode))}</strong>
                <p>
                  {t(
                    action.scene.enabled
                      ? "Disable this security preference?"
                      : "Enable this security preference?",
                  )}
                </p>
              </div>
            )}
            <VerificationFields
              email={email}
              totp={totp}
              onEmail={setEmail}
              onTotp={setTotp}
              mfaEnabled={mfa === true}
              disabled={Boolean(busy) || writeBlocked}
              sending={busy === "send"}
              onSend={() => void send()}
            />
            {info ? <p role="status">{info}</p> : null}
            {message ? (
              <p role="alert" className="inline-error">
                {message}
              </p>
            ) : null}
            {writeBlocked ? (
              <>
                <p>
                  {t("Refresh security settings and check the operation result before continuing.")}
                </p>
                <Button
                  tone="outline"
                  onClick={() => {
                    close()
                    refresh()
                  }}
                >
                  {t("Refresh and check")}
                </Button>
              </>
            ) : (
              <Button
                loading={busy === "write"}
                disabled={Boolean(busy)}
                onClick={() => void submit()}
              >
                {t("Confirm")}
              </Button>
            )}
          </fieldset>
        </SecurityActionDialog>
      ) : null}
    </div>
  )
}
function sceneLabel(code: string) {
  return (
    (
      {
        WITHDRAWAL: "Withdrawals",
        API_WITHDRAWAL: "API withdrawals",
        WHITELIST: "Withdrawal allowlist",
        TRANSFER: "Product transfers",
        LOGIN: "Login",
        CHANGE_PASSWORD: "Password changes",
        LARGE_TRANSFER: "Large transfers",
        SECURITY_SETTINGS: "Security settings",
      } as Record<string, string>
    )[code] ?? code
  )
}
function readError(reason: unknown) {
  return reason instanceof Error ? reason.message : t("Request failed. Please try again later.")
}
