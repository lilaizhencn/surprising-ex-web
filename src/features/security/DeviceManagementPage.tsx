import { MonitorSmartphone, ShieldBan } from "lucide-react"
import { useEffect, useState } from "react"
import {
  changeDeviceBlock,
  changeIpBlock,
  issueSecurityChallenge,
  loadDevices,
  loadLoginIps,
  loadMfaStatus,
  revokeDevice,
  revokeUserSession,
} from "../../api/endpoints"
import type { ApiDeviceStatus, ApiIpStatus } from "../../api/types"
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
  const [action, setAction] = useState<Action | null>(null)
  const [emailCode, setEmailCode] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaStatusLoaded, setMfaStatusLoaded] = useState(false)
  const visibleIps = ips.filter((ip) => !isPrivateIp(ip.ipAddress))
  const refresh = () => {
    setMfaStatusLoaded(false)
    setBusy(true)
    void Promise.all([loadDevices(), loadLoginIps(), loadMfaStatus()])
      .then(
        ([deviceRows, ipRows, mfaStatus]) => {
          setDevices(deviceRows)
          setIps(ipRows)
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
        {devices.length || visibleIps.length ? (
          <div className="device-management-list">
            {devices.map((device) => {
              const ip =
                device.ipAddress && !isPrivateIp(device.ipAddress)
                  ? visibleIps.find((item) => item.ipAddress === device.ipAddress)
                  : undefined
              return (
                <article
                  className="device-management-card"
                  key={device.deviceId ?? `session-${device.sessionId}`}
                >
                  <div className="device-management-heading">
                    <div className="device-management-identity">
                      <MonitorSmartphone size={20} aria-hidden="true" />
                      <div>
                        <strong>{describeDevice(device.userAgent)}</strong>
                        {device.current ? (
                          <small className="muted">{t("Current device")}</small>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`device-status ${device.blocked ? "is-blocked" : device.active ? "is-active" : ""}`}
                    >
                      {t(device.blocked ? "Blocked" : device.active ? "Active" : "Signed out")}
                    </span>
                  </div>
                  <div className="device-management-details">
                    <div>
                      <span>{t("IP address")}</span>
                      <strong className="mono">{displayIp(device.ipAddress)}</strong>
                    </div>
                    <div>
                      <span>{t("Last login")}</span>
                      <strong>{formatDate(device.lastSeen)}</strong>
                    </div>
                  </div>
                  <div className="device-management-actions">
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
                    {ip ? (
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
                    ) : null}
                  </div>
                </article>
              )
            })}
            {visibleIps
              .filter((ip) => !devices.some((device) => device.ipAddress === ip.ipAddress))
              .map((ip) => (
                <article className="device-management-card" key={`ip-${ip.ipAddress}`}>
                  <div className="device-management-heading">
                    <div className="device-management-identity">
                      <ShieldBan size={20} aria-hidden="true" />
                      <div>
                        <strong>{t("Login IP addresses")}</strong>
                        <small className="mono">{displayIp(ip.ipAddress)}</small>
                      </div>
                    </div>
                    <span className={`device-status ${ip.blocked ? "is-blocked" : "is-active"}`}>
                      {t(ip.blocked ? "Blocked" : "Allowed")}
                    </span>
                  </div>
                  <div className="device-management-details">
                    <div>
                      <span>{t("Last login")}</span>
                      <strong>{formatDate(ip.lastSeen)}</strong>
                    </div>
                    <div>
                      <span>{t("Logins")}</span>
                      <strong>{ip.loginCount}</strong>
                    </div>
                  </div>
                  <div className="device-management-actions">
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
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <Panel>
            <StateView kind={busy ? "loading" : "empty"} message={t("No devices yet.")} />
          </Panel>
        )}
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

function displayIp(value: string | null): string {
  if (!value) return "—"
  return isPrivateIp(value) ? "—" : value
}

function isPrivateIp(value: string): boolean {
  const normalized = value.toLowerCase()
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  )
    return true
  if (normalized.startsWith("::ffff:")) return isPrivateIp(normalized.slice(7))
  const octets = value.split(".").map(Number)
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false
  const [first = 0, second = 0] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    (first === 100 && second >= 64 && second <= 127)
  )
}

function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? ""
  if (/iPhone/i.test(ua)) return "iPhone"
  if (/iPad/i.test(ua)) return "iPad"
  if (/Android/i.test(ua)) {
    const model = ua.match(/;\s*([^;()]+?)\s+Build\//i)?.[1]?.trim()
    if (model && !/^(Android|Linux|K)$/i.test(model)) return model
    return "Android device"
  }
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac"
  if (/Windows NT/i.test(ua)) return "Windows PC"
  if (/Linux/i.test(ua)) return "Linux PC"
  return t("Unknown device")
}
function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : t("Request failed. Please try again later.")
}
