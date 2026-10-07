import { Check, FileCheck, Trash2, Upload, UserRound } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { submitKyc, uploadKycDocument } from "../../api/endpoints"
import { type Country, deleteKycDraft, loadCountries } from "../../api/kyc"
import { Button, Field } from "../../components/ui/Primitives"
import { t, useLocale } from "../../i18n"
import "./KycApplicationForm.css"

type Row = Readonly<Record<string, unknown>>
type UploadedDocument = { id: number; name: string }
type Slot = {
  type: string
  title: string
  hint: string
  example: "front" | "back" | "selfie" | "passport" | "bill" | "business"
}
export function KycApplicationForm({
  provider,
  onSubmitted,
}: {
  readonly provider: string
  readonly onSubmitted: (response: Row) => void
}) {
  const locale = useLocale()
  const [countries, setCountries] = useState<Country[]>([])
  const [country, setCountry] = useState("")
  const [type, setType] = useState("ID_CARD")
  const [applicant, setApplicant] = useState("INDIVIDUAL")
  const [level, setLevel] = useState("STANDARD")
  const [proof, setProof] = useState("UTILITY_BILL")
  const [expiry, setExpiry] = useState("")
  const [issued, setIssued] = useState("")
  const [files, setFiles] = useState<Record<string, UploadedDocument>>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(0)
  const [countryError, setCountryError] = useState("")
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    setCountryError("")
    void loadCountries(abort.signal).then(setCountries, (reason) => {
      if (!abort.signal.aborted) setCountryError(readError(reason))
    })
    return () => abort.abort()
  }, [reload])
  const slots: Slot[] =
    type === "ID_CARD"
      ? [
          {
            type: "ID_CARD_FRONT",
            title: "Identity card — front",
            hint: "Show the portrait, full name and document number. Keep all four corners visible.",
            example: "front",
          },
          {
            type: "ID_CARD_BACK",
            title: "Identity card — back",
            hint: "Show the issuing authority and validity dates. Do not crop or cover any details.",
            example: "back",
          },
          {
            type: "ID_CARD_SELFIE",
            title: "Photo holding your identity card",
            hint: "Show your face and the front of your identity card together. Keep both clear and unobstructed.",
            example: "selfie",
          },
        ]
      : [
          {
            type: "PASSPORT",
            title: "Passport — personal details page",
            hint: "Upload the page with your portrait, full name, passport number and expiry date. Your passport must be valid.",
            example: "passport",
          },
        ]
  if (level !== "BASIC")
    slots.push({
      type: "ADDRESS_PROOF",
      title: proof === "UTILITY_BILL" ? "Utility bill" : "Bank statement",
      hint: "Issued within the last three months. Show your full name, residential address, issuer and issue date on the same document.",
      example: "bill",
    })
  if (applicant === "BUSINESS")
    slots.push({
      type: "BUSINESS_LICENSE",
      title: "Business registration certificate",
      hint: "Show the full registered company name, registration number and issuing authority. Upload all relevant pages as one PDF.",
      example: "business",
    })
  if (level === "ENHANCED" && type !== "ID_CARD")
    slots.push({
      type: "FACE_IMAGE",
      title: "Face photograph",
      hint: "Face the camera in good lighting. Do not cover your face or use filters.",
      example: "selfie",
    })
  const today = new Date().toISOString().slice(0, 10)
  const oldest = new Date(`${today}T00:00:00Z`)
  const day = oldest.getUTCDate()
  oldest.setUTCDate(1)
  oldest.setUTCMonth(oldest.getUTCMonth() - 3)
  const last = new Date(Date.UTC(oldest.getUTCFullYear(), oldest.getUTCMonth() + 1, 0)).getUTCDate()
  oldest.setUTCDate(Math.min(day, last))
  const submit = async () => {
    setError("")
    if (!countries.some((row) => row.code === country)) {
      setError(t("Select a country or region."))
      return
    }
    if (!expiry || expiry < today) {
      setError(t("Your identity document must not be expired."))
      return
    }
    if (
      level !== "BASIC" &&
      (!issued || issued < oldest.toISOString().slice(0, 10) || issued > today)
    ) {
      setError(t("Address proof must be issued within the last three months."))
      return
    }
    if (slots.some((slot) => !files[slot.type])) {
      setError(t("Upload every required document before submitting."))
      return
    }
    setBusy(true)
    try {
      const result = await submitKyc({
        applicantType: applicant,
        kycLevel: level,
        country,
        documentType: type,
        provider,
        documentIds: slots.map((slot) => files[slot.type]?.id),
        documentExpiresOn: expiry,
        addressIssuedOn: level === "BASIC" ? null : issued,
        faceVerificationStatus: level === "ENHANCED" ? "PENDING" : "NOT_REQUIRED",
      })
      onSubmitted(result)
    } catch (reason) {
      setError(readError(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="kyc-application"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <fieldset disabled={busy || loadingFiles > 0}>
        <div className="grid-2">
          <Field label={t("Country or region")}>
            <select
              required
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              aria-label={t("Country or region")}
            >
              <option value="">{t("Select a country or region.")}</option>
              {countries.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.flag} {row.names[locale]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Applicant type")}>
            <select value={applicant} onChange={(event) => setApplicant(event.target.value)}>
              <option value="INDIVIDUAL">{t("Individual")}</option>
              <option value="BUSINESS">{t("Business")}</option>
            </select>
          </Field>
          <Field label={t("Document type")}>
            <select
              aria-label={t("Document type")}
              value={type}
              onChange={(event) => {
                setType(event.target.value)
                setExpiry("")
              }}
            >
              <option value="ID_CARD">{t("Identity card")}</option>
              <option value="PASSPORT">{t("Passport")}</option>
            </select>
          </Field>
          <Field label={t("Document expiry date")}>
            <input
              required
              type="date"
              min={today}
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </Field>
          <Field label={t("Verification level")}>
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="BASIC">{t("Basic")}</option>
              <option value="STANDARD">{t("Standard")}</option>
              <option value="ENHANCED">{t("Enhanced")}</option>
            </select>
          </Field>
          {level !== "BASIC" ? (
            <>
              <Field label={t("Proof of address")}>
                <select value={proof} onChange={(event) => setProof(event.target.value)}>
                  <option value="UTILITY_BILL">{t("Utility bill")}</option>
                  <option value="BANK_STATEMENT">{t("Bank statement")}</option>
                </select>
              </Field>
              <Field label={t("Proof of address issue date")}>
                <input
                  required
                  type="date"
                  min={oldest.toISOString().slice(0, 10)}
                  max={today}
                  value={issued}
                  onChange={(event) => setIssued(event.target.value)}
                />
              </Field>
            </>
          ) : null}
        </div>
        {countryError ? (
          <p role="alert">
            {countryError}{" "}
            <button type="button" onClick={() => setReload((value) => value + 1)}>
              {t("Retry")}
            </button>
          </p>
        ) : null}
        <div className="kyc-upload-slots">
          {slots.map((slot) => (
            <DocumentSlot
              key={slot.type}
              slot={slot}
              file={files[slot.type]}
              onBusy={(delta) => setLoadingFiles((value) => value + delta)}
              onChange={(file) =>
                setFiles((current) => {
                  const next = { ...current }
                  if (file) next[slot.type] = file
                  else delete next[slot.type]
                  return next
                })
              }
            />
          ))}
        </div>
        {error ? (
          <p role="alert" className="inline-error">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={busy} disabled={loadingFiles > 0 || !countries.length}>
          {t("Submit for verification")}
        </Button>
      </fieldset>
    </form>
  )
}
function DocumentSlot({
  slot,
  file,
  onChange,
  onBusy,
}: {
  readonly slot: Slot
  readonly file: UploadedDocument | undefined
  readonly onChange: (file?: UploadedDocument) => void
  readonly onBusy: (delta: number) => void
}) {
  const [preview, setPreview] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  const upload = async (value: File) => {
    setError("")
    if (
      !["image/png", "image/jpeg", "application/pdf"].includes(value.type) ||
      value.size > 15 * 1024 * 1024 ||
      !value.size
    ) {
      setError(t("Use a JPG, PNG or PDF file up to 15 MB."))
      return
    }
    setBusy(true)
    onBusy(1)
    try {
      const result = await uploadKycDocument(slot.type, value)
      if (typeof result["documentId"] !== "number") throw new Error(t("Document upload failed."))
      if (mounted.current) {
        onChange({ id: result["documentId"], name: value.name })
        setPreview(value.type.startsWith("image/") ? URL.createObjectURL(value) : "")
      }
    } catch (reason) {
      if (mounted.current) setError(readError(reason))
    } finally {
      onBusy(-1)
      if (mounted.current) setBusy(false)
    }
  }
  const remove = async () => {
    if (!file) return
    setBusy(true)
    onBusy(1)
    setError("")
    try {
      await deleteKycDraft(file.id)
      onChange()
      setPreview("")
      if (input.current) input.current.value = ""
    } catch (reason) {
      setError(readError(reason))
    } finally {
      setBusy(false)
      onBusy(-1)
    }
  }
  return (
    <section className="kyc-document-slot">
      <div className="kyc-document-content">
        <h3>{t(slot.title)}</h3>
        <p>{t(slot.hint)}</p>
        {file ? (
          <div className="kyc-file-preview">
            {preview ? <img src={preview} alt={t(slot.title)} /> : <FileCheck size={32} />}
            <span>
              <Check size={16} />
              {file.name}
            </span>
            <Button
              tone="ghost"
              loading={busy}
              aria-label={`${t("Remove")} ${t(slot.title)}`}
              onClick={() => void remove()}
            >
              <Trash2 size={17} />
              {t("Remove")}
            </Button>
          </div>
        ) : (
          <label className="kyc-file-drop">
            <Upload size={24} />
            <strong>{busy ? t("Uploading…") : t("Choose file")}</strong>
            <small>{t("JPG, PNG or PDF · Up to 15 MB")}</small>
            <input
              ref={input}
              type="file"
              aria-label={t(slot.title)}
              accept="image/jpeg,image/png,application/pdf"
              disabled={busy}
              onChange={(event) => {
                const value = event.target.files?.[0]
                if (value) void upload(value)
                event.target.value = ""
              }}
            />
          </label>
        )}
        {error ? (
          <p role="alert" className="inline-error">
            {error}
          </p>
        ) : null}
      </div>
      <div className="kyc-example">
        <div className={`kyc-example-art ${slot.example}`} aria-hidden="true">
          {slot.example === "selfie" ? <UserRound size={60} /> : null}
          <div className="kyc-example-paper">
            <div className="kyc-example-photo">
              <UserRound size={25} />
            </div>
            <div className="kyc-example-lines">
              <i />
              <i />
              <i />
            </div>
            <small>EXAMPLE</small>
          </div>
          <Check className="kyc-example-check" size={20} />
        </div>
        <strong>{t("Accepted example")}</strong>
        <small>{t("Clear, complete and unedited")}</small>
      </div>
    </section>
  )
}
function readError(reason: unknown) {
  return reason instanceof Error ? reason.message : t("Request failed. Please try again later.")
}
