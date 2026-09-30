import { memo, useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AlertTriangle, Bot, CheckCircle2, FileText, Lock, MessageSquare, Plus, ShieldCheck, User } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { criteriaForStage } from '../../data/workflow/criteria'
import { COMPONENTS, RESPONSIBLE_PARTIES, STAGES } from '../../data/workflow/hnqnProject'
import { AI_VERDICT_META, CRITERION_STATUS_META, CRITERION_STATUS_ORDER, ISSUE_STATUS_META, SIGNOFF_META } from '../../data/workflow/meta'
import { useEvidence, useIssues, useSession } from '../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../store/inspectionFlow.store'
import { flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { formatClock, uid } from '../../services/workflow/ids'
import { decisionKey, finalStatus, signOffGate, statusFromVerdict } from '../../services/workflow/reviewLogic'
import type { AiFinding, CriterionDef, CriterionStatus, Evidence, InspectionSession, ReviewAction, SignOffResult } from '../../workflow.types'
import { EvidenceMedia } from '../../components/flow/EvidenceMedia'
import { buildMarkers, EvidenceVideoPlayer } from '../../components/flow/EvidenceVideoPlayer'
import { Breadcrumbs, Card, formatDateTimeVn, SourceBadge, TokenBadge } from '../../components/flow/FlowUi'
import { MeasurementSheet, type MeasurementInput } from '../../components/flow/MeasurementSheet'
import { SignaturePad } from '../../components/flow/SignaturePad'

interface ReviewItemProps {
  session: InspectionSession
  criterion: CriterionDef
  finding?: AiFinding
  evidence: Evidence[]
  locked: boolean
  onSeek: (sec: number) => void
  onAddEvidence: (criterion: CriterionDef, videoTs: number) => void
  onCreateIssue: (criterion: CriterionDef, finding?: AiFinding) => void
  hasIssue: boolean
}

/** §21: Design → Observed → Snapshot → Video → Voice → AFC/BIM, và quyết định của người duyệt. */
const ReviewItem = memo(function ReviewItem({ session, criterion: c, finding, evidence, locked, onSeek, onAddEvidence, onCreateIssue, hasIssue }: ReviewItemProps) {
  const decide = useInspectionFlowStore(s => s.decide)
  const log = useInspectionFlowStore(s => s.log)
  const [mode, setMode] = useState<ReviewAction | 'comment' | null>(null)
  const [text, setText] = useState('')
  const [override, setOverride] = useState<CriterionStatus>('pass')
  const key = decisionKey(session, c.id)
  const decision = session.reviews[key]
  const live = session.results[c.id]
  const final = finalStatus(session, c.id)
  const snaps = evidence.filter(e => e.type === 'snapshot')
  const voices = evidence.filter(e => e.type === 'voice')
  const measures = evidence.filter(e => e.type === 'measurement' || e.type === 'test' || e.type === 'document')
  const videoTs = finding?.videoFrom ?? live?.videoTs ?? evidence[0]?.ctx.videoTs

  const submit = () => {
    if (mode === 'comment') {
      if (text.trim()) log('review.comment', session.assetId, `${c.code}: ${text.trim()}`, session.id)
    } else if (mode === 'accept') {
      decide(session.id, { findingId: key, action: 'accept', finalStatus: finding ? statusFromVerdict(finding.verdict) : live?.status ?? 'pass', comment: text.trim() })
    } else if (mode === 'reject') {
      const fallback = live?.status && live.status !== 'not_checked' && live.status !== 'review' ? live.status : 'pass'
      decide(session.id, { findingId: key, action: 'reject', finalStatus: fallback, comment: text.trim() })
    } else if (mode === 'override') {
      decide(session.id, { findingId: key, action: 'override', finalStatus: override, comment: text.trim() })
    }
    setMode(null)
    setText('')
  }
  const needsText = mode === 'reject' || mode === 'override' || mode === 'comment'

  return (
    <li className={cn('rounded-lg border p-2.5 flex flex-col gap-1.5', finding && finding.verdict !== 'pass_candidate' ? 'border-amber-500/30 bg-amber-500/[0.03]' : 'border-white/5 bg-white/[0.02]')}>
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-mono text-muted-foreground mt-0.5">{c.code}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground">{c.title} <span className="text-muted-foreground font-normal">· {COMPONENTS[c.component].label}</span></p>
          {finding && <p className="text-[11px] text-foreground/80 mt-0.5 flex items-start gap-1"><Bot className="w-3.5 h-3.5 text-purple-300 shrink-0" />{finding.summary} <span className="text-muted-foreground">({Math.round(finding.confidence * 100)}%)</span></p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {finding && <TokenBadge token={AI_VERDICT_META[finding.verdict]} size="small" />}
          <TokenBadge token={CRITERION_STATUS_META[final]} />
        </div>
      </div>
      <ol className="grid grid-cols-3 lg:grid-cols-6 gap-1 text-[10px]">
        <li className="rounded bg-white/[0.03] px-1.5 py-1"><p className="text-muted-foreground">Design</p><p className="text-foreground font-semibold truncate">{c.design}</p><SourceBadge source={c.source} /></li>
        <li className="rounded bg-white/[0.03] px-1.5 py-1"><p className="text-muted-foreground">Observed</p><p className="text-foreground font-semibold truncate">{finding?.observed ?? live?.observed ?? '—'}</p>{live?.observed && finding && <p className="text-muted-foreground truncate">KS: {live.observed}</p>}</li>
        <li className="rounded bg-white/[0.03] px-1.5 py-1"><p className="text-muted-foreground">Snapshot</p>{snaps[0] ? <EvidenceMedia evidence={snaps[0]} className="w-full h-8" /> : <p className="text-muted-foreground/60">—</p>}</li>
        <li className="rounded bg-white/[0.03] px-1.5 py-1">
          <p className="text-muted-foreground">Video</p>
          {videoTs != null ? (
            <button type="button" onClick={() => onSeek(videoTs)} className="font-mono text-sky-300 hover:underline">
              {formatClock(videoTs)}{finding ? `–${formatClock(finding.videoTo)}` : ''}
            </button>
          ) : <p className="text-muted-foreground/60">—</p>}
        </li>
        <li className="rounded bg-white/[0.03] px-1.5 py-1"><p className="text-muted-foreground">Voice / đo</p><p className="text-foreground">{voices.length} ghi âm · {measures.length} đo</p>{voices[0]?.transcript && <p className="text-muted-foreground truncate italic">“{voices[0].transcript}”</p>}</li>
        <li className="rounded bg-white/[0.03] px-1.5 py-1"><p className="text-muted-foreground">AFC / BIM</p><p className="text-foreground">{session.revisions.afc} · {session.revisions.bim}</p></li>
      </ol>
      {live?.comment && <p className="text-[10px] text-muted-foreground"><User className="w-3 h-3 inline" /> KS hiện trường: {live.status.toUpperCase()} · {live.comment}</p>}
      {decision && (
        <p className="text-[10px] text-sky-300">
          <ShieldCheck className="w-3 h-3 inline" /> {decision.action.toUpperCase()} → {decision.finalStatus.toUpperCase()} · {decision.by} · {formatDateTimeVn(decision.at)}{decision.comment ? ` — ${decision.comment}` : ''}
        </p>
      )}
      {!locked && (
        <div className="flex flex-wrap gap-1">
          {(['accept', 'reject', 'override', 'comment'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(mode === m ? null : m)}
              className={cn('h-8 px-2.5 rounded-lg border text-[11px] font-semibold', mode === m ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-white/10 text-muted-foreground')}
            >
              {m === 'accept' ? 'Accept' : m === 'reject' ? 'Reject' : m === 'override' ? 'Override' : 'Comment'}
            </button>
          ))}
          <button type="button" onClick={() => onAddEvidence(c, videoTs ?? 0)} className="h-8 px-2.5 rounded-lg border border-white/10 text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Evidence
          </button>
          {final === 'fail' && !hasIssue && (
            <button type="button" onClick={() => onCreateIssue(c, finding)} className="h-8 px-2.5 rounded-lg border border-red-500/50 bg-red-500/10 text-[11px] text-red-300 font-semibold inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Tạo issue
            </button>
          )}
        </div>
      )}
      {mode && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {mode === 'override' && (
            <select value={override} onChange={e => setOverride(e.target.value as CriterionStatus)} className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-foreground">
              {CRITERION_STATUS_ORDER.map(s => <option key={s} value={s}>{CRITERION_STATUS_META[s].label}</option>)}
            </select>
          )}
          <input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={mode === 'accept' ? 'Ghi chú (tuỳ chọn)' : mode === 'comment' ? 'Nhận xét' : 'Lý do (bắt buộc, ghi audit)'}
            className="flex-1 min-w-[200px] h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-foreground"
          />
          <button type="button" disabled={needsText && !text.trim()} onClick={submit} className="h-9 px-3 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-bold disabled:opacity-40">
            Xác nhận
          </button>
        </div>
      )}
    </li>
  )
})

function IssueForm({ criterion, finding, session, snapshotId, onDone }: {
  criterion: CriterionDef
  finding?: AiFinding
  session: InspectionSession
  snapshotId?: string
  onDone: () => void
}) {
  const createIssue = useInspectionFlowStore(s => s.createIssue)
  const [responsible, setResponsible] = useState<string>(RESPONSIBLE_PARTIES[0])
  const [comment, setComment] = useState(
    session.reviews[decisionKey(session, criterion.id)]?.comment || finding?.summary || session.results[criterion.id]?.comment || '',
  )
  const observed = finding?.observed ?? session.results[criterion.id]?.observed ?? '—'
  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 flex flex-col gap-2">
      <p className="text-[12px] font-bold text-red-300">Tạo issue · {criterion.code} {criterion.title}</p>
      <p className="text-[11px] text-muted-foreground">Design {criterion.design} · Observed {observed} · Video {formatClock(finding?.videoFrom ?? session.results[criterion.id]?.videoTs ?? 0)}</p>
      <select value={responsible} onChange={e => setResponsible(e.target.value)} className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-foreground">
        {RESPONSIBLE_PARTIES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Mô tả tồn tại" className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-foreground" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="h-9 px-3 rounded-lg border border-white/10 text-[11px] text-muted-foreground">Huỷ</button>
        <button
          type="button"
          disabled={!comment.trim()}
          onClick={() => {
            createIssue({
              assetId: session.assetId,
              stage: session.stage,
              component: criterion.component,
              criterionId: criterion.id,
              sessionId: session.id,
              design: criterion.design,
              observed,
              snapshotId,
              videoTs: finding?.videoFrom ?? session.results[criterion.id]?.videoTs ?? 0,
              comment: comment.trim(),
              responsible,
            })
            onDone()
          }}
          className="h-9 px-3 rounded-lg bg-red-500/15 border border-red-500/50 text-red-300 text-[11px] font-bold disabled:opacity-40"
        >
          Tạo issue
        </button>
      </div>
    </div>
  )
}

export function ReviewPage() {
  const { sessionId = '' } = useParams()
  const session = useSession(sessionId)
  const ctx = session ? resolveAsset(session.assetId) : null
  const evidence = useEvidence({ sessionId })
  const issues = useIssues(session?.assetId)
  const actor = useInspectionFlowStore(s => s.actor)
  const addEvidence = useInspectionFlowStore(s => s.addEvidence)
  const signOff = useInspectionFlowStore(s => s.signOff)
  const decide = useInspectionFlowStore(s => s.decide)
  const [seek, setSeek] = useState<{ sec: number; nonce: number } | null>(null)
  const [evidenceFor, setEvidenceFor] = useState<{ criterion: CriterionDef; videoTs: number } | null>(null)
  const [issueFor, setIssueFor] = useState<{ criterion: CriterionDef; finding?: AiFinding } | null>(null)
  const [result, setResult] = useState<SignOffResult | null>(null)
  const [note, setNote] = useState('')
  const [signature, setSignature] = useState<string | null>(null)

  const criteria = useMemo(() => (session ? criteriaForStage(session.stage) : []), [session])
  const findings = useMemo(() => session?.ai?.findings ?? [], [session])
  const markers = useMemo(() => (session ? buildMarkers(session, evidence, findings, issues) : []), [session, evidence, findings, issues])
  const onSeek = useCallback((sec: number) => setSeek({ sec, nonce: Date.now() }), [])
  const onAddEvidence = useCallback((criterion: CriterionDef, videoTs: number) => setEvidenceFor({ criterion, videoTs }), [])
  const onCreateIssue = useCallback((criterion: CriterionDef, finding?: AiFinding) => setIssueFor({ criterion, finding }), [])

  if (!session || !ctx) return <Navigate to={flowPaths.home()} replace />
  if (session.status === 'in_progress' || session.status === 'paused') return <Navigate to={flowPaths.live(session.id)} replace />
  if (session.sync !== 'synced' || session.ai?.status !== 'done') return <Navigate to={flowPaths.finish(session.id)} replace />

  const def = STAGES[session.stage]
  const locked = Boolean(session.signOff)
  const gate = signOffGate(session, criteria, issues)
  const sessionIssues = issues.filter(i => i.sessionId === session.id)
  const findingOf = (id: string) => findings.find(f => f.criterionId === id)
  const count = (group: 'quantity' | 'quality', verdict: AiFinding['verdict']) => findings.filter(f => f.group === group && f.verdict === verdict).length
  const flagCount = (group: 'quantity' | 'quality', verdict: AiFinding['verdict']) => findings.filter(f => f.group === group && f.verdict === verdict).reduce((n, f) => n + (f.count ?? 1), 0)
  const pendingCandidates = locked ? [] : findings.filter(f => f.verdict === 'pass_candidate' && !session.reviews[f.id])
  const acceptCandidates = () => {
    pendingCandidates.forEach(f => decide(session.id, { findingId: f.id, action: 'accept', finalStatus: statusFromVerdict(f.verdict), comment: 'Chấp nhận hàng loạt PASS CANDIDATE' }))
  }

  const renderGroup = (group: 'quantity' | 'quality') => {
    const list = criteria.filter(c => c.group === group).sort((a, b) => {
      const fa = findingOf(a.id)
      const fb = findingOf(b.id)
      return Number(fa?.verdict === 'pass_candidate' || !fa) - Number(fb?.verdict === 'pass_candidate' || !fb)
    })
    return (
      <ul className="flex flex-col gap-1.5">
        {list.map(c => (
          <ReviewItem
            key={c.id}
            session={session}
            criterion={c}
            finding={findingOf(c.id)}
            evidence={evidence.filter(e => e.ctx.criterionId === c.id)}
            locked={locked}
            onSeek={onSeek}
            onAddEvidence={onAddEvidence}
            onCreateIssue={onCreateIssue}
            hasIssue={sessionIssues.some(i => i.criterionId === c.id)}
          />
        ))}
      </ul>
    )
  }

  const saveEvidence = (m: MeasurementInput) => {
    if (!evidenceFor) return
    addEvidence({
      id: uid('rev'),
      type: m.type,
      label: `${m.label} (review)`,
      ctx: {
        projectId: ctx.project.id,
        structureId: ctx.structure.id,
        assetId: session.assetId,
        stage: session.stage,
        component: evidenceFor.criterion.component,
        criterionId: evidenceFor.criterion.id,
        sessionId: session.id,
        helmetId: session.helmetId,
        timestamp: new Date().toISOString(),
        videoTs: evidenceFor.videoTs,
      },
      value: m.value,
      unit: m.unit,
      note: m.note,
    })
  }

  return (
    <>
      <Header title="Inspection Review" subtitle={`${session.id} · ${ctx.asset.code} ${def.code} ${def.label}`} />
      <PageLayout scrollable>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Breadcrumbs items={[
            { label: ctx.asset.name, to: flowPaths.asset(ctx.asset.id) },
            { label: `${def.code} ${def.label}` },
            { label: session.id },
          ]} />
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Lock className="w-3 h-3" /> AFC {session.revisions.afc} · BIM {session.revisions.bim} · {session.revisions.checklist} · khoá lúc {formatDateTimeVn(session.revisions.lockedAt)}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-3">
            <p className="text-[10px] font-black tracking-wider text-muted-foreground">AI QUANTITY</p>
            <p className="text-[15px] font-bold text-foreground mt-1">
              {count('quantity', 'pass_candidate')} PASS CANDIDATE
              {flagCount('quantity', 'not_confirmed') > 0 && <span className="text-purple-300"> · {flagCount('quantity', 'not_confirmed')} thanh NOT CONFIRMED</span>}
              {count('quantity', 'review') > 0 && <span className="text-amber-300"> · {count('quantity', 'review')} REVIEW</span>}
            </p>
          </div>
          <div className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-3">
            <p className="text-[10px] font-black tracking-wider text-muted-foreground">AI QUALITY</p>
            <p className="text-[15px] font-bold text-foreground mt-1">
              {count('quality', 'pass_candidate')} PASS CANDIDATE
              {flagCount('quality', 'review') > 0 && <span className="text-amber-300"> · {flagCount('quality', 'review')} AREAS REQUIRE REVIEW</span>}
              {count('quality', 'possible_deviation') > 0 && <span className="text-red-300"> · {count('quality', 'possible_deviation')} POSSIBLE DEVIATION</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[10px] text-purple-300/80 flex items-center gap-1"><Bot className="w-3 h-3" /> AI chỉ hỗ trợ (POC — kết quả dựng sẵn, chưa chạy model). Người duyệt quyết định; mọi Override ghi audit.</p>
          {pendingCandidates.length > 0 && (
            <button type="button" onClick={acceptCandidates} className="h-9 px-3 rounded-lg bg-green-500/10 border border-green-500/40 text-green-300 text-[11px] font-bold inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Chấp nhận {pendingCandidates.length} PASS CANDIDATE
            </button>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-3 min-w-0">
            <Card title="QUANTITY · Khối lượng">{renderGroup('quantity')}</Card>
            <Card title="QUALITY · Chất lượng">{renderGroup('quality')}</Card>
          </div>
          <div className="flex flex-col gap-3 min-w-0">
            <Card title="Video H1 + marker">
              <EvidenceVideoPlayer session={session} markers={markers} seek={seek} />
            </Card>
            {issueFor && (
              <IssueForm
                criterion={issueFor.criterion}
                finding={issueFor.finding}
                session={session}
                snapshotId={evidence.find(e => e.type === 'snapshot' && e.ctx.criterionId === issueFor.criterion.id)?.id}
                onDone={() => setIssueFor(null)}
              />
            )}
            <Card title={`Issue phiên này · ${sessionIssues.length}`} icon={<AlertTriangle className="w-3.5 h-3.5 text-red-400" />}>
              {sessionIssues.length === 0 ? <p className="text-[11px] text-muted-foreground">Chưa có issue.</p> : (
                <ul className="flex flex-col gap-1">
                  {sessionIssues.map(i => (
                    <li key={i.id} className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono font-semibold text-foreground">{i.id}</span>
                      <span className="text-muted-foreground truncate flex-1">{i.criterionId} · {i.responsible}</span>
                      <TokenBadge token={ISSUE_STATUS_META[i.status]} size="small" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Final Sign-off" icon={<ShieldCheck className="w-3.5 h-3.5 text-primary" />} bodyClassName="flex flex-col gap-2">
              {session.signOff ? (
                <>
                  <TokenBadge token={SIGNOFF_META[session.signOff.result]} size="large" className="self-start" />
                  <p className="text-[11px] text-foreground">{session.signOff.inspector.name} · {formatDateTimeVn(session.signOff.at)}</p>
                  <p className="text-[10px] text-muted-foreground">{session.signOff.revision} · {session.signOff.note}</p>
                  {session.signOff.signatureDataUrl && <img src={session.signOff.signatureDataUrl} alt="Chữ ký" className="h-16 self-start" />}
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Lock className="w-3 h-3" /> Đã khoá — thay đổi phải qua revision / audit.</p>
                  <Link to={flowPaths.report(session.id)} className="self-start h-9 px-4 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[12px] font-bold inline-flex items-center gap-1">
                    <FileText className="w-4 h-4" /> Xem báo cáo
                  </Link>
                </>
              ) : (
                <>
                  <ul className="text-[11px] flex flex-col gap-0.5">
                    <li className={gate.undecided ? 'text-amber-300' : 'text-green-400'}>{gate.undecided ? `${gate.undecided} phát hiện AI chưa có quyết định` : '✓ Mọi phát hiện AI đã quyết định'}</li>
                    <li className={gate.unresolvedReview.length ? 'text-amber-300' : 'text-green-400'}>{gate.unresolvedReview.length ? `${gate.unresolvedReview.length} tiêu chí còn REVIEW` : '✓ Không còn REVIEW'}</li>
                    <li className={gate.failsWithoutIssue.length ? 'text-red-300' : 'text-green-400'}>{gate.failsWithoutIssue.length ? `${gate.failsWithoutIssue.length} FAIL chưa tạo issue` : `✓ ${gate.fails.length} FAIL đều có issue`}</li>
                    <li className={gate.uncheckedMandatory.length ? 'text-amber-300' : 'text-green-400'}>{gate.uncheckedMandatory.length ? `${gate.uncheckedMandatory.length} tiêu chí bắt buộc NOT CHECKED — chưa thể PASS (Override kèm lý do hoặc RE-INSPECTION)` : '✓ Mọi tiêu chí bắt buộc đã có kết quả'}</li>
                  </ul>
                  <div className="flex gap-1.5">
                    {(['pass', 'require_rectification', 'reinspection'] as const).map(r => (
                      <button
                        key={r}
                        type="button"
                        disabled={!gate.allowed.includes(r)}
                        onClick={() => setResult(r)}
                        className={cn('flex-1 h-10 rounded-lg border text-[10px] font-black tracking-wider disabled:opacity-30', result === r ? SIGNOFF_META[r].className : 'border-white/10 text-muted-foreground')}
                      >
                        {SIGNOFF_META[r].label}
                      </button>
                    ))}
                  </div>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú nghiệm thu" className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-foreground" />
                  <p className="text-[10px] text-muted-foreground">Người ký: {actor.name} · {session.revisions.afc} · {session.revisions.checklist}</p>
                  <SignaturePad onChange={setSignature} />
                  <button
                    type="button"
                    disabled={!gate.canSign || !result || !gate.allowed.includes(result) || !signature}
                    onClick={() => result && signature && signOff(session.id, {
                      result,
                      signatureDataUrl: signature,
                      revision: `AFC ${session.revisions.afc} · BIM ${session.revisions.bim} · ${session.revisions.checklist}`,
                      note: note.trim(),
                    })}
                    className="h-11 rounded-xl bg-green-500/15 border border-green-500/50 text-green-300 text-[13px] font-black tracking-wider disabled:opacity-40 inline-flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" /> KÝ NGHIỆM THU
                  </button>
                </>
              )}
            </Card>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Comment / quyết định xem ở tab HISTORY của Passport.</p>
          </div>
        </div>
      </PageLayout>
      <MeasurementSheet
        open={Boolean(evidenceFor)}
        criterion={evidenceFor?.criterion}
        onOpenChange={o => { if (!o) setEvidenceFor(null) }}
        onSave={saveEvidence}
      />
    </>
  )
}
