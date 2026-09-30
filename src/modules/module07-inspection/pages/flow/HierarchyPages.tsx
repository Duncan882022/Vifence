import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, BookOpen, Building2, ChevronRight, QrCode, Search } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { ASSETS, PROJECTS, STAGES, STRUCTURES } from '../../data/workflow/hnqnProject'
import { STAGE_PROGRESS_META } from '../../data/workflow/meta'
import { useIssues, useSessions } from '../../hooks/useInspectionFlow'
import { flowPaths } from '../../services/workflow/flowNav'
import { latestSession, openIssues, stageProgress } from '../../services/workflow/sessionLogic'
import type { AssetRecord } from '../../workflow.types'
import { Breadcrumbs, Card, formatDateTimeVn, Meta, TokenBadge } from '../../components/flow/FlowUi'

function HierarchyTile({ to, eyebrow, title, subtitle, children }: {
  to: string
  eyebrow: string
  title: string
  subtitle: string
  children?: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="group rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-4 hover:border-primary/50 transition-colors flex flex-col gap-2"
    >
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-foreground">{title}</p>
          <p className="text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 mt-1" />
      </div>
      {children}
    </Link>
  )
}

export function ProjectsPage() {
  return (
    <>
      <Header title="Digital Inspection" subtitle="Bước 1 · Chọn dự án" />
      <PageLayout scrollable>
        <Breadcrumbs items={[{ label: 'Nghiệm thu số' }]} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PROJECTS.map(p => {
            const structures = STRUCTURES.filter(s => s.projectId === p.id)
            return (
              <HierarchyTile key={p.id} to={flowPaths.project(p.id)} eyebrow="Project" title={p.code} subtitle={p.name}>
                <div className="flex gap-5 text-[11px] mt-2">
                  <Meta label="Chủ đầu tư" value={p.owner} />
                  <Meta label="Công trình" value={structures.length} />
                </div>
              </HierarchyTile>
            )
          })}
        </div>
      </PageLayout>
    </>
  )
}

export function StructuresPage() {
  const { projectId = '' } = useParams()
  const project = PROJECTS.find(p => p.id === projectId)
  if (!project) return <Navigate to={flowPaths.home()} replace />
  const structures = STRUCTURES.filter(s => s.projectId === project.id)
  return (
    <>
      <Header title="Digital Inspection" subtitle="Bước 2 · Chọn công trình" />
      <PageLayout scrollable>
        <Breadcrumbs items={[{ label: 'Nghiệm thu số', to: flowPaths.home() }, { label: project.code }]} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {structures.map(s => (
            <HierarchyTile key={s.id} to={flowPaths.structure(project.id, s.id)} eyebrow="Structure" title={s.name} subtitle={s.kind}>
              <div className="flex gap-5 text-[11px] mt-2">
                <Meta label="Mã" value={s.code} />
                <Meta label="Hạng mục" value={ASSETS.filter(a => a.structureId === s.id).length} />
              </div>
            </HierarchyTile>
          ))}
        </div>
      </PageLayout>
    </>
  )
}

function AssetRow({ asset }: { asset: AssetRecord }) {
  const sessions = useSessions()
  const issues = useIssues(asset.id)
  const progress = asset.stages.map(st => stageProgress(sessions, asset.id, st, STAGES[st].dependsOn))
  const passed = progress.filter(p => p === 'pass').length
  const pct = Math.round((passed / asset.stages.length) * 100)
  const open = openIssues(issues, asset.id).length
  const last = asset.stages
    .map(st => latestSession(sessions, asset.id, st))
    .filter(Boolean)
    .sort((a, b) => (b?.startedAt ?? '').localeCompare(a?.startedAt ?? ''))[0]

  return (
    <Link
      to={flowPaths.asset(asset.id)}
      className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_auto] gap-4 items-center rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-3 hover:border-primary/50 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-bold text-foreground">{asset.name}</p>
          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-sky-300 border border-sky-500/30 rounded px-1.5 py-0.5">
            <QrCode className="w-3 h-3" />{asset.qrId}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{asset.type} · {asset.location}</p>
        <div className="mt-2 h-1.5 rounded bg-white/5 overflow-hidden">
          <div className="h-full bg-green-400/70" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[9px] text-muted-foreground mt-1">{passed}/{asset.stages.length} giai đoạn PASS · {pct}%</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {asset.stages.map((st, i) => (
          <span key={st} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            {STAGES[st].code}
            <TokenBadge token={STAGE_PROGRESS_META[progress[i]]} size="small" />
          </span>
        ))}
      </div>
      <div className="flex flex-col items-end gap-1 text-[10px]">
        <span className={cn('inline-flex items-center gap-1 font-semibold', open ? 'text-red-400' : 'text-muted-foreground')}>
          <AlertTriangle className="w-3 h-3" />{open} issue mở
        </span>
        <span className="text-muted-foreground">{last ? `${last.id} · ${formatDateTimeVn(last.startedAt)}` : 'Chưa nghiệm thu'}</span>
      </div>
    </Link>
  )
}

export function AssetsPage() {
  const { projectId = '', structureId = '' } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const project = PROJECTS.find(p => p.id === projectId)
  const structure = STRUCTURES.find(s => s.id === structureId && s.projectId === projectId)
  const assets = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ASSETS.filter(a => a.structureId === structureId)
      .filter(a => !q || `${a.code} ${a.name} ${a.qrId}`.toLowerCase().includes(q))
  }, [structureId, query])

  if (!project || !structure) return <Navigate to={flowPaths.home()} replace />

  return (
    <>
      <Header title="Digital Inspection" subtitle="Bước 3 · Chọn hạng mục" />
      <PageLayout scrollable>
        <Breadcrumbs items={[
          { label: 'Nghiệm thu số', to: flowPaths.home() },
          { label: project.code, to: flowPaths.project(project.id) },
          { label: structure.name },
        ]} />
        <Card
          title={`Hạng mục · ${structure.name}`}
          icon={<Building2 className="w-3.5 h-3.5 text-primary" />}
          right={(
            <label className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && assets.length === 1) navigate(flowPaths.asset(assets[0].id))
                }}
                placeholder="Tìm mã / QR"
                className="h-8 w-48 rounded-lg bg-white/5 border border-white/10 pl-7 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </label>
          )}
        >
          <div className="flex flex-col gap-2">
            {assets.map(a => <AssetRow key={a.id} asset={a} />)}
            {assets.length === 0 && <p className="text-[11px] text-muted-foreground py-6 text-center">Không có hạng mục khớp “{query}”</p>}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground flex items-center gap-1">
            <BookOpen className="w-3 h-3" /> Mỗi hạng mục có QR riêng — QR chỉ xác định hạng mục, không xác định từng cấu kiện.
          </p>
        </Card>
      </PageLayout>
    </>
  )
}
