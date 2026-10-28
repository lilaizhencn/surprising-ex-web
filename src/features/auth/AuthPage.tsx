import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { type AffiliateInvitation, affiliateApi } from "../../api/affiliate"
import { ApiError } from "../../api/client"
import { authApi } from "../../api/endpoints"
import { type LoginChallenge, LoginChallengeSchema } from "../../api/types"
import { Button, Field } from "../../components/ui/Primitives"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { t } from "../../i18n"
import { saveSession } from "../../state/session"
import { clearInvitation, invitationCode } from "../affiliate/invitation"
import { authDestination, authReturnPath } from "./authReturn"
import { LoginVerificationDialog, verificationMessage } from "./LoginVerificationDialog"

import { TelegramLoginButton } from "./TelegramLoginButton"

type AuthMode = "login" | "register" | "forgot" | "reset" | "verify"

export function AuthPage({ mode }: { readonly mode: AuthMode }) {
  const returnQuery =
    authReturnPath(window.location.search) === "/assets"
      ? ""
      : `?redirect=${encodeURIComponent(authReturnPath(window.location.search))}`
  const [inviteCode, setInviteCode] = useState(invitationCode)
  const [invitePreview, setInvitePreview] = useState<AffiliateInvitation | null>(null)
  const [inviteError, setInviteError] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null)
  const [contactMode, setContactMode] = useState<"email" | "phone">("email")
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [credentialsRejected, setCredentialsRejected] = useState(false)
  const loginErrorDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (credentialsRejected) loginErrorDialog.current?.showModal()
    else loginErrorDialog.current?.close()
  }, [credentialsRejected])
  useEffect(() => {
    if (mode !== "register" || !inviteCode.trim()) {
      setInvitePreview(null)
      setInviteError("")
      return
    }
    const controller = new AbortController()
    setInvitePreview(null)
    setInviteError("")
    void affiliateApi
      .preview(inviteCode.trim(), controller.signal)
      .then(setInvitePreview)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setInviteError(error instanceof Error ? error.message : "邀请码验证失败")
      })
    return () => controller.abort()
  }, [mode, inviteCode])
  const submitting = useRef(false)
  const submit = async () => {
    if (submitting.current || loading) return
    setMessage("")
    const passwordRequired = mode === "login" || mode === "register" || mode === "reset"
    if (!identifier || (passwordRequired && !password)) {
      setMessage("Please complete the required fields.")
      return
    }
    if ((mode === "reset" || mode === "verify") && !code) {
      setMessage("Enter the verification code.")
      return
    }
    submitting.current = true
    setLoading(true)
    try {
      if (mode === "login") {
        const session = await authApi.login(identifier, password)
        setPassword("")
        if ("requiresVerification" in session && session.requiresVerification) {
          setChallenge(LoginChallengeSchema.parse(session))
          return
        }
        if (!("accessToken" in session)) return
        saveSession(session)
        navigateInApplication(
          authDestination(session.requiresEmailVerification, window.location.search),
        )
      } else if (mode === "register") {
        const session = await authApi.register(identifier, password, contactMode, inviteCode)
        clearInvitation()
        saveSession(session)
        navigateInApplication(
          authDestination(session.requiresEmailVerification, window.location.search),
        )
      } else if (mode === "forgot") {
        await authApi.forgotPassword(identifier)
        setMessage("If the account exists, recovery instructions have been sent.")
      } else if (mode === "reset") {
        await authApi.resetPassword(identifier, code, password)
        setMessage("Password reset accepted. You can sign in now.")
      } else {
        await authApi.verifyEmail(identifier, code)
        setMessage("Email verified. Your account is ready.")
        navigateInApplication(authReturnPath(window.location.search))
      }
    } catch (reason: unknown) {
      if (mode === "login" && reason instanceof ApiError && reason.status === 401) {
        setCredentialsRejected(true)
      } else if (mode === "login" && reason instanceof ApiError && reason.status === 403) {
        setMessage(t("This account cannot sign in right now. Please contact support."))
      } else {
        setMessage(verificationMessage(reason))
      }
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }
  const title =
    mode === "login"
      ? "Sign in to your account"
      : mode === "register"
        ? "Create Account"
        : mode === "forgot"
          ? "Recover your account"
          : mode === "reset"
            ? "Reset your password"
            : "Verify your email"
  return (
    <div className="auth-page">
      {challenge ? (
        <LoginVerificationDialog
          key={challenge.challengeToken}
          challenge={challenge}
          onCancel={() => setChallenge(null)}
          onVerify={async (codes) => {
            const session = await authApi.verifyLogin(codes)
            saveSession(session)
            navigateInApplication(
              authDestination(session.requiresEmailVerification, window.location.search),
            )
          }}
        />
      ) : null}
      <dialog
        ref={loginErrorDialog}
        className="standard-dialog auth-error-dialog"
        aria-labelledby="login-error-title"
        aria-describedby="login-error-description"
        onClose={() => setCredentialsRejected(false)}
      >
        <h2 id="login-error-title">{t("Sign-in failed")}</h2>
        <p id="login-error-description">{t("Incorrect username or password.")}</p>
        <Button onClick={() => setCredentialsRejected(false)}>{t("Confirm")}</Button>
      </dialog>
      <div className="auth-art" aria-hidden="true">
        <div className="art-band art-blue" />
        <div className="art-band art-red" />
      </div>
      <main className="auth-card">
        <a className="auth-brand auth-platform-logo" href="/" aria-label="Surprising EX">
          <span className="auth-logo-mark" aria-hidden="true" />
          <span className="sr-only">Surprising EX</span>
        </a>
        <h1 className="sr-only">{t(title)}</h1>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {mode === "register" ? (
            <fieldset className="segment-control">
              <legend className="sr-only">{t("Registration contact method")}</legend>
              <button
                type="button"
                className={contactMode === "email" ? "active" : ""}
                onClick={() => setContactMode("email")}
              >
                {" "}
                {t("Email")}{" "}
              </button>
              <button
                type="button"
                className={contactMode === "phone" ? "active" : ""}
                onClick={() => setContactMode("phone")}
              >
                {" "}
                {t("Phone")}{" "}
              </button>
            </fieldset>
          ) : null}
          <Field
            label={
              mode === "register" || mode === "forgot" || mode === "reset" || mode === "verify"
                ? mode === "register" && contactMode === "phone"
                  ? t("Phone")
                  : t("Email")
                : t("Email or phone")
            }
          >
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder={
                mode === "login"
                  ? t("Enter your email or phone")
                  : mode === "register" && contactMode === "phone"
                    ? "+65 8123 4567"
                    : "name@example.com"
              }
              aria-label={t("Email or phone")}
              autoComplete="username"
            />
          </Field>
          {mode === "reset" || mode === "verify" ? (
            <Field label={t("Verification code")}>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                placeholder={t("Enter code")}
                aria-label={t("Verification code")}
              />
            </Field>
          ) : null}
          {mode !== "forgot" && mode !== "verify" ? (
            <Field label={t("Password")}>
              <div className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("Enter your password")}
                  aria-label={t("Password")}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
          ) : null}
          {mode === "register" && (
            <Field label="邀请码（选填）" error={inviteError}>
              <input
                aria-label="邀请码（选填）"
                value={inviteCode}
                maxLength={64}
                onChange={(event) => setInviteCode(event.target.value)}
              />
              {invitePreview && (
                <p>
                  邀请人 UID {invitePreview.inviterId} ·{" "}
                  {invitePreview.cooperation
                    ? `接受团队合作，下级比例 ${Number(invitePreview.sharePpm) / 10000}%；本人交易不向团队上级返佣`
                    : "注册后接受邀请，符合条件的手续费将自动参与返佣核算"}
                </p>
              )}
            </Field>
          )}
          {message ? (
            <p className="form-message" role="alert">
              {t(message)}
            </p>
          ) : null}
          <Button type="submit" loading={loading}>
            {mode === "login"
              ? t("Log In")
              : mode === "register"
                ? t("Create Account")
                : mode === "forgot"
                  ? "Send Recovery"
                  : mode === "reset"
                    ? "Reset Password"
                    : "Verify Email"}{" "}
            <ArrowRight size={16} />
          </Button>
          {(mode === "login" || mode === "register") && !challenge ? (
            <TelegramLoginButton
              disabled={loading}
              onBusyChange={setLoading}
              onError={setMessage}
              onLogin={(result) => {
                setPassword("")
                if ("requiresVerification" in result && result.requiresVerification) {
                  setChallenge(LoginChallengeSchema.parse(result))
                  return
                }
                if (!("accessToken" in result)) return
                saveSession(result)
                navigateInApplication(
                  authDestination(result.requiresEmailVerification, window.location.search),
                )
              }}
            />
          ) : null}
          {mode === "verify" ? (
            <Button
              tone="outline"
              disabled={loading}
              onClick={() => {
                setLoading(true)
                void authApi
                  .resendEmailVerification()
                  .then(
                    () => setMessage("A new verification code has been issued."),
                    (reason: unknown) =>
                      setMessage(
                        reason instanceof Error ? reason.message : "Unable to resend code.",
                      ),
                  )
                  .finally(() => setLoading(false))
              }}
            >
              {" "}
              {t("Resend code")}{" "}
            </Button>
          ) : null}
        </form>
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <a href={`/auth/forgot-password${returnQuery}`}>{t("Forgot password?")}</a>
              <span>
                {" "}
                {t("Don't have an account?")}{" "}
                <a href={`/auth/register${returnQuery}`}>{t("Create Account")}</a>
              </span>
            </>
          ) : (
            <a href={`/auth/login${returnQuery}`}>{t("Back to login")}</a>
          )}
        </div>
      </main>
    </div>
  )
}
