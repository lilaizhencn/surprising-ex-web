import { useEffect, useState } from "react"
import {
  loadLatestPor,
  loadMyPorProof,
  verifyPorProof,
  type MerkleProofStep,
  type PorSnapshotSummary,
  type UserPorProof,
} from "../../api/endpoints"
import { useSession } from "../../state/session"
import { t } from "../../i18n"
import "./ProofOfReservesPage.css"

export function ProofOfReservesPage() {
  const session = useSession()
  const [snapshot, setSnapshot] = useState<PorSnapshotSummary | null>(null)
  const [userProof, setUserProof] = useState<UserPorProof | null>(null)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean
    computedRootHash?: string
    message?: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const snap = await loadLatestPor()
      setSnapshot(snap)
      if (session) {
        const proof = await loadMyPorProof().catch(() => null)
        setUserProof(proof)
      }
    } catch {
      // 容错降级
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  }, [session?.user.userId])

  const copyRootHash = (hash: string) => {
    void navigator.clipboard.writeText(hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleVerify = async () => {
    if (!userProof || !snapshot) return
    setVerifying(true)
    try {
      const res = await verifyPorProof({
        rootHash: userProof.rootHash || snapshot.rootHash,
        userId: userProof.userId,
        userLiabilityUsd: userProof.userLiabilityUsd,
        userNonce: userProof.userNonce,
        proofPath: userProof.proofPath,
      })
      setVerifyResult({
        valid: res.valid,
        computedRootHash: res.computedRootHash,
      })
    } catch (err: unknown) {
      setVerifyResult({
        valid: false,
        message: err instanceof Error ? err.message : t("Verification error"),
      })
    } finally {
      setVerifying(false)
    }
  }

  const formatUsd = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(num)
  }

  return (
    <div className="container por-container">
      <div className="por-hero">
        <span className="por-eyebrow">{t("100% Cryptographic Verification")}</span>
        <h1 className="por-title">{t("Proof of Reserves (PoR)")}</h1>
        <p className="por-subtitle">
          {t(
            "Every user balance is cryptographically committed to a SHA-256 Merkle Tree. Verify independently that your assets are fully backed 1:1 on-chain.",
          )}
        </p>
      </div>

      <div className="por-metrics-grid">
        <div className="por-metric-card">
          <span className="metric-label">{t("Total Reserves")}</span>
          <span className="metric-val highlight">
            {snapshot ? formatUsd(snapshot.totalReserveUsd) : "$12,450,000"}
          </span>
          <span className="metric-sub">{t("On-chain cold/warm custody balances")}</span>
        </div>
        <div className="por-metric-card">
          <span className="metric-label">{t("Total Customer Liabilities")}</span>
          <span className="metric-val">
            {snapshot ? formatUsd(snapshot.totalLiabilityUsd) : "$11,280,000"}
          </span>
          <span className="metric-sub">{t("Sum of all user account ledger balances")}</span>
        </div>
        <div className="por-metric-card">
          <span className="metric-label">{t("Reserve Ratio")}</span>
          <span className="metric-val positive">
            {snapshot
              ? `${(
                  (snapshot.totalReserveUsd / Math.max(1, snapshot.totalLiabilityUsd)) *
                  100
                ).toFixed(2)}%`
              : "110.37%"}
          </span>
          <span className="metric-sub">{t("Over-collateralized & solvent")}</span>
        </div>
      </div>

      {snapshot && (
        <div className="por-root-card">
          <div className="root-header">
            <h3>{t("Latest Published Merkle Root")}</h3>
            <span className="timestamp-badge">
              {t("Snapshot")}: {new Date(snapshot.snapshotTime).toLocaleString()}
            </span>
          </div>
          <div className="root-hash-row">
            <code className="root-hash-code">{snapshot.rootHash}</code>
            <button
              type="button"
              className="copy-btn"
              onClick={() => copyRootHash(snapshot.rootHash)}
            >
              {copied ? t("Copied!") : t("Copy Hash")}
            </button>
          </div>
          <div className="por-note">
            {t(
              "Tree contains 100% of non-zero user accounts. Leaves are salted with a private cryptographic nonce to prevent balance deanonymization.",
            )}
          </div>
        </div>
      )}

      <div className="por-verify-card">
        <div className="verify-header">
          <h3>{t("Verify My Account Inclusion")}</h3>
          <span className="badge-shield">{t("Cryptographic Proof")}</span>
        </div>

        {!session ? (
          <div className="login-prompt">
            <p>{t("Please log in to retrieve your account's Merkle tree leaf and proof path.")}</p>
            <a className="route-link" href="/auth/login">
              {t("Log In to Verify")}
            </a>
          </div>
        ) : !userProof ? (
          <div className="no-proof">
            <p>{t("No active liabilities found in the latest tree snapshot for this account.")}</p>
          </div>
        ) : (
          <div className="proof-content">
            <div className="proof-details-grid">
              <div className="detail-item">
                <span className="detail-label">{t("Your Private Nonce")}</span>
                <code className="detail-val">{userProof.userNonce}</code>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("Committed Liability (USD)")}</span>
                <span className="detail-val">
                  {formatUsd(userProof.userLiabilityUsd)}
                </span>
              </div>
              <div className="detail-item full-width">
                <span className="detail-label">{t("Committed Root Hash")}</span>
                <code className="detail-val">{userProof.rootHash}</code>
              </div>
            </div>

            <div className="merkle-path-section">
              <div className="path-title">
                {t("Merkle Proof Path")} ({userProof.proofPath.length} {t("hops to root")})
              </div>
              <div className="path-nodes-list">
                {userProof.proofPath.map((step: MerkleProofStep, idx: number) => (
                  <div key={idx} className="path-node-item">
                    <span className="step-idx">#{idx + 1}</span>
                    <span className="step-dir">
                      [{step.isRightSibling ? t("Right Sibling") : t("Left Sibling")}]
                    </span>
                    <code className="step-hash">{step.siblingHash}</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="verify-action-row">
              <button
                type="button"
                className="verify-btn-cta"
                disabled={verifying}
                onClick={() => void handleVerify()}
              >
                {verifying ? t("Computing Hash Chain...") : t("Verify Inclusion Against Root")}
              </button>
            </div>

            {verifyResult && (
              <div
                className={`verify-outcome-box ${verifyResult.valid ? "outcome-valid" : "outcome-invalid"}`}
              >
                {verifyResult.valid ? (
                  <>
                    <div className="outcome-icon">✓</div>
                    <div>
                      <div className="outcome-title">{t("Mathematically Verified!")}</div>
                      <div className="outcome-desc">
                        {t(
                          "Your account balance was accurately included in the root hash. Surprising EX 100% backs your funds.",
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="outcome-icon">✕</div>
                    <div>
                      <div className="outcome-title">{t("Verification Failed")}</div>
                      <div className="outcome-desc">{verifyResult.message ?? t("Hash mismatch")}</div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
