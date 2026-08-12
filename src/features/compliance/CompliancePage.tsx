import { Check, FileText, Upload, UserRound } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { loadKyc, submitKyc, uploadKycDocument } from "../../api/endpoints"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { loadSession } from "../../state/session"

type RecordRow = Readonly<Record<string, unknown>>
const DOCUMENT_ID_KEY = "documentId"

export function CompliancePage({ flow = false }: { readonly flow?: boolean }) {
  const session = loadSession()
  const [kyc, setKyc] = useState<RecordRow | null>(null)
  const [message, setMessage] = useState("")
  useEffect(() => {
    if (!session) return
    void loadKyc()
      .then(setKyc)
      .catch((reason: unknown) => setMessage(readError(reason)))
  }, [session])
  if (!session)
    return (
      <div className="account-content">
        <div className="page-heading">
          <div>
            <h1>Identity Verification</h1>
            <p>Review KYC status and submit documents through the backend workflow.</p>
          </div>
        </div>
        <Panel>
          <StateView kind="error" message="Sign in to begin identity verification." />
          <a className="route-link" href="/auth/login">
            Go to login
          </a>
        </Panel>
      </div>
    )
  const level = text(kyc, "kycLevel") || "NOT_VERIFIED"
  const status = text(kyc, "status") || "NOT_STARTED"
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>Identity Verification</h1>
          <p>
            Submit documents to the backend compliance workflow. Approval is never simulated by this
            page.
          </p>
        </div>
        <span className="verification-status">{status}</span>
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
              active={status === "PENDING" || status === "VERIFIED"}
              icon={<FileText />}
              label="Document review"
            />
            <Step
              active={text(kyc, "faceVerificationStatus") === "VERIFIED"}
              icon={<Upload />}
              label="Face verification"
            />
          </div>
          {flow ? (
            <KycForm
              onDone={(value, profile) => {
                setMessage(value)
                if (profile) setKyc(profile)
              }}
            />
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
                  window.location.href = "/account/kyc/verify"
                }}
              >
                Start verification
              </Button>
            </div>
          )}
        </Panel>
        <Panel className="kyc-notice">
          <h2>Backend review state</h2>
          <p className="muted">
            Current status: <strong>{status}</strong>. Rejection reason:{" "}
            {text(kyc, "rejectionReason") || "—"}
          </p>
          <div className="notice-list">
            <span>
              <Check size={16} /> No mock approval
            </span>
            <span>
              <Check size={16} /> Documents upload through the real API
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
  text: description,
  active,
}: {
  readonly title: string
  readonly text: string
  readonly active: boolean
}) {
  return (
    <div className={active ? "tier active" : "tier"}>
      <strong>{title}</strong>
      <p>{description}</p>
      <span>{active ? "Current backend status" : "Available after previous step"}</span>
    </div>
  )
}

function KycForm({ onDone }: { readonly onDone: (message: string, profile?: RecordRow) => void }) {
  const [country, setCountry] = useState("")
  const [documentType, setDocumentType] = useState("PASSPORT")
  const [level, setLevel] = useState("BASIC")
  const [documentIds, setDocumentIds] = useState<readonly number[]>([])
  const [fileName, setFileName] = useState("")
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    if (!/^[A-Z]{2}$/.test(country)) {
      onDone("请输入两个字母的国家/地区代码，例如 SG。")
      return
    }
    if (documentIds.length === 0) {
      onDone("请先上传至少一份证件。后端会保存文档并返回 documentId。")
      return
    }
    setLoading(true)
    try {
      const profile = await submitKyc({
        applicantType: "INDIVIDUAL",
        kycLevel: level,
        country,
        documentType,
        provider: "WEB_UPLOAD",
        submittedDocuments: JSON.stringify(
          documentIds.map((documentId) => ({ documentId, documentType })),
        ),
        faceVerificationStatus: "NOT_REQUIRED",
        documentIds,
      })
      onDone("KYC 资料已提交，当前状态由后端审核服务返回。", profile)
    } catch (reason: unknown) {
      onDone(readError(reason))
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="kyc-form">
      <h2>Submit identity information</h2>
      <div className="grid-2">
        <Field label="Country or region">
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
            placeholder="SG"
            maxLength={2}
          />
        </Field>
        <Field label="Verification level">
          <select value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="BASIC">Basic</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
        </Field>
        <Field label="Document type">
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
            <option value="PASSPORT">Passport</option>
            <option value="ID_CARD">National ID</option>
            <option value="ADDRESS_PROOF">Address proof</option>
          </select>
        </Field>
      </div>
      <label className="upload-box">
        <Upload size={22} />
        <span>{fileName || "Upload document"}</span>
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setFileName(file.name)
            setLoading(true)
            void uploadKycDocument(documentType, file)
              .then(
                (result) => {
                  const idValue = result[DOCUMENT_ID_KEY]
                  if (typeof idValue === "number")
                    setDocumentIds((current) => [...current, idValue])
                  onDone("证件已上传，点击提交完成 KYC 申请。")
                },
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        />
      </label>
      <p className="muted">
        Supported by the real `/api/v1/compliance/kyc/documents` endpoint. The page does not claim
        face recognition capability.
      </p>
      <Button loading={loading} onClick={() => void submit()}>
        Submit for review
      </Button>
    </div>
  )
}

function text(row: RecordRow | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "合规服务暂不可用，请稍后重试。"
}
