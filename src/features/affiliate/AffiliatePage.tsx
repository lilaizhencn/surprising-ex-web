import { useEffect, useRef, useState } from "react"
import {
  type AffiliateEntry,
  type AffiliateInvitation,
  type AffiliateMember,
  type AffiliateOverview,
  type AffiliatePayout,
  affiliateApi,
  percentPpm,
} from "../../api/affiliate"
import { loadAssetScales } from "../../api/endpoints"
import { Button, Field, Panel } from "../../components/ui/Primitives"
import { unitsToDecimal } from "../../lib/units"
import { loadSession, useSession } from "../../state/session"
import { PRODUCT_LINES } from "../../types/domain"
import { clearInvitation, invitationCode, invitationLink } from "./invitation"
import "./affiliate.css"

const errorText = (error: unknown) => (error instanceof Error ? error.message : "请求失败，请重试")
const statusText: Record<string, string> = {
  UNSETTLED: "待结算",
  PENDING: "待发放",
  UNKNOWN: "到账确认中",
  PAID: "已到账",
  REJECTED: "发放被拒绝，等待处理",
}
export function AffiliatePage() {
  const session = useSession()
  const owner = String(session?.user.userId ?? "")
  const [data, setData] = useState<AffiliateOverview | null>(null)
  const [members, setMembers] = useState<AffiliateMember[]>([])
  const [entries, setEntries] = useState<AffiliateEntry[]>([])
  const [scales, setScales] = useState<Record<string, string>>({})
  const [payouts, setPayouts] = useState<AffiliatePayout[]>([])
  const [preview, setPreview] = useState<AffiliateInvitation | null>(null)
  const [code, setCode] = useState(invitationCode)
  const [subject, setSubject] = useState("")
  const [line, setLine] = useState("")
  const [memberCursor, setMemberCursor] = useState("0")
  const [entryCursor, setEntryCursor] = useState("0")
  const [memberNext, setMemberNext] = useState<string | null>(null)
  const [entryNext, setEntryNext] = useState<string | null>(null)
  const [target, setTarget] = useState("")
  const [share, setShare] = useState("50")
  const [selected, setSelected] = useState<AffiliateMember | null>(null)
  const [created, setCreated] = useState<AffiliateInvitation | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [revision, setRevision] = useState(0)
  const queryScope = useRef("")
  useEffect(() => {
    if (!code.trim()) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    setPreview(null)
    void affiliateApi
      .preview(code.trim(), controller.signal)
      .then(setPreview)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorText(reason))
      })
    return () => controller.abort()
  }, [code])
  useEffect(() => {
    if (!owner) return
    const controller = new AbortController()
    setLoading(true)
    setError("")
    const scope = `${owner}:${line}:${subject}`
    if (queryScope.current !== scope) {
      setData(null)
      queryScope.current = scope
    }
    void Promise.all([
      affiliateApi.overview(line, subject || undefined, controller.signal),
      affiliateApi.members(subject || undefined, memberCursor, controller.signal),
      affiliateApi.entries(line, entryCursor, controller.signal),
      affiliateApi.payouts(controller.signal),
      loadAssetScales(controller.signal),
    ])
      .then(([overview, page, history, payments, assetScales]) => {
        if (controller.signal.aborted) return
        for (const row of [
          ...overview.balances,
          ...history.items,
          ...payments.items,
          ...page.items.flatMap((member) => member.contributions),
        ]) {
          const scale = assetScales[row.asset]
          if (!scale || !/^10*$/.test(scale))
            throw new Error(`币种 ${row.asset} 的精度尚未就绪，请刷新重试`)
        }
        setScales(assetScales)
        setData(overview)
        setMembers(page.items)
        setMemberNext(page.nextCursor)
        setEntries(history.items)
        setEntryNext(history.nextCursor)
        setPayouts(payments.items)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorText(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [owner, line, subject, memberCursor, entryCursor, revision])
  async function act(operation: () => Promise<unknown>, message: string) {
    if (busy) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await operation()
      if (String(loadSession()?.user.userId ?? "") !== owner) return
      setNotice(message)
      setRevision((value) => value + 1)
    } catch (reason) {
      if (String(loadSession()?.user.userId ?? "") === owner) setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }
  const viewingOwn = !subject || subject === owner
  const registrationQuery = `invite=${encodeURIComponent(code)}&redirect=%2Faffiliate`
  return (
    <main className="container section affiliate-page">
      <div className="affiliate-heading">
        <div>
          <h1>邀请与合作</h1>
          <p>邀请好友，查看交易贡献与佣金。团队按约定比例逐级分配。</p>
        </div>
        {owner && (
          <Button
            tone="outline"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            刷新
          </Button>
        )}
      </div>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <Panel>
        <h2>接受邀请</h2>
        <div className="affiliate-form">
          <Field label="邀请码">
            <input
              aria-label="邀请码"
              value={code}
              maxLength={64}
              onChange={(event) => {
                setCode(event.target.value)
                setError("")
              }}
            />
          </Field>
          {preview && (
            <p>
              邀请人 UID {preview.inviterId} ·{" "}
              {preview.cooperation
                ? `团队合作：你获得所在分支上级佣金的 ${Number(preview.sharePpm) / 10000}%`
                : "普通邀请"}
              {preview.cooperation && "。加入后，你本人交易不再给团队上级返佣。"}
            </p>
          )}
          {preview && (
            <a
              className="button button-outline"
              href={`surprising://affiliate?invite=${encodeURIComponent(code.trim())}`}
            >
              在 App 中打开邀请
            </a>
          )}
          {owner ? (
            <Button
              disabled={!preview || busy}
              onClick={() =>
                void act(async () => {
                  await affiliateApi.accept(code.trim())
                  clearInvitation()
                  setCode("")
                  setPreview(null)
                }, "邀请已接受，后续符合条件的手续费将自动核算")
              }
            >
              确认接受邀请
            </Button>
          ) : (
            <div className="affiliate-actions">
              <a className="button button-primary" href={`/auth/register?${registrationQuery}`}>
                注册并接受邀请
              </a>
              <a className="button button-outline" href={`/auth/login?${registrationQuery}`}>
                已有账户，登录接受
              </a>
            </div>
          )}
        </div>
      </Panel>
      {!owner ? (
        <p>每位注册用户都可以邀请好友。登录后查看你的邀请码、贡献和收益。</p>
      ) : loading && !data ? (
        <p role="status">正在加载邀请与佣金…</p>
      ) : (
        data && (
          <>
            <Panel>
              <h2>{viewingOwn ? "我的推广" : `成员 UID ${data.profile.userId}`}</h2>
              {viewingOwn && (
                <>
                  <p>
                    当前平台顶层比例：{data.rootRatePpm / 10000}% ·{" "}
                    {data.profile.autoSettlement ? "自动结算已开启" : "自动结算已关闭"}
                  </p>
                  <Field label="我的邀请码">
                    <input readOnly value={data.profile.inviteCode} aria-label="我的邀请码" />
                  </Field>
                  <div className="affiliate-actions">
                    <Button
                      tone="outline"
                      onClick={() =>
                        void act(
                          () =>
                            navigator.clipboard.writeText(invitationLink(data.profile.inviteCode)),
                          "邀请链接已复制",
                        )
                      }
                    >
                      复制邀请链接
                    </Button>
                  </div>
                </>
              )}
              <p>
                直接邀请 {data.counts.directInviteCount} 人 · 团队邀请 {data.counts.teamInviteCount}{" "}
                人
              </p>
              {!viewingOwn && (
                <Button
                  tone="outline"
                  onClick={() => {
                    setSubject("")
                    setMemberCursor("0")
                    setSelected(null)
                  }}
                >
                  返回我的团队
                </Button>
              )}
            </Panel>
            <Panel>
              <h2>当前合作分配</h2>
              <p>
                平台顶层比例 {data.rootRatePpm / 10000}%。
                {data.teamPath.length
                  ? "你邀请的用户产生的佣金，还将沿以下合作路径分配。"
                  : "你目前直接获得对应邀请分支的平台佣金。"}
              </p>
              {!data.teamActive && (
                <p role="status">顶层团队已暂停，新团队佣金暂不分配，历史记录保留。</p>
              )}
              {data.teamPath.length > 0 && (
                <details>
                  <summary>查看我的合作路径（{data.teamPath.length} 层）</summary>
                  <div className="affiliate-path">
                    {data.teamPath.map((edge) => (
                      <p key={edge.childId}>
                        UID {edge.parentId} → UID {edge.childId}：上级额度的 {edge.sharePpm / 10000}
                        %
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </Panel>
            <Panel>
              <h2>贡献与收益</h2>
              <Field label="产品线">
                <select
                  aria-label="产品线"
                  value={line}
                  onChange={(event) => {
                    setLine(event.target.value)
                    setEntryCursor("0")
                  }}
                >
                  <option value="">全部产品，分别展示</option>
                  {Object.values(PRODUCT_LINES).map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))}
                </select>
              </Field>
              <p>收益按产品线与币种分别展示。获得额度包含分给下级的份额，可结算的是本人留存。</p>
              {data.balances.length === 0 ? (
                <p>暂无已确认佣金。产生符合条件的交易手续费后自动更新。</p>
              ) : (
                <div className="affiliate-table">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "产品 / 资产",
                          "团队费用贡献",
                          "直接费用贡献",
                          "获得额度",
                          "下级分配",
                          "本人留存",
                          "待结算",
                          "在途",
                          "已到账",
                        ].map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.balances.map((row) => (
                        <tr key={`${row.productLine}:${row.asset}`}>
                          <td>
                            {row.productLine} / {row.asset}
                          </td>
                          {[
                            row.teamFeeUnits,
                            row.directFeeUnits,
                            row.receivedUnits,
                            row.delegatedUnits,
                            row.retainedUnits,
                            row.pendingUnits,
                            row.inFlightUnits,
                            row.paidUnits,
                          ].map((value, index) => (
                            <td key={`${index}:${value}`}>
                              {unitsToDecimal(value, scales[row.asset] as string)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel>
              <h2>邀请用户与团队成员</h2>
              <p>
                点击成员查看其邀请和贡献。成为合作下级需要对方接受；比例以对应分支的上级佣金为基数。
              </p>
              {members.length === 0 ? (
                <p>这个分支还没有邀请用户。</p>
              ) : (
                <div className="affiliate-table">
                  <table>
                    <thead>
                      <tr>
                        <th>UID</th>
                        <th>直接邀请</th>
                        <th>合作身份</th>
                        <th>分配比例</th>
                        <th>对本级的贡献</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.userId}>
                          <td>{member.userId}</td>
                          <td>{member.directInviteCount}</td>
                          <td>{member.teamParentId ? "团队下级" : "普通邀请用户"}</td>
                          <td>{member.sharePpm === null ? "—" : `${member.sharePpm / 10000}%`}</td>
                          <td>
                            {member.contributions.length === 0
                              ? "暂无交易贡献"
                              : member.contributions.map((row) => (
                                  <p key={`${row.productLine}:${row.asset}`}>
                                    {row.productLine} / {row.asset}：手续费{" "}
                                    {unitsToDecimal(row.feeUnits, scales[row.asset] as string)} ·
                                    获得{" "}
                                    {unitsToDecimal(row.receivedUnits, scales[row.asset] as string)}{" "}
                                    · 留存{" "}
                                    {unitsToDecimal(row.retainedUnits, scales[row.asset] as string)}
                                  </p>
                                ))}
                          </td>
                          <td>
                            <div className="affiliate-actions">
                              {member.teamParentId && (
                                <Button
                                  tone="ghost"
                                  onClick={() => {
                                    setSubject(member.userId)
                                    setMemberCursor("0")
                                    setSelected(null)
                                  }}
                                >
                                  查看贡献
                                </Button>
                              )}
                              {viewingOwn && data.profile.kolEnabled && (
                                <Button
                                  tone="outline"
                                  onClick={() => {
                                    setSelected(member)
                                    setTarget(member.userId)
                                    setShare(
                                      member.sharePpm === null
                                        ? "50"
                                        : String(member.sharePpm / 10000),
                                    )
                                  }}
                                >
                                  {member.teamParentId ? "调整比例" : "邀请成为下级"}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="affiliate-actions">
                <Button
                  tone="outline"
                  disabled={memberCursor === "0"}
                  onClick={() => setMemberCursor("0")}
                >
                  首页
                </Button>
                <Button
                  tone="outline"
                  disabled={!memberNext}
                  onClick={() => memberNext && setMemberCursor(memberNext)}
                >
                  下一页
                </Button>
              </div>
            </Panel>
            {viewingOwn && (
              <Panel>
                <h2>KOL 合作管理</h2>
                {!data.profile.kolEnabled ? (
                  <p>KOL 尚未开通。普通邀请返佣已可使用；请联系平台开通团队合作管理。</p>
                ) : (
                  <div className="affiliate-form">
                    <Field label="合作用户 UID（留空生成合作链接）">
                      <input
                        aria-label="合作用户 UID"
                        inputMode="numeric"
                        value={target}
                        onChange={(event) => {
                          setTarget(event.target.value)
                          setSelected(null)
                        }}
                      />
                    </Field>
                    <Field label="下级获得上级佣金的比例（%）">
                      <input
                        aria-label="下级分配比例"
                        inputMode="decimal"
                        value={share}
                        onChange={(event) => setShare(event.target.value)}
                      />
                    </Field>
                    <Button
                      loading={busy}
                      onClick={() =>
                        void act(
                          async () => {
                            const ppm = percentPpm(share)
                            if (selected?.teamParentId) {
                              await affiliateApi.share(selected.userId, ppm)
                              setSelected(null)
                              setTarget("")
                              setCreated(null)
                            } else setCreated(await affiliateApi.invite(target, ppm))
                          },
                          selected?.teamParentId
                            ? "未来分配比例已更新，历史佣金保持原结果"
                            : "合作邀请已创建，接受后生效",
                        )
                      }
                    >
                      {selected?.teamParentId ? "保存分配比例" : "生成合作邀请"}
                    </Button>
                    {created && (
                      <>
                        <Field label="合作邀请链接">
                          <input
                            readOnly
                            value={invitationLink(created.code)}
                            aria-label="合作邀请链接"
                          />
                        </Field>
                        <Button
                          tone="outline"
                          onClick={() =>
                            void act(
                              () => navigator.clipboard.writeText(invitationLink(created.code)),
                              "合作邀请链接已复制",
                            )
                          }
                        >
                          复制合作链接
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </Panel>
            )}
            {viewingOwn && data.invitations.length > 0 && (
              <Panel>
                <h2>待接受的合作邀请</h2>
                {data.invitations.map((invite) => (
                  <div className="affiliate-invitation" key={invite.code}>
                    <span>
                      邀请人 {invite.inviterId} → {invite.targetUserId ?? "持链接的新合作用户"} ·{" "}
                      {Number(invite.sharePpm) / 10000}% · 有效至{" "}
                      {new Date(invite.expiresAt ?? "").toLocaleString()}
                    </span>
                    {invite.inviterId === owner ? (
                      <Button
                        tone="outline"
                        onClick={() =>
                          void act(
                            () => navigator.clipboard.writeText(invitationLink(invite.code)),
                            "链接已复制",
                          )
                        }
                      >
                        复制链接
                      </Button>
                    ) : (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          setCode(invite.code)
                          window.scrollTo({ top: 0, behavior: "smooth" })
                        }}
                      >
                        查看并接受
                      </Button>
                    )}
                  </div>
                ))}
              </Panel>
            )}
            {viewingOwn && (
              <Panel>
                <h2>佣金明细</h2>
                {entries.length === 0 ? (
                  <p>暂无佣金明细。</p>
                ) : (
                  <div className="affiliate-table">
                    <table>
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>产品 / 资产</th>
                          <th>来源用户</th>
                          <th>本人留存</th>
                          <th>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((row) => (
                          <tr key={row.commissionId}>
                            <td>{new Date(row.occurredAt).toLocaleString()}</td>
                            <td>
                              {row.productLine} / {row.asset}
                            </td>
                            <td>{row.sourceUserId}</td>
                            <td>
                              {unitsToDecimal(row.retainedUnits, scales[row.asset] as string)}{" "}
                              {row.asset}
                            </td>
                            <td>{statusText[row.status] ?? row.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="affiliate-actions">
                  <Button
                    tone="outline"
                    disabled={entryCursor === "0"}
                    onClick={() => setEntryCursor("0")}
                  >
                    明细首页
                  </Button>
                  <Button
                    tone="outline"
                    disabled={!entryNext}
                    onClick={() => entryNext && setEntryCursor(entryNext)}
                  >
                    更多明细
                  </Button>
                </div>
              </Panel>
            )}
            {viewingOwn && (
              <Panel>
                <h2>结算记录</h2>
                {payouts.length === 0 ? (
                  <p>
                    暂无结算记录。佣金确认满 {data.settings.settlementHours}{" "}
                    小时后进入结算，资金不足时保留待处理。
                  </p>
                ) : (
                  payouts.map((row) => (
                    <div className="affiliate-invitation" key={row.payoutId}>
                      <span>
                        {row.productLine} / {row.asset} ·{" "}
                        {unitsToDecimal(row.amountUnits, scales[row.asset] as string)} {row.asset} ·{" "}
                        {statusText[row.status] ?? row.status}
                        <br />
                        {row.error}
                      </span>
                    </div>
                  ))
                )}
              </Panel>
            )}
          </>
        )
      )}
    </main>
  )
}
