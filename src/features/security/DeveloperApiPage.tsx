import { KeyRound } from "lucide-react"
import { useEffect, useState } from "react"
import {
  createApiKey,
  issueSecurityChallenge,
  loadApiKeys,
  loadMfaStatus,
  revokeApiKey,
  updateApiKeyIpAllowlist,
} from "../../api/endpoints"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { SecurityActionDialog } from "./SecurityActionDialog"

type Key = Readonly<Record<string, unknown>>
type Action = { kind: "create" } | { kind: "allowlist" | "revoke"; key: Key }

export function DeveloperApiPage() {
  const [keys, setKeys] = useState<readonly Key[]>([])
  const [action, setAction] = useState<Action | null>(null)
  const [label, setLabel] = useState("")
  const [tradePermission, setTradePermission] = useState(false)
  const [withdrawPermission, setWithdrawPermission] = useState(false)
  const [allowlist, setAllowlist] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [secret, setSecret] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaStatusLoaded, setMfaStatusLoaded] = useState(false)
  const refresh = () => {
    setMfaStatusLoaded(false)
    void Promise.all([loadApiKeys(), loadMfaStatus()])
      .then(([apiKeys, mfaStatus]) => {
        setKeys(apiKeys)
        setMfaEnabled(mfaStatus["enabled"] === true)
        setMfaStatusLoaded(true)
        setError("")
      })
      .catch((reason: unknown) => setError(readError(reason)))
  }
  useEffect(refresh, [])
  const close = () => {
    setAction(null)
    setEmailCode("")
    setTotpCode("")
    setMessage("")
  }
  const submit = async () => {
    if (!action) return
    setBusy(true)
    setMessage("")
    try {
      if (!emailCode || (mfaEnabled && !totpCode))
        throw new Error(t("Complete the required fields."))
      const addresses = allowlist
        .split(/[\s,]+/)
        .map((ip) => ip.trim())
        .filter(Boolean)
      if (action.kind === "create") {
        if (!label.trim()) throw new Error(t("Enter a key name."))
        const permissions = [
          "READ",
          ...(tradePermission ? ["TRADE"] : []),
          ...(withdrawPermission ? ["WITHDRAW"] : []),
        ]
        const result = await createApiKey(label.trim(), permissions, addresses, emailCode, totpCode)
        setSecret(String(result["secret"] ?? ""))
      } else {
        const apiKey = String(action.key["apiKey"] ?? "")
        if (action.kind === "allowlist")
          await updateApiKeyIpAllowlist(apiKey, addresses, emailCode, totpCode)
        else await revokeApiKey(apiKey, emailCode, totpCode)
      }
      close()
      refresh()
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
          <h1>{t("Developer API")}</h1>
          <p>{t("Create API keys, choose permissions, and manage IP allowlists.")}</p>
        </div>
        <KeyRound size={28} />
      </div>
      {secret ? (
        <Panel>
          <h2>{t("Save your API secret now")}</h2>
          <p>{t("The secret is shown only once.")}</p>
          <code className="api-secret">{secret}</code>
          <Button tone="outline" onClick={() => setSecret("")}>
            {t("I have saved it")}
          </Button>
        </Panel>
      ) : null}
      {error ? (
        <Panel>
          <StateView kind="error" message={error} retry={refresh} />
        </Panel>
      ) : null}
      <div className="panel-heading">
        <h2>{t("API keys")}</h2>
        <Button
          onClick={() => {
            setSecret("")
            setLabel("")
            setTradePermission(false)
            setWithdrawPermission(false)
            setAllowlist("")
            setAction({ kind: "create" })
          }}
        >
          {t("Create API key")}
        </Button>
      </div>
      {keys.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("API key")}</th>
                <th>{t("Permissions")}</th>
                <th>{t("IP allowlist")}</th>
                <th>{t("Status")}</th>
                <th>{t("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const active = String(key["status"] ?? "").toUpperCase() === "ACTIVE"
                return (
                  <tr key={String(key["apiKey"])}>
                    <td>{String(key["label"] ?? "")}</td>
                    <td className="mono">{String(key["apiKey"] ?? "")}</td>
                    <td>{String(key["permissions"] ?? "")}</td>
                    <td>
                      {Array.isArray(key["ipAllowlist"])
                        ? key["ipAllowlist"].join(", ") || "—"
                        : "—"}
                    </td>
                    <td>{String(key["status"] ?? "")}</td>
                    <td>
                      {active ? (
                        <div className="inline-form">
                          <Button
                            tone="outline"
                            onClick={() => {
                              setAllowlist(
                                Array.isArray(key["ipAllowlist"])
                                  ? key["ipAllowlist"].join(", ")
                                  : "",
                              )
                              setAction({ kind: "allowlist", key })
                            }}
                          >
                            {t("Edit IPs")}
                          </Button>
                          <Button
                            tone="negative"
                            onClick={() => setAction({ kind: "revoke", key })}
                          >
                            {t("Revoke")}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Panel>
          <StateView kind="empty" message={t("No API keys yet.")} />
        </Panel>
      )}
      {action ? (
        <SecurityActionDialog
          title={t(
            action.kind === "create"
              ? "Create API key"
              : action.kind === "allowlist"
                ? "Edit IP allowlist"
                : "Revoke API key",
          )}
          onClose={close}
        >
          {action.kind === "create" ? (
            <>
              <Field label={t("Name")}>
                <input value={label} onChange={(event) => setLabel(event.target.value)} />
              </Field>
              <fieldset className="api-permissions">
                <legend>{t("Permissions")}</legend>
                <label>
                  <input type="checkbox" checked readOnly /> {t("Read")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={tradePermission}
                    onChange={(event) => setTradePermission(event.target.checked)}
                  />{" "}
                  {t("Trade")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={withdrawPermission}
                    onChange={(event) => setWithdrawPermission(event.target.checked)}
                  />{" "}
                  {t("Withdraw")}
                </label>
              </fieldset>
            </>
          ) : null}
          {action.kind !== "revoke" ? (
            <Field
              label={t("IP allowlist")}
              hint="Comma-separated IP addresses. Leave empty to allow any IP."
            >
              <textarea
                value={allowlist}
                onChange={(event) => setAllowlist(event.target.value)}
                rows={3}
              />
            </Field>
          ) : (
            <p>{t("Revoke this API key permanently?")}</p>
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
              disabled={!mfaStatusLoaded}
              onClick={() => {
                setBusy(true)
                void issueSecurityChallenge("SECURITY_SETTINGS")
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
          {mfaEnabled ? (
            <Field label={t("Authenticator code")}>
              <input
                inputMode="numeric"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
              />
            </Field>
          ) : null}
          {message ? (
            <p className="form-message" role="status">
              {message}
            </p>
          ) : null}
          <div className="security-dialog-actions">
            <Button loading={busy} disabled={!mfaStatusLoaded} onClick={() => void submit()}>
              {t("Confirm")}
            </Button>
          </div>
        </SecurityActionDialog>
      ) : null}
    </div>
  )
}

function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : t("Request failed. Please try again later.")
}
