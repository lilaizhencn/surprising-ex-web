import { Check, FileText, Upload, UserRound } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import {
  completeKycSimulation,
  downloadKycDocument,
  loadKyc,
  loadKycDocuments,
  loadKycProvider,
  refreshKycSession,
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
  const [providerInfo, setProviderInfo] = useState<RecordRow | null>(null)
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
    void Promise.all([loadKyc(), loadKycDocuments(), loadKycProvider()])
      .then(([profile, rows, provider]) => {
        setKyc(profile)
        setDocuments(rows)
        setProviderInfo(provider)
      })
      .catch((reason: unknown) => setMessage(readError(reason)))
  }, [session])
  useEffect(() => {
    if (!session || text(kyc, "status") !== "PENDING") return
    const refreshStatus = () => {
      if (document.visibilityState !== "visible") return
      void loadKyc().then(setKyc, (reason: unknown) => setMessage(readError(reason)))
    }
    const timer = window.setInterval(refreshStatus, 10_000)
    document.addEventListener("visibilitychange", refreshStatus)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshStatus)
    }
  }, [session, kyc])
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
          <p>{t("Complete identity and face verification with the configured provider.")}</p>
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
              profile={kyc}
              provider={text(providerInfo, "provider") || "SUMSUB"}
              providerReady={providerInfo !== null}
              simulationEnabled={providerInfo?.["simulationEnabled"] === true}
              onDone={(value, profile) => {
                setMessage(value)
                if (profile) setKyc(profile)
                refreshDocuments()
              }}
              onSimulationComplete={(decision) => {
                return completeKycSimulation(decision).then(
                  (profile) => {
                    setKyc(profile)
                    setMessage(
                      t(
                        "Simulation result recorded. Manual review remains available when selected.",
                      ),
                    )
                    return profile
                  },
                  (reason: unknown) => {
                    setMessage(readError(reason))
                    throw reason
                  },
                )
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
                  title={t("Standard")}
                  text="Identity document verification."
                  active={level === "STANDARD" || level === "ENHANCED"}
                />
                <Tier
                  title={t("Enhanced")}
                  text="Identity document and face verification."
                  active={level === "ENHANCED"}
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
              <Check size={16} />{" "}
              {t(
                providerInfo?.["simulationEnabled"] === true
                  ? "Development simulation is enabled"
                  : "Provider callbacks are signature verified",
              )}{" "}
            </span>
            <span>
              <Check size={16} /> {t("Documents upload through the real API")}{" "}
            </span>
            <span>
              <Check size={16} /> {t("Manual review remains available for escalations")}{" "}
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

function KycForm({
  profile,
  onDone,
  onSimulationComplete,
  provider,
  providerReady,
  simulationEnabled,
}: {
  readonly profile: RecordRow | null
  readonly onDone: (message: string, profile?: RecordRow) => void
  readonly onSimulationComplete: (
    decision: "APPROVED" | "REJECTED" | "MANUAL_REVIEW",
  ) => Promise<RecordRow>
  readonly provider: string
  readonly providerReady: boolean
  readonly simulationEnabled: boolean
}) {
  const [country, setCountry] = useState("")
  const [documentType, setDocumentType] = useState("PASSPORT")
  const [level, setLevel] = useState("BASIC")
  const [documentIds, setDocumentIds] = useState<readonly number[]>([])
  const [fileName, setFileName] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [simulationCompleted, setSimulationCompleted] = useState(false)
  const simulate = async (decision: "APPROVED" | "REJECTED" | "MANUAL_REVIEW") => {
    setLoading(true)
    try {
      await onSimulationComplete(decision)
      setSimulationCompleted(true)
    } catch {
      // The shared status panel already displays the API error.
    } finally {
      setLoading(false)
    }
  }
  const openSession = async (session: RecordRow) => {
    if (simulationEnabled || provider === "SELF") return
    const redirect = text(session, "redirectUrl")
    if (provider === "VERIFF" && redirect) {
      const url = new URL(redirect)
      if (url.protocol !== "https:") throw new Error(t("Invalid verification link."))
      window.location.assign(url.href)
    } else if (provider === "SUMSUB" && text(session, "launchToken")) {
      await launchSumsub(
        text(session, "launchToken"),
        async () => {
          const refreshed = await refreshKycSession()
          const token = text(refreshed, "launchToken")
          if (!token) throw new Error(t("Verification session expired. Please retry."))
          return token
        },
        () => onDone(t("Identity and face verification submitted.")),
        onDone,
      )
    } else throw new Error(t("Verification session is unavailable. Please retry."))
  }
  const resume = async () => {
    setLoading(true)
    try {
      if (!simulationEnabled) await openSession(await refreshKycSession())
      setSubmitted(true)
    } catch (reason) {
      onDone(readError(reason))
    } finally {
      setLoading(false)
    }
  }
  const pending = text(profile, "status") === "PENDING"
  const submit = async () => {
    if (!providerReady) {
      onDone(t("KYC provider configuration is unavailable. Reload and try again."))
      return
    }
    if (!/^[A-Z]{2}$/.test(country)) {
      onDone(t("Enter a two-letter country or region code, such as SG."))
      return
    }
    if (provider === "SELF" && documentIds.length === 0) {
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
        provider,
        submittedDocuments: JSON.stringify(
          documentIds.map((documentId) => ({ documentId, documentType })),
        ),
        faceVerificationStatus: level === "ENHANCED" ? "PENDING" : "NOT_REQUIRED",
        documentIds,
      })
      const savedProfile =
        profile["profile"] && typeof profile["profile"] === "object"
          ? (profile["profile"] as RecordRow)
          : profile
      const session =
        profile["verificationSession"] && typeof profile["verificationSession"] === "object"
          ? (profile["verificationSession"] as RecordRow)
          : null
      setSubmitted(true)
      if (session) await openSession(session)
      onDone(
        simulationEnabled
          ? t(
              "Simulation session ready. Choose a simulated provider outcome to test the full flow.",
            )
          : t("Identity information submitted to the provider."),
        savedProfile,
      )
    } catch (reason: unknown) {
      onDone(readError(reason))
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="kyc-form">
      <h2>{t("Submit identity information")}</h2>
      <div id="sumsub-websdk-container" />
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
            <option value="STANDARD">{t("Standard")}</option>
            <option value="ENHANCED">{t("Enhanced")}</option>
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
      {provider !== "SELF" ? (
        <p className="muted">
          {t(
            "The selected provider securely collects the identity document and face/liveness check in its verification flow.",
          )}
        </p>
      ) : null}
      <p className="muted">
        {" "}
        {t("Optional internal documents can be provided for a fallback manual review.")}{" "}
      </p>
      {pending && provider !== "SELF" ? (
        <Button loading={loading} onClick={() => void resume()}>
          {t("Continue verification")}
        </Button>
      ) : null}
      {!submitted && !pending && provider !== "SELF" && documentIds.length === 0 ? (
        <Button loading={loading} onClick={() => void submit()}>
          {t("Start provider verification")}
        </Button>
      ) : null}
      {!submitted && !pending && (provider === "SELF" || documentIds.length > 0) ? (
        <Button loading={loading} onClick={() => void submit()}>
          {t("Submit for verification")}
        </Button>
      ) : null}
      {submitted && simulationEnabled && !simulationCompleted ? (
        <div className="button-row">
          <Button loading={loading} onClick={() => void simulate("APPROVED")}>
            {t("Simulate automatic approval")}
          </Button>
          <Button loading={loading} onClick={() => void simulate("MANUAL_REVIEW")}>
            {t("Simulate manual review")}
          </Button>
          <Button loading={loading} onClick={() => void simulate("REJECTED")}>
            {t("Simulate rejection")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

type SumsubBuilder = {
  withConf: (conf: Record<string, unknown>) => SumsubBuilder
  on: (event: string, callback: () => void) => SumsubBuilder
  build: () => { launch: (selector: string) => void }
}

async function launchSumsub(
  token: string,
  refresh: () => Promise<string>,
  onComplete: () => void,
  onError: (message: string) => void,
): Promise<void> {
  const w = window as typeof window & {
    snsWebSdk?: { init: (token: string, refresh: () => Promise<string>) => SumsubBuilder }
  }
  if (!w.snsWebSdk) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script")
      const timer = window.setTimeout(() => {
        script.remove()
        reject(new Error(t("Verification service failed to load. Please retry.")))
      }, 15_000)
      script.src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js"
      script.onload = () => {
        window.clearTimeout(timer)
        resolve()
      }
      script.onerror = () => {
        window.clearTimeout(timer)
        script.remove()
        reject(new Error(t("Verification service failed to load. Please retry.")))
      }
      document.head.append(script)
    })
  }
  if (!w.snsWebSdk) throw new Error(t("Verification service failed to load. Please retry."))
  w.snsWebSdk
    .init(token, refresh)
    .withConf({})
    .on("idCheck.onApplicantSubmitted", onComplete)
    .on("idCheck.onError", () => onError(t("Verification could not be completed. Please retry.")))
    .build()
    .launch("#sumsub-websdk-container")
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
