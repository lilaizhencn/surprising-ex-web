import { useEffect, useState } from "react"
import {
  createSubAccount,
  loadSubAccounts,
  type SubAccountRecord,
  transferSubAccount,
} from "../../api/endpoints"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { Button, Field } from "../../components/ui/Primitives"
import { t } from "../../i18n"
import { useSession } from "../../state/session"
import { SubAccountManagementControls } from "./SubAccountManagementControls"
import "./SubAccountPage.css"

export function SubAccountPage() {
  const session = useSession()
  const [subAccounts, setSubAccounts] = useState<readonly SubAccountRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ message: string; failed?: boolean } | null>(null)

  // 创建子账户表单
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newAccountName, setNewAccountName] = useState("")
  const [newPermissions, setNewPermissions] = useState("TRADING")
  const [creating, setCreating] = useState(false)

  // 内部划转模态框
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [selectedSubUserId, setSelectedSubUserId] = useState<number | null>(null)
  const [transferDirection, setTransferDirection] = useState<"toSub" | "fromSub">("toSub")
  const [transferAsset, setTransferAsset] = useState("USDT")
  const [transferAmount, setTransferAmount] = useState("")
  const [transferring, setTransferring] = useState(false)

  const reloadSubAccounts = async () => {
    if (!session) return
    setLoading(true)
    try {
      const list = await loadSubAccounts()
      setSubAccounts(list)
    } catch (err: unknown) {
      setNotice({
        message: err instanceof Error ? err.message : t("Failed to load sub accounts"),
        failed: true,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadSubAccounts()
  }, [session?.user.userId])

  const handleCreate = async () => {
    if (!newAccountName.trim()) {
      setNotice({ message: t("Please enter a sub account name"), failed: true })
      return
    }
    setCreating(true)
    try {
      await createSubAccount({
        subAccountName: newAccountName.trim(),
        permissions: newPermissions,
      })
      setNotice({ message: t("Sub account created successfully!"), failed: false })
      setShowCreateModal(false)
      setNewAccountName("")
      await reloadSubAccounts()
    } catch (err: unknown) {
      setNotice({
        message: err instanceof Error ? err.message : t("Failed to create sub account"),
        failed: true,
      })
    } finally {
      setCreating(false)
    }
  }

  const handleTransfer = async () => {
    if (!selectedSubUserId) {
      setNotice({ message: t("Please select a sub account"), failed: true })
      return
    }
    const amt = Number(transferAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setNotice({ message: t("Please enter a valid transfer amount"), failed: true })
      return
    }
    setTransferring(true)
    try {
      const resp = await transferSubAccount({
        subUserId: selectedSubUserId,
        fromParentToSub: transferDirection === "toSub",
        asset: transferAsset,
        amountUnits: transferAmount,
      })
      setNotice({
        message: `${t("Transfer successful! TxID")}: ${resp.transferId}`,
        failed: false,
      })
      setShowTransferModal(false)
      setTransferAmount("")
    } catch (err: unknown) {
      setNotice({
        message: err instanceof Error ? err.message : t("Transfer failed"),
        failed: true,
      })
    } finally {
      setTransferring(false)
    }
  }

  const openTransfer = (subUserId: number, direction: "toSub" | "fromSub" = "toSub") => {
    setSelectedSubUserId(subUserId)
    setTransferDirection(direction)
    setShowTransferModal(true)
  }

  return (
    <div className="container sub-account-container">
      <div className="sub-actions-bar">
        <Button className="sub-gradient-btn" onClick={() => setShowCreateModal(true)}>
          {t("+ Create Sub-Account")}
        </Button>
      </div>

      {notice && (
        <div className={`sub-notice-banner ${notice.failed ? "notice-error" : "notice-success"}`}>
          {notice.message}
        </div>
      )}

      <div className="sub-account-card">
        <div className="sub-table-wrapper">
          <table className="sub-table">
            <thead>
              <tr>
                <th>{t("User ID")}</th>
                <th>{t("Account Name")}</th>
                <th>{t("Permissions")}</th>
                <th>{t("Status")}</th>
                <th>{t("Created At")}</th>
                <th>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {subAccounts.length > 0 ? (
                subAccounts.map((account) => (
                  <tr key={account.id}>
                    <td className="mono-cell">{account.subUserId}</td>
                    <td className="name-cell">{account.subAccountName}</td>
                    <td>
                      <span className="perm-badge">{account.permissions}</span>
                    </td>
                    <td>
                      <span className="status-badge-active">{account.status}</span>
                    </td>
                    <td className="date-cell">
                      {new Date(account.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="action-buttons-group">
                        <button
                          type="button"
                          className="transfer-btn"
                          onClick={() => openTransfer(account.subUserId, "toSub")}
                        >
                          {t("Transfer In")}
                        </button>
                        <button
                          type="button"
                          className="transfer-btn"
                          onClick={() => openTransfer(account.subUserId, "fromSub")}
                        >
                          {t("Transfer Out")}
                        </button>
                      </div>
                      <SubAccountManagementControls
                        account={account}
                        onStatusChange={(updated) =>
                          setSubAccounts((current) =>
                            current.map((row) => (row.subUserId === updated.subUserId ? { ...row, ...updated } : row)),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="sub-table-empty-row">
                  <td colSpan={6} aria-hidden="true" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-glass">
            <h2>{t("Create Sub-Account")}</h2>
            <div className="modal-form">
              <Field label={t("Sub-Account Name")}>
                <input
                  className="glass-input"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder={t("e.g. Trend-Following-Bot")}
                />
              </Field>
              <Field label={t("Permissions")}>
                <DropdownSelect
                  value={newPermissions}
                  onChange={(e) => setNewPermissions(e.target.value)}
                >
                  <option value="TRADING">{t("Trading & Transfer Only")}</option>
                  <option value="READONLY">{t("Read Only (Auditing)")}</option>
                  <option value="ALL">{t("Full Permissions")}</option>
                </DropdownSelect>
              </Field>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowCreateModal(false)}
              >
                {t("Cancel")}
              </button>
              <Button className="sub-gradient-btn" loading={creating} onClick={() => void handleCreate()}>
                {t("Create Account")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div className="modal-backdrop">
          <div className="modal-glass">
            <h2>{t("Internal Asset Transfer")}</h2>
            <div className="modal-form">
              <div className="direction-tabs">
                <button
                  type="button"
                  className={transferDirection === "toSub" ? "active" : ""}
                  onClick={() => setTransferDirection("toSub")}
                >
                  {t("Master → Sub-Account")}
                </button>
                <button
                  type="button"
                  className={transferDirection === "fromSub" ? "active" : ""}
                  onClick={() => setTransferDirection("fromSub")}
                >
                  {t("Sub-Account → Master")}
                </button>
              </div>

              <Field label={t("Sub-Account ID")}>
                <input className="glass-input" value={selectedSubUserId ?? ""} disabled />
              </Field>

              <Field label={t("Asset")}>
                <DropdownSelect
                  value={transferAsset}
                  onChange={(e) => setTransferAsset(e.target.value)}
                >
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                </DropdownSelect>
              </Field>

              <Field label={t("Transfer Amount")}>
                <input
                  className="glass-input"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </Field>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowTransferModal(false)}
              >
                {t("Cancel")}
              </button>
              <Button className="sub-gradient-btn" loading={transferring} onClick={() => void handleTransfer()}>
                {t("Confirm Transfer")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
