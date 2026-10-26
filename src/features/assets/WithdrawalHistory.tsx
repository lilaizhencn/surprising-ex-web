import { useEffect, useState } from "react"
import { loadWithdrawalHistory } from "../../api/endpoints"
import { Button, Panel, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"

type Row = Readonly<Record<string, unknown>>
export function WithdrawalHistory({
  asset,
  refreshVersion,
  onRefresh,
  busy,
}: {
  readonly asset: string
  readonly refreshVersion: number
  readonly onRefresh: () => void
  readonly busy: boolean
}) {
  const session = useSession()
  const token = session?.accessToken ?? ""
  const scope = `${token}:${asset}`
  const [history, setHistory] = useState<{
    key: string
    value?: readonly Row[]
    error?: string
  } | null>(null)
  const historyRows = history?.key === scope ? history.value : undefined
  const historyError = history?.key === scope ? history.error : ""
  useEffect(() => {
    if (!token || !asset) return
    const controller = new AbortController()
    setHistory({ key: scope })
    void loadWithdrawalHistory(asset, undefined, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setHistory({ key: scope, value: rows })
      },
      (error) => {
        if (!controller.signal.aborted)
          setHistory({
            key: scope,
            error:
              error instanceof Error
                ? error.message
                : t("Funding service unavailable. Please retry later."),
          })
      },
    )
    return () => controller.abort()
  }, [token, asset, scope, refreshVersion])
  return (
    <Panel>
      <div className="withdraw-history-heading">
        <h2>{t("Withdrawal history")}</h2>
        <Button tone="ghost" onClick={onRefresh} disabled={busy}>
          {t("Refresh")}
        </Button>
      </div>
      {!asset ? (
        <StateView kind="empty" message="Choose an asset to view withdrawal history." />
      ) : historyError ? (
        <StateView kind="error" message={historyError} retry={onRefresh} />
      ) : !historyRows ? (
        <StateView kind="loading" message="Loading records" />
      ) : historyRows.length === 0 ? (
        <StateView kind="empty" message="No withdrawal records yet." />
      ) : (
        <ul className="withdraw-history">
          {historyRows.map((row, index) => (
            <li
              key={String(row["gatewayWithdrawalId"] ?? row["withdrawalId"] ?? row["id"] ?? index)}
            >
              <div className="withdraw-history-title">
                <strong className="mono">
                  {String(row["amount"] ?? "—")}{" "}
                  {String(row["asset"] ?? row["assetSymbol"] ?? asset)}
                </strong>
                <span>{String(row["status"] ?? "—")}</span>
              </div>
              <dl>
                <div>
                  <dt>{t("Network")}</dt>
                  <dd>{String(row["chain"] ?? "—")}</dd>
                </div>
                <div>
                  <dt>{t("Created")}</dt>
                  <dd>{String(row["createdAt"] ?? "—")}</dd>
                </div>
                <div className="withdraw-wide">
                  <dt>{t("Recipient address")}</dt>
                  <dd className="mono">{String(row["toAddress"] ?? "—")}</dd>
                </div>
                <div className="withdraw-wide">
                  <dt>{t("Withdrawal ID")}</dt>
                  <dd className="mono">
                    {String(row["gatewayWithdrawalId"] ?? row["withdrawalId"] ?? row["id"] ?? "—")}
                  </dd>
                </div>
              </dl>
              {row["custodyWalletUnavailable"] === true ? (
                <p className="withdraw-network-note">
                  {t(
                    "The custody service is unavailable. The platform record is shown; on-chain status is not confirmed.",
                  )}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
