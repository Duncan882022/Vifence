import { useMemo } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, QrCode, RefreshCw, User } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { STAGES } from '../../data/workflow/hnqnProject'
import { STAGE_PROGRESS_META } from '../../data/workflow/meta'
import { useIssues, useSessions } from '../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../store/inspectionFlow.store'
import { flowPaths, resolveAsset, type PassportTab } from '../../services/workflow/flowNav'
import { openIssues, stageProgress } from '../../services/workflow/sessionLogic'
import { stageAction } from '../../services/workflow/stageAction'
import { Breadcrumbs, Meta, PocMockBanner, TokenBadge } from '../../components/flow/FlowUi'
import { OverviewTab, StagesTab, DocumentsTab } from '../../components/flow/passport/PassportTabs'
import { BimTab } from '../../components/flow/passport/BimTab'
import { EvidenceLibrary } from '../../components/flow/passport/EvidenceLibrary'
import { IssuesPanel } from '../../components/flow/passport/IssuesPanel'
import { AssetHistory } from '../../components/flow/passport/AssetHistory'

const TABS: { id: PassportTab; label: string }[] = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'stages', label: 'STAGES' },
  { id: 'bim', label: 'BIM' },
  { id: 'evidence', label: 'EVIDENCE' },
  { id: 'documents', label: 'DOCUMENTS' },
  { id: 'issues', label: 'ISSUES' },
  { id: 'history', label: 'HISTORY' },
]

export function AssetPassportPage() {
  const { assetId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const ctx = resolveAsset(assetId)
  const sessions = useSessions()
  const issues = useIssues(assetId)
  const actor = useInspectionFlowStore(s => s.actor)
  const setActor = useInspectionFlowStore(s => s.setActor)
  const resetDemo = useInspectionFlowStore(s => s.resetDemo)
  const tab = (TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'overview') as PassportTab

  const next = useMemo(() => {
    if (!ctx) return null
    for (const st of ctx.asset.stages) {
      const a = stageAction(ctx.asset.id, st, sessions, issues)
      if (a.primary) return { stage: st, action: a }
    }
    return null
  }, [ctx, sessions, issues])

  if (!ctx) return <Navigate to={flowPaths.home()} replace />
  const { asset, structure, project } = ctx
  const open = openIssues(issues, asset.id).length
  const passed = asset.stages.filter(st => stageProgress(sessions, asset.id, st, STAGES[st].dependsOn) === 'pass').length

  return (
    <>
      <Header title="Digital Inspection Passport" subtitle={`${asset.name} · ${structure.name}`} />
      <PageLayout scrollable className="gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs items={[
            { label: 'Nghiệm thu số', to: flowPaths.home() },
            { label: project.code, to: flowPaths.project(project.id) },
            { label: structure.name, to: flowPaths.structure(project.id, structure.id) },
            { label: asset.name },
          ]} />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <User className="w-3.5 h-3.5" />
              <select
                value={actor.role}
                onChange={e => setActor(e.target.value === 'senior_inspector' ? 'senior_inspector' : 'inspector')}
                className="h-8 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-foreground"
              >
                <option value="inspector">Kỹ sư TVGS</option>
                <option value="senior_inspector">Trưởng TVGS (quyền cao)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Đặt lại dữ liệu demo? Toàn bộ phiên, bằng chứng, issue tạo trên iPad sẽ bị xoá.')) resetDemo()
              }}
              className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Đặt lại demo
            </button>
          </div>
        </div>

        <section className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-4 grid gap-4 lg:grid-cols-[auto_1fr_auto] items-center">
          <div className="w-16 h-16 rounded-lg border border-sky-500/30 bg-sky-500/5 flex flex-col items-center justify-center">
            <QrCode className="w-7 h-7 text-sky-300" />
            <span className="text-[9px] font-mono font-bold text-sky-300 mt-1">{asset.qrId}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground">{asset.name}</p>
            <p className="text-[11px] text-muted-foreground">{asset.type} · {asset.location}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
              <Meta label="AFC" value={`${asset.afc.code} ${asset.afc.revision}`} />
              <Meta label="BIM" value={`${asset.bim.label} · ${asset.bim.revision}`} />
              <Meta label="BBS" value={`${asset.bbs.code} ${asset.bbs.revision}`} />
              <Meta label="ITP / BPTC" value={`${asset.itp.code} ${asset.itp.revision} / ${asset.bptc.revision}`} />
              <Meta label="Tiến độ" value={`${passed}/${asset.stages.length} giai đoạn PASS`} />
              <Meta
                label="Issue mở"
                value={<span className={cn('inline-flex items-center gap-1', open ? 'text-red-400' : '')}><AlertTriangle className="w-3 h-3" />{open}</span>}
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {asset.stages.map(st => (
                <span key={st} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  {STAGES[st].code} {STAGES[st].label}
                  <TokenBadge token={STAGE_PROGRESS_META[stageProgress(sessions, asset.id, st, STAGES[st].dependsOn)]} size="small" />
                </span>
              ))}
            </div>
          </div>
          {next?.action.to && (
            <Link
              to={next.action.to}
              className="rounded-xl bg-green-500/15 border border-green-500/40 text-green-300 hover:bg-green-500/25 px-5 py-3 text-center"
            >
              <p className="text-[13px] font-bold">{next.action.label}</p>
              <p className="text-[10px] text-green-300/70">{STAGES[next.stage].code} {STAGES[next.stage].label} · {next.action.hint}</p>
            </Link>
          )}
        </section>

        <nav className="flex gap-1 border-b border-[#1e2433] overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setParams(t.id === 'overview' ? {} : { tab: t.id }, { replace: true })}
              className={cn(
                'px-3 py-2 text-[11px] font-bold tracking-wider border-b-2 -mb-px whitespace-nowrap',
                tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {t.id === 'issues' && open > 0 && <span className="ml-1 text-red-400">{open}</span>}
            </button>
          ))}
        </nav>

        {tab === 'overview' && <OverviewTab asset={asset} />}
        {tab === 'stages' && <StagesTab asset={asset} />}
        {tab === 'bim' && <BimTab asset={asset} />}
        {tab === 'evidence' && <EvidenceLibrary asset={asset} />}
        {tab === 'documents' && <DocumentsTab asset={asset} />}
        {tab === 'issues' && <IssuesPanel asset={asset} />}
        {tab === 'history' && <AssetHistory asset={asset} />}
        <PocMockBanner />
      </PageLayout>
    </>
  )
}
