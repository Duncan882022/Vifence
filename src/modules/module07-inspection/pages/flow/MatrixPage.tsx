import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, BookOpen, QrCode, RefreshCw, ScanLine, User } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/utils/cn'
import { ASSETS, COMPONENTS, MATRIX_ROWS, STAGE_ORDER, STAGES } from '../../data/workflow/hnqnProject'
import { useIssues, useSessions } from '../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../store/inspectionFlow.store'
import { findAssetByQr, flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { inspectionOpenPlan, matrixCell, matrixSummary, type MatrixCellKind } from '../../services/workflow/componentMatrix'
import type { ComponentId, StageCode } from '../../workflow.types'
import { QrScannerPanel } from '../../components/flow/QrScannerPanel'

const CELL_STYLE: Record<MatrixCellKind, string> = {
  na: 'text-muted-foreground/40 cursor-default',
  locked: 'text-muted-foreground/50 cursor-not-allowed',
  waiting: 'text-sky-300 border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/15',
  in_progress: 'text-sky-200 border-sky-400/50 bg-sky-500/15 hover:bg-sky-500/25',
  pass: 'text-green-300 border-green-500/30 bg-green-500/10 hover:bg-green-500/20',
  fail: 'text-red-300 border-red-500/40 bg-red-500/10 hover:bg-red-500/20',
}

function cellLabel(kind: MatrixCellKind, checked: number, total: number, fail: number): string {
  if (kind === 'na') return '—'
  if (kind === 'locked') return '·'
  if (kind === 'fail') return fail > 0 ? `${fail} lỗi` : 'Không đạt'
  if (kind === 'in_progress') return `${checked}/${total}`
  if (kind === 'pass') return 'Đạt'
  return 'Chờ'
}

export function MatrixPage() {
  const { assetId: paramId } = useParams()
  const navigate = useNavigate()
  const assetId = paramId || ASSETS[0]?.id || ''
  const ctx = resolveAsset(assetId)
  const sessions = useSessions()
  const issues = useIssues(assetId)
  const actor = useInspectionFlowStore(s => s.actor)
  const setActor = useInspectionFlowStore(s => s.setActor)
  const resetDemo = useInspectionFlowStore(s => s.resetDemo)
  const startSession = useInspectionFlowStore(s => s.startSession)
  const log = useInspectionFlowStore(s => s.log)
  const [qrOpen, setQrOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const summary = useMemo(
    () => (ctx ? matrixSummary(sessions, issues, ctx.asset.id, ctx.asset.stages) : null),
    [ctx, sessions, issues],
  )

  const openCell = useCallback((stage: StageCode, component: ComponentId) => {
    if (!ctx) return
    const plan = inspectionOpenPlan(ctx.asset, stage, component, sessions, issues)
    if (plan.action === 'blocked') {
      setToast(plan.hint)
      window.setTimeout(() => setToast(null), 2200)
      return
    }
    if (plan.action === 'resume') {
      navigate(flowPaths.inspect(plan.sessionId, component))
      return
    }
    if (plan.action === 'sign') {
      navigate(flowPaths.sign(plan.sessionId))
      return
    }
    const id = startSession({
      assetId: ctx.asset.id,
      stage,
      qr: { value: ctx.asset.qrId, method: 'manual', verifiedAt: new Date().toISOString() },
      simulatedH1: true,
      focusComponent: component,
      scope: plan.scope,
    })
    navigate(flowPaths.inspect(id, component))
  }, [ctx, issues, navigate, sessions, startSession])

  const onQr = useCallback((value: string, method: 'camera' | 'manual') => {
    const asset = findAssetByQr(value)
    if (!asset) {
      setToast(`Mã ${value} không khớp hạng mục`)
      return
    }
    log('qr.verify', asset.id, `${value} (${method}) = ${asset.qrId}`)
    setQrOpen(false)
    navigate(flowPaths.asset(asset.id))
  }, [log, navigate])

  if (!ctx) return <Navigate to={flowPaths.home()} replace />
  const { asset, structure, project } = ctx
  const rows = MATRIX_ROWS.filter(id => asset.stages.some(st => STAGES[st].components.includes(id)))

  return (
    <>
      <Header title="Nghiệm thu" subtitle={`${asset.name} · ${structure.name}`} />
      <PageLayout scrollable className="gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground truncate">{asset.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{project.code} · {asset.location}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <User className="w-3.5 h-3.5" />
              <select
                value={actor.role}
                onChange={e => setActor(e.target.value === 'senior_inspector' ? 'senior_inspector' : 'inspector')}
                className="h-8 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-foreground"
              >
                <option value="inspector">Kỹ sư TVGS</option>
                <option value="senior_inspector">Trưởng TVGS</option>
              </select>
            </label>
            <Link
              to={flowPaths.bim(asset.id)}
              className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] font-bold text-foreground hover:border-primary/50"
            >
              <BookOpen className="w-3.5 h-3.5" /> Xem BIM
            </Link>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 text-[11px] font-bold text-sky-300"
            >
              <ScanLine className="w-3.5 h-3.5" /> Quét QR
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Xóa phiên và bằng chứng trên máy này?')) resetDemo()
              }}
              className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Đặt lại
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryTile label="Chờ nghiệm thu" value={summary?.waiting ?? 0} tone="sky" />
          <SummaryTile label="Chờ ký" value={summary?.signing ?? 0} tone="amber" />
          <SummaryTile label="Không đạt" value={summary?.failing ?? 0} tone="red" />
          <SummaryTile label="Lỗi chưa đóng" value={summary?.openIssues ?? 0} tone="red" icon />
        </div>

        <div className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-[#1e2433]">
                <th className="text-left p-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-44">Cấu phần</th>
                {STAGE_ORDER.filter(st => asset.stages.includes(st)).map(st => (
                  <th key={st} className="p-3 text-[11px] font-bold text-foreground text-center">{STAGES[st].label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(cid => (
                <tr key={cid} className="border-b border-white/5 last:border-0">
                  <td className="p-3 font-semibold text-foreground">{COMPONENTS[cid].label}</td>
                  {STAGE_ORDER.filter(st => asset.stages.includes(st)).map(st => {
                    const cell = matrixCell(sessions, asset.id, st, cid)
                    const clickable = cell.kind !== 'na' && cell.kind !== 'locked'
                    return (
                      <td key={st} className="p-2 text-center">
                        <button
                          type="button"
                          disabled={!clickable}
                          title={cell.hint}
                          onClick={() => openCell(st, cid)}
                          className={cn(
                            'w-full min-h-11 rounded-lg border text-[11px] font-bold px-2',
                            CELL_STYLE[cell.kind],
                          )}
                        >
                          {cellLabel(cell.kind, cell.checked, cell.total, cell.fail)}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <p>Đạt · Đang làm · Lỗi · Chờ · · Chưa tới · — Không áp dụng</p>
          <p>{asset.afc.code} {asset.afc.revision} · {asset.itp.code} {asset.itp.revision}</p>
        </div>
        {toast && (
          <p className="text-[12px] text-amber-300 inline-flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />{toast}
          </p>
        )}
      </PageLayout>

      <Sheet open={qrOpen} onOpenChange={setQrOpen}>
        <SheetContent side="center" className="p-4 sm:p-5 max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="inline-flex items-center gap-2"><QrCode className="w-4 h-4" /> Quét QR hạng mục</SheetTitle>
          </SheetHeader>
          {qrOpen && <QrScannerPanel onResult={onQr} />}
        </SheetContent>
      </Sheet>
    </>
  )
}

function SummaryTile({ label, value, tone, icon }: { label: string; value: number; tone: 'sky' | 'amber' | 'red'; icon?: boolean }) {
  const color = tone === 'sky' ? 'text-sky-300' : tone === 'amber' ? 'text-amber-300' : 'text-red-300'
  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-bold inline-flex items-center gap-1', color)}>
        {icon && <AlertTriangle className="w-4 h-4" />}
        {value}
      </p>
    </div>
  )
}
