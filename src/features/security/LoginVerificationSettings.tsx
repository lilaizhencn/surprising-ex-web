import QRCode from "qrcode"
import "./LoginVerificationSettings.css"
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
  const [editing, setEditing] = useState<{
    method: Method
    enabled: boolean
    changeBinding: boolean
  } | null>(null)
  const [password, setPassword] = useState("")
  const [passwordVerified, setPasswordVerified] = useState(false)
  const [codes, setCodes] = useState<Partial<Record<Method, string>>>({})
  const [cooldown, setCooldown] = useState(0)
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
  const selectedSetting = settings.find((setting) => setting.type === editing?.method)
  const stagedEmail =
    editing?.method === "EMAIL" &&
    editing.enabled &&
    selectedSetting?.bound &&
    !editing.changeBinding
  const verificationMethods = challenge?.methods ?? [
    { type: "EMAIL" as const, destination: selectedSetting?.destination ?? null },
  ]
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])
  const close = () => {
    setEnrollment(null)
    setChallenge(null)
    setEditing(null)
    setPassword("")
    setDestination("")
    setPasswordVerified(false)
    setCodes({})
    setCooldown(0)
    setError("")
  }
  return (
    <section className="section-block">
      <h2>{t("Login verification methods")}</h2>
      {error && !editing ? <p role="alert">{error}</p> : null}
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
                setEditing({
                  method: setting.type,
                  enabled: !setting.enabled,
                  changeBinding: false,
                })
              }}
            >
              {t(setting.enabled ? "Disable" : setting.bound ? "Enable" : "Bind")}
            </button>
            {setting.type !== "TOTP" && setting.bound ? (
              <Button
                tone="ghost"
                onClick={() => {
                  close()
                  setError("")
                  setEditing({ method: setting.type, enabled: true, changeBinding: true })
                }}
              >
                {t(setting.bound ? "Change binding" : "Bind")}
              </Button>
            ) : null}
          </Panel>
        ))}
      </div>
      {editing && (!challenge || stagedEmail) ? (
        <SecurityActionDialog
          title={t(
            editing.method === "EMAIL"
              ? "Email login verification"
              : editing.method === "PHONE"
                ? "SMS login verification"
                : "Google Authenticator",
          )}
          onClose={() => {
            if (!busy) close()
          }}
        >
          <p className="muted">
            {t("Changing a security method disables withdrawals for 24 hours.")}
          </p>
          {editing.method === "PHONE" && editing.enabled ? (
            <p className="muted">
              {t(
                editing.changeBinding
                  ? "To change your bound phone, enter your password and the new phone number."
                  : "To bind a phone, enter your password and phone number. We will send a code to verify it.",
              )}
            </p>
          ) : null}
          {challenge?.simulated ? (
            <p className="verification-simulation-hint" role="status">
              {t("Test environment: use 123456 for email or SMS verification.")}
            </p>
          ) : null}
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
          {stagedEmail && passwordVerified ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (!challenge || busy) return
                setBusy(true)
                setError("")
                void authApi
                  .confirmLoginMethod(
                    editing.method,
                    {
                      challengeToken: challenge.challengeToken,
                      emailCode: codes.EMAIL,
                      phoneCode: codes.PHONE,
                      totpCode: codes.TOTP,
                    },
                    password,
                  )
                  .then(async () => {
                    setSettings(await authApi.loginMethods())
                    close()
                    onChange()
                  })
                  .catch((reason) => setError(verificationMessage(reason)))
                  .finally(() => setBusy(false))
              }}
            >
              {verificationMethods.map((method) => (
                <Field
                  key={method.type}
                  label={t(
                    method.type === "EMAIL"
                      ? "Email verification code"
                      : method.type === "PHONE"
                        ? "SMS verification code"
                        : "Google Authenticator code",
                  )}
                >
                  {method.destination ? <small>{method.destination}</small> : null}
                  <div className="login-method-code-row">
                    <input
                      aria-label={t(
                        method.type === "EMAIL"
                          ? "Email verification code"
                          : method.type === "PHONE"
                            ? "SMS verification code"
                            : "Google Authenticator code",
                      )}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      required
                      disabled={busy}
                      value={codes[method.type] ?? ""}
                      onChange={(event) =>
                        setCodes({ ...codes, [method.type]: event.target.value.replace(/\D/g, "") })
                      }
                    />
                    {method.type === "EMAIL" ? (
                      <Button
                        disabled={busy || cooldown > 0}
                        onClick={() => {
                          setBusy(true)
                          setError("")
                          void authApi
                            .bindLoginMethod("EMAIL", password, "", true)
                            .then((result) => {
                              setChallenge(result.challenge)
                              setCodes({})
                              setCooldown(60)
                            })
                            .catch((reason) => setError(verificationMessage(reason)))
                            .finally(() => setBusy(false))
                        }}
                      >
                        {cooldown > 0 ? `${cooldown}s` : t(challenge ? "Resend code" : "Send code")}
                      </Button>
                    ) : null}
                  </div>
                </Field>
              ))}
              <Button
                type="submit"
                loading={busy}
                disabled={
                  !challenge ||
                  verificationMethods.some((method) => !/^\d{6}$/.test(codes[method.type] ?? ""))
                }
              >
                {t("Confirm")}
              </Button>
            </form>
          ) : (
            <>
              <Field label={t("Login Password")}>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {editing.enabled &&
              editing.method !== "TOTP" &&
              (editing.changeBinding || !selectedSetting?.bound) ? (
                <Field label={t(editing.method === "EMAIL" ? "Email" : "Phone")}>
                  <input
                    type={editing.method === "EMAIL" ? "email" : "tel"}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                  />
                </Field>
              ) : null}
              <div className="security-dialog-actions">
                <Button
                  loading={busy}
                  disabled={
                    !password ||
                    (editing.enabled &&
                      editing.method !== "TOTP" &&
                      (editing.changeBinding || !selectedSetting?.bound) &&
                      !destination.trim())
                  }
                  onClick={() => {
                    setBusy(true)
                    setError("")
                    if (stagedEmail) {
                      void authApi
                        .verifyLoginMethodPassword(editing.method, password)
                        .then(() => setPasswordVerified(true))
                        .catch((reason) => setError(verificationMessage(reason)))
                        .finally(() => setBusy(false))
                      return
                    }
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
                  {t(
                    stagedEmail || editing.method === "TOTP"
                      ? "Continue"
                      : "Send verification code",
                  )}
                </Button>
              </div>
            </>
          )}
          {error ? <p role="alert">{error}</p> : null}
        </SecurityActionDialog>
      ) : null}
      {challenge && editing && !stagedEmail ? (
        <LoginVerificationDialog
          key={challenge.challengeToken}
          challenge={challenge}
          enrollment={enrollment}
          {...(editing.method === "TOTP" && editing.enabled
            ? {
                onResend: async (challengeToken: string) => {
                  setChallenge(await authApi.resendLoginMethodCode("TOTP", challengeToken))
                },
              }
            : {})}
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
