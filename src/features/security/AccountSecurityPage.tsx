import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"
import {
  changePassword,
  issueSecurityChallenge,
  loadSecurityScenes,
  updateSecurityScene,
} from "../../api/endpoints"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { LoginVerificationSettings } from "./LoginVerificationSettings"
import { SecurityActionDialog } from "./SecurityActionDialog"

type Scene = Readonly<Record<string, unknown>>
type Action = { type: "password" } | { type: "scene"; scene: Scene }

export function AccountSecurityPage() {
  const [scenes, setScenes] = useState<readonly Scene[]>([])
  const [action, setAction] = useState<Action | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const refresh = () => {
    void loadSecurityScenes().then(setScenes, (reason: unknown) => setError(readError(reason)))
  }
  useEffect(refresh, [])
  const close = () => {
    setAction(null)
    setCurrentPassword("")
    setNewPassword("")
    setEmailCode("")
    setTotpCode("")
    setMessage("")
  }
  const scene = action?.type === "scene" ? action.scene : null
  const sceneCode = scene ? String(scene["sceneCode"] ?? scene["code"] ?? "") : ""
  const enabled = scene?.["enabled"] === true
  const challenge = action?.type === "password" ? "CHANGE_PASSWORD" : "SECURITY_SETTINGS"
  const submit = async () => {
    if (!action) return
    setBusy(true)
    setMessage("")
    try {
      if (action.type === "password") {
        if (!currentPassword || !newPassword || !emailCode)
          throw new Error(t("Complete the required fields."))
        await changePassword(currentPassword, newPassword, emailCode, totpCode)
      } else {
        if (!sceneCode || !emailCode) throw new Error(t("Complete the required fields."))
        await updateSecurityScene(sceneCode, !enabled, emailCode, totpCode)
        refresh()
      }
      close()
      setMessage(t("Security setting updated."))
    } catch (reason) {
      setMessage(readError(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>{t("Account security")}</h1>
          <p>{t("Review your bindings and change security settings with verification.")}</p>
        </div>
        <ShieldCheck size={28} />
      </div>
      {error ? (
        <Panel>
          <StateView kind="error" message={error} retry={refresh} />
        </Panel>
      ) : null}
      {message && !action ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      <section className="section-block">
        <h2>{t("Password")}</h2>
        <Panel className="security-status-row" dense>
          <div>
            <LockKeyhole size={22} />
            <div>
              <strong>{t("Login Password")}</strong>
              <p>{t("Configured")}</p>
            </div>
          </div>
          <Button
            tone="outline"
            onClick={() => {
              setMessage("")
              setAction({ type: "password" })
            }}
          >
            {t("Change password")}
          </Button>
        </Panel>
      </section>
      <LoginVerificationSettings onChange={refresh} />
      <section className="section-block">
        <h2>{t("Security preferences")}</h2>
        <p className="muted">{t("Choose when additional verification is required.")}</p>
        <div className="security-preference-list">
          {scenes.map((value) => {
            const code = String(value["sceneCode"] ?? value["code"] ?? "")
            const required = code === "WITHDRAWAL" || code === "API_WITHDRAWAL"
            return (
              <Panel className="security-status-row" dense key={code}>
                <div>
                  <KeyRound size={21} />
                  <div>
                    <strong>{t(sceneLabel(code))}</strong>
                    <p>
                      {t(
                        required ? "Required" : value["enabled"] === true ? "Enabled" : "Disabled",
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  tone="outline"
                  disabled={required}
                  onClick={() => {
                    setMessage("")
                    setAction({ type: "scene", scene: value })
                  }}
                >
                  {t("Manage")}
                </Button>
              </Panel>
            )
          })}
        </div>
      </section>
      {action ? (
        <SecurityActionDialog
          title={t(action.type === "password" ? "Change password" : sceneLabel(sceneCode))}
          onClose={close}
        >
          {action.type === "password" ? (
            <>
              <Field label={t("Current password")}>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
              <Field label={t("New password")}>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>
            </>
          ) : (
            <p>
              {t(
                enabled ? "Disable this security preference?" : "Enable this security preference?",
              )}
            </p>
          )}
          <div className="security-dialog-code">
            <Field label={t("Email code")}>
              <input
                inputMode="numeric"
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value)}
              />
            </Field>
            <Button
              tone="outline"
              loading={busy}
              onClick={() => {
                setBusy(true)
                void issueSecurityChallenge(challenge)
                  .then(
                    () => setMessage(t("Verification code sent. Check your email.")),
                    (reason: unknown) => setMessage(readError(reason)),
                  )
                  .finally(() => setBusy(false))
              }}
            >
              {t("Send code")}
            </Button>
          </div>
          <Field label={t("Authenticator code")}>
            <input
              inputMode="numeric"
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value)}
            />
          </Field>
          {message ? (
            <p role="status" className="form-message">
              {message}
            </p>
          ) : null}
          <div className="security-dialog-actions">
            <Button tone="outline" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button loading={busy} onClick={() => void submit()}>
              {t("Confirm")}
            </Button>
          </div>
        </SecurityActionDialog>
      ) : null}
    </div>
  )
}

function sceneLabel(code: string): string {
  const names: Record<string, string> = {
    WITHDRAWAL: "Withdrawals",
    API_WITHDRAWAL: "API withdrawals",
    WHITELIST: "Withdrawal allowlist",
    TRANSFER: "Product transfers",
    LOGIN: "Login",
    CHANGE_PASSWORD: "Password changes",
    LARGE_TRANSFER: "Large transfers",
    API_KEY: "API key changes",
    SECURITY_SETTINGS: "Security settings",
  }
  return names[code] ?? code.replaceAll("_", " ")
}

function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : t("Request failed. Please try again later.")
}
