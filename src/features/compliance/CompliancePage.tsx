import { Check, FileText, Upload, UserRound } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { loadKyc } from "../../api/endpoints"
import { Button, Panel, StateView } from "../../components/ui/Primitives"
import { loadSession } from "../../state/session"

export function CompliancePage({ flow = false }: { readonly flow?: boolean }) {
  const session = loadSession()
  const [kyc, setKyc] = useState<Record<string, unknown> | null>(null)
  const [message, setMessage] = useState("")
  useEffect(() => {
    if (!session) return
    void loadKyc()
      .then(setKyc)
      .catch((reason: unknown) =>
        setMessage(reason instanceof Error ? reason.message : "KYC service unavailable."),
      )
  }, [session])
  if (!session)
    return (
      <div className="container section">
        <Panel>
          <StateView kind="error" message="Sign in to begin identity verification." />
          <a className="route-link" href="/auth/login">
            Go to login
          </a>
        </Panel>
      </div>
    )
  const level = typeof kyc?.["kycLevel"] === "string" ? String(kyc["kycLevel"]) : "NOT_VERIFIED"
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>Identity Verification</h1>
          <p>
            Complete the steps required by the backend compliance workflow. This page does not claim
            real identity verification by itself.
          </p>
        </div>
        <span className="verification-status">{level}</span>
      </div>
      {message ? (
        <div className="inline-error" role="alert">
          {message}
        </div>
      ) : null}
      <div className="kyc-layout">
        <Panel>
          <div className="kyc-steps">
            <Step
              active={level !== "NOT_VERIFIED"}
              icon={<UserRound />}
              label="Personal information"
            />
            <Step
              active={level === "BASIC" || level === "ADVANCED"}
              icon={<FileText />}
              label="Document review"
            />
            <Step active={level === "ADVANCED"} icon={<Upload />} label="Face verification" />
          </div>
          {flow ? (
            <KycForm onMessage={setMessage} />
          ) : (
            <div className="kyc-intro">
              <h2>Verification tiers</h2>
              <div className="tier-grid">
                <Tier
                  title="Basic"
                  text="Personal information and country."
                  active={level === "BASIC"}
                />
                <Tier
                  title="Intermediate"
                  text="Identity document upload."
                  active={level === "INTERMEDIATE" || level === "ADVANCED"}
                />
                <Tier
                  title="Advanced"
                  text="Face verification provider status."
                  active={level === "ADVANCED"}
                />
              </div>
              <Button
                onClick={() => {
                  window.location.href = "/compliance/verify"
                }}
              >
                Start verification
              </Button>
            </div>
          )}
        </Panel>
        <Panel className="kyc-notice">
          <h2>Review states</h2>
          <p className="muted">
            Pending, approved, rejected and resubmission states must come from the compliance API.
          </p>
          <div className="notice-list">
            <span>
              <Check size={16} /> No mock approval
            </span>
            <span>
              <Check size={16} /> Documents stay client-side until upload
            </span>
            <span>
              <Check size={16} /> Risk decisions remain server-side
            </span>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Step({
  active,
  icon,
  label,
}: {
  readonly active: boolean
  readonly icon: ReactNode
  readonly label: string
}) {
  return (
    <div className={active ? "kyc-step active" : "kyc-step"}>
      <span>{icon}</span>
      <small>{label}</small>
    </div>
  )
}
function Tier({
  title,
  text,
  active,
}: {
  readonly title: string
  readonly text: string
  readonly active: boolean
}) {
  return (
    <div className={active ? "tier active" : "tier"}>
      <strong>{title}</strong>
      <p>{text}</p>
      <span>{active ? "Current backend status" : "Available after previous step"}</span>
    </div>
  )
}
function KycForm({ onMessage }: { readonly onMessage: (message: string) => void }) {
  return (
    <div className="kyc-form">
      <h2>Personal Information</h2>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">Country or region</span>
          <select>
            <option>Select country</option>
            <option>United States</option>
            <option>Singapore</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Document type</span>
          <select>
            <option>Passport</option>
            <option>National ID</option>
          </select>
        </label>
      </div>
      <label className="upload-box">
        <Upload size={22} />
        <span>Upload document</span>
        <input
          type="file"
          onChange={() =>
            onMessage(
              "Document is selected locally. Upload is not submitted until the backend document endpoint is confirmed.",
            )
          }
        />
      </label>
      <Button
        tone="outline"
        onClick={() => onMessage("演示流程：当前不会伪造审核通过，等待真实 KYC 提交接口。")}
      >
        Save draft
      </Button>
    </div>
  )
}
