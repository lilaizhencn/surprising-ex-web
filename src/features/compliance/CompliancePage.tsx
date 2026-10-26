import { Check, CircleAlert, Clock, LoaderCircle, ShieldCheck } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
import { launchSumsub, type SumsubInstance } from "./sumsub"
import "./KycApplicationForm.css"

type Profile = Awaited<ReturnType<typeof loadKyc>>
type Provider = Awaited<ReturnType<typeof loadKycProvider>>
export function CompliancePage(_props: { readonly flow?: boolean }) {
  const session = useSession()
  return session ? (
    <AuthenticatedKyc key={String(session.user.userId)} />
  ) : (
    <Panel className="kyc-result">
      <ShieldCheck size={36} aria-hidden="true" />
      <h1>{t("Identity Verification")}</h1>
      <p>{t("Sign in to begin identity verification.")}</p>
      <a className="button button-primary" href="/auth/login">
        {t("Go to login")}
      </a>
    </Panel>
  )
}
function AuthenticatedKyc() {
  const [profile, setProfile] = useState<Profile>(null)
  const [provider, setProvider] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)
  const [providerLoading, setProviderLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [providerError, setProviderError] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sdkOpen, setSdkOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const [now, setNow] = useState(Date.now)
  const lifetime = useRef<AbortController | null>(null)
  const actionBusy = useRef(false)
  const sdk = useRef<SumsubInstance | null>(null)
  const sdkRequest = useRef<AbortController | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    return () => {
      abort.abort()
      sdk.current?.destroy()
      sdk.current = null
    }
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setProviderLoading(true)
    setLoadError("")
    setProviderError("")
    setError("")
    void loadKyc(abort.signal)
      .then(
        (value) => {
          if (!abort.signal.aborted) {
            setProfile(value)
            setNow(Date.now())
          }
        },
        (reason) => {
          if (!abort.signal.aborted) setLoadError(readError(reason))
        },
      )
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    void loadKycProvider(abort.signal)
      .then(
        (value) => {
          if (!abort.signal.aborted) setProvider(value)
        },
        (reason) => {
          if (!abort.signal.aborted) {
            setProvider(null)
            setProviderError(readError(reason))
          }
        },
      )
      .finally(() => {
        if (!abort.signal.aborted) setProviderLoading(false)
      })
    return () => abort.abort()
  }, [reload])
  const status = profile?.status ?? "UNVERIFIED"
  const expiry = profile?.expiresAt ? Date.parse(profile.expiresAt) : null
  const expired =
    status === "EXPIRED" || (status === "VERIFIED" && expiry !== null && expiry <= now)
  useEffect(() => {
    if (status !== "VERIFIED" || expiry === null || expiry <= now) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(expiry - now, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [status, expiry, now])
  useEffect(() => {
    if (status !== "PENDING" || loading) return
    const abort = new AbortController()
    let timer: number
    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const value = await loadKyc(abort.signal)
          if (!abort.signal.aborted) {
            setProfile(value)
            setError("")
          }
        } catch (reason) {
          if (!abort.signal.aborted) setError(readError(reason))
        }
      }
      if (!abort.signal.aborted) timer = window.setTimeout(() => void poll(), 10_000)
    }
    timer = window.setTimeout(() => void poll(), 10_000)
    return () => {
      abort.abort()
      window.clearTimeout(timer)
    }
  }, [status, loading, reload])
  useEffect(() => {
    if (status !== "PENDING") {
      sdkRequest.current?.abort()
      sdk.current?.destroy()
      sdk.current = null
      setSdkOpen(false)
    }
  }, [status])
  const retry = () => {
    sdkRequest.current?.abort()
    sdk.current?.destroy()
    sdk.current = null
    setSdkOpen(false)
    setReload((value) => value + 1)
  }
  const resume = async () => {
    if (!lifetime.current || lifetime.current.signal.aborted || actionBusy.current || sdk.current)
      return
    const abort = new AbortController()
    sdkRequest.current = abort
    const signal = AbortSignal.any([lifetime.current.signal, abort.signal])
    actionBusy.current = true
    setBusy(true)
    setError("")
    try {
      const session = await refreshKycSession(signal)
      if (signal.aborted) return
      if (provider?.provider === "VERIFF") {
        const url = new URL(text(session, "redirectUrl"))
        if (url.protocol !== "https:") throw new Error(t("Invalid verification link."))
        window.location.assign(url.href)
      } else if (provider?.provider === "SUMSUB" && text(session, "launchToken")) {
        const instance = await launchSumsub(
          text(session, "launchToken"),
          async () => {
            const token = text(await refreshKycSession(signal), "launchToken")
            if (!token) throw new Error(t("Verification session expired. Please retry."))
            return token
          },
          () => {
            void loadKyc(signal).then(
              (value) => {
                if (!signal.aborted) setProfile(value)
              },
              (reason) => {
                if (!signal.aborted) setError(readError(reason))
              },
            )
          },
          (message) => {
            if (!signal.aborted) setError(message)
          },
          signal,
        )
        if (signal.aborted) instance.destroy()
        else {
          sdk.current = instance
          setSdkOpen(true)
        }
      } else throw new Error(t("Verification session is unavailable. Please retry."))
    } catch (reason) {
      if (!signal.aborted) setError(readError(reason))
    } finally {
      actionBusy.current = false
      if (!lifetime.current?.signal.aborted) setBusy(false)
    }
  }
  const simulate = async (decision: "APPROVED" | "REJECTED") => {
    const signal = lifetime.current?.signal
    if (!signal || signal.aborted || actionBusy.current) return
    actionBusy.current = true
    setBusy(true)
    setError("")
    try {
      const value = await completeKycSimulation(decision, signal)
      if (!signal.aborted) setProfile(value)
    } catch (reason) {
      if (!signal.aborted) setError(readError(reason))
    } finally {
      actionBusy.current = false
      if (!signal.aborted) setBusy(false)
    }
  }
  const canApply =
    status === "UNVERIFIED" || status === "EXPIRED" || (status === "REJECTED" && editing)
  return (
    <div className="account-content kyc-page">
      <div className="page-heading">
        <div>
          <h1>{t("Identity Verification")}</h1>
          <p className="kyc-page-intro">
            {t(
              "Prepare valid documents, submit your application and follow its review status here.",
            )}
          </p>
        </div>
      </div>
      {!loading && !loadError ? (
        <ol className="kyc-progress" aria-label={t("Verification progress")}>
          {["Application details", "Document review", "Verification result"].map((step, index) => {
            const current = canApply ? 0 : status === "PENDING" ? 1 : 2
            return (
              <li
                key={step}
                aria-current={index === current ? "step" : undefined}
                className={index < current ? "is-complete" : ""}
              >
                <span>{index < current ? <Check size={15} aria-hidden="true" /> : index + 1}</span>
                {t(step)}
              </li>
            )
          })}
        </ol>
      ) : null}
      {loading ? (
        <Panel className="kyc-result">
          <div role="status" aria-busy="true">
            <LoaderCircle className="spin" size={30} aria-hidden="true" />
            <p>{t("Loading verification status…")}</p>
          </div>
        </Panel>
      ) : loadError ? (
        <Panel className="kyc-result">
          <CircleAlert size={34} aria-hidden="true" />
          <h2>{t("Verification status unavailable")}</h2>
          <p role="alert">{loadError}</p>
          <Button onClick={retry}>{t("Retry")}</Button>
        </Panel>
      ) : status === "VERIFIED" ? (
        <Panel className={`kyc-result ${expired ? "" : "kyc-verified"}`}>
          {expired ? (
            <CircleAlert size={38} aria-hidden="true" />
          ) : (
            <ShieldCheck size={42} aria-hidden="true" />
          )}
          <h2>{t(expired ? "Verification has expired" : "Identity verified")}</h2>
          <p>
            {t(
              expired
                ? "Your verification is no longer current. Check the Help Center for guidance on updating your identity documents."
                : "Your identity review is complete. You can view your assets or manage account security.",
            )}
          </p>
          {expiry !== null ? (
            <p className="kyc-status-date">
              {t("Valid until")}:{" "}
              <time dateTime={profile?.expiresAt ?? undefined}>
                {new Date(expiry).toLocaleString()}
              </time>
            </p>
          ) : null}
          <div className="button-row kyc-result-actions">
            <a className="button button-primary" href={expired ? "/help" : "/assets"}>
              {t(expired ? "Help Center" : "View assets")}
            </a>
            <a className="button button-outline" href="/security/account">
              {t("Account security")}
            </a>
          </div>
        </Panel>
      ) : status === "REJECTED" && !editing ? (
        <Panel className="kyc-result">
          <CircleAlert size={38} aria-hidden="true" />
          <h2>{t("Verification was not approved")}</h2>
          <p className="kyc-rejection">
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
          <Clock size={38} aria-hidden="true" />
          <h2>{t("Verification in progress")}</h2>
          <p>
            {t(
              "Your documents have been submitted. We will update this page when the review is complete.",
            )}
          </p>
          {error ? (
            <p role="alert" className="inline-error">
              {error}
            </p>
          ) : null}
          <div className="button-row kyc-result-actions">
            {provider?.simulationEnabled === true ? (
              <>
                <Button loading={busy} onClick={() => void simulate("APPROVED")}>
                  {t("Simulate automatic approval")}
                </Button>
                <Button tone="outline" loading={busy} onClick={() => void simulate("REJECTED")}>
                  {t("Simulate rejection")}
                </Button>
              </>
            ) : provider && provider.provider !== "SELF" && !sdkOpen ? (
              <Button loading={busy} onClick={() => void resume()}>
                {t("Continue verification")}
              </Button>
            ) : null}
            <Button tone="outline" disabled={busy} onClick={retry}>
              {t("Check review status")}
            </Button>
          </div>
          {providerError ? (
            <p role="alert" className="inline-error">
              {providerError}
            </p>
          ) : null}
          {sdkOpen ? (
            <Button
              tone="ghost"
              onClick={() => {
                sdkRequest.current?.abort()
                sdk.current?.destroy()
                sdk.current = null
                setSdkOpen(false)
              }}
            >
              {t("Close verification window")}
            </Button>
          ) : null}
          <div id="sumsub-websdk-container" />
        </Panel>
      ) : providerLoading ? (
        <Panel className="kyc-result">
          <p role="status">{t("Loading verification requirements…")}</p>
        </Panel>
      ) : providerError || !provider ? (
        <Panel className="kyc-result">
          <CircleAlert size={34} aria-hidden="true" />
          <h2>{t("Verification requirements unavailable")}</h2>
          <p role="alert">{providerError}</p>
          <Button onClick={retry}>{t("Retry")}</Button>
        </Panel>
      ) : (
        <Panel>
          {status === "EXPIRED" ? (
            <div className="kyc-form-notice">
              <CircleAlert size={20} aria-hidden="true" />
              <p>{t("Verification has expired. Submit current documents to apply again.")}</p>
            </div>
          ) : null}
          <KycApplicationForm
            provider={provider.provider}
            onSubmitted={(response) => {
              setProfile(response.profile)
              setEditing(false)
              setError("")
            }}
          />
        </Panel>
      )}
    </div>
  )
}
function text(row: Readonly<Record<string, unknown>> | null | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function readError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : t("Compliance service unavailable. Please retry later.")
}
