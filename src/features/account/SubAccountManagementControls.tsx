import { useState } from "react"
import type { SubAccountRecord } from "../../api/accountApi"
import { loadSubAccountAssets, updateSubAccountStatus } from "../../api/subAccountApi"
import type { ApiBalance } from "../../api/types"
import { t } from "../../i18n"
import "./SubAccountManagementControls.css"

export function SubAccountManagementControls({
  account,
  onStatusChange,
}: {
  readonly account: SubAccountRecord
  readonly onStatusChange?: (account: SubAccountRecord) => void
}) {
  const [assets, setAssets] = useState<readonly ApiBalance[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const frozen = account.status === "FROZEN"

  const showAssets = async () => {
    setBusy(true)
    setError(null)
    try {
      setAssets(await loadSubAccountAssets(account.subUserId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Unable to load sub-account assets."))
    } finally {
      setBusy(false)
    }
  }

  const toggleFreeze = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateSubAccountStatus(account.subUserId, frozen ? "ACTIVE" : "FROZEN")
      onStatusChange?.(updated)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Unable to update sub-account status."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sub-account-manage">
      <div className="action-buttons-group">
        <button
          type="button"
          className="transfer-btn"
          disabled={busy}
          onClick={() => void showAssets()}
        >
          {assets ? t("Refresh assets") : t("View assets")}
        </button>
        <button
          type="button"
          className="transfer-btn"
          disabled={busy}
          onClick={() => void toggleFreeze()}
        >
          {frozen ? t("Unfreeze") : t("Freeze")}
        </button>
      </div>
      {error ? <p className="sub-account-manage-error">{error}</p> : null}
      {assets ? <SubAccountAssetList balances={assets} /> : null}
    </div>
  )
}

export function SubAccountAssetList({ balances }: { readonly balances: readonly ApiBalance[] }) {
  if (balances.length === 0) {
    return <p className="sub-account-assets-empty">{t("No assets in this sub-account.")}</p>
  }
  return (
    <table className="sub-account-assets">
      <thead>
        <tr>
          <th>{t("Asset")}</th>
          <th>{t("Available")}</th>
          <th>{t("Locked")}</th>
        </tr>
      </thead>
      <tbody>
        {balances.map((row) => (
          <tr key={`${row.accountType ?? ""}-${row.asset}`}>
            <td>{row.asset}</td>
            <td className="mono-cell">{String(row.free ?? row.availableUnits ?? "0")}</td>
            <td className="mono-cell">{String(row.locked ?? row.lockedUnits ?? "0")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
