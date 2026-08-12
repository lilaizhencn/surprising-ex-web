import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { authApi } from "../../api/endpoints"
import { Button, Field } from "../../components/ui/Primitives"
import { saveSession } from "../../state/session"

type AuthMode = "login" | "register" | "forgot" | "reset" | "verify"

export function AuthPage({ mode }: { readonly mode: AuthMode }) {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [contactMode, setContactMode] = useState<"email" | "phone">("email")
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const submit = async () => {
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
    setLoading(true)
    try {
      if (mode === "login") {
        const session = await authApi.login(identifier, password, totpCode.trim() || undefined)
        saveSession(session)
        window.location.href = session.requiresEmailVerification ? "/auth/verify-email" : "/assets"
      } else if (mode === "register") {
        const session = await authApi.register(identifier, password, contactMode)
        saveSession(session)
        window.location.href = session.requiresEmailVerification ? "/auth/verify-email" : "/assets"
      } else if (mode === "forgot") {
        await authApi.forgotPassword(identifier)
        setMessage("If the account exists, recovery instructions have been sent.")
      } else if (mode === "reset") {
        await authApi.resetPassword(identifier, code, password)
        setMessage("Password reset accepted. You can sign in now.")
      } else {
        await authApi.verifyEmail(identifier, code)
        setMessage("Email verified. Your account is ready.")
        window.location.href = "/assets"
      }
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "Request failed. Please try again.")
    } finally {
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
      <div className="auth-art" aria-hidden="true">
        <div className="art-band art-blue" />
        <div className="art-band art-red" />
      </div>
      <main className="auth-card">
        <a className="auth-brand" href="/">
          <span className="brand-mark">S</span>Surprising EX
        </a>
        <p className="auth-kicker">
          {mode === "login" ? "Sign in to your account" : "Account access"}
        </p>
        <h1>{title}</h1>
        <p className="auth-lead">
          {mode === "verify"
            ? "Enter the six-digit code sent to your registered email."
            : "Use your registered email or phone. Security checks are handled by the exchange backend."}
        </p>
        <div className="auth-form">
          {mode === "register" ? (
            <fieldset className="segment-control">
              <legend className="sr-only">Registration contact method</legend>
              <button
                type="button"
                className={contactMode === "email" ? "active" : ""}
                onClick={() => setContactMode("email")}
              >
                Email
              </button>
              <button
                type="button"
                className={contactMode === "phone" ? "active" : ""}
                onClick={() => setContactMode("phone")}
              >
                Phone
              </button>
            </fieldset>
          ) : null}
          <Field
            label={
              mode === "register" || mode === "forgot" || mode === "reset" || mode === "verify"
                ? mode === "register" && contactMode === "phone"
                  ? "Phone"
                  : "Email"
                : "Email or Phone"
            }
          >
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder={
                mode === "login"
                  ? "Enter your email or phone"
                  : mode === "register" && contactMode === "phone"
                    ? "+65 8123 4567"
                    : "name@example.com"
              }
              aria-label="Email or phone"
              autoComplete="username"
            />
          </Field>
          {mode === "reset" || mode === "verify" ? (
            <Field label="Verification code">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                placeholder="Enter code"
                aria-label="Verification code"
              />
            </Field>
          ) : null}
          {mode === "login" ? (
            <Field label="Authenticator code (if enabled)">
              <input
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                aria-label="Authenticator code"
              />
            </Field>
          ) : null}
          {mode !== "forgot" && mode !== "verify" ? (
            <Field label="Password">
              <div className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  aria-label="Password"
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
          {message ? (
            <p className="form-message" role="alert">
              {message}
            </p>
          ) : null}
          <Button loading={loading} onClick={() => void submit()}>
            {mode === "login"
              ? "Log In"
              : mode === "register"
                ? "Create Account"
                : mode === "forgot"
                  ? "Send Recovery"
                  : mode === "reset"
                    ? "Reset Password"
                    : "Verify Email"}{" "}
            <ArrowRight size={16} />
          </Button>
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
              Resend code
            </Button>
          ) : null}
        </div>
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <a href="/auth/reset-password">Forgot password?</a>
              <span>
                Don't have an account? <a href="/auth/register">Create Account</a>
              </span>
            </>
          ) : (
            <a href="/auth/login">Back to login</a>
          )}
        </div>
      </main>
    </div>
  )
}
