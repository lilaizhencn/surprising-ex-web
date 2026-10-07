import { useEffect, useState } from "react"
import { ApiError } from "../../api/client"
import type { LoginChallenge, LoginVerificationCodes } from "../../api/types"
import { Button, Field } from "../../components/ui/Primitives"
import { StandardDialog } from "../../components/ui/StandardDialog"
import { t } from "../../i18n"

export function verificationMessage(reason: unknown): string {
  if (reason instanceof ApiError && reason.status >= 500) {
    return t("The service is temporarily unavailable. Please try again shortly.")
  }
  if (reason instanceof ApiError && reason.status === 429) {
    return t("Too many attempts. Please wait a moment and try again.")
  }
  if (reason instanceof TypeError || (reason instanceof Error && reason.name === "TimeoutError")) {
    return t("Could not connect to the service. Check your connection and try again.")
  }
  const messages: Record<string, string> = {
    LOGIN_CHALLENGE_EXPIRED: "Verification expired or too many attempts. Please start again.",
    LOGIN_VERIFICATION_INVALID: "Incorrect verification code. Check all required codes.",
    LOGIN_VERIFICATION_RATE_LIMITED: "Too many requests. Please wait before trying again.",
    LOGIN_SMS_UNAVAILABLE: "SMS verification is not configured yet.",
    LOGIN_CODE_DELIVERY_FAILED: "Unable to send verification codes. Please try again later.",
    LOGIN_PASSWORD_INVALID: "Incorrect login password.",
    LOGIN_CONTACT_INVALID: "Enter a valid email address or international phone number.",
    LOGIN_CONTACT_MISSING: "Bind an email address or phone number before enabling this method.",
    LOGIN_SECURITY_CHANGED: "Security settings changed. Please contact support.",
    LOGIN_MFA_ENROLLMENT_REQUIRED:
      "This account requires an enrolled authenticator. Please contact support.",
  }
  const message = reason instanceof Error ? reason.message : "Request failed. Please try again."
  return t(messages[message] ?? message)
}

export function LoginVerificationDialog({
  challenge,
  onVerify,
  onResend,
  onCancel,
  enrollment,
}: {
  readonly challenge: LoginChallenge
  readonly onVerify: (codes: LoginVerificationCodes) => Promise<void>
  readonly onResend?: (challengeToken: string) => Promise<void>
  readonly enrollment?: { secret: string; qr: string } | null
  readonly onCancel: () => void
}) {
  const [codes, setCodes] = useState<Partial<Record<"EMAIL" | "PHONE" | "TOTP", string>>>({})
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(60)
  const [error, setError] = useState("")
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    const timeout = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(challenge.expiresAt) - Date.now()),
    )
    return () => clearTimeout(timeout)
  }, [challenge.expiresAt])
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])
  return (
    <StandardDialog
      title={t("Security verification")}
      subtitle={t("Enter every required code to complete verification.")}
      onClose={onCancel}
      closeDisabled={loading || resending}
      className="login-verification-dialog"
    >
      {challenge.simulated ? (
        <p className="verification-simulation-hint" role="status">
          {t("Test environment: use 123456 for email or SMS verification.")}
        </p>
      ) : null}
      {enrollment ? (
        <div className="authenticator-enrollment">
          <img
            src={enrollment.qr}
            width={180}
            height={180}
            alt={t("Scan with Google Authenticator")}
          />
          <p>{t("Scan with Google Authenticator")}</p>
          <code>{enrollment.secret}</code>
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (loading || expired) return
          setLoading(true)
          setError("")
          void onVerify({
            challengeToken: challenge.challengeToken,
            emailCode: codes.EMAIL,
            phoneCode: codes.PHONE,
            totpCode: codes.TOTP,
          })
            .catch((reason: unknown) => setError(verificationMessage(reason)))
            .finally(() => setLoading(false))
        }}
      >
        {challenge.methods.map((method) => (
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
            <input
              name={method.type}
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
              disabled={loading || expired}
              value={codes[method.type] ?? ""}
              onChange={(event) =>
                setCodes({ ...codes, [method.type]: event.target.value.replace(/\D/g, "") })
              }
            />
            {(method.type === "EMAIL" || method.type === "PHONE") && onResend ? (
              <div className="login-verification-resend">
                <Button
                  type="button"
                  tone="ghost"
                  disabled={loading || resending || expired || resendCooldown > 0}
                  loading={resending}
                  onClick={() => {
                    if (loading || resending || expired || resendCooldown > 0) return
                    setResending(true)
                    setError("")
                    void onResend(challenge.challengeToken)
                      .catch((reason: unknown) => setError(verificationMessage(reason)))
                      .finally(() => setResending(false))
                  }}
                >
                  {resendCooldown > 0
                    ? `${t("Resend code")} (${resendCooldown}s)`
                    : t("Resend code")}
                </Button>
              </div>
            ) : null}
          </Field>
        ))}
        {error || expired ? (
          <p role="alert">
            {expired ? t("Verification expired or too many attempts. Please start again.") : error}
          </p>
        ) : null}
        <Button type="submit" loading={loading} disabled={expired}>
          {t("Confirm")}
        </Button>
      </form>
    </StandardDialog>
  )
}
