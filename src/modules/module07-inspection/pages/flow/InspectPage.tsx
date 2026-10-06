import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BookOpen, Camera, CircleStop, Mic, Pause, Play, Radio, Ruler } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { criteriaForStage } from '../../data/workflow/criteria'
import { COMPONENTS, STAGES } from '../../data/workflow/hnqnProject'
import { useEvidence, useNowTick, useSession } from '../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../store/inspectionFlow.store'
import { putBlob } from '../../services/workflow/evidenceBlobs'
import { flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { formatClock, uid } from '../../services/workflow/ids'
import { isPaused, sessionElapsedSec } from '../../services/workflow/sessionLogic'
import { evaluateMeasurement } from '../../services/workflow/measurementEval'
import { validateBeforeFinish } from '../../services/workflow/validation'
import {
  captureFrame,
  hasSessionCapture,
  isSessionCaptureSupported,
  pauseSessionCapture,
  resumeSessionCapture,
  startSessionCapture,
} from '../../services/workflow/sessionRecorder'
import { isSpeechToTextSupported, startVoiceComment, type VoiceSession } from '../../services/workflow/voiceRecorder'
import type { ComponentId, CriterionResult, CriterionStatus, Evidence, EvidenceContext, LiveAxis } from '../../workflow.types'
import { CriterionRow } from '../../components/flow/CriterionRow'
import { EvidenceMedia } from '../../components/flow/EvidenceMedia'
import { H1LiveFeed } from '../../components/flow/H1LiveFeed'
import { MeasurementSheet, type MeasurementInput } from '../../components/flow/MeasurementSheet'

const BimComponentSheet = lazy(() => import('../../components/flow/BimComponentSheet'))

export function InspectPage() {
  const { sessionId = '' } = useParams()
  const [params] = useSearchParams()
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
  const queryComponent = params.get('c') as ComponentId | null
  const [component, setComponent] = useState<ComponentId>(
    () => (queryComponent && def?.components.includes(queryComponent) ? queryComponent : session?.focusComponent ?? def?.components[0] ?? 'bottom'),
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [live, setLive] = useState<LiveAxis>('connecting')
  const [measureOpen, setMeasureOpen] = useState(false)
  const [bimOpen, setBimOpen] = useState(false)
  const [voice, setVoice] = useState<{ rec: VoiceSession; startedAt: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
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
    if (!isSessionCaptureSupported()) return
    startSessionCapture(session.id, () => videoRef.current, () => `${session.id} · ${formatClock(elapsedRef.current)}`)
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

  const componentCriteria = useMemo(
    () => criteria.filter(c => c.component === component && !session?.results[c.id]?.carriedFrom),
    [criteria, component, session],
  )
  const active = criteria.find(c => c.id === activeId) ?? componentCriteria[0]
  const validation = useMemo(
    () => (session ? validateBeforeFinish(session, componentCriteria, evidence) : null),
    [session, componentCriteria, evidence],
  )

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
    setCriterion(session.id, id, { status, videoTs: Math.round(elapsedRef.current) })
  }, [session, setCriterion])

  const onText = useCallback((id: string, patch: Pick<CriterionResult, 'observed' | 'comment'>) => {
    if (session) setCriterion(session.id, id, patch)
  }, [session, setCriterion])

  if (!session || !ctx || !def) return <Navigate to={flowPaths.home()} replace />
  if (!running) return <Navigate to={flowPaths.sign(session.id)} replace />

  const snapshot = async () => {
    const c = makeCtx(active?.id)
    if (!c) return
    const blob = await captureFrame(videoRef.current)
    if (!blob) {
      setToast('Chưa có khung hình để chụp')
      return
    }
    const id = uid('snap')
    await putBlob(id, blob)
    const e: Evidence = { id, type: 'snapshot', label: active?.title ?? COMPONENTS[component].label, ctx: c, blobKey: id, mime: blob.type }
    addEvidence(e)
    setFlash(true)
    window.setTimeout(() => setFlash(false), 180)
    setToast('Đã lưu ảnh')
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
        label: 'Ghi âm',
        ctx: { ...c, videoTs: Math.max(0, c.videoTs - Math.round(clip.durationSec)) },
        blobKey: id,
        mime: clip.mime,
        durationSec: clip.durationSec,
        transcript: clip.transcript,
        videoTo: c.videoTs,
      })
      setToast(`Đã lưu ghi âm ${clip.durationSec.toFixed(0)}s`)
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
    if (verdict) {
      setCriterion(session.id, active.id, {
        status: verdict.status,
        observed,
        autoVerdict: verdict.summary,
        comment: verdict.status === 'fail' ? verdict.summary : session.results[active.id]?.comment,
        videoTs: c.videoTs,
      })
      return
    }
    if (!session.results[active.id]?.observed) setCriterion(session.id, active.id, { observed })
  }

  const goSign = () => {
    const failOpen = validation?.problems.filter(p => p.kind === 'fail_without_support') ?? []
    if (failOpen.length) {
      setToast('Tiêu chí không đạt cần ghi chú và bằng chứng')
      return
    }
    navigate(flowPaths.sign(session.id))
  }

  const recent = evidence.filter(e => e.ctx.criterionId === active?.id).slice(-4)
  const actionBtn = 'h-11 rounded-xl border flex items-center justify-center gap-1.5 text-[11px] font-bold px-2'

  return (
    <>
      <Header
        title={`${def.label} · ${COMPONENTS[component].label}`}
        subtitle={ctx.asset.name}
        headerRight={(
          <span className="font-mono text-[13px] font-bold text-foreground">{formatClock(elapsed)}</span>
        )}
      />
      <PageLayout className="gap-2 p-2 max-lg:min-h-[calc(100dvh-64px)] max-lg:h-auto max-lg:overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2 lg:flex-1 lg:min-h-0">
          <section className="flex flex-col gap-2 min-h-0 min-w-0">
            <div className="relative w-full min-h-[200px] sm:min-h-[240px] lg:flex-1 lg:min-h-[220px] aspect-video lg:aspect-auto rounded-lg overflow-hidden border border-[#1e2433] bg-black">
              <H1LiveFeed
                helmetId={session.helmetId}
                simulated={session.simulatedH1}
                overlayText={`${ctx.asset.code} · ${formatClock(elapsed)}`}
                onVideoElement={onVideoElement}
                onLiveAxis={setLive}
              />
              {flash && <div className="absolute inset-0 bg-white/70 pointer-events-none" />}
              <div className="absolute top-2 left-2">
                <span className="bg-black/60 rounded px-2 py-1 text-[10px] text-white inline-flex items-center gap-1">
                  <Radio className="w-3 h-3 text-red-400" />
                  {live === 'live' ? 'Đang quay' : paused ? 'Tạm dừng' : 'Kết nối…'}
                </span>
              </div>
              {voice && (
                <div className="absolute top-2 right-2 bg-red-600/80 rounded px-2 py-1 text-[11px] font-bold text-white">
                  Ghi âm · {Math.round((now - voice.startedAt) / 1000)}s
                </div>
              )}
              {toast && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 rounded-lg px-3 py-1.5 text-[11px] text-white">{toast}</div>}
            </div>
            {recent.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto shrink-0">
                {recent.map(e => (
                  <div key={e.id} className="w-24 shrink-0 rounded border border-white/10 p-1">
                    <EvidenceMedia evidence={e} compact className="w-full h-12" />
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 shrink-0">
              <button type="button" disabled={paused} onClick={() => void snapshot()} className={cn(actionBtn, 'border-sky-500/40 bg-sky-500/10 text-sky-300 disabled:opacity-40')}>
                <Camera className="w-4 h-4" /> Ảnh
              </button>
              <button type="button" disabled={paused} onClick={() => void toggleVoice()} className={cn(actionBtn, voice ? 'border-red-500/60 bg-red-500/20 text-red-300' : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300', 'disabled:opacity-40')}>
                <Mic className="w-4 h-4" /> {voice ? 'Dừng' : 'Ghi âm'}
              </button>
              <button type="button" onClick={() => setMeasureOpen(true)} className={cn(actionBtn, 'border-white/10 text-foreground')}>
                <Ruler className="w-4 h-4" /> Số đo
              </button>
              <button type="button" onClick={() => setBimOpen(true)} className={cn(actionBtn, 'border-white/10 text-foreground')}>
                <BookOpen className="w-4 h-4" /> BIM
              </button>
              <button type="button" onClick={() => (paused ? resumeSession(session.id) : pauseSession(session.id))} className={cn(actionBtn, 'border-amber-500/40 text-amber-300')}>
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />} {paused ? 'Tiếp tục' : 'Tạm dừng'}
              </button>
            </div>
          </section>

          <section className="flex flex-col min-h-[min(52vh,520px)] lg:min-h-0 min-w-0 rounded-lg border border-[#1e2433] bg-[#0b0f1a]">
            <div className="flex gap-1.5 px-2 pt-3 pb-2 overflow-x-auto shrink-0">
              {def.components.map(cid => {
                const list = criteria.filter(c => c.component === cid && !session.results[c.id]?.carriedFrom)
                const n = list.filter(c => (session.results[c.id]?.status ?? 'not_checked') !== 'not_checked').length
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => { setComponent(cid); setActiveId(null) }}
                    className={cn(
                      'h-9 px-3 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0',
                      cid === component ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-white/10 text-muted-foreground',
                    )}
                  >
                    {COMPONENTS[cid].label}
                    <span className="ml-1 text-[10px] text-muted-foreground">{n}/{list.length}</span>
                  </button>
                )
              })}
            </div>
            <ul className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 flex flex-col gap-1.5">
              {componentCriteria.map(c => (
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
                  onMeasure={id => { setActiveId(id); setMeasureOpen(true) }}
                />
              ))}
            </ul>
            <div className="p-2 border-t border-[#1e2433] shrink-0">
              <button
                type="button"
                onClick={goSign}
                className="w-full h-11 rounded-xl bg-green-500/15 border border-green-500/50 text-green-300 text-[13px] font-bold inline-flex items-center justify-center gap-1.5"
              >
                <CircleStop className="w-4 h-4" /> Gửi ký
              </button>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                {ctx.asset.afc.code} {session.revisions.afc} · {session.revisions.checklist}
              </p>
            </div>
          </section>
        </div>
      </PageLayout>
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
