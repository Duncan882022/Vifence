import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Camera, CheckCircle2, FileText, Mic, ShieldCheck, User } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { criteriaForStage } from '../../data/workflow/criteria'
import { COMPONENTS, RESPONSIBLE_PARTIES, STAGES } from '../../data/workflow/hnqnProject'
import { SIGNOFF_META } from '../../data/workflow/meta'
import { useEvidence, useIssues, useSession } from '../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../store/inspectionFlow.store'
import { putBlob } from '../../services/workflow/evidenceBlobs'
import { flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { formatClock } from '../../services/workflow/ids'
import { sessionElapsedSec } from '../../services/workflow/sessionLogic'
import { stopSessionCapture } from '../../services/workflow/sessionRecorder'
import { signOffGate } from '../../services/workflow/reviewLogic'
import type { SignOffResult } from '../../workflow.types'
import { SignaturePad } from '../../components/flow/SignaturePad'
import { formatDateTimeVn, TokenBadge } from '../../components/flow/FlowUi'

export function SignPage() {
  const { sessionId = '' } = useParams()
  const session = useSession(sessionId)
  const ctx = session ? resolveAsset(session.assetId) : null
  const evidence = useEvidence({ sessionId })
  const issues = useIssues(session?.assetId)
  const actor = useInspectionFlowStore(s => s.actor)
  const setActor = useInspectionFlowStore(s => s.setActor)
  const finishSession = useInspectionFlowStore(s => s.finishSession)
  const setSync = useInspectionFlowStore(s => s.setSync)
  const setVideo = useInspectionFlowStore(s => s.setVideo)
  const createIssue = useInspectionFlowStore(s => s.createIssue)
  const signOff = useInspectionFlowStore(s => s.signOff)
  const [result, setResult] = useState<SignOffResult | null>(null)
  const [note, setNote] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [due, setDue] = useState('')
  const [party, setParty] = useState<string>(RESPONSIBLE_PARTIES[0])
  const closing = useRef(false)

  const criteria = useMemo(() => (session ? criteriaForStage(session.stage) : []), [session])
  const fails = useMemo(
    () => criteria.filter(c => (session?.results[c.id]?.status ?? 'not_checked') === 'fail' && !session?.results[c.id]?.carriedFrom),
    [criteria, session],
  )
  const passed = useMemo(
    () => criteria.filter(c => {
      const st = session?.results[c.id]?.status ?? 'not_checked'
      return st === 'pass' || st === 'na' || Boolean(session?.results[c.id]?.carriedFrom)
    }).length,
    [criteria, session],
  )

  useEffect(() => {
    if (!session || closing.current) return
    if (session.status === 'in_progress' || session.status === 'paused') {
      closing.current = true
      finishSession(session.id)
    }
  }, [finishSession, session])

  useEffect(() => {
    if (!session || session.sync === 'synced' || session.signOff) return
    let cancelled = false
    void (async () => {
      setSync(session.id, 'syncing', 20)
      const captured = await stopSessionCapture(session.id)
      if (cancelled) return
      if (captured) {
        const key = `video-${session.id}`
        await putBlob(key, captured.blob)
        setVideo(session.id, {
          source: 'cms-capture',
          blobKey: key,
          mime: captured.mime,
          durationSec: sessionElapsedSec(session),
          sizeBytes: captured.blob.size,
        })
      }
      setSync(session.id, 'synced', 100)
    })()
    return () => { cancelled = true }
  }, [session, setSync, setVideo])

  const sessionIssues = useMemo(
    () => issues.filter(i => i.sessionId === sessionId),
    [issues, sessionId],
  )

  if (!session || !ctx) return <Navigate to={flowPaths.home()} replace />
  const def = STAGES[session.stage]
  const gate = signOffGate({ ...session, ai: session.ai ?? { status: 'done', findings: [] } }, criteria, sessionIssues, actor)

  const ensureIssues = () => {
    for (const c of fails) {
      if (sessionIssues.some(i => i.criterionId === c.id)) continue
      const ev = evidence.find(e => e.ctx.criterionId === c.id)
      createIssue({
        assetId: session.assetId,
        stage: session.stage,
        component: c.component,
        criterionId: c.id,
        sessionId: session.id,
        design: c.design,
        observed: session.results[c.id]?.observed ?? '',
        snapshotId: ev?.type === 'snapshot' ? ev.id : undefined,
        videoTs: session.results[c.id]?.videoTs ?? ev?.ctx.videoTs ?? 0,
        comment: session.results[c.id]?.comment ?? '',
        responsible: party,
      })
    }
  }

  const submit = () => {
    if (!result || !signature) return
    ensureIssues()
    signOff(session.id, {
      result,
      signatureDataUrl: signature,
      revision: `${session.revisions.afc} · ${session.revisions.checklist}`,
      note: [note.trim(), due ? `Hạn ${due}` : ''].filter(Boolean).join(' · '),
    })
  }

  return (
    <>
      <Header title={`Ký nghiệm thu · ${def.label}`} subtitle={`${ctx.asset.name}`} />
      <PageLayout scrollable className="gap-3 max-w-3xl">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link to={flowPaths.asset(ctx.asset.id)} className="text-[12px] text-muted-foreground hover:text-foreground">
            ← {ctx.asset.name}
          </Link>
          <p className="text-[10px] text-muted-foreground">
            Đạt {passed} / Không đạt {fails.length}
          </p>
        </div>

        {fails.length === 0 ? (
          <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-[12px] text-green-300">
            Không có tiêu chí không đạt.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fails.map(c => {
              const r = session.results[c.id]
              const ev = evidence.filter(e => e.ctx.criterionId === c.id)
              return (
                <li key={c.id} className="rounded-lg border border-red-500/30 bg-red-500/[0.05] p-3">
                  <p className="text-[13px] font-semibold text-foreground">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {COMPONENTS[c.component].label}
                    {r?.observed ? ` · thực tế ${r.observed}` : ''}
                    {c.design ? ` / TK ${c.design}` : ''}
                  </p>
                  {r?.comment && <p className="text-[12px] text-foreground mt-1">“{r.comment}”</p>}
                  <p className="mt-1 text-[10px] text-muted-foreground inline-flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5"><Camera className="w-3 h-3" />{ev.filter(e => e.type === 'snapshot').length}</span>
                    <span className="inline-flex items-center gap-0.5"><Mic className="w-3 h-3" />{ev.filter(e => e.type === 'voice').length}</span>
                    {r?.videoTs != null && <span>▶ {formatClock(r.videoTs)}</span>}
                  </p>
                </li>
              )
            })}
          </ul>
        )}

        {session.signOff ? (
          <section className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-4 flex flex-col gap-2">
            <TokenBadge token={SIGNOFF_META[session.signOff.result]} size="large" className="self-start" />
            <p className="text-[12px] text-foreground">{session.signOff.inspector.name} · {formatDateTimeVn(session.signOff.at)}</p>
            {session.signOff.note && <p className="text-[11px] text-muted-foreground">{session.signOff.note}</p>}
            {session.signOff.signatureDataUrl && <img src={session.signOff.signatureDataUrl} alt="Chữ ký" className="h-16 self-start" />}
            <Link
              to={flowPaths.report(session.id)}
              className="self-start h-9 px-4 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[12px] font-bold inline-flex items-center gap-1"
            >
              <FileText className="w-4 h-4" /> Xuất biên bản
            </Link>
          </section>
        ) : (
          <section className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-4 flex flex-col gap-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-foreground inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Kết luận
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {(['pass', 'require_rectification', 'reinspection'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  disabled={!gate.allowed.includes(r)}
                  onClick={() => setResult(r)}
                  className={cn(
                    'h-11 rounded-lg border text-[12px] font-bold disabled:opacity-30',
                    result === r ? SIGNOFF_META[r].className : 'border-white/10 text-muted-foreground',
                  )}
                >
                  {SIGNOFF_META[r].label}
                </button>
              ))}
            </div>
            {fails.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <select
                  value={party}
                  onChange={e => setParty(e.target.value)}
                  className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[12px] text-foreground"
                >
                  {RESPONSIBLE_PARTIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  type="date"
                  value={due}
                  onChange={e => setDue(e.target.value)}
                  className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[12px] text-foreground"
                />
              </div>
            )}
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ghi chú"
              className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[12px] text-foreground"
            />
            {gate.signerBlock && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 flex flex-col gap-2">
                <p className="text-[11px] text-amber-300">{gate.signerBlock}</p>
                {actor.role !== 'senior_inspector' && (
                  <button
                    type="button"
                    onClick={() => setActor('senior_inspector')}
                    className="self-start h-9 px-3 rounded-lg border border-white/10 text-[11px] text-foreground inline-flex items-center gap-1"
                  >
                    <User className="w-3.5 h-3.5" /> Chuyển Trưởng TVGS
                  </button>
                )}
              </div>
            )}
            <SignaturePad onChange={setSignature} />
            <button
              type="button"
              disabled={!result || !signature || Boolean(gate.signerBlock) || !gate.allowed.includes(result)}
              onClick={submit}
              className="h-11 rounded-xl bg-green-500/15 border border-green-500/50 text-green-300 text-[13px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <CheckCircle2 className="w-4 h-4" /> Ký & xuất biên bản
            </button>
          </section>
        )}
        <p className="text-[10px] text-muted-foreground">
          {ctx.asset.afc.code} {session.revisions.afc} · {session.revisions.checklist}
        </p>
      </PageLayout>
    </>
  )
}