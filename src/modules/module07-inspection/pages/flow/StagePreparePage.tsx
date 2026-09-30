import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Camera, CheckCircle2, ChevronRight, Circle, ClipboardList, HardHat, Lock, QrCode, RefreshCw, XCircle } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { criteriaForStage } from '../../data/workflow/criteria'
import { COMPONENTS, DOCUMENTS, H1_HELMET_ID, STAGES } from '../../data/workflow/hnqnProject'
import { READINESS_META, VISUAL_CONTEXT_LABEL } from '../../data/workflow/meta'
import { briefAck, briefFor } from '../../data/workflow/requirements'
import { useIssues, useSessions } from '../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../store/inspectionFlow.store'
import { findAssetByQr, flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { readH1Status, type H1DeviceStatus } from '../../services/workflow/h1Device'
import { computeReadiness } from '../../services/workflow/readiness'
import type { BriefAck, ComponentId, InspectionBrief, LiveAxis, ReadinessState, StageCode } from '../../workflow.types'
import { Breadcrumbs, Card, formatDateTimeVn, SourceBadge } from '../../components/flow/FlowUi'
import { H1LiveFeed } from '../../components/flow/H1LiveFeed'
import { InspectionBriefDialog } from '../../components/flow/InspectionBriefDialog'
import { QrScannerPanel } from '../../components/flow/QrScannerPanel'

type Step = 'readiness' | 'brief' | 'qr' | 'h1' | 'start'

const STEPS: { id: Step; label: string }[] = [
  { id: 'readiness', label: 'Inspection Readiness' },
  { id: 'brief', label: 'Lưu ý nghiệm thu' },
  { id: 'qr', label: 'Scan QR' },
  { id: 'h1', label: 'H1 Camera Preview' },
  { id: 'start', label: 'Start Inspection' },
]

function StateIcon({ state }: { state: ReadinessState }) {
  if (state === 'ok') return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
  if (state === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
  return <XCircle className="w-4 h-4 text-red-400 shrink-0" />
}

interface QrOutcome {
  value: string
  method: 'camera' | 'manual'
  ok: boolean
  matchedName?: string
}

export function StagePreparePage() {
  const { assetId = '', stageId = '' } = useParams()
  const navigate = useNavigate()
  const ctx = resolveAsset(assetId)
  const stage = stageId as StageCode
  const def = STAGES[stage]
  const sessions = useSessions()
  const issues = useIssues(assetId)
  const log = useInspectionFlowStore(s => s.log)
  const startSession = useInspectionFlowStore(s => s.startSession)
  const [step, setStep] = useState<Step>('readiness')
  const [warnAck, setWarnAck] = useState(false)
  const [qr, setQr] = useState<QrOutcome | null>(null)
  const [h1, setH1] = useState<H1DeviceStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [live, setLive] = useState<LiveAxis>('connecting')
  const [simulated, setSimulated] = useState(false)
  const [searchParams] = useSearchParams()
  const actorName = useInspectionFlowStore(s => s.actor.name)
  const [acks, setAcks] = useState<BriefAck[]>(() => {
    const pre = searchParams.get('brief') as ComponentId | null
    const brief = pre && def?.components.includes(pre) ? briefFor(assetId, stage, pre) : null
    return brief ? [briefAck(brief, actorName)] : []
  })
  const [focus, setFocus] = useState<ComponentId | undefined>(() => acks[0]?.component)
  const [briefOpen, setBriefOpen] = useState<ComponentId | null>(null)

  const onBriefStart = useCallback((brief: InspectionBrief) => {
    if (!acks.some(a => a.briefId === brief.id)) {
      setAcks(list => [...list, briefAck(brief, actorName)])
      log('brief.view', assetId, `${brief.id} · ${brief.version} · ${brief.requirements.length} yêu cầu`)
    }
    setFocus(brief.component)
    setBriefOpen(null)
    setStep('qr')
  }, [acks, actorName, assetId, log])

  const readiness = useMemo(
    () => (ctx && def ? computeReadiness({ asset: ctx.asset, stage, sessions, issues, documents: DOCUMENTS }) : null),
    [ctx, def, stage, sessions, issues],
  )

  const recheckH1 = useCallback(() => {
    setChecking(true)
    void readH1Status(H1_HELMET_ID).then(s => {
      setH1(s)
      setChecking(false)
    })
  }, [])

  useEffect(() => {
    if (step === 'h1' && !h1) recheckH1()
  }, [step, h1, recheckH1])

  if (!ctx || !def || !readiness) return <Navigate to={flowPaths.home()} replace />
  const { asset, structure, project } = ctx

  const handleQr = (value: string, method: 'camera' | 'manual') => {
    const matched = findAssetByQr(value)
    const ok = value.toUpperCase() === asset.qrId.toUpperCase()
    setQr({ value, method, ok, matchedName: matched?.name })
    log(ok ? 'qr.verify' : 'qr.mismatch', asset.id, `${value} (${method === 'manual' ? 'nhập tay' : 'camera'}) ${ok ? '= ' : '≠ '}${asset.qrId}`)
  }

  const h1Checks: { label: string; ok: boolean; detail: string; mock?: boolean }[] = h1 ? [
    { label: 'Helmet ID', ok: h1.configured, detail: `${h1.helmetId}${h1.configured ? '' : ' · chưa cấu hình MediaMTX'}` },
    { label: 'Online', ok: h1.online || simulated, detail: h1.online ? 'Đang publish lên MediaMTX' : simulated ? 'Mô phỏng (POC)' : 'Không có luồng từ mũ' },
    { label: 'Battery', ok: h1.batteryPct > 20, detail: `${h1.batteryPct}%`, mock: true },
    { label: 'Recording ready', ok: h1.recordingReady, detail: 'Sẵn sàng ghi', mock: true },
    { label: 'Storage', ok: h1.storageFreeGb > 4, detail: `${h1.storageFreeGb} GB trống`, mock: true },
    { label: 'Live stream', ok: live === 'live', detail: live === 'live' ? (simulated ? 'Luồng mô phỏng (POC)' : 'WHEP / LL-HLS') : live === 'connecting' ? 'Đang kết nối...' : 'Mất tín hiệu' },
    { label: 'Camera preview', ok: live === 'live', detail: live === 'live' ? 'Có khung hình' : 'Chưa có hình' },
  ] : []
  const h1Ok = h1Checks.length > 0 && h1Checks.every(c => c.ok)
  const criteria = criteriaForStage(stage)
  const readinessPass = !readiness.blocked && (readiness.warnings === 0 || warnAck)
  const stepDone: Record<Step, boolean> = { readiness: readinessPass, brief: acks.length > 0, qr: Boolean(qr?.ok), h1: h1Ok, start: false }
  const canGo = (s: Step) => {
    const idx = STEPS.findIndex(x => x.id === s)
    return STEPS.slice(0, idx).every(x => stepDone[x.id])
  }

  const summary = [
    { label: `Lưu ý ${acks.length}/${def.components.length} cấu kiện`, ok: acks.length > 0 },
    { label: `QR ${asset.qrId}`, ok: Boolean(qr?.ok) },
    { label: `H1 ${H1_HELMET_ID}${simulated ? ' (mô phỏng)' : ''}`, ok: h1Ok },
    { label: 'Camera Preview', ok: live === 'live' },
    { label: `Checklist ${def.checklistRevision}`, ok: criteria.length > 0 },
    { label: `AFC ${asset.afc.revision}`, ok: !readiness.checks.some(c => c.id === 'afc-bim' && c.state === 'block') },
  ]

  const start = () => {
    if (!qr?.ok) return
    const id = startSession({
      assetId: asset.id,
      stage,
      qr: { value: qr.value, method: qr.method, verifiedAt: new Date().toISOString() },
      simulatedH1: simulated,
      focusComponent: focus,
      briefs: acks,
    })
    navigate(flowPaths.live(id))
  }

  return (
    <>
      <Header title="Chuẩn bị nghiệm thu" subtitle={`${asset.code} · ${def.code} ${def.label}`} />
      <PageLayout scrollable>
        <Breadcrumbs items={[
          { label: project.code, to: flowPaths.project(project.id) },
          { label: structure.name, to: flowPaths.structure(project.id, structure.id) },
          { label: asset.name, to: flowPaths.asset(asset.id) },
          { label: `${def.code} ${def.label}` },
        ]} />
        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
          <ol className="flex lg:flex-col gap-1.5 self-start">
            {STEPS.map((s, i) => {
              const enabled = canGo(s.id)
              return (
                <li key={s.id} className="flex-1 lg:flex-none">
                  <button
                    type="button"
                    disabled={!enabled}
                    onClick={() => setStep(s.id)}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[12px] font-semibold',
                      step === s.id ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-white/5 text-muted-foreground',
                      !enabled && 'opacity-40',
                    )}
                  >
                    {stepDone[s.id] ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : enabled ? <Circle className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    <span className="text-muted-foreground">{i + 1}</span> {s.label}
                  </button>
                </li>
              )
            })}
          </ol>

          {step === 'readiness' && (
            <Card title={`Inspection Readiness · ${def.code} ${def.label}`} bodyClassName="flex flex-col gap-2">
              {readiness.checks.map(c => (
                <div key={c.id} className="flex items-start gap-2 rounded-lg border border-white/5 px-3 py-2">
                  <StateIcon state={c.state} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-foreground">{c.label}</p>
                    <p className="text-[10px] text-muted-foreground">{c.detail}</p>
                  </div>
                  <span className={cn('text-[9px] font-bold', READINESS_META[c.state].className)}>{READINESS_META[c.state].label}</span>
                </div>
              ))}
              {readiness.blocked && (
                <p className="text-[11px] text-red-400">Có điều kiện CHẶN — chưa được bắt đầu nghiệm thu giai đoạn này.</p>
              )}
              {!readiness.blocked && readiness.warnings > 0 && (
                <label className="flex items-center gap-2 text-[11px] text-amber-300">
                  <input type="checkbox" checked={warnAck} onChange={e => setWarnAck(e.target.checked)} />
                  Đã xem {readiness.warnings} cảnh báo, vẫn tiếp tục (ghi nhận vào báo cáo)
                </label>
              )}
              <div className="flex justify-end">
                <button type="button" disabled={!readinessPass} onClick={() => setStep('brief')} className="h-10 px-5 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[12px] font-bold disabled:opacity-40 inline-flex items-center gap-1">
                  Tiếp tục · Lưu ý nghiệm thu <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </Card>
          )}

          {step === 'brief' && (
            <Card title={`Lưu ý nghiệm thu · ${def.code} ${def.label}`} icon={<ClipboardList className="w-3.5 h-3.5 text-primary" />} bodyClassName="flex flex-col gap-3">
              <p className="text-[11px] text-muted-foreground">Chọn cấu kiện sẽ nghiệm thu để xem tóm tắt yêu cầu, điểm cần chú ý và phần phải kiểm tra ngoài video.</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {def.components.map(cid => {
                  const brief = briefFor(asset.id, stage, cid)
                  const ack = acks.find(a => a.component === cid)
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => setBriefOpen(cid)}
                      className={cn(
                        'rounded-xl border p-3 text-left flex flex-col gap-1 min-w-0',
                        focus === cid ? 'border-primary/60 bg-primary/10' : 'border-white/10 hover:border-white/20',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-foreground truncate">{COMPONENTS[cid].label}</span>
                        {ack ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 ml-auto" /> : <Circle className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {COMPONENTS[cid].labelEn} · {brief ? VISUAL_CONTEXT_LABEL[brief.visualContext] : '—'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {brief?.requirements.length ?? 0} yêu cầu · {criteria.filter(c => c.component === cid).length} tiêu chí
                      </span>
                      <span className={cn('text-[10px] font-semibold', ack ? 'text-green-400' : 'text-amber-300')}>
                        {ack ? `Đã xem ${formatDateTimeVn(ack.viewedAt)}` : 'Chưa xem lưu ý'}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-end">
                <button type="button" disabled={acks.length === 0} onClick={() => setStep('qr')} className="h-10 px-5 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[12px] font-bold disabled:opacity-40 inline-flex items-center gap-1">
                  Tiếp tục · Quét QR <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </Card>
          )}

          {step === 'qr' && (
            <Card title="Scan QR hạng mục" icon={<QrCode className="w-3.5 h-3.5 text-primary" />} bodyClassName="flex flex-col gap-3">
              {qr ? (
                <div className={cn('rounded-xl border p-5 text-center', qr.ok ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10')}>
                  <p className={cn('text-xl font-black tracking-wider', qr.ok ? 'text-green-300' : 'text-red-300')}>
                    {qr.ok ? `QR VERIFIED — ${asset.name}` : 'QR DOES NOT MATCH'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Đọc được <b className="font-mono text-foreground">{qr.value}</b> ({qr.method === 'manual' ? 'nhập tay' : 'camera'})
                    {!qr.ok && ` · mong đợi ${asset.qrId}${qr.matchedName ? ` — mã này thuộc ${qr.matchedName}` : ''}`}
                  </p>
                  <div className="flex justify-center gap-2 mt-4">
                    <button type="button" onClick={() => setQr(null)} className="h-9 px-4 rounded-lg border border-white/10 text-[12px] text-foreground inline-flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5" /> Quét lại
                    </button>
                    {qr.ok && (
                      <button type="button" onClick={() => setStep('h1')} className="h-9 px-4 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[12px] font-bold">
                        Tiếp tục · Kiểm tra H1
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <QrScannerPanel expected={asset.qrId} onResult={handleQr} />
              )}
              <p className="text-[10px] text-muted-foreground">QR chỉ xác định hạng mục ({asset.qrId} → {asset.name}); cấu kiện đã chọn ở bước Lưu ý nghiệm thu.</p>
            </Card>
          )}

          {step === 'h1' && (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Card title={`H1 Camera Preview · ${H1_HELMET_ID}`} icon={<Camera className="w-3.5 h-3.5 text-primary" />} bodyClassName="p-0">
                <div className="relative aspect-video">
                  <H1LiveFeed helmetId={H1_HELMET_ID} simulated={simulated} overlayText={`${asset.code} · ${def.code} · preview`} onLiveAxis={setLive} />
                </div>
              </Card>
              <Card
                title="H1 Pre-check"
                icon={<HardHat className="w-3.5 h-3.5 text-primary" />}
                right={(
                  <button type="button" onClick={recheckH1} className="text-[10px] text-primary inline-flex items-center gap-1">
                    <RefreshCw className={cn('w-3 h-3', checking && 'animate-spin')} /> Kiểm tra lại
                  </button>
                )}
                bodyClassName="flex flex-col gap-1.5"
              >
                {h1Checks.map(c => (
                  <div key={c.label} className="flex items-center gap-2 text-[12px]">
                    {c.ok ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                    <span className="text-foreground font-semibold w-32">{c.label}</span>
                    <span className="text-muted-foreground flex-1 truncate">{c.detail}</span>
                    {c.mock && <SourceBadge source="MOCK" />}
                  </div>
                ))}
                {h1 && !h1.online && !simulated && (
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 flex flex-col gap-2">
                    <p className="text-[11px] text-amber-300">
                      {H1_HELMET_ID} chưa phát luồng. Bật mũ và phát sóng, rồi bấm Kiểm tra lại.
                    </p>
                    <button type="button" onClick={() => setSimulated(true)} className="self-start h-8 px-3 rounded-lg border border-fuchsia-500/40 text-fuchsia-300 text-[11px] font-semibold">
                      Dùng H1 mô phỏng (POC) — ghi vào audit
                    </button>
                  </div>
                )}
                <div className="flex justify-end mt-2">
                  <button type="button" disabled={!h1Ok} onClick={() => setStep('start')} className="h-10 px-5 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[12px] font-bold disabled:opacity-40">
                    Tiếp tục
                  </button>
                </div>
              </Card>
            </div>
          )}

          {step === 'start' && (
            <Card title="Sẵn sàng nghiệm thu" bodyClassName="flex flex-col items-center gap-4 py-8">
              <p className="text-2xl font-black text-foreground">{asset.code} · {def.code} {def.label}</p>
              <ul className="flex flex-wrap justify-center gap-3">
                {summary.map(s => (
                  <li key={s.label} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-semibold', s.ok ? 'border-green-500/40 text-green-300' : 'border-red-500/40 text-red-300')}>
                    {s.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {s.label}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground text-center max-w-lg">
                Bắt đầu sẽ tạo phiên mới, khoá revision AFC {asset.afc.revision} · BIM {asset.bim.revision} · {def.checklistRevision}, bật ghi hình và live stream {H1_HELMET_ID}.
              </p>
              <button
                type="button"
                disabled={!summary.every(s => s.ok)}
                onClick={start}
                className="h-14 px-10 rounded-2xl bg-green-500/20 border-2 border-green-500/60 text-green-300 text-lg font-black tracking-wider hover:bg-green-500/30 disabled:opacity-40"
              >
                START INSPECTION
              </button>
            </Card>
          )}
        </div>
      </PageLayout>
      {briefOpen && (
        <InspectionBriefDialog
          open
          onOpenChange={o => { if (!o) setBriefOpen(null) }}
          assetId={asset.id}
          stage={stage}
          component={briefOpen}
          onComponentChange={setBriefOpen}
          onStart={onBriefStart}
        />
      )}
    </>
  )
}
