import { Check, CircleAlert, Clock } from "lucide-react"
import { useEffect, useState } from "react"
import {
  completeKycSimulation,
  loadKyc,
  loadKycProvider,
  refreshKycSession,
} from "../../api/endpoints"
import { Button, Panel } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"
import { KycApplicationForm } from "./KycApplicationForm"
import "./KycApplicationForm.css"

type RecordRow = Readonly<Record<string, unknown>>
export function CompliancePage(_props: { readonly flow?: boolean }) {
  const session = useSession()
  return session ? (
    <AuthenticatedKyc key={session.accessToken} />
  ) : (
    <Panel>
      <p>{t("Sign in to begin identity verification.")}</p>
      <a href="/auth/login">{t("Go to login")}</a>
    </Panel>
  )
}
function AuthenticatedKyc() {
  const [profile, setProfile] = useState<RecordRow | null>(null)
  const [provider, setProvider] = useState<RecordRow | null>(null)
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setError("")
    void Promise.all([loadKyc(), loadKycProvider()]).then(
      ([value, info]) => {
        if (active) {
          setProfile(value)
          setProvider(info)
          setReady(true)
        }
      },
      (reason) => {
        if (active) setError(readError(reason))
      },
    )
    return () => {
      active = false
    }
  }, [reload])
  const status = text(profile, "status")
  useEffect(() => {
    if (status !== "PENDING") return
    let active = true
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void loadKyc().then(
          (value) => {
            if (active) setProfile(value)
          },
          (reason) => {
            if (active) setError(readError(reason))
          },
        )
    }, 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [status])
  const resume = async () => {
    setBusy(true)
    setError("")
    try {
      const session = await refreshKycSession()
      if (text(provider, "provider") === "VERIFF") {
        const url = new URL(text(session, "redirectUrl"))
        if (url.protocol !== "https:") throw new Error(t("Invalid verification link."))
        window.location.assign(url.href)
      } else if (text(provider, "provider") === "SUMSUB" && text(session, "launchToken")) {
        await launchSumsub(
          text(session, "launchToken"),
          async () => {
            const token = text(await refreshKycSession(), "launchToken")
            if (!token) throw new Error(t("Verification session expired. Please retry."))
            return token
          },
          () => {
            void loadKyc().then(setProfile, (reason) => setError(readError(reason)))
          },
          setError,
        )
      } else throw new Error(t("Verification session is unavailable. Please retry."))
    } catch (reason) {
      setError(readError(reason))
    } finally {
      setBusy(false)
    }
  }
  const simulate = async (decision: "APPROVED" | "REJECTED") => {
    setBusy(true)
    setError("")
    try {
      setProfile(await completeKycSimulation(decision))
    } catch (reason) {
      setError(readError(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="account-content">
      <div className="page-heading">
        <h1>{t("Identity Verification")}</h1>
      </div>
      {error ? (
        <div role="alert" className="inline-error">
          {error}{" "}
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            {t("Retry")}
          </button>
        </div>
      ) : null}
      {!ready ? (
        <div aria-busy="true" className="kyc-result" />
      ) : status === "VERIFIED" ? (
        <Panel className="kyc-result">
          <Check size={42} />
          <h2>{t("Identity verified")}</h2>
        </Panel>
      ) : status === "REJECTED" && !editing ? (
        <Panel className="kyc-result">
          <CircleAlert size={38} />
          <h2>{t("Verification was not approved")}</h2>
          <p>
            {text(profile, "rejectionReason") ||
              t("Your documents could not be verified. Please submit clear, valid documents.")}
          </p>
          <Button
            onClick={() => {
              setEditing(true)
              setError("")
            }}
          >
            {t("Verify again")}
          </Button>
        </Panel>
      ) : status === "PENDING" ? (
        <Panel className="kyc-result">
          <Clock size={38} />
          <h2>{t("Verification in progress")}</h2>
          <p>
            {t(
              "Your documents have been submitted. We will update this page when the review is complete.",
            )}
          </p>
          {provider?.["simulationEnabled"] === true ? (
            <div className="button-row">
              <Button loading={busy} onClick={() => void simulate("APPROVED")}>
                {t("Simulate automatic approval")}
              </Button>
              <Button tone="outline" loading={busy} onClick={() => void simulate("REJECTED")}>
                {t("Simulate rejection")}
              </Button>
            </div>
          ) : text(provider, "provider") !== "SELF" ? (
            <Button loading={busy} onClick={() => void resume()}>
              {t("Continue verification")}
            </Button>
          ) : null}
          <div id="sumsub-websdk-container" />
        </Panel>
      ) : (
        <Panel>
          <KycApplicationForm
            provider={text(provider, "provider")}
            onSubmitted={(response) => {
              const saved = response["profile"]
              setProfile(saved && typeof saved === "object" ? (saved as RecordRow) : response)
              setEditing(false)
              setError("")
            }}
          />
        </Panel>
      )}
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
