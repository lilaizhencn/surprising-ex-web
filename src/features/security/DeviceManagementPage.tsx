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
import { Badge, Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { SecurityActionDialog } from "./SecurityActionDialog"

type Action = {
  kind: "device" | "ip"
  value: string
  mode: "revoke" | "block" | "unblock"
  sessionId?: string
}
type DeviceTableRow = {
  key: string
  device?: ApiDeviceStatus
  ip?: ApiIpStatus | undefined
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
  const rows: DeviceTableRow[] = [
    ...devices.map((device) => ({
      key: device.deviceId ?? `session-${device.sessionId}`,
      device,
      ip: device.ipAddress
        ? visibleIps.find((item) => item.ipAddress === device.ipAddress)
        : undefined,
    })),
    ...visibleIps
      .filter((ip) => !devices.some((device) => device.ipAddress === ip.ipAddress))
      .map((ip) => ({ key: `ip-${ip.ipAddress}`, ip })),
  ]
  const [page, setPage] = useState(0)
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
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
        {rows.length ? (
          <div className="device-management-table-shell">
            <div className="table-wrap" aria-busy={busy}>
              <table className="data-table device-management-table">
                <thead>
                  <tr>
                    <th>{t("Device and IP")}</th>
                    <th>{t("Status")}</th>
                    <th>{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((row) => {
                    const blocked = row.device?.blocked ?? row.ip?.blocked ?? false
                    const active = row.device?.active ?? !blocked
                    return (
                      <tr key={row.key}>
                        <td>
                          <div className="device-table-identity">
                            <div className="device-table-title">
                              {row.device ? (
                                <MonitorSmartphone size={16} aria-hidden="true" />
                              ) : (
                                <ShieldBan size={16} aria-hidden="true" />
                              )}
                              <strong>
                                {row.device
                                  ? describeDevice(row.device.userAgent)
                                  : t("Login IP address")}
                              </strong>
                              {row.device?.current ? (
                                <Badge tone="info">{t("Current device")}</Badge>
                              ) : null}
                            </div>
                            <span className="device-table-ip mono">
                              {displayIp(row.device?.ipAddress ?? row.ip?.ipAddress ?? null)}
                            </span>
                            <small className="device-table-date">
                              {t("Last login")}:{" "}
                              {formatDate(row.device?.lastSeen ?? row.ip?.lastSeen ?? "")}
                              {row.ip ? ` · ${t("Logins")}: ${row.ip.loginCount}` : ""}
                            </small>
                          </div>
                        </td>
                        <td>
                          <Badge tone={blocked ? "negative" : active ? "positive" : "neutral"}>
                            {t(
                              blocked
                                ? "Blocked"
                                : row.device
                                  ? active
                                    ? "Active"
                                    : "Signed out"
                                  : "Allowed",
                            )}
                          </Badge>
                        </td>
                        <td>
                          <div className="device-table-actions">
                            {row.device?.active && !row.device.current ? (
                              <Button
                                tone="outline"
                                disabled={busy}
                                onClick={() =>
                                  setAction({
                                    kind: "device",
                                    value: row.device?.deviceId ?? "",
                                    mode: "revoke",
                                    sessionId: String(row.device?.sessionId),
                                  })
                                }
                              >
                                {t("Sign out")}
                              </Button>
                            ) : null}
                            {row.device?.deviceId && !row.device.current ? (
                              <Button
                                tone="outline"
                                disabled={busy}
                                onClick={() =>
                                  setAction({
                                    kind: "device",
                                    value: row.device?.deviceId ?? "",
                                    mode: row.device?.blocked ? "unblock" : "block",
                                  })
                                }
                              >
                                {t(row.device.blocked ? "Allow login" : "Block login")}
                              </Button>
                            ) : null}
                            {row.ip ? (
                              <Button
                                tone="outline"
                                disabled={busy}
                                onClick={() =>
                                  setAction({
                                    kind: "ip",
                                    value: row.ip?.ipAddress ?? "",
                                    mode: row.ip?.blocked ? "unblock" : "block",
                                  })
                                }
                              >
                                {t(row.ip.blocked ? "Allow IP" : "Block IP")}
                              </Button>
                            ) : null}
                            {(!row.device ||
                              row.device.current ||
                              (!row.device.active && !row.device.deviceId)) &&
                            !row.ip ? (
                              <span className="muted">—</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {pageCount > 1 ? (
              <nav className="device-table-pagination" aria-label={t("Device pages")}>
                <Button
                  tone="outline"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  {t("Previous")}
                </Button>
                <span>
                  {currentPage + 1} / {pageCount}
                </span>
                <Button
                  tone="outline"
                  disabled={currentPage + 1 >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {t("Next")}
                </Button>
              </nav>
            ) : null}
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
