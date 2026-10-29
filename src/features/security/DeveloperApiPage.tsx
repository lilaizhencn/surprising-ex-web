import { Copy, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ApiError } from "../../api/client"
import {
  createApiKey,
  issueSecurityChallenge,
  loadApiKeys,
  loadMfaStatus,
  revokeApiKey,
  updateApiKey,
} from "../../api/endpoints"
import type { ApiSecurityKey } from "../../api/types"
import { Badge, Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"
import { SecurityActionDialog } from "./SecurityActionDialog"
import { VerificationFields } from "./VerificationFields"
import "./SecurityPages.css"

type Action = { kind: "create" } | { kind: "edit" | "revoke"; key: ApiSecurityKey }
export function DeveloperApiPage() {
  const session = useSession()
  return session ? (
    <AccountApiKeys key={String(session.user.userId)} />
  ) : (
    <div className="account-content">
      <h1>{t("Developer API")}</h1>
      <Panel>
        <p>{t("Sign in to manage account security.")}</p>
        <a href="/auth/login" className="button button-primary">
          {t("Go to login")}
        </a>
      </Panel>
    </div>
  )
}
function AccountApiKeys() {
  const [keys, setKeys] = useState<ApiSecurityKey[] | null>(null)
  const [mfa, setMfa] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [securityError, setSecurityError] = useState("")
  const [reload, setReload] = useState(0)
  const [action, setAction] = useState<Action | null>(null)
  const [label, setLabel] = useState("")
  const [trade, setTrade] = useState(false)
  const [withdraw, setWithdraw] = useState(false)
  const [allowlist, setAllowlist] = useState("")
  const [email, setEmail] = useState("")
  const [totp, setTotp] = useState("")
  const [message, setMessage] = useState("")
  const [info, setInfo] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState<"send" | "write" | "">("")
  const [writeBlocked, setWriteBlocked] = useState(false)
  const [created, setCreated] = useState<Awaited<ReturnType<typeof createApiKey>> | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [copyStatus, setCopyStatus] = useState("")
  const [page, setPage] = useState(0)
  const lock = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  const secretTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    return () => abort.abort()
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setKeys(null)
    setMfa(null)
    setError("")
    setSecurityError("")
    void Promise.allSettled([loadApiKeys(abort.signal), loadMfaStatus(abort.signal)]).then(
      ([list, security]) => {
        if (abort.signal.aborted) return
        if (list.status === "fulfilled") {
          setKeys(list.value)
          setWriteBlocked(false)
        } else setError(readError(list.reason))
        if (security.status === "fulfilled") setMfa(security.value.enabled)
        else setSecurityError(readError(security.reason))
        setLoading(false)
      },
    )
    return () => abort.abort()
  }, [reload])
  useEffect(() => {
    if (created) secretTitle.current?.focus({ preventScroll: true })
  }, [created])
  const close = () => {
    if (lock.current) return
    setAction(null)
    setEmail("")
    setTotp("")
    setMessage("")
    setInfo("")
  }
  const begin = (next: Action) => {
    if (lock.current || created || writeBlocked || loading || mfa === null || !keys) return
    setAction(next)
    setLabel(next.kind === "edit" ? next.key.label : "")
    setTrade(next.kind === "edit" && next.key.permissions.split(",").includes("TRADE"))
    setWithdraw(next.kind === "edit" && next.key.permissions.split(",").includes("WITHDRAW"))
    setAllowlist(next.kind === "edit" ? next.key.ipAllowlist.join(", ") : "")
    setEmail("")
    setTotp("")
    setMessage("")
    setInfo("")
    setNotice("")
  }
  const send = async () => {
    const signal = lifetime.current?.signal
    if (!signal || signal.aborted || lock.current) return
    lock.current = true
    setBusy("send")
    setMessage("")
    setInfo("")
    try {
      await issueSecurityChallenge("SECURITY_SETTINGS", signal)
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
    const addresses = [
      ...new Set(
        allowlist
          .split(/[\s,]+/)
          .map((ip) => ip.trim())
          .filter(Boolean),
      ),
    ]
    if (!email.trim() || (mfa && !totp.trim())) {
      setMessage(t("Complete the required fields."))
      return
    }
    if (addresses.length > 100 || addresses.some((ip) => ip.length > 64)) {
      setMessage(t("Use up to 100 IP addresses or CIDR ranges, each up to 64 characters."))
      return
    }
    if (action.kind !== "revoke" && (!label.trim() || label.trim().length > 80)) {
      setMessage(t("Use a key name from 1 to 80 characters."))
      return
    }
    if (action.kind !== "revoke" && (trade || withdraw) && addresses.length === 0) {
      setMessage(t("An IP allowlist is required for trading or withdrawals."))
      return
    }
    lock.current = true
    setBusy("write")
    setMessage("")
    setInfo("")
    try {
      if (action.kind === "create") {
        const result = await createApiKey(
          label.trim(),
          ["READ", ...(trade ? ["TRADE"] : []), ...(withdraw ? ["WITHDRAW"] : [])],
          addresses,
          email.trim(),
          totp.trim(),
          signal,
        )
        if (signal.aborted) return
        setCreated(result)
        setRevealed(false)
        setCopyStatus("")
      } else if (action.kind === "edit")
        await updateApiKey(
          action.key.apiKey,
          label.trim(),
          ["READ", ...(trade ? ["TRADE"] : []), ...(withdraw ? ["WITHDRAW"] : [])],
          addresses,
          email.trim(),
          totp.trim(),
          signal,
        )
      else await revokeApiKey(action.key.apiKey, email.trim(), totp.trim(), signal)
      if (!signal.aborted) {
        setAction(null)
        setEmail("")
        setTotp("")
        setNotice(t("API key setting updated."))
        setReload((value) => value + 1)
      }
    } catch (reason) {
      if (!signal.aborted) {
        setMessage(readError(reason))
        setEmail("")
        setTotp("")
        setWriteBlocked(
          !(reason instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(reason.status)),
        )
      }
    } finally {
      lock.current = false
      if (!signal.aborted) setBusy("")
    }
  }
  const copySecret = async () => {
    if (!created) return
    setCopyStatus("")
    try {
      await navigator.clipboard.writeText(created.secret)
      if (!lifetime.current?.signal.aborted) setCopyStatus(t("Copied."))
    } catch {
      if (!lifetime.current?.signal.aborted)
        setCopyStatus(t("Copy failed. Select and copy the secret manually."))
    }
  }
  const dismissSecret = () => {
    if (!window.confirm(t("The secret cannot be shown again after closing. Have you saved it?")))
      return
    setCreated(null)
    setRevealed(false)
    setCopyStatus("")
  }
  const pages = Math.max(1, Math.ceil((keys?.length ?? 0) / 8)),
    current = Math.min(page, pages - 1)
  return (
    <div className="account-content security-tools-page">
      <div className="page-heading">
        <div>
          <h1>{t("Developer API")}</h1>
          <p>{t("Create API keys, choose permissions, and manage IP allowlists.")}</p>
        </div>
        <KeyRound size={28} aria-hidden="true" />
      </div>
      {notice ? (
        <p role="status" className="security-notice">
          {notice}
        </p>
      ) : null}
      {writeBlocked && !action ? (
        <p role="alert" className="security-impact">
          {t(
            "Refresh the key list and check the operation result before continuing. A failed creation may not return its secret.",
          )}
        </p>
      ) : null}
      {securityError ? (
        <Panel>
          <p role="alert" className="inline-error">
            {securityError}
          </p>
          <p className="muted">
            {t("Security requirements are unavailable. Refresh before making changes.")}
          </p>
          <Button tone="outline" onClick={() => setReload((value) => value + 1)}>
            {t("Retry")}
          </Button>
        </Panel>
      ) : null}
      <div className="panel-heading">
        <h2>{t("API keys")}</h2>
        <div className="button-row">
          <Button
            tone="outline"
            loading={loading}
            disabled={Boolean(busy)}
            onClick={() => setReload((value) => value + 1)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {t("Refresh")}
          </Button>
          <Button
            disabled={
              loading || mfa === null || !keys || writeBlocked || Boolean(created) || Boolean(busy)
            }
            onClick={() => begin({ kind: "create" })}
          >
            {t("Create API key")}
          </Button>
        </div>
      </div>
      {loading ? (
        <Panel>
          <div role="status" aria-busy="true">
            <StateView kind="loading" message="Loading API keys" />
            <span className="sr-only">{t("Loading API keys")}</span>
          </div>
        </Panel>
      ) : error ? (
        <Panel>
          <StateView kind="error" message={error} retry={() => setReload((value) => value + 1)} />
        </Panel>
      ) : !keys?.length ? (
        <Panel>
          <StateView kind="empty" message="No API keys yet." />
        </Panel>
      ) : (
        <>
          <div className="api-key-cards">
            {keys.slice(current * 8, current * 8 + 8).map((key) => (
              <Panel className="api-key-card" key={key.apiKey}>
                <div className="panel-heading">
                  <h3>{key.label}</h3>
                  <Badge tone={key.status === "ACTIVE" ? "positive" : "neutral"}>
                    {t(key.status === "ACTIVE" ? "Active" : "Revoked")}
                  </Badge>
                </div>
                <span className="field-label">{t("API key")}</span>
                <code className="api-key-identifier">{key.apiKey}</code>
                <div className="api-key-permissions">
                  {key.permissions.split(",").map((permission) => (
                    <Badge
                      key={permission}
                      tone={permission === "WITHDRAW" ? "warning" : "neutral"}
                    >
                      {t(
                        (
                          { READ: "Read", TRADE: "Trade", WITHDRAW: "Withdraw" } as Record<
                            string,
                            string
                          >
                        )[permission] ?? permission,
                      )}
                    </Badge>
                  ))}
                </div>
                {key.ipAllowlist.length ? (
                  <details>
                    <summary>
                      {t("IP allowlist")} · {key.ipAllowlist.length}
                    </summary>
                    <ul className="api-ip-list">
                      {key.ipAllowlist.map((ip) => (
                        <li key={ip}>
                          <code>{ip}</code>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <p className="muted">{t("Any IP address")}</p>
                )}
                <small className="muted">
                  {t("Created")}: {new Date(key.createdAt).toLocaleString()}
                </small>
                {key.lastUsedAt ? (
                  <small className="muted">
                    {t("Last used")}: {new Date(key.lastUsedAt).toLocaleString()}
                  </small>
                ) : null}
                {key.status === "ACTIVE" ? (
                  <div className="button-row">
                    <Button
                      tone="outline"
                      disabled={mfa === null || writeBlocked || Boolean(busy)}
                      onClick={() => begin({ kind: "edit", key })}
                    >
                      {t("Edit API key")}
                    </Button>
                    <Button
                      tone="negative"
                      disabled={mfa === null || writeBlocked || Boolean(busy)}
                      onClick={() => begin({ kind: "revoke", key })}
                    >
                      {t("Revoke")}
                    </Button>
                  </div>
                ) : null}
              </Panel>
            ))}
          </div>
          {pages > 1 ? (
            <nav className="device-table-pagination" aria-label={t("API key pages")}>
              <Button
                tone="outline"
                disabled={current === 0 || Boolean(busy)}
                onClick={() => setPage(current - 1)}
              >
                {t("Previous")}
              </Button>
              <span>
                {current + 1} / {pages}
              </span>
              <Button
                tone="outline"
                disabled={current + 1 === pages || Boolean(busy)}
                onClick={() => setPage(current + 1)}
              >
                {t("Next")}
              </Button>
            </nav>
          ) : null}
        </>
      )}
      {action ? (
        <SecurityActionDialog
          title={t(
            action.kind === "create"
              ? "Create API key"
              : action.kind === "edit"
                ? "Edit API key"
                : "Revoke API key",
          )}
          onClose={close}
          closeDisabled={Boolean(busy)}
        >
          <fieldset className="security-action-fields" disabled={Boolean(busy)}>
            {action.kind !== "create" ? (
              <div className="security-target">
                <strong>{action.key.label}</strong>
                <code>{action.key.apiKey}</code>
                <p>
                  {t("Permissions")}: {action.key.permissions}
                </p>
              </div>
            ) : null}
            {action.kind !== "revoke" ? (
              <>
                <Field label={t("Name")}>
                  <input
                    aria-label={t("Name")}
                    maxLength={80}
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </Field>
                <fieldset className="api-permissions">
                  <legend>{t("Permissions")}</legend>
                  <label>
                    <input type="checkbox" checked disabled />
                    {t("Read")}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={trade}
                      onChange={(event) => setTrade(event.target.checked)}
                    />
                    {t("Trade")}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={withdraw}
                      onChange={(event) => setWithdraw(event.target.checked)}
                    />
                    {t("Withdraw")}
                  </label>
                </fieldset>
                {withdraw ? (
                  <p className="security-impact">
                    {t(
                      "Withdrawal permission allows this key to request withdrawals. Review the IP allowlist before confirming.",
                    )}
                  </p>
                ) : null}
              </>
            ) : null}
            {action.kind !== "revoke" ? (
              <>
                <Field
                  label={t("IP allowlist")}
                  hint="IP addresses or CIDR ranges, separated by commas. Trading and withdrawals require an IP allowlist."
                >
                  <textarea
                    aria-label={t("IP allowlist")}
                    value={allowlist}
                    onChange={(event) => setAllowlist(event.target.value)}
                    rows={3}
                  />
                </Field>
                {!allowlist.trim() ? (
                  <p className="security-impact">
                    {t("This key will not be restricted by an IP allowlist.")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="security-impact">{t("Revoke this API key permanently?")}</p>
            )}
            <VerificationFields
              email={email}
              totp={totp}
              onEmail={setEmail}
              onTotp={setTotp}
              mfaEnabled={mfa === true}
              sending={busy === "send"}
              disabled={Boolean(busy) || writeBlocked}
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
                  {t(
                    "Refresh the key list and check the operation result before continuing. A failed creation may not return its secret.",
                  )}
                </p>
                <Button
                  tone="outline"
                  onClick={() => {
                    close()
                    setReload((value) => value + 1)
                  }}
                >
                  {t("Refresh and check")}
                </Button>
              </>
            ) : (
              <Button
                loading={busy === "write"}
                disabled={Boolean(busy)}
                tone={action.kind === "revoke" ? "negative" : "primary"}
                onClick={() => void submit()}
              >
                {t("Confirm")}
              </Button>
            )}
          </fieldset>
        </SecurityActionDialog>
      ) : null}
      {created ? (
        <SecurityActionDialog title={t("Save your API secret now")} onClose={dismissSecret}>
          <h3 ref={secretTitle} tabIndex={-1}>
            {created.apiKey.label}
          </h3>
          <p>{t("The secret is shown only once.")}</p>
          <span className="field-label">{t("API key")}</span>
          <code className="api-key-identifier">{created.apiKey.apiKey}</code>
          <Field label={t("API secret")}>
            <input
              className="api-secret-input"
              aria-label={t("API secret")}
              type={revealed ? "text" : "password"}
              readOnly
              autoComplete="off"
              spellCheck={false}
              value={created.secret}
            />
          </Field>
          <div className="button-row">
            <Button tone="outline" onClick={() => setRevealed((value) => !value)}>
              {revealed ? (
                <EyeOff size={16} aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
              {t(revealed ? "Hide secret" : "Show secret")}
            </Button>
            <Button tone="outline" onClick={() => void copySecret()}>
              <Copy size={16} aria-hidden="true" />
              {t("Copy secret")}
            </Button>
          </div>
          {copyStatus ? <p role="status">{copyStatus}</p> : null}
          <Button
            onClick={() => {
              setCreated(null)
              setRevealed(false)
              setCopyStatus("")
            }}
          >
            {t("I have saved it")}
          </Button>
        </SecurityActionDialog>
      ) : null}
    </div>
  )
}
function readError(reason: unknown) {
  return reason instanceof Error ? reason.message : t("Request failed. Please try again later.")
}
