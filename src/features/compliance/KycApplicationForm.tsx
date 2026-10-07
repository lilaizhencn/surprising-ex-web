import { Check, FileCheck, Trash2, Upload, UserRound } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { submitKyc, uploadKycDocument } from "../../api/endpoints"
import { type Country, deleteKycDraft, loadCountries } from "../../api/kyc"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field } from "../../components/ui/Primitives"
import { t, useLocale } from "../../i18n"
import { KycDatePicker } from "./KycDatePicker"
import "./KycApplicationForm.css"

type Row = Readonly<Record<string, unknown>>
type UploadedDocument = { id: number; name: string; file: File }
type Slot = {
  type: string
  title: string
  hint: string
  key?: string
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
  const [type, setType] = useState("")
  const [applicant, setApplicant] = useState("")
  const [level, setLevel] = useState("")
  const [proof, setProof] = useState("")
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
      : type === "PASSPORT"
        ? [
            {
              type: "PASSPORT",
              title: "Passport — personal details page",
              hint: "Upload the page with your portrait, full name, passport number and expiry date. Your passport must be valid.",
              example: "passport",
            },
          ]
        : type
          ? [
              {
                type: `${type}_FRONT`,
                title:
                  type === "DRIVING_LICENSE"
                    ? "Driving licence — front"
                    : "Residence permit — front",
                hint: "Show the portrait, full name and document number. Keep all four corners visible.",
                example: "front",
              },
              {
                type: `${type}_BACK`,
                title:
                  type === "DRIVING_LICENSE" ? "Driving licence — back" : "Residence permit — back",
                hint: "Show the issuing authority and validity dates. Do not crop or cover any details.",
                example: "back",
              },
            ]
          : []
  if (level && level !== "BASIC" && proof)
    slots.push({
      type: "ADDRESS_PROOF",
      key: `ADDRESS_PROOF_${proof}`,
      title:
        proof === "UTILITY_BILL"
          ? "Utility bill"
          : proof === "BANK_STATEMENT"
            ? "Bank statement"
            : "Government residence certificate",
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
  if (type && level === "ENHANCED" && type !== "ID_CARD")
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
    if (!type || !applicant || !level || (level !== "BASIC" && !proof)) {
      setError(t("Choose the applicant, verification level and required document types."))
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
    if (slots.some((slot) => !files[slot.key ?? slot.type])) {
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
        documentIds: slots.map((slot) => files[slot.key ?? slot.type]?.id),
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
  function renderSlots(items: Slot[]) {
    return items.length ? (
      <div className="kyc-upload-slots">
        {items.map((slot) => {
          const key = slot.key ?? slot.type
          return (
            <DocumentSlot
              key={key}
              slot={slot}
              file={files[key]}
              onBusy={(delta) => setLoadingFiles((value) => value + delta)}
              onChange={(file) =>
                setFiles((current) => {
                  const next = { ...current }
                  if (file) next[key] = file
                  else delete next[key]
                  return next
                })
              }
            />
          )
        })}
      </div>
    ) : null
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
            <DropdownSelect
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              aria-label={t("Country or region")}
              searchable
              searchPlaceholder={t("Search by country name")}
              noResultsLabel={t("No matches")}
              maxMenuWidth={320}
            >
              <option value="">{t("Select a country or region.")}</option>
              {countries.map((row) => (
                <option
                  key={row.code}
                  value={row.code}
                  data-search={`${row.code} ${row.names.en} ${row.names.zh}`}
                >{`${row.flag} ${row.names[locale]}`}</option>
              ))}
            </DropdownSelect>
          </Field>
          <Field label={t("Applicant type")}>
            <DropdownSelect
              value={applicant}
              onChange={(event) => setApplicant(event.target.value)}
              aria-label={t("Applicant type")}
            >
              <option value="">{t("Please select")}</option>
              <option value="INDIVIDUAL">{t("Individual")}</option>
              <option value="BUSINESS">{t("Business")}</option>
            </DropdownSelect>
          </Field>
          <Field label={t("Verification level")}>
            <DropdownSelect
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              aria-label={t("Verification level")}
            >
              <option value="">{t("Please select")}</option>
              <option value="BASIC">{t("Basic")}</option>
              <option value="STANDARD">{t("Standard")}</option>
              <option value="ENHANCED">{t("Enhanced")}</option>
            </DropdownSelect>
          </Field>
        </div>
        {countryError ? (
          <p role="alert">
            {countryError}{" "}
            <button type="button" onClick={() => setReload((value) => value + 1)}>
              {t("Retry")}
            </button>
          </p>
        ) : null}
        <section className="kyc-evidence-section">
          <h2>{t("Identity document")}</h2>
          <div className="grid-2">
            <Field label={t("Document type")}>
              <DropdownSelect
                aria-label={t("Document type")}
                value={type}
                onChange={(event) => {
                  setType(event.target.value)
                  setExpiry("")
                }}
              >
                <option value="">{t("Select an identity document")}</option>
                <option value="ID_CARD">{t("Identity card")}</option>
                <option value="PASSPORT">{t("Passport")}</option>
                <option value="DRIVING_LICENSE">{t("Driving licence")}</option>
                <option value="RESIDENCE_PERMIT">{t("Residence permit")}</option>
              </DropdownSelect>
            </Field>
            {type ? (
              <Field label={t("Document expiry date")}>
                <KycDatePicker
                  label={t("Document expiry date")}
                  value={expiry}
                  onChange={setExpiry}
                  min={today}
                />
              </Field>
            ) : null}
          </div>
          {renderSlots(slots.filter((slot) => slot.type !== "ADDRESS_PROOF"))}
        </section>
        {level && level !== "BASIC" ? (
          <section className="kyc-evidence-section">
            <h2>{t("Proof of address")}</h2>
            <p className="kyc-section-hint">
              {t(
                "Separate from your identity document. Choose one recent document showing your name and residential address.",
              )}
            </p>
            <div className="grid-2">
              <Field label={t("Address proof type")}>
                <DropdownSelect
                  aria-label={t("Address proof type")}
                  value={proof}
                  searchable
                  searchPlaceholder={t("Search address proof")}
                  noResultsLabel={t("No matches")}
                  maxMenuWidth={300}
                  onChange={(event) => {
                    setProof(event.target.value)
                    setIssued("")
                  }}
                >
                  <option value="">{t("Select an address proof")}</option>
                  <option value="UTILITY_BILL" data-search="utility bill 水电 燃气 账单">
                    {t("Utility bill")}
                  </option>
                  <option value="BANK_STATEMENT" data-search="bank statement 银行 对账单 流水">
                    {t("Bank statement")}
                  </option>
                  <option
                    value="RESIDENCE_CERTIFICATE"
                    data-search="government residence certificate 居住证明 居住证 政府"
                  >
                    {t("Government residence certificate")}
                  </option>
                </DropdownSelect>
              </Field>
              {proof ? (
                <Field label={t("Proof of address issue date")}>
                  <KycDatePicker
                    label={t("Proof of address issue date")}
                    value={issued}
                    onChange={setIssued}
                    min={oldest.toISOString().slice(0, 10)}
                    max={today}
                  />
                </Field>
              ) : null}
            </div>
            {renderSlots(slots.filter((slot) => slot.type === "ADDRESS_PROOF"))}
          </section>
        ) : null}
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
  useEffect(() => {
    if (!file) {
      setPreview("")
      return
    }
    const url = URL.createObjectURL(file.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
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
        onChange({ id: result["documentId"], name: value.name, file: value })
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
            {preview && file.file.type.startsWith("image/") ? (
              <img src={preview} alt={t(slot.title)} />
            ) : (
              <FileCheck size={32} />
            )}
            <span>
              <Check size={16} />
              {file.name}
            </span>
            {preview ? (
              <a href={preview} target="_blank" rel="noopener noreferrer">
                {t("View file")}
              </a>
            ) : null}
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
