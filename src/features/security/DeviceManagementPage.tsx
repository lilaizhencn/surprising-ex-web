import { MonitorSmartphone, ShieldBan } from "lucide-react"
import { useEffect, useState } from "react"
import {
  changeDeviceBlock,
  changeIpBlock,
  issueSecurityChallenge,
  loadDevices,
  loadLoginHistory,
  loadLoginIps,
  loadMfaStatus,
  revokeDevice,
  revokeUserSession,
} from "../../api/endpoints"
import type { ApiDeviceStatus, ApiIpStatus, ApiLoginHistoryEntry } from "../../api/types"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { SecurityActionDialog } from "./SecurityActionDialog"

type Action = {
  kind: "device" | "ip"
  value: string
  mode: "revoke" | "block" | "unblock"
  sessionId?: string
}

export function DeviceManagementPage() {
  const [devices, setDevices] = useState<readonly ApiDeviceStatus[]>([])
  const [ips, setIps] = useState<readonly ApiIpStatus[]>([])
  const [logins, setLogins] = useState<readonly ApiLoginHistoryEntry[]>([])
  const [action, setAction] = useState<Action | null>(null)
  const [emailCode, setEmailCode] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaStatusLoaded, setMfaStatusLoaded] = useState(false)
  const refresh = () => {
    setMfaStatusLoaded(false)
    setBusy(true)
    void Promise.all([loadDevices(), loadLoginIps(), loadLoginHistory(), loadMfaStatus()])
      .then(
        ([deviceRows, ipRows, history, mfaStatus]) => {
          setDevices(deviceRows)
          setIps(ipRows)
          setLogins(history.logs)
          setMfaEnabled(mfaStatus["enabled"] === true)
          setMfaStatusLoaded(true)
          setError("")
        },
        (reason: unknown) => setError(readError(reason)),
      )
      .finally(() => setBusy(false))
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
      if (action.kind === "device") {
        if (action.mode === "revoke") {
          if (action.value) await revokeDevice(action.value)
          else if (action.sessionId) await revokeUserSession(action.sessionId)
        } else {
          if (!emailCode || (mfaEnabled && !totpCode))
            throw new Error(t("Complete the required fields."))
          await changeDeviceBlock(action.value, action.mode === "block", emailCode, totpCode)
        }
      } else {
        if (!emailCode || (mfaEnabled && !totpCode))
          throw new Error(t("Complete the required fields."))
        await changeIpBlock(action.value, action.mode === "block", emailCode, totpCode)
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
          <h1>{t("Device management")}</h1>
          <p>
            {t(
              "Review signed-in devices and login IPs. Revoking a device ends its active sessions.",
            )}
          </p>
        </div>
        <MonitorSmartphone size={28} />
      </div>
      {error ? (
        <Panel>
          <StateView kind="error" message={error} retry={refresh} />
        </Panel>
      ) : null}
      <section className="section-block">
        <div className="panel-heading">
          <h2>{t("Devices")}</h2>
          <Button tone="outline" loading={busy} onClick={refresh}>
            {t("Refresh")}
          </Button>
        </div>
        {devices.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Device")}</th>
                  <th>{t("IP address")}</th>
                  <th>{t("Last login")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Action")}</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.deviceId ?? `session-${device.sessionId}`}>
                    <td>
                      {device.userAgent || t("Unknown device")}
                      {device.current ? (
                        <small className="muted"> · {t("Current device")}</small>
                      ) : null}
                    </td>
                    <td className="mono">{device.ipAddress ?? "—"}</td>
                    <td>{formatDate(device.lastSeen)}</td>
                    <td>
                      {t(device.blocked ? "Blocked" : device.active ? "Active" : "Signed out")}
                    </td>
                    <td>
                      <div className="inline-form">
                        {device.active && !device.current ? (
                          <Button
                            tone="outline"
                            onClick={() =>
                              setAction({
                                kind: "device",
                                value: device.deviceId ?? "",
                                mode: "revoke",
                                sessionId: String(device.sessionId),
                              })
                            }
                          >
                            {t("Sign out")}
                          </Button>
                        ) : null}
                        {device.deviceId && !device.current ? (
                          <Button
                            tone={device.blocked ? "outline" : "negative"}
                            onClick={() =>
                              setAction({
                                kind: "device",
                                value: device.deviceId ?? "",
                                mode: device.blocked ? "unblock" : "block",
                              })
                            }
                          >
                            {t(device.blocked ? "Allow login" : "Block login")}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Panel>
            <StateView kind={busy ? "loading" : "empty"} message={t("No devices yet.")} />
          </Panel>
        )}
      </section>
      <section className="section-block">
        <h2>{t("Login IP addresses")}</h2>
        {ips.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("IP address")}</th>
                  <th>{t("Logins")}</th>
                  <th>{t("Last login")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Action")}</th>
                </tr>
              </thead>
              <tbody>
                {ips.map((ip) => (
                  <tr key={ip.ipAddress}>
                    <td className="mono">{ip.ipAddress}</td>
                    <td>{ip.loginCount}</td>
                    <td>{formatDate(ip.lastSeen)}</td>
                    <td>{t(ip.blocked ? "Blocked" : "Allowed")}</td>
                    <td>
                      <Button
                        tone={ip.blocked ? "outline" : "negative"}
                        onClick={() =>
                          setAction({
                            kind: "ip",
                            value: ip.ipAddress,
                            mode: ip.blocked ? "unblock" : "block",
                          })
                        }
                      >
                        <ShieldBan size={15} /> {t(ip.blocked ? "Allow IP" : "Block IP")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Panel>
            <StateView kind={busy ? "loading" : "empty"} message={t("No login IPs yet.")} />
          </Panel>
        )}
      </section>
      <section className="section-block">
        <h2>{t("Recent login attempts")}</h2>
        {logins.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Time")}</th>
                  <th>{t("Result")}</th>
                  <th>{t("Reason")}</th>
                  <th>{t("IP address")}</th>
                  <th>{t("Device")}</th>
                </tr>
              </thead>
              <tbody>
                {logins.map((entry) => (
                  <tr key={String(entry.loginId)}>
                    <td>{formatDate(entry.createdAt)}</td>
                    <td>{entry.result}</td>
                    <td>{entry.reason ?? "—"}</td>
                    <td className="mono">{entry.ipAddress ?? "—"}</td>
                    <td>{entry.userAgent ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {action ? (
        <SecurityActionDialog
          title={t(
            action.mode === "revoke"
              ? "Sign out device"
              : action.mode === "block"
                ? "Block access"
                : "Allow access",
          )}
          onClose={close}
        >
          <p>
            {action.kind === "ip" ? action.value : t("This action affects the selected device.")}
          </p>
          {action.mode !== "revoke" ? (
            <>
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
            </>
          ) : null}
          {message ? (
            <p role="status" className="form-message">
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

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : t("Request failed. Please try again later.")
}
