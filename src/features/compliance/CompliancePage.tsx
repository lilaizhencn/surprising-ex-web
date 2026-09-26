import { Check, FileText, Upload, UserRound } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import {
  downloadKycDocument,
  loadKyc,
  loadKycDocuments,
  submitKyc,
  uploadKycDocument,
} from "../../api/endpoints"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"

type RecordRow = Readonly<Record<string, unknown>>
const DOCUMENT_ID_KEY = "documentId"

export function CompliancePage({ flow = false }: { readonly flow?: boolean }) {
  const session = useSession()
  const [kyc, setKyc] = useState<RecordRow | null>(null)
  const [message, setMessage] = useState("")
  const [documents, setDocuments] = useState<readonly RecordRow[]>([])
  const [documentLoading, setDocumentLoading] = useState(false)
  const refreshDocuments = () => {
    if (!session) return
    setDocumentLoading(true)
    void loadKycDocuments()
      .then(setDocuments, (reason: unknown) => setMessage(readError(reason)))
      .finally(() => setDocumentLoading(false))
  }
  useEffect(() => {
    if (!session) return
    void Promise.all([loadKyc(), loadKycDocuments()])
      .then(([profile, rows]) => {
        setKyc(profile)
        setDocuments(rows)
      })
      .catch((reason: unknown) => setMessage(readError(reason)))
  }, [session])
  if (!session)
    return (
      <div className="account-content">
        <div className="page-heading">
          <div>
            <h1>{t("Identity Verification")}</h1>
            <p>{t("Review KYC status and submit documents through the backend workflow.")}</p>
          </div>
        </div>
        <Panel>
          <StateView kind="error" message="Sign in to begin identity verification." />
          <a className="route-link" href="/auth/login">
            {" "}
            {t("Go to login")}{" "}
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
          <h1>{t("Identity Verification")}</h1>
          <p>
            {" "}
            {t(
              "Submit documents to the backend compliance workflow. Approval is never simulated by this page.",
            )}{" "}
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
              label={t("Personal information")}
            />
            <Step
              active={status === "PENDING" || status === "VERIFIED"}
              icon={<FileText />}
              label={t("Document review")}
            />
            <Step
              active={text(kyc, "faceVerificationStatus") === "VERIFIED"}
              icon={<Upload />}
              label={t("Face verification")}
            />
          </div>
          {flow ? (
            <KycForm
              onDone={(value, profile) => {
                setMessage(value)
                if (profile) setKyc(profile)
                refreshDocuments()
              }}
            />
          ) : (
            <div className="kyc-intro">
              <h2>{t("Verification tiers")}</h2>
              <div className="tier-grid">
                <Tier
                  title={t("Basic")}
                  text="Personal information and country."
                  active={level === "BASIC"}
                />
                <Tier
                  title={t("Intermediate")}
                  text="Identity document upload."
                  active={level === "INTERMEDIATE" || level === "ADVANCED"}
                />
                <Tier
                  title={t("Advanced")}
                  text="Face verification provider status."
                  active={level === "ADVANCED"}
                />
              </div>
              <Button
                onClick={() => {
                  window.location.href = "/account/kyc/verify"
                }}
              >
                {" "}
                {t("Start verification")}{" "}
              </Button>
            </div>
          )}
        </Panel>
        <Panel className="kyc-notice">
          <h2>{t("Backend review state")}</h2>
          <p className="muted">
            {" "}
            {t("Current status:")} <strong>{status}</strong>
            {t(". Rejection reason:")} {text(kyc, "rejectionReason") || "—"}
          </p>
          <div className="notice-list">
            <span>
              <Check size={16} /> {t("No mock approval")}{" "}
            </span>
            <span>
              <Check size={16} /> {t("Documents upload through the real API")}{" "}
            </span>
            <span>
              <Check size={16} /> {t("Risk decisions remain server-side")}{" "}
            </span>
          </div>
        </Panel>
      </div>
      <Panel>
        <div className="panel-heading">
          <h2>{t("Uploaded documents")}</h2>
          <Button tone="outline" loading={documentLoading} onClick={refreshDocuments}>
            {" "}
            {t("Refresh")}{" "}
          </Button>
        </div>
        {documents.length === 0 ? (
          <StateView
            kind={documentLoading ? "loading" : "empty"}
            message="No uploaded KYC documents returned."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("Type")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Uploaded")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {documents.map((document, index) => {
                  const id = documentValue(document, "documentId") || documentValue(document, "id")
                  return (
                    <tr key={id || String(index)}>
                      <td className="mono">{id || "—"}</td>
                      <td>{documentValue(document, "documentType") || "—"}</td>
                      <td>{documentValue(document, "status") || "—"}</td>
                      <td>{documentValue(document, "createdAt") || "—"}</td>
                      <td>
                        <Button tone="ghost" disabled={!id} onClick={() => void saveDocument(id)}>
                          {" "}
                          {t("Download")}{" "}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
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
      onDone(t("Enter a two-letter country or region code, such as SG."))
      return
    }
    if (documentIds.length === 0) {
      onDone(t("Upload at least one document first."))
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
      onDone(t("Identity information submitted for review."), profile)
    } catch (reason: unknown) {
      onDone(readError(reason))
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="kyc-form">
      <h2>{t("Submit identity information")}</h2>
      <div className="grid-2">
        <Field label={t("Country or region")}>
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
            placeholder="SG"
            maxLength={2}
          />
        </Field>
        <Field label={t("Verification level")}>
          <DropdownSelect value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="BASIC">{t("Basic")}</option>
            <option value="INTERMEDIATE">{t("Intermediate")}</option>
            <option value="ADVANCED">{t("Advanced")}</option>
          </DropdownSelect>
        </Field>
        <Field label={t("Document type")}>
          <DropdownSelect
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value)}
          >
            <option value="PASSPORT">{t("Passport")}</option>
            <option value="ID_CARD">{t("National ID")}</option>
            <option value="ADDRESS_PROOF">{t("Address proof")}</option>
          </DropdownSelect>
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
                  onDone(t("Document uploaded. Submit to complete your KYC application."))
                },
                (reason: unknown) => onDone(readError(reason)),
              )
              .finally(() => setLoading(false))
          }}
        />
      </label>
      <p className="muted">
        {" "}
        {t(
          "Supported by the real `/api/v1/compliance/kyc/documents` endpoint. The page does not claim face recognition capability.",
        )}{" "}
      </p>
      <Button loading={loading} onClick={() => void submit()}>
        {" "}
        {t("Submit for review")}{" "}
      </Button>
    </div>
  )
}

function text(row: RecordRow | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function readError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : t("Compliance service unavailable. Please retry later.")
}

async function saveDocument(documentId: string): Promise<void> {
  try {
    const blob = await downloadKycDocument(documentId)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `kyc-document-${documentId}`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch {
    window.alert(t("Document download failed. Please retry later."))
  }
}

function documentValue(row: RecordRow, key: string): string {
  const value = row[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
