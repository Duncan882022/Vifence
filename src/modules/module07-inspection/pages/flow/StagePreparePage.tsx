import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, ChevronUp, Circle, ClipboardList, HardHat, Play, QrCode, RefreshCw, RotateCcw, XCircle } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { useShellLayout } from '@/hooks/useShellLayout'
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
import { canReinspectFailedOnly, carryOverResults } from '../../services/workflow/reinspection'
import { latestSession } from '../../services/workflow/sessionLogic'
import type { BriefAck, ComponentId, InspectionBrief, LiveAxis, ReadinessState, SessionScope, StageCode } from '../../workflow.types'
import { Breadcrumbs, Card, formatDateTimeVn, SourceBadge } from '../../components/flow/FlowUi'
import { H1LiveFeed } from '../../components/flow/H1LiveFeed'
import { InspectionBriefDialog } from '../../components/flow/InspectionBriefDialog'
import { QrScannerPanel } from '../../components/flow/QrScannerPanel'

function StateIcon({ state }: { state: ReadinessState }) {
  if (state === 'ok') return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
  if (state === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
  return <XCircle className="w-4 h-4 text-red-400 shrink-0" />
}

function SectionStatus({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold', ok ? 'text-green-400' : 'text-amber-300')}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
      {label}
    </span>
  )
}

interface QrOutcome {
  value: string
  method: 'camera' | 'manual'
  ok: boolean
  matchedName?: string
}

/**
 * Pre-check một màn hình: điều kiện, lưu ý cấu kiện, QR, mũ H1 kiểm tra song song;
 * thanh START cố định cho biết còn thiếu gì.
 */
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
  const actorName = useInspectionFlowStore(s => s.actor.name)
  const [searchParams] = useSearchParams()
  const { sidebarInset } = useShellLayout()

  const [warnAck, setWarnAck] = useState(false)
  const [showOk, setShowOk] = useState(false)
  const [qr, setQr] = useState<QrOutcome | null>(() => {
    const value = searchParams.get('qr')
    if (!value || !ctx) return null
    const method = searchParams.get('qrm') === 'manual' ? 'manual' : 'camera'
    return { value, method, ok: value.toUpperCase() === ctx.asset.qrId.toUpperCase() }
  })
  const [scanning, setScanning] = useState(false)
  const [h1, setH1] = useState<H1DeviceStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [live, setLive] = useState<LiveAxis>('connecting')
  const [simulated, setSimulated] = useState(false)
  const [acks, setAcks] = useState<BriefAck[]>(() => {
    const pre = searchParams.get('brief') as ComponentId | null
    const brief = pre && def?.components.includes(pre) ? briefFor(assetId, stage, pre) : null
    return brief ? [briefAck(brief, actorName)] : []
  })
  const [focus, setFocus] = useState<ComponentId | undefined>(() => acks[0]?.component)
  const [briefOpen, setBriefOpen] = useState<ComponentId | null>(null)
  const [scope, setScope] = useState<SessionScope>('failed_only')

  const onBriefStart = useCallback((brief: InspectionBrief) => {
    if (!acks.some(a => a.briefId === brief.id)) {
      setAcks(list => [...list, briefAck(brief, actorName)])
      log('brief.view', assetId, `${brief.id} · ${brief.version} · ${brief.requirements.length} yêu cầu`)
    }
    setFocus(brief.component)
    setBriefOpen(null)
  }, [acks, actorName, assetId, log])

  const readiness = useMemo(
    () => (ctx && def ? computeReadiness({ asset: ctx.asset, stage, sessions, issues, documents: DOCUMENTS }) : null),
    [ctx, def, stage, sessions, issues],
  )
  const criteria = useMemo(() => (def ? criteriaForStage(stage) : []), [def, stage])
  const last = ctx && def ? latestSession(sessions, ctx.asset.id, stage) : undefined
  const partialAllowed = canReinspectFailedOnly(last)
  const carriedCount = useMemo(
    () => (partialAllowed && last ? Object.keys(carryOverResults(last, criteria, '')).length : 0),
    [partialAllowed, last, criteria],
  )

  const recheckH1 = useCallback(() => {
    setChecking(true)
    void readH1Status(H1_HELMET_ID).then(s => {
      setH1(s)
      setChecking(false)
    })
  }, [])

  useEffect(() => {
    recheckH1()
  }, [recheckH1])

  if (!ctx || !def || !readiness) return <Navigate to={flowPaths.home()} replace />
  const { asset, structure, project } = ctx

  const handleQr = (value: string, method: 'camera' | 'manual') => {
    const matched = findAssetByQr(value)
    const ok = value.toUpperCase() === asset.qrId.toUpperCase()
    setQr({ value, method, ok, matchedName: matched?.name })
    setScanning(false)
    log(ok ? 'qr.verify' : 'qr.mismatch', asset.id, `${value} (${method === 'manual' ? 'nhập tay' : 'camera'}) ${ok ? '= ' : '≠ '}${asset.qrId}`)
  }

  const h1Checks: { label: string; ok: boolean; detail: string; mock?: boolean }[] = h1 ? [
    { label: 'Helmet ID', ok: h1.configured || simulated, detail: `${h1.helmetId}${h1.configured ? '' : simulated ? ' · mô phỏng (POC)' : ' · chưa cấu hình MediaMTX'}` },
    { label: 'Online', ok: h1.online || simulated, detail: h1.online ? 'Đang publish lên MediaMTX' : simulated ? 'Mô phỏng (POC)' : 'Không có luồng từ mũ' },
    { label: 'Pin', ok: h1.batteryPct > 20, detail: `${h1.batteryPct}%`, mock: true },
    { label: 'Sẵn sàng ghi', ok: h1.recordingReady, detail: 'Sẵn sàng ghi', mock: true },
    { label: 'Bộ nhớ', ok: h1.storageFreeGb > 4, detail: `${h1.storageFreeGb} GB trống`, mock: true },
    { label: 'Live stream', ok: live === 'live', detail: live === 'live' ? (simulated ? 'Luồng mô phỏng (POC)' : 'WHEP / LL-HLS') : live === 'connecting' ? 'Đang kết nối...' : 'Mất tín hiệu' },
  ] : []
  const h1Ok = h1Checks.length > 0 && h1Checks.every(c => c.ok)
  const readinessOk = !readiness.blocked && (readiness.warnings === 0 || warnAck)
  const blockers = readiness.checks.filter(c => c.state !== 'ok')
  const passedChecks = readiness.checks.filter(c => c.state === 'ok')

  const missing = [
    !readinessOk && (readiness.blocked ? 'Điều kiện bị CHẶN' : 'Xác nhận cảnh báo'),
    acks.length === 0 && 'Xem lưu ý ≥ 1 cấu kiện',
    !qr?.ok && 'Quét QR hạng mục',
    !h1Ok && 'Mũ H1 sẵn sàng',
  ].filter((x): x is string => Boolean(x))
  const ready = missing.length === 0
  const toInspect = partialAllowed && scope === 'failed_only' ? criteria.length - carriedCount : criteria.length

  const start = () => {
    if (!ready || !qr?.ok) return
    const id = startSession({
      assetId: asset.id,
      stage,
      qr: { value: qr.value, method: qr.method, verifiedAt: new Date().toISOString() },
      simulatedH1: simulated,
      focusComponent: focus,
      briefs: acks,
      scope: partialAllowed ? scope : 'full',
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

        <div className="grid gap-3 lg:grid-cols-2 items-start">
          <div className="flex flex-col gap-3 min-w-0">
            <Card
              title={`1 · Điều kiện · ${def.code} ${def.label}`}
              right={<SectionStatus ok={readinessOk} label={readiness.blocked ? 'CHẶN' : readinessOk ? 'Đạt' : `${readiness.warnings} cảnh báo`} />}
              bodyClassName="flex flex-col gap-1.5"
            >
              {blockers.map(c => (
                <div key={c.id} className="flex items-start gap-2 rounded-lg border border-white/5 px-3 py-2">
                  <StateIcon state={c.state} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-foreground">{c.label}</p>
                    <p className="text-[10px] text-muted-foreground">{c.detail}</p>
                  </div>
                  <span className={cn('text-[9px] font-bold', READINESS_META[c.state].className)}>{READINESS_META[c.state].label}</span>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setShowOk(v => !v)}
                className="flex items-center gap-1.5 text-[11px] text-green-400 px-1 py-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> {passedChecks.length} điều kiện đạt
                {showOk ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
              </button>
              {showOk && passedChecks.map(c => (
                <div key={c.id} className="flex items-start gap-2 px-3 py-1">
                  <StateIcon state={c.state} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-foreground">{c.label}</p>
                    <p className="text-[10px] text-muted-foreground">{c.detail}</p>
                  </div>
                </div>
              ))}
              {readiness.blocked && (
                <p className="text-[11px] text-red-400">Có điều kiện CHẶN — chưa được bắt đầu nghiệm thu giai đoạn này.</p>
              )}
              {!readiness.blocked && readiness.warnings > 0 && (
                <label className="flex items-center gap-2 text-[12px] text-amber-300 py-1">
                  <input type="checkbox" className="w-4 h-4" checked={warnAck} onChange={e => setWarnAck(e.target.checked)} />
                  Đã xem {readiness.warnings} cảnh báo, vẫn tiếp tục (ghi nhận vào báo cáo)
                </label>
              )}
            </Card>

            {partialAllowed && last && (
              <Card title="Phạm vi nghiệm thu lại" icon={<RotateCcw className="w-3.5 h-3.5 text-primary" />} bodyClassName="flex flex-col gap-1.5">
                {([
                  { id: 'failed_only', label: `Chỉ mục chưa đạt · ${criteria.length - carriedCount} tiêu chí`, hint: `Kế thừa ${carriedCount} PASS đã duyệt từ ${last.id}` },
                  { id: 'full', label: `Toàn bộ checklist · ${criteria.length} tiêu chí`, hint: 'Kiểm lại tất cả từ đầu' },
                ] as const).map(o => (
                  <label
                    key={o.id}
                    className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 cursor-pointer', scope === o.id ? 'border-primary/60 bg-primary/10' : 'border-white/10')}
                  >
                    <input type="radio" name="scope" className="mt-0.5 w-4 h-4" checked={scope === o.id} onChange={() => setScope(o.id)} />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold text-foreground">{o.label}</span>
                      <span className="block text-[10px] text-muted-foreground">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </Card>
            )}

            <Card
              title="2 · Lưu ý cấu kiện"
              icon={<ClipboardList className="w-3.5 h-3.5 text-primary" />}
              right={<SectionStatus ok={acks.length > 0} label={`${acks.length}/${def.components.length} đã xem`} />}
              bodyClassName="flex flex-col gap-2"
            >
              <p className="text-[11px] text-muted-foreground">Chạm cấu kiện sẽ nghiệm thu để xem yêu cầu, điểm cần chú ý và phần kiểm tra ngoài video.</p>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                {def.components.map(cid => {
                  const brief = briefFor(asset.id, stage, cid)
                  const ack = acks.find(a => a.component === cid)
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => setBriefOpen(cid)}
                      className={cn(
                        'rounded-xl border p-3 text-left flex flex-col gap-0.5 min-w-0',
                        focus === cid ? 'border-primary/60 bg-primary/10' : 'border-white/10 hover:border-white/20',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-foreground truncate">{COMPONENTS[cid].label}</span>
                        {ack ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 ml-auto" /> : <Circle className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {brief ? VISUAL_CONTEXT_LABEL[brief.visualContext] : '—'} · {brief?.requirements.length ?? 0} yêu cầu · {criteria.filter(c => c.component === cid).length} tiêu chí
                      </span>
                      <span className={cn('text-[10px] font-semibold', ack ? 'text-green-400' : 'text-amber-300')}>
                        {ack ? `Đã xem ${formatDateTimeVn(ack.viewedAt)}` : 'Chưa xem lưu ý'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-3 min-w-0">
            <Card
              title="3 · QR hạng mục"
              icon={<QrCode className="w-3.5 h-3.5 text-primary" />}
              right={<SectionStatus ok={Boolean(qr?.ok)} label={qr?.ok ? 'Đã xác minh' : 'Chưa quét'} />}
              bodyClassName="flex flex-col gap-2"
            >
              {qr && !scanning ? (
                <div className={cn('rounded-xl border p-3 flex items-center gap-3', qr.ok ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10')}>
                  {qr.ok ? <CheckCircle2 className="w-6 h-6 text-green-300 shrink-0" /> : <XCircle className="w-6 h-6 text-red-300 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[13px] font-black tracking-wide', qr.ok ? 'text-green-300' : 'text-red-300')}>
                      {qr.ok ? `QR ĐÚNG — ${asset.name}` : 'QR KHÔNG KHỚP'}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      <b className="font-mono text-foreground">{qr.value}</b> ({qr.method === 'manual' ? 'nhập tay' : 'camera'})
                      {!qr.ok && ` · cần ${asset.qrId}${qr.matchedName ? ` — mã này thuộc ${qr.matchedName}` : ''}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setScanning(true)} className="h-9 px-3 rounded-lg border border-white/10 text-[11px] text-foreground inline-flex items-center gap-1 shrink-0">
                    <RefreshCw className="w-3.5 h-3.5" /> Quét lại
                  </button>
                </div>
              ) : scanning ? (
                <QrScannerPanel expected={asset.qrId} onResult={handleQr} />
              ) : (
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  className="h-12 rounded-xl border-2 border-dashed border-sky-500/40 text-sky-300 text-[13px] font-bold inline-flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" /> Quét QR {asset.qrId}
                </button>
              )}
              <p className="text-[10px] text-muted-foreground">QR chỉ xác định hạng mục ({asset.qrId} → {asset.name}); cấu kiện chọn ở mục Lưu ý.</p>
            </Card>

            <Card
              title={`4 · Mũ H1 · ${H1_HELMET_ID}`}
              icon={<HardHat className="w-3.5 h-3.5 text-primary" />}
              right={(
                <span className="flex items-center gap-2">
                  <SectionStatus ok={h1Ok} label={h1Ok ? 'Sẵn sàng' : checking ? 'Đang kiểm tra' : 'Chưa sẵn sàng'} />
                  <button type="button" onClick={recheckH1} aria-label="Kiểm tra lại H1" className="p-1 text-primary">
                    <RefreshCw className={cn('w-3.5 h-3.5', checking && 'animate-spin')} />
                  </button>
                </span>
              )}
              bodyClassName="p-0"
            >
              <div className="relative aspect-video">
                <H1LiveFeed helmetId={H1_HELMET_ID} simulated={simulated} overlayText={`${asset.code} · ${def.code} · preview`} onLiveAxis={setLive} />
              </div>
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                {h1Checks.map(c => (
                  <div key={c.label} className="flex items-center gap-1.5 text-[11px] min-w-0">
                    {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    <span className="text-foreground font-semibold shrink-0">{c.label}</span>
                    <span className="text-muted-foreground truncate">{c.detail}</span>
                    {c.mock && <SourceBadge source="MOCK" />}
                  </div>
                ))}
              </div>
              {h1 && !h1.online && !simulated && (
                <div className="mx-3 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 flex flex-col gap-2">
                  <p className="text-[11px] text-amber-300">
                    {H1_HELMET_ID} chưa phát luồng. Bật mũ và phát sóng, rồi bấm kiểm tra lại.
                  </p>
                  <button type="button" onClick={() => setSimulated(true)} className="self-start h-9 px-3 rounded-lg border border-fuchsia-500/40 text-fuchsia-300 text-[11px] font-semibold">
                    Dùng H1 mô phỏng (POC) — ghi vào audit
                  </button>
                </div>
              )}
            </Card>
          </div>
        </div>

        <div aria-hidden className="h-32 sm:h-20 shrink-0" />
        <div
          className="fixed bottom-0 right-0 z-30 border-t border-[#1e2433] bg-[#060b14]/95 backdrop-blur px-3 sm:px-4 pt-3 flex flex-col sm:flex-row sm:items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[left] duration-200"
          style={{ left: sidebarInset }}
        >
          <div className="min-w-0 flex-1">
            {ready ? (
              <p className="text-[12px] text-green-300 font-semibold">
                Sẵn sàng · {toInspect} tiêu chí · khoá AFC {asset.afc.revision} · BIM {asset.bim.revision} · {def.checklistRevision}
              </p>
            ) : (
              <p className="text-[11px] text-amber-300">
                Còn thiếu: {missing.join(' · ')}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={!ready}
            onClick={start}
            className="h-12 px-8 rounded-xl bg-green-500/20 border-2 border-green-500/60 text-green-300 text-[15px] font-black tracking-wider hover:bg-green-500/30 disabled:opacity-40 inline-flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Play className="w-4 h-4" /> BẮT ĐẦU NGHIỆM THU
          </button>
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
          startLabel="ĐÃ XEM LƯU Ý"
        />
      )}
    </>
  )
}
