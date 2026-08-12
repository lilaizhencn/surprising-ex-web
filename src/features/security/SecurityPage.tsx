import {
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import {
  changePassword,
  confirmMfa,
  createApiKey,
  disableMfa,
  enrollMfa,
  loadApiKeys,
  loadMfaStatus,
  loadSecurityScenes,
  revokeApiKey,
  updateSecurityScene,
} from "../../api/endpoints"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { loadSession } from "../../state/session"

type RecordRow = Readonly<Record<string, unknown>>

export function SecurityPage() {
  const session = loadSession()
  const [mfa, setMfa] = useState<RecordRow | null>(null)
  const [scenes, setScenes] = useState<readonly RecordRow[]>([])
  const [keys, setKeys] = useState<readonly RecordRow[]>([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showMfa, setShowMfa] = useState(false)
  const [showKeyForm, setShowKeyForm] = useState(false)

  const refresh = () => {
    if (!session) return
    setBusy(true)
    void Promise.all([loadMfaStatus(), loadSecurityScenes(), loadApiKeys()])
      .then(([mfaResult, sceneResult, keyResult]) => {
        setMfa(mfaResult)
        setScenes(sceneResult)
        setKeys(keyResult)
        setMessage("")
      })
      .catch((reason: unknown) => setMessage(readError(reason)))
      .finally(() => setBusy(false))
  }
  useEffect(refresh, [session])

  if (!session)
    return (
      <div className="account-content">
        <div className="page-heading">
          <div>
            <h1>Security Center</h1>
            <p>Manage authentication, high-risk verification and API access.</p>
          </div>
        </div>
        <Panel>
          <StateView kind="error" message="Sign in to manage account security." />
          <a className="route-link" href="/auth/login">
            Go to login
          </a>
        </Panel>
      </div>
    )

  const mfaEnabled = booleanValue(mfa, "enabled") || booleanValue(mfa, "enrolled")
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>Security Center</h1>
          <p>Manage authentication, high-risk verification and API access from backend state.</p>
        </div>
        <div className="security-score">
          <ShieldCheck size={24} />
          <span>{mfaEnabled ? "Protected" : "Review required"}</span>
        </div>
      </div>
      {message ? (
        <div className="inline-error" role="alert">
          {message}
        </div>
      ) : null}
      <section className="section-block">
        <h2>Verification & Authentication</h2>
        <div className="security-grid">
          <SecurityCard
            icon={<LockKeyhole />}
            title="Login Password"
            text="Change your password after current-password and security verification."
            action="Change password"
            onClick={() => setShowPassword(true)}
          />
          <SecurityCard
            icon={<Smartphone />}
            title="Authenticator App (2FA)"
            text={
              mfa
                ? mfaEnabled
                  ? "Authenticator is enabled for high-risk operations."
                  : "Authenticator is not enabled."
                : "Loading MFA status..."
            }
            action={mfaEnabled ? "Disable 2FA" : "Enable 2FA"}
            onClick={() => setShowMfa(true)}
          />
          <SecurityCard
            icon={<CheckCircle2 />}
            title="Email Verification"
            text="Email verification and security challenges are controlled by the backend."
            action="Review scenes"
            onClick={() =>
              document.getElementById("security-scenes")?.scrollIntoView({ behavior: "smooth" })
            }
          />
          <SecurityCard
            icon={<MonitorSmartphone />}
            title="Passkey"
            text="The current backend exposes no passkey registration contract."
            action="Backend pending"
          />
        </div>
      </section>
      {showPassword ? (
        <PasswordPanel
          onDone={(value) => {
            setMessage(value)
            setShowPassword(false)
          }}
        />
      ) : null}
      {showMfa ? (
        <MfaPanel
          enabled={mfaEnabled}
          onDone={(value) => {
            setMessage(value)
            setShowMfa(false)
            refresh()
          }}
        />
      ) : null}
      <section className="section-block" id="security-scenes">
        <div className="panel-heading">
          <h2>Security scenes</h2>
          <span className="muted">Each change requires email and TOTP verification.</span>
        </div>
        {scenes.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scene</th>
                  <th>Status</th>
                  <th>Verification</th>
                </tr>
              </thead>
              <tbody>
                {scenes.map((scene, index) => (
                  <SceneRow
                    key={sceneCode(scene) || String(index)}
                    scene={scene}
                    onDone={(value) => {
                      setMessage(value)
                      refresh()
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Panel>
            <StateView
              kind={busy ? "loading" : "empty"}
              message="No security scenes returned by the backend."
              retry={refresh}
            />
          </Panel>
        )}
      </section>
      <section className="section-block">
        <div className="panel-heading">
          <h2>API Management</h2>
          <Button tone="outline" onClick={() => setShowKeyForm((value) => !value)}>
            <KeyRound size={16} /> {showKeyForm ? "Close" : "Create API key"}
          </Button>
        </div>
        {showKeyForm ? (
          <ApiKeyForm
            onDone={(value) => {
              setMessage(value)
              setShowKeyForm(false)
              refresh()
            }}
          />
        ) : null}
        {keys.length === 0 ? (
          <StateView
            kind={busy ? "loading" : "empty"}
            message="No API keys returned by the backend."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Key</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((key, index) => (
                  <ApiKeyRow
                    key={text(key, "apiKey") || text(key, "key") || String(index)}
                    value={key}
                    onDone={(value) => {
                      setMessage(value)
                      refresh()
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="section-block">
        <h2>Account tools</h2>
        <div className="security-grid">
          <SecurityCard
            icon={<MonitorSmartphone />}
            title="Device management"
            text="The current backend has admin-only session routes; no user device mutation contract is exposed."
            action="Backend pending"
          />
        </div>
      </section>
    </div>
  )
}

function SecurityCard({
  icon,
  title,
  text,
  action,
  onClick,
}: {
  readonly icon: ReactNode
  readonly title: string
  readonly text: string
  readonly action?: string
  readonly onClick?: () => void
}) {
  return (
    <Panel className="security-card">
      <div className="security-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action ? (
        <Button tone="outline" onClick={onClick} disabled={!onClick}>
          {action}
        </Button>
      ) : null}
    </Panel>
  )
}

function PasswordPanel({ onDone }: { readonly onDone: (message: string) => void }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [email, setEmail] = useState("")
  const [totp, setTotp] = useState("")
  const [loading, setLoading] = useState(false)
  return (
    <Panel className="security-action-panel">
      <h2>Change password</h2>
      <div className="grid-2">
        <Field label="Current password">
          <input
            type="password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <Field label="New password">
          <input type="password" value={next} onChange={(event) => setNext(event.target.value)} />
        </Field>
        <Field label="Email code">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Authenticator code">
          <input
            value={totp}
            onChange={(event) => setTotp(event.target.value)}
            inputMode="numeric"
          />
        </Field>
      </div>
      <Button
        loading={loading}
        onClick={() => {
          if (!current || !next || !email || !totp) {
            onDone("请完整填写密码和安全验证码。")
            return
          }
          setLoading(true)
          void changePassword(current, next, email, totp)
            .then(
              () => onDone("密码修改请求已完成。"),
              (reason: unknown) => onDone(readError(reason)),
            )
            .finally(() => setLoading(false))
        }}
      >
        Confirm password change
      </Button>
    </Panel>
  )
}

function MfaPanel({
  enabled,
  onDone,
}: {
  readonly enabled: boolean
  readonly onDone: (message: string) => void
}) {
  const [code, setCode] = useState("")
  const [secret, setSecret] = useState("")
  const [loading, setLoading] = useState(false)
  return (
    <Panel className="security-action-panel">
      <h2>{enabled ? "Disable authenticator" : "Enable authenticator"}</h2>
      {!enabled && secret ? (
        <p className="notice">
          Scan or save this backend-issued secret: <strong className="mono">{secret}</strong>
        </p>
      ) : null}
      <Field label="Authenticator code">
        <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
      </Field>
      <Button
        loading={loading}
        onClick={() => {
          if (!code) {
            onDone("请输入 TOTP 验证码。")
            return
          }
          setLoading(true)
          const operation = enabled ? disableMfa(code) : confirmMfa(code)
          void operation
            .then(
              () => onDone(enabled ? "2FA 已关闭。" : "2FA 已启用。"),
              (reason: unknown) => onDone(readError(reason)),
            )
            .finally(() => setLoading(false))
        }}
      >
        {enabled ? "Disable 2FA" : "Confirm 2FA"}
      </Button>
      {!enabled && !secret ? (
        <Button
          tone="ghost"
          onClick={() => {
            setLoading(true)
            void enrollMfa().then(
              (result) => {
                setSecret(text(result, "secret") || text(result, "totpSecret"))
                setLoading(false)
              },
              (reason: unknown) => {
                onDone(readError(reason))
                setLoading(false)
              },
            )
          }}
        >
          Issue enrollment secret
        </Button>
      ) : null}
    </Panel>
  )
}

function SceneRow({
  scene,
  onDone,
}: {
  readonly scene: RecordRow
  readonly onDone: (message: string) => void
}) {
  const [email, setEmail] = useState("")
  const [totp, setTotp] = useState("")
  const [loading, setLoading] = useState(false)
  const enabled = booleanValue(scene, "enabled")
  return (
    <tr>
      <td>{sceneCode(scene) || "Security operation"}</td>
      <td>{enabled ? "Enabled" : "Disabled"}</td>
      <td>
        <div className="inline-form">
          <input
            placeholder="Email code"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label="Scene email code"
          />
          <input
            placeholder="TOTP"
            value={totp}
            onChange={(event) => setTotp(event.target.value)}
            aria-label="Scene TOTP code"
          />
          <Button
            loading={loading}
            tone="outline"
            onClick={() => {
              setLoading(true)
              void updateSecurityScene(sceneCode(scene), !enabled, email, totp)
                .then(
                  () => onDone("安全场景已更新。"),
                  (reason: unknown) => onDone(readError(reason)),
                )
                .finally(() => setLoading(false))
            }}
          >
            Toggle
          </Button>
        </div>
      </td>
    </tr>
  )
}

function ApiKeyForm({ onDone }: { readonly onDone: (message: string) => void }) {
  const [label, setLabel] = useState("")
  const [email, setEmail] = useState("")
  const [totp, setTotp] = useState("")
  const [loading, setLoading] = useState(false)
  return (
    <Panel className="security-action-panel">
      <div className="grid-2">
        <Field label="Label">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Trading bot"
          />
        </Field>
        <Field label="Permissions">
          <input value="READ_ONLY" readOnly />
        </Field>
        <Field label="Email code">
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Authenticator code">
          <input value={totp} onChange={(event) => setTotp(event.target.value)} />
        </Field>
      </div>
      <Button
        loading={loading}
        onClick={() => {
          if (!label || !email || !totp) {
            onDone("请完整填写 API Key 信息和安全验证码。")
            return
          }
          setLoading(true)
          void createApiKey(label, ["READ_ONLY"], [], email, totp)
            .then(
              (result) =>
                onDone(`API Key 已创建：${text(result, "apiKey") || "请立即安全保存一次性密钥"}`),
              (reason: unknown) => onDone(readError(reason)),
            )
            .finally(() => setLoading(false))
        }}
      >
        Create API key
      </Button>
    </Panel>
  )
}

function ApiKeyRow({
  value,
  onDone,
}: {
  readonly value: RecordRow
  readonly onDone: (message: string) => void
}) {
  const [email, setEmail] = useState("")
  const [totp, setTotp] = useState("")
  const [loading, setLoading] = useState(false)
  const key = text(value, "apiKey") || text(value, "key")
  return (
    <tr>
      <td>{text(value, "label") || "—"}</td>
      <td className="mono">{key || "—"}</td>
      <td>{text(value, "permissions") || "—"}</td>
      <td>{text(value, "status") || "ACTIVE"}</td>
      <td>
        <div className="inline-form">
          <input
            placeholder="Email code"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label="API key email code"
          />
          <input
            placeholder="TOTP"
            value={totp}
            onChange={(event) => setTotp(event.target.value)}
            aria-label="API key TOTP code"
          />
          <Button
            tone="negative"
            loading={loading}
            onClick={() => {
              setLoading(true)
              void revokeApiKey(key, email, totp)
                .then(
                  () => onDone("API Key 已撤销。"),
                  (reason: unknown) => onDone(readError(reason)),
                )
                .finally(() => setLoading(false))
            }}
          >
            <Trash2 size={14} /> Revoke
          </Button>
        </div>
      </td>
    </tr>
  )
}

function sceneCode(row: RecordRow): string {
  return text(row, "sceneCode") || text(row, "code") || text(row, "name")
}
function text(row: RecordRow | null | undefined, key: string): string {
  const value = row?.[key]
  if (Array.isArray(value)) return value.join(", ")
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : ""
}
function booleanValue(row: RecordRow | null | undefined, key: string): boolean {
  const value = row?.[key]
  return value === true || value === "true"
}
function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "安全服务暂不可用，请稍后重试。"
}
