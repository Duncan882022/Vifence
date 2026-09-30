import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronLeft, CloudUpload, Loader2, Lock, RefreshCw } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { criteriaForStage, findCriterion } from '../../data/workflow/criteria'
import { COMPONENTS, STAGES } from '../../data/workflow/hnqnProject'
import { SYNC_META } from '../../data/workflow/meta'
import { useEvidence, useSession } from '../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../store/inspectionFlow.store'
import { runMockAiAnalysis } from '../../services/workflow/aiAnalysis'
import { putBlob } from '../../services/workflow/evidenceBlobs'
import { flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { formatClock } from '../../services/workflow/ids'
import { sessionElapsedSec } from '../../services/workflow/sessionLogic'
import { stopSessionCapture } from '../../services/workflow/sessionRecorder'
import { findMediaMtxRecording } from '../../services/workflow/sessionVideo'
import { validateBeforeFinish, VALIDATION_LABEL } from '../../services/workflow/validation'
import type { SessionVideo } from '../../workflow.types'
import { Breadcrumbs, Card, TokenBadge } from '../../components/flow/FlowUi'

const SYNC_STEP_MS = 350

function componentLabel(criterionId: string): string {
  const c = findCriterion(criterionId)
  return c ? COMPONENTS[c.component].label : ''
}

export function FinishPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const session = useSession(sessionId)
  const ctx = session ? resolveAsset(session.assetId) : null
  const evidence = useEvidence({ sessionId })
  const actor = useInspectionFlowStore(s => s.actor)
  const finishSession = useInspectionFlowStore(s => s.finishSession)
  const setSync = useInspectionFlowStore(s => s.setSync)
  const setVideo = useInspectionFlowStore(s => s.setVideo)
  const setAi = useInspectionFlowStore(s => s.setAi)
  const [reason, setReason] = useState('')
  const [aiRunning, setAiRunning] = useState(false)
  const syncing = useRef(false)
  const aiStarted = useRef(false)

  const criteria = useMemo(() => (session ? criteriaForStage(session.stage) : []), [session])
  const validation = useMemo(
    () => (session ? validateBeforeFinish(session, criteria, evidence) : null),
    [session, criteria, evidence],
  )

  const runAi = useCallback(async (id: string) => {
    if (aiStarted.current) return
    aiStarted.current = true
    setAiRunning(true)
    setAi(id, null)
    await new Promise(r => window.setTimeout(r, 1800))
    const latest = useInspectionFlowStore.getState()
    const cur = latest.sessions[id]
    if (cur) setAi(id, runMockAiAnalysis(cur, criteriaForStage(cur.stage), Object.values(latest.evidence)))
    setAiRunning(false)
    navigate(flowPaths.review(id))
  }, [navigate, setAi])

  const runSync = useCallback(async (id: string) => {
    const s = useInspectionFlowStore.getState().sessions[id]
    if (!s || syncing.current) return
    syncing.current = true
    setSync(id, 'syncing', 5)
    let video: SessionVideo = s.video ?? { source: 'none', durationSec: sessionElapsedSec(s) }
    const captured = await stopSessionCapture(id)
    if (captured) {
      const key = `video-${id}`
      await putBlob(key, captured.blob)
      video = { source: 'cms-capture', blobKey: key, mime: captured.mime, durationSec: sessionElapsedSec(s), sizeBytes: captured.blob.size }
    }
    if (s.finishedAt) {
      const original = await findMediaMtxRecording(s.helmetId, s.startedAt, s.finishedAt)
      if (original) video = { ...original, blobKey: video.blobKey, mime: video.mime }
    }
    setVideo(id, video)
    for (let p = 15; p <= 100; p += 17) {
      if (!navigator.onLine) {
        setSync(id, 'failed', p)
        syncing.current = false
        return
      }
      setSync(id, 'syncing', Math.min(p, 99))
      await new Promise(r => window.setTimeout(r, SYNC_STEP_MS))
    }
    setSync(id, 'synced', 100)
    syncing.current = false
  }, [setSync, setVideo])

  useEffect(() => {
    if (!session || session.status !== 'closed') return
    if (session.sync === 'pending' || (session.sync === 'syncing' && !syncing.current)) void runSync(session.id)
    else if (session.sync === 'synced' && session.ai?.status !== 'done') void runAi(session.id)
  }, [session, runSync, runAi])

  if (!session || !ctx || !validation) return <Navigate to={flowPaths.home()} replace />
  const def = STAGES[session.stage]
  const open = session.status === 'in_progress' || session.status === 'paused'
  const senior = actor.role === 'senior_inspector'
  const problemsByKind = validation.problems.reduce<Record<string, typeof validation.problems>>((acc, p) => {
    ;(acc[p.kind] ??= []).push(p)
    return acc
  }, {})

  const finish = () => {
    if (!validation.ok && (!senior || !reason.trim())) return
    finishSession(session.id, validation.ok ? undefined : { reason: reason.trim(), openItems: validation.problems.length })
  }

  const saved = [
    `Checklist ${validation.completed}/${validation.total} tiêu chí`,
    `${evidence.filter(e => e.type === 'snapshot').length} snapshot`,
    `${evidence.filter(e => e.type === 'voice').length} ghi âm`,
    `${evidence.filter(e => e.type === 'measurement' || e.type === 'test' || e.type === 'document').length} đo đạc / thí nghiệm`,
    `Video timestamp mapping · ${formatClock(sessionElapsedSec(session))}`,
    `AFC ${session.revisions.afc} · BIM ${session.revisions.bim} · ${session.revisions.checklist}`,
  ]

  return (
    <>
      <Header title={open ? 'Pre-Finish Validation' : 'Đồng bộ & phân tích'} subtitle={`${session.id} · ${ctx.asset.code} ${def.code}`} />
      <PageLayout scrollable>
        <Breadcrumbs items={[
          { label: ctx.asset.name, to: flowPaths.asset(ctx.asset.id) },
          { label: `${def.code} ${def.label}` },
          { label: session.id },
        ]} />
        {open ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card title="Pre-Finish Validation" bodyClassName="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <p className={cn('text-3xl font-black', validation.ok ? 'text-green-400' : 'text-amber-300')}>
                  {validation.completed}/{validation.total}
                </p>
                <p className="text-[12px] text-muted-foreground">tiêu chí hoàn thành{validation.ok ? ' · đủ điều kiện kết thúc' : ` · ${validation.problems.length} vấn đề`}</p>
              </div>
              {Object.entries(problemsByKind).map(([kind, list]) => (
                <div key={kind}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {VALIDATION_LABEL[kind as keyof typeof VALIDATION_LABEL]} · {list.length}
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {list.map(p => (
                      <li key={`${p.kind}-${p.criterionId}`} className="text-[11px] text-foreground/90">
                        {p.message} <span className="text-muted-foreground">· {componentLabel(p.criterionId)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {validation.ok && <p className="text-[12px] text-green-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Không còn mục thiếu.</p>}
            </Card>
            <Card title="Kết thúc phiên" bodyClassName="flex flex-col gap-3">
              <button type="button" onClick={() => navigate(flowPaths.live(session.id))} className="h-11 rounded-xl border border-white/10 text-[12px] font-semibold text-foreground inline-flex items-center justify-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Quay lại kiểm tra tiếp
              </button>
              {!validation.ok && (
                senior ? (
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={3}
                    placeholder="Lý do kết thúc khi còn mục chưa hoàn thành (bắt buộc, ghi audit)"
                    className="rounded-lg bg-white/5 border border-white/10 p-2 text-[12px] text-foreground"
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Chỉ Trưởng TVGS được kết thúc khi còn mục thiếu (đổi vai trò ở Passport).
                  </p>
                )
              )}
              <button
                type="button"
                disabled={!validation.ok && (!senior || !reason.trim())}
                onClick={finish}
                className="h-12 rounded-xl bg-red-500/15 border border-red-500/50 text-red-300 text-[13px] font-black tracking-wider disabled:opacity-40"
              >
                FINISH INSPECTION{!validation.ok ? ' (có lý do)' : ''}
              </button>
              <ul className="text-[10px] text-muted-foreground flex flex-col gap-0.5">
                <li className="font-semibold text-foreground/80">Khi kết thúc sẽ lưu:</li>
                {saved.map(s => <li key={s}>· {s}</li>)}
              </ul>
            </Card>
          </div>
        ) : (
          <Card title="Đồng bộ bằng chứng" icon={<CloudUpload className="w-3.5 h-3.5 text-primary" />} bodyClassName="flex flex-col items-center gap-4 py-8">
            <TokenBadge token={SYNC_META[session.sync]} size="large" pulse={session.sync === 'syncing'} />
            <div className="w-full max-w-md h-2 rounded bg-white/5 overflow-hidden">
              <div className={cn('h-full transition-all', session.sync === 'failed' ? 'bg-red-400' : 'bg-sky-400')} style={{ width: `${session.syncProgress}%` }} />
            </div>
            <ul className="text-[11px] text-muted-foreground text-center">
              {saved.map(s => <li key={s}>{s}</li>)}
              <li>
                Video: {session.video?.source === 'mediamtx' ? 'bản ghi gốc MediaMTX' : session.video?.source === 'cms-capture' ? `bản sao CMS (${((session.video.sizeBytes ?? 0) / 1e6).toFixed(1)} MB)` : 'bản gốc trên H1'}
              </li>
            </ul>
            {session.sync === 'failed' && (
              <button type="button" onClick={() => void runSync(session.id)} className="h-10 px-4 rounded-lg border border-white/10 text-[12px] text-foreground inline-flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại tải lên
              </button>
            )}
            {(aiRunning || session.ai?.status === 'running') && (
              <p className="text-[12px] text-purple-300 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> AI đang phân tích video (Quantity / Quality)...</p>
            )}
            {session.sync === 'synced' && session.ai?.status === 'done' && (
              <button type="button" onClick={() => navigate(flowPaths.review(session.id))} className="h-11 px-6 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[13px] font-bold">
                Mở Inspection Review
              </button>
            )}
          </Card>
        )}
      </PageLayout>
    </>
  )
}
