import {
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
} from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { loadMfaStatus, loadSecurityScenes } from "../../api/endpoints"
import { Button, Panel, StateView } from "../../components/ui/Primitives"
import { loadSession } from "../../state/session"

export function SecurityPage() {
  const [mfa, setMfa] = useState<Record<string, unknown> | null>(null)
  const [scenes, setScenes] = useState<readonly Record<string, unknown>[]>([])
  const [message, setMessage] = useState("")
  const session = loadSession()
  useEffect(() => {
    if (!session) return
    void Promise.all([loadMfaStatus(), loadSecurityScenes()])
      .then(([mfaResult, sceneResult]) => {
        setMfa(mfaResult)
        setScenes(sceneResult)
      })
      .catch((reason: unknown) =>
        setMessage(reason instanceof Error ? reason.message : "Security service unavailable."),
      )
  }, [session])
  if (!session)
    return (
      <div className="container section">
        <Panel>
          <StateView kind="error" message="Sign in to manage account security." />
          <a className="route-link" href="/auth/login">
            Go to login
          </a>
        </Panel>
      </div>
    )
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>Security Center</h1>
          <p>Protect account access and review high-risk operation requirements.</p>
        </div>
        <div className="security-score">
          <ShieldCheck size={24} />
          <span>Review required</span>
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
            text="Update your password with a security challenge."
          />
          <SecurityCard
            icon={<Smartphone />}
            title="Authenticator App (2FA)"
            text={mfa ? "MFA status returned by backend." : "Loading MFA status..."}
            action="Manage"
          />
          <SecurityCard
            icon={<CheckCircle2 />}
            title="Email Verification"
            text="Backend controls verification status."
            action="Review"
          />
          <SecurityCard
            icon={<MonitorSmartphone />}
            title="Passkey"
            text="Passkey capability requires backend support."
            action="Backend pending"
          />
        </div>
      </section>
      <section className="section-block">
        <h2>Security scenes</h2>
        {scenes.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scene</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {scenes.map((scene) => (
                  <tr key={String(scene["code"] ?? scene["name"] ?? JSON.stringify(scene))}>
                    <td>{String(scene["name"] ?? scene["code"] ?? "Security operation")}</td>
                    <td>
                      <span className="positive">
                        {String(scene["enabled"] ?? "Backend state")}
                      </span>
                    </td>
                    <td>
                      <Button
                        tone="outline"
                        onClick={() =>
                          setMessage(
                            "This high-risk toggle requires email/TOTP verification from the backend.",
                          )
                        }
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Panel>
            <StateView kind="empty" message="No security scenes returned by the backend." />
          </Panel>
        )}
      </section>
      <section className="section-block">
        <h2>Account tools</h2>
        <div className="security-grid">
          <SecurityCard
            icon={<KeyRound />}
            title="API Management"
            text="Create and revoke API keys only after email and TOTP confirmation."
            action="Manage API keys"
          />
          <SecurityCard
            icon={<MonitorSmartphone />}
            title="Device management"
            text="Device session endpoint is not present in the current Gateway contract."
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
}: {
  readonly icon: ReactNode
  readonly title: string
  readonly text: string
  readonly action?: string
}) {
  return (
    <Panel className="security-card">
      <div className="security-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action ? (
        <Button
          tone="outline"
          onClick={() => {
            if (action === "Manage API keys") window.location.href = "/security?tab=api-keys"
          }}
        >
          {action}
        </Button>
      ) : null}
    </Panel>
  )
}
