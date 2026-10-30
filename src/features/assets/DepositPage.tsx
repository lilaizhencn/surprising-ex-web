import { Copy, Download } from "lucide-react"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { loadDepositHistory } from "../../api/endpoints"
import {
  type FundingAddress,
  type FundingAsset,
  getDepositAddress,
  loadFundingAssets,
} from "../../api/funding"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field, Panel } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"
import { FundingAssetSelect } from "./FundingAssetSelect"
import "./DepositPage.css"

export function DepositPage() {
  const session = useSession()
  const [requestedAsset] = useState(
    () => new URLSearchParams(window.location.search).get("asset")?.toUpperCase() ?? "",
  )
  const [catalog, setCatalog] = useState<{ token: string; rows: readonly FundingAsset[] } | null>(
    null,
  )
  const [selection, setSelection] = useState({ asset: requestedAsset, network: "" })
  const [catalogError, setCatalogError] = useState("")
  const [reload, setReload] = useState(0)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    key: string
    address?: FundingAddress
    error?: string
  } | null>(null)
  const [qr, setQr] = useState({ key: "", url: "" })
  const [qrError, setQrError] = useState("")
  const [notice, setNotice] = useState("")
  const [historyRevision, setHistoryRevision] = useState(0)
  const [history, setHistory] = useState<{
    key: string
    rows: readonly (Readonly<Record<string, unknown>> & {
      id?: unknown
      assetSymbol?: unknown
      asset?: unknown
      amount?: unknown
      status?: unknown
      createdAt?: unknown
    })[]
    error: string
  } | null>(null)
  const assets = catalog?.token === session?.accessToken ? (catalog?.rows ?? []) : []
  const asset = selection.asset ? assets.find((row) => row.asset === selection.asset) : assets[0]
  const network = asset?.networks.find((row) => row.networkCode === selection.network)
  const assetCode = asset?.asset ?? ""
  const networkCode = network?.networkCode ?? ""
  const token = session?.accessToken ?? ""
  const key = `${token}:${assetCode}:${networkCode}`
  const address = result?.key === key ? result.address : undefined
  const addressError = result?.key === key ? result.error : ""

  useEffect(() => {
    if (!token) return
    const abort = new AbortController()
    setCatalogError("")
    void loadFundingAssets("deposit", abort.signal).then(
      (rows) => {
        if (abort.signal.aborted) return
        setCatalog({ token, rows })
        setSelection((current) => {
          const code = current.asset || requestedAsset
          const selected = code ? rows.find((row) => row.asset === code) : rows[0]
          const selectedNetwork = selected?.networks.find(
            (row) => row.networkCode === current.network,
          )
          return {
            asset: selected?.asset ?? code,
            network:
              selectedNetwork?.networkCode ??
              (!current.network && selected?.networks.length === 1
                ? (selected.networks[0]?.networkCode ?? "")
                : ""),
          }
        })
      },
      (reason) => {
        if (!abort.signal.aborted) setCatalogError(readError(reason))
      },
    )
    return () => abort.abort()
  }, [token, reload, requestedAsset])

  useEffect(() => {
    setNotice("")
    setResult(null)
    setQr({ key: "", url: "" })
    setQrError("")
    if (!token || !assetCode || !networkCode) return
    const abort = new AbortController()
    void getDepositAddress(assetCode, networkCode, abort.signal).then(
      (value) => {
        if (abort.signal.aborted) return
        if (value.asset !== assetCode || value.network !== networkCode) {
          setResult({ key, error: t("The address does not match the selected asset and network.") })
        } else setResult({ key, address: value })
      },
      (reason) => {
        if (!abort.signal.aborted) setResult({ key, error: readError(reason) })
      },
    )
    return () => abort.abort()
  }, [key, token, assetCode, networkCode, retry])

  useEffect(() => {
    if (!address) return
    let active = true
    void QRCode.toDataURL(address.address, {
      width: 360,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).then(
      (url) => {
        if (active) setQr({ key, url })
      },
      (reason) => {
        if (active) setQrError(readError(reason))
      },
    )
    return () => {
      active = false
    }
  }, [address, key])

  useEffect(() => {
    if (!token || !assetCode || !networkCode) return
    const controller = new AbortController()
    setHistory(null)
    void loadDepositHistory(assetCode, networkCode, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setHistory({ key, rows, error: "" })
      },
      (reason) => {
        if (!controller.signal.aborted) setHistory({ key, rows: [], error: readError(reason) })
      },
    )
    return () => {
      controller.abort()
    }
  }, [key, token, assetCode, networkCode, historyRevision])

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(t("Copied"))
    } catch {
      setNotice(t("Copy failed. Please copy the address manually."))
    }
  }
  return (
    <div className="container section funding-page">
      <div className="page-heading">
        <h1>{t("Deposit Crypto")}</h1>
      </div>
      {!session ? (
        <Panel>
          <a className="route-link" href="/auth/login">
            {t("Go to login")}
          </a>
        </Panel>
      ) : (
        <div className="stack">
          <Panel>
            <h2>{t("1. Select asset & network")}</h2>
            {catalogError ? (
              <div role="alert">
                <p>{catalogError}</p>
                <Button onClick={() => setReload((value) => value + 1)}>{t("Retry")}</Button>
              </div>
            ) : catalog?.token !== token ? (
              <p role="status">{t("Loading assets…")}</p>
            ) : !assets.length ? (
              <p role="status">{t("No deposit assets are currently available.")}</p>
            ) : (
              <div className="stack">
                {!asset && selection.asset ? (
                  <p role="status">
                    {t("This asset is not enabled for deposits. Select an available asset.")}
                  </p>
                ) : null}
                <div className="grid-2">
                  <Field label={t("Asset")}>
                    <FundingAssetSelect
                      assets={assets}
                      value={assetCode}
                      onChange={(value) => {
                        const nextAsset = assets.find((row) => row.asset === value)
                        setSelection({
                          asset: value,
                          network:
                            nextAsset?.networks.length === 1
                              ? (nextAsset.networks[0]?.networkCode ?? "")
                              : "",
                        })
                      }}
                    />
                  </Field>
                  <Field label={t("Network")}>
                    <DropdownSelect
                      aria-label={t("Network")}
                      value={networkCode}
                      onChange={(event) =>
                        setSelection({ asset: assetCode, network: event.target.value })
                      }
                    >
                      <option value="">{t("Select network")}</option>
                      {asset?.networks.map((row) => (
                        <option
                          key={row.networkCode}
                          value={row.networkCode}
                        >{`${row.displayName} (${row.networkCode})`}</option>
                      ))}
                    </DropdownSelect>
                  </Field>
                </div>
              </div>
            )}
          </Panel>
          {asset && network ? (
            <Panel>
              <h2>{t("2. Deposit details")}</h2>
              {addressError ? (
                <div role="alert">
                  <p>{addressError}</p>
                  <Button onClick={() => setRetry((value) => value + 1)}>{t("Retry")}</Button>
                </div>
              ) : !address ? (
                <p role="status">{t("Loading deposit address…")}</p>
              ) : (
                <div className="deposit-details">
                  <div>
                    {qr.key === key && qr.url ? (
                      <>
                        <img
                          className="deposit-qr"
                          src={qr.url}
                          alt={t("Deposit address QR code")}
                        />
                        <a
                          className="button button-outline"
                          download={`${assetCode}-${networkCode}-deposit.png`}
                          href={qr.url}
                        >
                          <Download size={16} />
                          {t("Download QR code")}
                        </a>
                      </>
                    ) : (
                      <p role="status">{qrError || t("Generating QR code…")}</p>
                    )}
                  </div>
                  <div className="deposit-info">
                    <span>{t("Deposit address")}</span>
                    <div className="deposit-copy">
                      <code>{address.address}</code>
                      <Button
                        tone="ghost"
                        aria-label={t("Copy deposit address")}
                        onClick={() => void copy(address.address)}
                      >
                        <Copy size={18} />
                      </Button>
                    </div>
                    {address.memo ? (
                      <>
                        <strong>{t("Memo/Tag (required)")}</strong>
                        <div className="deposit-copy">
                          <code>{address.memo}</code>
                          <Button
                            tone="ghost"
                            aria-label={t("Copy memo/tag")}
                            onClick={() => void copy(address.memo)}
                          >
                            <Copy size={18} />
                          </Button>
                        </div>
                        <p>
                          {t("Include this memo/tag with your transfer to receive the deposit.")}
                        </p>
                      </>
                    ) : null}
                    <p>
                      {t("Only send")} {assetCode} · {network.displayName} ({networkCode}
                      {t(")")}
                    </p>
                    <div className="deposit-facts">
                      <div>
                        <span>{t("Minimum deposit")}</span>
                        <strong>
                          {network.minDeposit} {assetCode}
                        </strong>
                      </div>
                      <div>
                        <span>{t("Required confirmations")}</span>
                        <strong>{network.confirmations}</strong>
                      </div>
                    </div>
                    {notice ? <p role="status">{notice}</p> : null}
                  </div>
                </div>
              )}
            </Panel>
          ) : null}
          <Panel>
            <h2>{t("Deposit history")}</h2>
            {!assetCode || !networkCode ? (
              <p>{t("Choose an asset and network to view deposit records.")}</p>
            ) : history?.key !== key ? (
              <p role="status">{t("Loading records")}</p>
            ) : history.error ? (
              <div role="alert">
                <p>{history.error}</p>
                <Button onClick={() => setHistoryRevision((value) => value + 1)}>
                  {t("Retry deposit records")}
                </Button>
              </div>
            ) : history?.key === key && history.rows.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("Asset")}</th>
                      <th>{t("Amount")}</th>
                      <th>{t("Status")}</th>
                      <th>{t("Created")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.rows.map((row, index) => (
                      <tr key={String(row.id ?? index)}>
                        <td>{String(row.assetSymbol ?? row.asset ?? assetCode)}</td>
                        <td>{String(row.amount ?? "")}</td>
                        <td>{String(row.status ?? "")}</td>
                        <td>{String(row.createdAt ?? "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{t("No deposit records yet.")}</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
function readError(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : t("Funding service unavailable. Please retry later.")
}
