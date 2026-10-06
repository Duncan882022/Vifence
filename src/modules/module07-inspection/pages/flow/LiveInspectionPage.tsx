import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, BookOpen, Camera, CheckCircle2, CircleStop, ClipboardList, HardHat, Mic, Pause, Play, Radio, Ruler, Wifi, WifiOff } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { criteriaForStage } from '../../data/workflow/criteria'
import { COMPONENTS, STAGES } from '../../data/workflow/hnqnProject'
import { CAMERA_STATE_META } from '../../data/workflow/meta'
import { useEvidence, useNowTick, useSession } from '../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../store/inspectionFlow.store'
import { putBlob } from '../../services/workflow/evidenceBlobs'
import { flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { formatClock, uid } from '../../services/workflow/ids'
import { cameraDisplayState, isPaused, sessionElapsedSec } from '../../services/workflow/sessionLogic'
import {
  captureFrame,
  hasSessionCapture,
  isSessionCaptureSupported,
  pauseSessionCapture,
  resumeSessionCapture,
  startSessionCapture,
} from '../../services/workflow/sessionRecorder'
import { isSpeechToTextSupported, startVoiceComment, type VoiceSession } from '../../services/workflow/voiceRecorder'
import { evaluateMeasurement } from '../../services/workflow/measurementEval'
import { validateBeforeFinish } from '../../services/workflow/validation'
import { briefAck } from '../../data/workflow/requirements'
import type { ComponentId, CriterionResult, CriterionStatus, Evidence, EvidenceContext, InspectionBrief, LiveAxis, RecordAxis } from '../../workflow.types'
import { CriterionRow } from '../../components/flow/CriterionRow'
import { InspectionBriefDialog } from '../../components/flow/InspectionBriefDialog'
import { EvidenceMedia } from '../../components/flow/EvidenceMedia'
import { TokenBadge } from '../../components/flow/FlowUi'
import { H1LiveFeed } from '../../components/flow/H1LiveFeed'
import { MeasurementSheet, type MeasurementInput } from '../../components/flow/MeasurementSheet'

const BimComponentSheet = lazy(() => import('../../components/flow/BimComponentSheet'))

export function LiveInspectionPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const session = useSession(sessionId)
  const ctx = session ? resolveAsset(session.assetId) : null
  const evidence = useEvidence({ sessionId })
  const setCriterion = useInspectionFlowStore(s => s.setCriterion)
  const addEvidence = useInspectionFlowStore(s => s.addEvidence)
  const pauseSession = useInspectionFlowStore(s => s.pauseSession)
  const resumeSession = useInspectionFlowStore(s => s.resumeSession)

  const def = session ? STAGES[session.stage] : null
  const criteria = useMemo(() => (session ? criteriaForStage(session.stage) : []), [session])
  const ackBrief = useInspectionFlowStore(s => s.ackBrief)
  const actorName = useInspectionFlowStore(s => s.actor.name)
  const [component, setComponent] = useState<ComponentId>(() => session?.focusComponent ?? def?.components[0] ?? 'bottom')
  const [briefOpen, setBriefOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [live, setLive] = useState<LiveAxis>('connecting')
  const [forceLost, setForceLost] = useState(false)
  const [bimOpen, setBimOpen] = useState(false)
  const [measureOpen, setMeasureOpen] = useState(false)
  const [voice, setVoice] = useState<{ rec: VoiceSession; startedAt: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [capture, setCapture] = useState<'on' | 'unsupported' | 'idle'>('idle')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const running = session?.status === 'in_progress' || session?.status === 'paused'
  const now = useNowTick(Boolean(running))
  const paused = session ? isPaused(session) : false
  const elapsed = session ? sessionElapsedSec(session, now) : 0
  const elapsedRef = useRef(elapsed)
  elapsedRef.current = elapsed

  const onVideoElement = useCallback((v: HTMLVideoElement | null) => {
    videoRef.current = v
  }, [])

  useEffect(() => {
    if (!session || session.status !== 'in_progress' || hasSessionCapture(session.id)) return
    if (!isSessionCaptureSupported()) {
      setCapture('unsupported')
      return
    }
    const ok = startSessionCapture(session.id, () => videoRef.current, () => `${session.id} · ${session.helmetId} · ${formatClock(elapsedRef.current)}`)
    setCapture(ok ? 'on' : 'unsupported')
  }, [session])

  useEffect(() => {
    if (!session) return
    if (paused) pauseSessionCapture(session.id)
    else resumeSessionCapture(session.id)
  }, [session, paused])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [toast])

  const componentCriteria = useMemo(() => criteria.filter(c => c.component === component), [criteria, component])
  const validation = useMemo(() => (session ? validateBeforeFinish(session, criteria, evidence) : null), [session, criteria, evidence])
  const openByComponent = useMemo(() => {
    const out: Partial<Record<ComponentId, number>> = {}
    for (const p of validation?.problems ?? []) {
      const c = criteria.find(x => x.id === p.criterionId)
      if (c) out[c.component] = (out[c.component] ?? 0) + 1
    }
    return out
  }, [validation, criteria])
  const active = criteria.find(c => c.id === activeId) ?? componentCriteria.find(c => !session?.results[c.id]?.carriedFrom) ?? componentCriteria[0]

  const makeCtx = useCallback((criterionId?: string): EvidenceContext | null => {
    if (!session || !ctx) return null
    const crit = criteria.find(c => c.id === criterionId)
    return {
      projectId: ctx.project.id,
      structureId: ctx.structure.id,
      assetId: session.assetId,
      stage: session.stage,
      component: crit?.component ?? component,
      criterionId,
      sessionId: session.id,
      helmetId: session.helmetId,
      timestamp: new Date().toISOString(),
      videoTs: Math.round(elapsedRef.current),
    }
  }, [session, ctx, criteria, component])

  const onStatus = useCallback((id: string, status: CriterionStatus) => {
    if (!session) return
    const r = session.results[id]
    const same = r?.status === status
    setCriterion(session.id, id, {
      status,
      videoTs: Math.round(elapsedRef.current),
      autoVerdict: same ? r?.autoVerdict : undefined,
      carriedFrom: same ? r?.carriedFrom : undefined,
    })
  }, [session, setCriterion])

  const onMeasure = useCallback((id: string) => {
    setActiveId(id)
    setMeasureOpen(true)
  }, [])

  const onText = useCallback((id: string, patch: Pick<CriterionResult, 'observed' | 'comment'>) => {
    if (session) setCriterion(session.id, id, patch)
  }, [session, setCriterion])

  const selectComponent = useCallback((cid: ComponentId) => {
    setComponent(cid)
    setActiveId(null)
    if (session && !session.briefs?.some(b => b.component === cid)) setBriefOpen(true)
  }, [session])

  const onBriefDone = useCallback((brief: InspectionBrief) => {
    if (session) ackBrief(session.id, briefAck(brief, actorName))
    setBriefOpen(false)
  }, [session, ackBrief, actorName])

  if (!session || !ctx || !def) return <Navigate to={flowPaths.home()} replace />
  if (!running) return <Navigate to={session.sync === 'synced' ? flowPaths.review(session.id) : flowPaths.finish(session.id)} replace />

  const record: RecordAxis = paused ? 'off' : live === 'lost' ? 'local' : 'recording'
  const camState = cameraDisplayState(live, record)
  const camMeta = CAMERA_STATE_META[camState]
  const done = criteria.filter(c => (session.results[c.id]?.status ?? 'not_checked') !== 'not_checked').length

  const snapshot = async () => {
    const c = makeCtx(active?.id)
    if (!c) return
    const blob = await captureFrame(videoRef.current)
    if (!blob) {
      setToast('Chưa có khung hình từ H1 để chụp')
      return
    }
    const id = uid('snap')
    await putBlob(id, blob)
    const e: Evidence = { id, type: 'snapshot', label: `Snapshot · ${active?.code ?? COMPONENTS[component].label}`, ctx: c, blobKey: id, mime: blob.type }
    addEvidence(e)
    setFlash(true)
    window.setTimeout(() => setFlash(false), 180)
    setToast(`Đã lưu snapshot · ${formatClock(c.videoTs)}`)
  }

  const toggleVoice = async () => {
    if (voice) {
      const c = makeCtx(active?.id)
      const clip = await voice.rec.stop()
      setVoice(null)
      if (!clip || !c) return
      const id = uid('voice')
      await putBlob(id, clip.blob)
      addEvidence({
        id,
        type: 'voice',
        label: `Ghi âm · ${active?.code ?? ''}`,
        ctx: { ...c, videoTs: Math.max(0, c.videoTs - Math.round(clip.durationSec)) },
        blobKey: id,
        mime: clip.mime,
        durationSec: clip.durationSec,
        transcript: clip.transcript,
        videoTo: c.videoTs,
      })
      setToast(`Đã lưu ghi âm ${clip.durationSec.toFixed(0)}s${clip.transcript ? ' + chuyển văn bản' : ''}`)
      return
    }
    try {
      const rec = await startVoiceComment(isSpeechToTextSupported())
      setVoice({ rec, startedAt: Date.now() })
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Không mở được micro')
    }
  }

  const saveMeasurement = (m: MeasurementInput) => {
    const c = makeCtx(active?.id)
    if (!c || !active) return
    addEvidence({ id: uid('meas'), type: m.type, label: m.label, ctx: c, value: m.value, unit: m.unit, note: m.note })
    const observed = `${m.value}${m.unit ? ` ${m.unit}` : ''}`
    const verdict = m.type === 'document' ? null : evaluateMeasurement(active, m.value, m.unit)
    const current = session.results[active.id]
    if (verdict) {
      setCriterion(session.id, active.id, {
        status: verdict.status,
        observed,
        autoVerdict: verdict.summary,
        comment: verdict.status === 'fail' && !current?.comment?.trim() ? verdict.summary : current?.comment,
        videoTs: c.videoTs,
      })
      setToast(verdict.status === 'pass' ? `Tự chấm PASS · ${verdict.summary}` : `Tự chấm FAIL · ${verdict.summary}`)
      return
    }
    if (!current?.observed) setCriterion(session.id, active.id, { observed })
    setToast('Đã lưu kết quả đo / thí nghiệm — chấm PASS/FAIL thủ công')
  }

  const recent = evidence.filter(e => e.ctx.criterionId === active?.id).slice(-4)
  const carried = componentCriteria.filter(c => session.results[c.id]?.carriedFrom)
  const remaining = validation?.problems.length ?? 0
  const actionBtn = 'h-11 sm:h-12 min-w-0 rounded-xl border flex items-center justify-center gap-1 sm:gap-1.5 text-[10px] sm:text-[12px] font-bold px-1 sm:px-2'

  return (
    <>
      <Header
        title={`${ctx.asset.name} · ${def.code} ${def.label}`}
        subtitle={session.id}
        headerRight={(
          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] max-w-[52vw] sm:max-w-none justify-end">
            <span className="font-mono text-foreground text-[12px] sm:text-[13px] font-bold shrink-0">{formatClock(elapsed)}</span>
            {live === 'live' ? <Wifi className="w-4 h-4 text-green-400 shrink-0" /> : <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />}
            <div className="hidden sm:flex items-center gap-1.5 min-w-0">
              <TokenBadge token={camMeta} pulse={camMeta.pulse} size="large" />
              {paused && <TokenBadge token={{ label: 'PAUSED', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40' }} size="large" />}
            </div>
            <span className="hidden lg:inline-flex items-center gap-1 text-muted-foreground truncate"><HardHat className="w-3.5 h-3.5 shrink-0" />{session.helmetId}{session.simulatedH1 ? ' (mô phỏng)' : ''}</span>
          </div>
        )}
      />
      <PageLayout className="gap-2 p-2 max-lg:min-h-[calc(100dvh-64px)] max-lg:h-auto max-lg:overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2 lg:flex-1 lg:min-h-0">
          <section className="flex flex-col gap-2 min-h-0 min-w-0">
            <div className="relative w-full min-h-[200px] sm:min-h-[240px] lg:flex-1 lg:min-h-[220px] aspect-video lg:aspect-auto rounded-lg overflow-hidden border border-[#1e2433] bg-black">
              <H1LiveFeed
                helmetId={session.helmetId}
                simulated={session.simulatedH1}
                forceLost={forceLost}
                overlayText={`${session.id} · ${formatClock(elapsed)}`}
                onVideoElement={onVideoElement}
                onLiveAxis={setLive}
              />
              {flash && <div className="absolute inset-0 bg-white/70 pointer-events-none" />}
              <div className="absolute top-2 left-2 right-2 flex flex-wrap items-center gap-1 max-w-full">
                <span className="bg-black/60 rounded px-2 py-1 text-[9px] sm:text-[10px] text-white inline-flex items-center gap-1 max-w-full truncate">
                  <Radio className="w-3 h-3 text-red-400 shrink-0" /> {ctx.asset.code} · {def.code} · {COMPONENTS[component].label}
                </span>
                {active && <span className="hidden sm:inline bg-black/60 rounded px-2 py-1 text-[10px] text-white truncate max-w-[min(100%,280px)]">{active.code} {active.title}</span>}
              </div>
              {live === 'lost' && (
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-6 rounded-xl border border-amber-500/50 bg-black/80 p-4 text-center">
                  <p className="text-[12px] sm:text-[15px] font-black tracking-wider text-amber-300 flex items-center justify-center gap-2 text-center">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span className="sm:hidden">MẤT LIVE · H1 VẪN GHI CỤC BỘ</span>
                    <span className="hidden sm:inline">LIVE VIEW LOST — H1 IS STILL RECORDING LOCALLY</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">Bằng chứng video sẽ đồng bộ khi có mạng trở lại. Checklist vẫn tiếp tục được.</p>
                </div>
              )}
              {voice && (
                <div className="absolute top-2 right-2 bg-red-600/80 rounded px-2 py-1 text-[11px] font-bold text-white inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Đang ghi âm · {Math.round((now - voice.startedAt) / 1000)}s
                </div>
              )}
              {toast && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 rounded-lg px-3 py-1.5 text-[11px] text-white">{toast}</div>}
              <div className="absolute bottom-2 right-2 flex gap-1">
                {capture === 'unsupported' && <span className="bg-black/60 rounded px-2 py-0.5 text-[9px] text-amber-300">Trình duyệt không ghi bản sao video</span>}
                <button type="button" onClick={() => setForceLost(v => !v)} className="bg-black/60 rounded px-2 py-0.5 text-[9px] text-fuchsia-300 border border-dashed border-fuchsia-500/40">
                  POC: {forceLost ? 'Khôi phục mạng' : 'Giả lập mất live'}
                </button>
              </div>
            </div>
            {recent.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto shrink-0">
                {recent.map(e => (
                  <div key={e.id} className="w-28 shrink-0 rounded border border-white/10 p-1">
                    <EvidenceMedia evidence={e} compact className="w-full h-14" />
                    <p className="text-[8px] text-muted-foreground font-mono mt-0.5">{formatClock(e.ctx.videoTs)}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1.5 shrink-0">
              <button type="button" disabled={paused} onClick={() => void snapshot()} className={cn(actionBtn, 'border-sky-500/40 bg-sky-500/10 text-sky-300 disabled:opacity-40')}>
                <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> SNAPSHOT
              </button>
              <button type="button" disabled={paused} onClick={() => void toggleVoice()} className={cn(actionBtn, voice ? 'border-red-500/60 bg-red-500/20 text-red-300' : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300', 'disabled:opacity-40')}>
                <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> <span className="truncate">{voice ? 'DỪNG GHI' : 'GHI ÂM'}</span>
              </button>
              <button type="button" onClick={() => setMeasureOpen(true)} className={cn(actionBtn, 'border-white/10 text-foreground')}>
                <Ruler className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> ĐO / TN
              </button>
              <button type="button" onClick={() => setBimOpen(true)} className={cn(actionBtn, 'border-white/10 text-foreground')}>
                <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> BIM
              </button>
              <button
                type="button"
                onClick={() => (paused ? resumeSession(session.id) : pauseSession(session.id))}
                className={cn(actionBtn, 'border-amber-500/40 text-amber-300')}
              >
                {paused ? <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> : <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />} {paused ? 'RESUME' : 'PAUSE'}
              </button>
              <button type="button" onClick={() => navigate(flowPaths.finish(session.id))} className={cn(actionBtn, 'col-span-2 sm:col-span-1 border-red-500/50 bg-red-500/10 text-red-300')}>
                <CircleStop className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> FINISH
                {remaining > 0 ? <span className="text-[9px] font-semibold text-amber-300">· còn {remaining}</span> : <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
              </button>
            </div>
          </section>

          <section className="flex flex-col min-h-[min(52vh,520px)] lg:min-h-0 min-w-0 rounded-lg border border-[#1e2433] bg-[#0b0f1a]">
            <div className="flex gap-1 p-2 border-b border-[#1e2433] overflow-x-auto shrink-0">
              {def.components.map(cid => {
                const list = criteria.filter(c => c.component === cid)
                const n = list.filter(c => (session.results[c.id]?.status ?? 'not_checked') !== 'not_checked').length
                const open = openByComponent[cid] ?? 0
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => selectComponent(cid)}
                    className={cn(
                      'relative h-10 px-3 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0',
                      cid === component ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-white/10 text-muted-foreground',
                    )}
                  >
                    {COMPONENTS[cid].label}
                    <span className={cn('ml-1 text-[10px]', open === 0 ? 'text-green-400' : 'text-muted-foreground')}>{n}/{list.length}</span>
                    {open > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-[9px] font-black text-black flex items-center justify-center" title={`${open} mục còn thiếu`}>
                        {open}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
              <span className="truncate">{COMPONENTS[component].labelEn} · checklist {def.checklistRevision} (đã khoá)</span>
              <button type="button" onClick={() => setBriefOpen(true)} className="ml-auto shrink-0 h-7 px-2 rounded-md border border-amber-500/40 text-amber-300 font-bold inline-flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5" /> LƯU Ý
              </button>
              <span className="font-bold text-foreground shrink-0">{done}/{criteria.length} tiêu chí</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 flex flex-col gap-3">
              {(['quantity', 'quality'] as const).map(group => {
                const list = componentCriteria.filter(c => c.group === group && !session.results[c.id]?.carriedFrom)
                if (!list.length) return null
                return (
                  <div key={group}>
                    <p className="text-[10px] font-black tracking-wider text-muted-foreground px-1 py-1">
                      {group === 'quantity' ? 'KHỐI LƯỢNG · QUANTITY' : 'CHẤT LƯỢNG · QUALITY'}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {list.map(c => (
                        <CriterionRow
                          key={c.id}
                          criterion={c}
                          result={session.results[c.id]}
                          evidence={evidence.filter(e => e.ctx.criterionId === c.id)}
                          active={active?.id === c.id}
                          locked={false}
                          onActivate={setActiveId}
                          onStatus={onStatus}
                          onText={onText}
                          onMeasure={onMeasure}
                        />
                      ))}
                    </ul>
                  </div>
                )
              })}
              {carried.length > 0 && (
                <details className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
                  <summary className="text-[11px] text-green-400 font-semibold cursor-pointer">
                    {carried.length} tiêu chí đã PASS ở {session.previousSessionId} — kế thừa, không phải kiểm lại
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {carried.map(c => (
                      <CriterionRow
                        key={c.id}
                        criterion={c}
                        result={session.results[c.id]}
                        evidence={evidence.filter(e => e.ctx.criterionId === c.id)}
                        active={active?.id === c.id}
                        locked={false}
                        onActivate={setActiveId}
                        onStatus={onStatus}
                        onText={onText}
                        onMeasure={onMeasure}
                      />
                    ))}
                  </ul>
                </details>
              )}
              {componentCriteria.length > carried.length && (openByComponent[component] ?? 0) === 0 && (
                <p className="text-[11px] text-green-400 flex items-center gap-1 px-1"><CheckCircle2 className="w-3.5 h-3.5" /> {COMPONENTS[component].label} đã đủ — chuyển cấu kiện tiếp theo.</p>
              )}
            </div>
          </section>
        </div>
      </PageLayout>
      {briefOpen && (
        <InspectionBriefDialog
          open
          onOpenChange={setBriefOpen}
          assetId={session.assetId}
          stage={session.stage}
          component={component}
          onComponentChange={selectComponent}
          onStart={onBriefDone}
          startLabel="TIẾP TỤC NGHIỆM THU"
        />
      )}
      <MeasurementSheet open={measureOpen} criterion={active} onOpenChange={setMeasureOpen} onSave={saveMeasurement} />
      {bimOpen && (
        <Suspense fallback={null}>
          <BimComponentSheet
            open
            onOpenChange={setBimOpen}
            assetId={session.assetId}
            stage={session.stage}
            component={component}
            onComponentChange={cid => {
              setComponent(cid)
              setActiveId(null)
            }}
          />
        </Suspense>
      )}
    </>
  )
}
