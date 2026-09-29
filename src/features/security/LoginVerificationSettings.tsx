import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { authApi } from "../../api/endpoints"
import type { LoginChallenge } from "../../api/types"
import { Button, Field, Panel } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { LoginVerificationDialog, verificationMessage } from "../auth/LoginVerificationDialog"
import { SecurityActionDialog } from "./SecurityActionDialog"

type Method = "EMAIL" | "PHONE" | "TOTP"
type Setting = { type: Method; bound: boolean; enabled: boolean; destination: string | null }
export function LoginVerificationSettings({ onChange }: { readonly onChange: () => void }) {
  const [settings, setSettings] = useState<Setting[]>([])
  const [editing, setEditing] = useState<{ method: Method; enabled: boolean } | null>(null)
  const [password, setPassword] = useState("")
  const [destination, setDestination] = useState("")
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null)
  const [enrollment, setEnrollment] = useState<{ secret: string; qr: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    void authApi
      .loginMethods()
      .then(setSettings)
      .catch((reason) => setError(verificationMessage(reason)))
  }, [])
  const close = () => {
    setEnrollment(null)
    setChallenge(null)
    setEditing(null)
    setPassword("")
    setDestination("")
  }
  return (
    <section className="section-block">
      <h2>{t("Login verification methods")}</h2>
      {error ? <p role="alert">{error}</p> : null}
      <div className="security-grid">
        {settings.map((setting) => (
          <Panel key={setting.type} dense>
            <h3>
              {t(
                setting.type === "EMAIL"
                  ? "Email login verification"
                  : setting.type === "PHONE"
                    ? "SMS login verification"
                    : "Google Authenticator",
              )}
            </h3>
            <p>
              {setting.bound ? (setting.destination ?? t("Bound")) : t("Not bound")} ·{" "}
              {t(setting.enabled ? "Enabled" : "Disabled")}
            </p>
            <button
              type="button"
              aria-label={t(
                setting.type === "EMAIL"
                  ? "Email login verification"
                  : setting.type === "PHONE"
                    ? "SMS login verification"
                    : "Google Authenticator",
              )}
              className="button button-outline"
              onClick={() => {
                close()
                setError("")
                setEditing({ method: setting.type, enabled: !setting.enabled })
              }}
            >
              {t(setting.enabled ? "Disable" : setting.bound ? "Enable" : "Bind")}
            </button>
            {setting.type !== "TOTP" ? (
              <Button
                tone="ghost"
                onClick={() => {
                  close()
                  setError("")
                  setEditing({ method: setting.type, enabled: true })
                }}
              >
                {t(setting.bound ? "Change binding" : "Bind")}
              </Button>
            ) : null}
          </Panel>
        ))}
      </div>
      {editing && !challenge ? (
        <SecurityActionDialog
          title={t(
            editing.method === "EMAIL"
              ? "Email login verification"
              : editing.method === "PHONE"
                ? "SMS login verification"
                : "Google Authenticator",
          )}
          onClose={close}
        >
          <h3>
            {t(
              editing.method === "EMAIL"
                ? "Email login verification"
                : editing.method === "PHONE"
                  ? "SMS login verification"
                  : "Google Authenticator",
            )}{" "}
            · {t(editing.enabled ? "Verify and enable" : "Verify and disable")}
          </h3>
          <Field label={t("Login Password")}>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {editing.enabled && editing.method !== "TOTP" ? (
            <Field label={t(editing.method === "EMAIL" ? "Email" : "Phone")}>
              <input
                type={editing.method === "EMAIL" ? "email" : "tel"}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={t("Leave blank to use the current binding.")}
              />
            </Field>
          ) : null}
          <Button
            loading={busy}
            disabled={!password}
            onClick={() => {
              setBusy(true)
              setError("")
              void authApi
                .bindLoginMethod(editing.method, password, destination, editing.enabled)
                .then(async (result) => {
                  if (result.secret && result.provisioningUri)
                    setEnrollment({
                      secret: result.secret,
                      qr: await QRCode.toDataURL(result.provisioningUri),
                    })
                  setChallenge(result.challenge)
                })
                .catch((reason) => setError(verificationMessage(reason)))
                .finally(() => setBusy(false))
            }}
          >
            {t("Send verification code")}
          </Button>
          <Button tone="ghost" disabled={busy} onClick={close}>
            {t("Cancel")}
          </Button>
        </SecurityActionDialog>
      ) : null}
      {challenge && editing ? (
        <LoginVerificationDialog
          key={challenge.challengeToken}
          challenge={challenge}
          enrollment={enrollment}
          onCancel={close}
          onVerify={async (codes) => {
            await authApi.confirmLoginMethod(editing.method, codes, password)
            setSettings(await authApi.loginMethods())
            close()
            onChange()
          }}
        />
      ) : null}
    </section>
  )
}
