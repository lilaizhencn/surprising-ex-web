import { MonitorSmartphone, ShieldBan } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
import { Badge, Button, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"
import { SecurityActionDialog } from "./SecurityActionDialog"
import { VerificationFields } from "./VerificationFields"
import "./SecurityPages.css"

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
  const session = useSession()
  return session ? (
    <AccountDevices key={String(session.user.userId)} />
  ) : (
    <div className="account-content security-tools-page">
      <h1>{t("Device management")}</h1>
      <Panel>
        <p>{t("Sign in to manage account security.")}</p>
        <a className="button button-primary" href="/auth/login">
          {t("Go to login")}
        </a>
      </Panel>
    </div>
  )
}
function AccountDevices() {
  const [devices, setDevices] = useState<readonly ApiDeviceStatus[]>([])
  const [ips, setIps] = useState<readonly ApiIpStatus[]>([])
  const [action, setAction] = useState<Action | null>(null)
  const [emailCode, setEmailCode] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [message, setMessage] = useState("")
  const [info, setInfo] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaStatusLoaded, setMfaStatusLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [devicesReady, setDevicesReady] = useState(false)
  const [ipsReady, setIpsReady] = useState(false)
  const [writeBlocked, setWriteBlocked] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState("")
  const [reload, setReload] = useState(0)
  const lock = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    return () => abort.abort()
  }, [])
  const visibleIps = ips.filter((ip) => !isPrivateIp(ip.ipAddress))
  const rows: DeviceTableRow[] = [
    ...devices.map((device) => ({
      key: `session-${device.sessionId}`,
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
  const refresh = () => setReload((value) => value + 1)
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setMfaStatusLoaded(false)
    setDevicesReady(false)
    setIpsReady(false)
    setDevices([])
    setIps([])
    setError("")
    void Promise.allSettled([
      loadDevices(abort.signal),
      loadLoginIps(abort.signal),
      loadMfaStatus(abort.signal),
    ]).then(([deviceResult, ipResult, security]) => {
      if (abort.signal.aborted) return
      const errors: string[] = []
      if (deviceResult.status === "fulfilled") {
        setDevices(deviceResult.value)
        setDevicesReady(true)
      } else errors.push(t("Devices") + ": " + readError(deviceResult.reason))
      if (ipResult.status === "fulfilled") {
        setIps(ipResult.value)
        setIpsReady(true)
      } else errors.push(t("Login IP address") + ": " + readError(ipResult.reason))
      if (security.status === "fulfilled") {
        setMfaEnabled(security.value.enabled)
        setMfaStatusLoaded(true)
      } else errors.push(t("Security requirements are unavailable. Refresh before making changes."))
      if (deviceResult.status === "fulfilled" && ipResult.status === "fulfilled")
        setWriteBlocked(false)
      setError(errors.join("\n"))
      setLoading(false)
    })
    return () => abort.abort()
  }, [reload])
  const close = () => {
    if (lock.current) return
    setAction(null)
    setEmailCode("")
    setTotpCode("")
    setMessage("")
    setInfo("")
  }
  const begin = (next: Action) => {
    if (lock.current || loading || writeBlocked || (next.mode !== "revoke" && !mfaStatusLoaded))
      return
    setEmailCode("")
    setTotpCode("")
    setMessage("")
    setInfo("")
    setNotice("")
    setAction(next)
  }
  const send = async () => {
    const signal = lifetime.current?.signal
    if (!signal || signal.aborted || lock.current) return
    lock.current = true
    setBusy(true)
    setSending(true)
    setMessage("")
    setInfo("")
    try {
      await issueSecurityChallenge("SECURITY_SETTINGS", signal)
      if (!signal.aborted) setInfo(t("Verification code sent. Check your email."))
    } catch (reason) {
      if (!signal.aborted) setMessage(readError(reason))
    } finally {
      lock.current = false
      if (!signal.aborted) {
        setBusy(false)
        setSending(false)
      }
    }
  }
  const submit = async () => {
    const signal = lifetime.current?.signal
    if (!action || !signal || signal.aborted || lock.current || writeBlocked) return
    if (
      action.mode !== "revoke" &&
      (!mfaStatusLoaded || !emailCode.trim() || (mfaEnabled && !totpCode.trim()))
    ) {
      setMessage(t("Complete the required fields."))
      return
    }
    lock.current = true
    setBusy(true)
    setSending(false)
    setMessage("")
    setInfo("")
    try {
      if (action.kind === "device" && action.mode === "revoke") {
        if (action.value) await revokeDevice(action.value, signal)
        else if (action.sessionId) await revokeUserSession(action.sessionId, signal)
        else throw new Error(t("The selected device is unavailable. Refresh and try again."))
      } else if (action.kind === "device")
        await changeDeviceBlock(
          action.value,
          action.mode === "block",
          emailCode.trim(),
          totpCode.trim(),
          signal,
        )
      else
        await changeIpBlock(
          action.value,
          action.mode === "block",
          emailCode.trim(),
          totpCode.trim(),
          signal,
        )
      if (!signal.aborted) {
        setAction(null)
        setEmailCode("")
        setTotpCode("")
        setNotice(t("Account access setting updated."))
        refresh()
      }
    } catch (reason) {
      if (!signal.aborted) {
        setMessage(readError(reason))
        setWriteBlocked(true)
        setEmailCode("")
        setTotpCode("")
      }
    } finally {
      lock.current = false
      if (!signal.aborted) setBusy(false)
    }
  }
  const selectedDevice =
    action?.kind === "device"
      ? devices.find((device) =>
          action.value ? device.deviceId === action.value : device.sessionId === action.sessionId,
        )
      : null
  const currentIp = devices.find((device) => device.current)?.ipAddress
  return (
    <div className="account-content security-tools-page">
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
      {notice ? (
        <p role="status" className="security-notice">
          {notice}
        </p>
      ) : null}
      {writeBlocked && !action ? (
        <p role="alert" className="security-impact">
          {t("Refresh access records and check the operation result before continuing.")}
        </p>
      ) : null}
      {error ? (
        <Panel>
          <StateView kind="error" message={error} retry={refresh} />
        </Panel>
      ) : null}
      <section className="section-block">
        <div className="panel-heading">
          <h2>{t("Devices")}</h2>
          <Button tone="outline" loading={loading} disabled={busy} onClick={refresh}>
            {t("Refresh")}
          </Button>
        </div>
        {loading ? (
          <Panel>
            <div role="status" aria-busy="true">
              <StateView kind="loading" message="Loading devices" />
              <span className="sr-only">{t("Loading devices")}</span>
            </div>
          </Panel>
        ) : rows.length ? (
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
                          {row.device && row.ip?.blocked ? (
                            <Badge tone="negative">{t("IP blocked")}</Badge>
                          ) : null}
                        </td>
                        <td>
                          <div className="device-table-actions">
                            {row.device?.active && !row.device.current ? (
                              <Button
                                tone="outline"
                                disabled={busy || loading || writeBlocked}
                                onClick={() =>
                                  begin({
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
                            {row.device?.deviceId && !row.device.current && mfaStatusLoaded ? (
                              <Button
                                tone="outline"
                                disabled={busy || loading || writeBlocked}
                                onClick={() =>
                                  begin({
                                    kind: "device",
                                    value: row.device?.deviceId ?? "",
                                    mode: row.device?.blocked ? "unblock" : "block",
                                  })
                                }
                              >
                                {t(row.device.blocked ? "Allow login" : "Block login")}
                              </Button>
                            ) : null}
                            {row.ip && mfaStatusLoaded ? (
                              <Button
                                tone="outline"
                                disabled={
                                  busy ||
                                  loading ||
                                  writeBlocked ||
                                  (!row.ip.blocked && row.ip.ipAddress === currentIp)
                                }
                                onClick={() =>
                                  begin({
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
            {devicesReady && ipsReady ? (
              <StateView kind="empty" message="No devices yet." />
            ) : (
              <p role="status">
                {t("Some access records are unavailable. Refresh to check the remaining records.")}
              </p>
            )}
          </Panel>
        )}
      </section>
      {(devices.length === 100 || ips.length === 100) && (
        <p className="muted">{t("Showing up to 100 recent devices and 100 login IP records.")}</p>
      )}
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
          closeDisabled={busy}
        >
          <fieldset className="security-action-fields" disabled={busy}>
            <div className="security-target">
              <strong>
                {action.kind === "ip"
                  ? t("Login IP address")
                  : describeDevice(selectedDevice?.userAgent ?? null)}
              </strong>
              <code>{action.value || action.sessionId}</code>
              {selectedDevice ? (
                <p>
                  {t("Last login")}: {formatDate(selectedDevice.lastSeen)}
                </p>
              ) : null}
            </div>
            <p className="security-impact">
              {t(
                action.mode === "revoke"
                  ? "Signing out ends this device's active sessions."
                  : action.mode === "block"
                    ? "Blocking prevents future access for this device or IP."
                    : "Allowing access removes this device or IP restriction.",
              )}
            </p>
            {action.mode !== "revoke" ? (
              <VerificationFields
                email={emailCode}
                totp={totpCode}
                onEmail={setEmailCode}
                onTotp={setTotpCode}
                mfaEnabled={mfaEnabled}
                sending={sending}
                disabled={busy || writeBlocked}
                onSend={() => void send()}
              />
            ) : null}
            {info ? <p role="status">{info}</p> : null}
            {message ? (
              <p role="alert" className="form-message">
                {message}
              </p>
            ) : null}
            <div className="security-dialog-actions">
              {writeBlocked ? (
                <Button
                  tone="outline"
                  onClick={() => {
                    close()
                    refresh()
                  }}
                >
                  {t("Refresh and check")}
                </Button>
              ) : (
                <Button
                  loading={busy && !sending}
                  disabled={busy || (action.mode !== "revoke" && !mfaStatusLoaded)}
                  onClick={() => void submit()}
                >
                  {t("Confirm")}
                </Button>
              )}
            </div>
          </fieldset>
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
