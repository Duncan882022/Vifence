import { memo, useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, BookOpen, Camera, ClipboardList, FileText, Search } from 'lucide-react'
import { cn } from '@/utils/cn'
import { criteriaForStage } from '../../../data/workflow/criteria'
import { COMPONENTS, DOCUMENTS, STAGES } from '../../../data/workflow/hnqnProject'
import { DOC_KIND_LABEL, DOC_STATUS_META, ISSUE_STATUS_META, SIGNOFF_META, STAGE_PROGRESS_META } from '../../../data/workflow/meta'
import { useIssues, useSessions } from '../../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../../store/inspectionFlow.store'
import { flowPaths } from '../../../services/workflow/flowNav'
import { openIssues, sessionResumeStep, sessionsFor, stageProgress } from '../../../services/workflow/sessionLogic'
import { stageAction } from '../../../services/workflow/stageAction'
import type { AssetRecord, ComponentId, InspectionBrief, InspectionSession, StageCode } from '../../../workflow.types'
import { Card, formatDateTimeVn, SourceBadge, TokenBadge } from '../FlowUi'
import { InspectionBriefDialog } from '../InspectionBriefDialog'

function StageCardAction({ asset, stage }: { asset: AssetRecord; stage: StageCode }) {
  const sessions = useSessions()
  const issues = useIssues(asset.id)
  const action = stageAction(asset.id, stage, sessions, issues)
  if (!action.to) return <span className="text-[10px] text-muted-foreground">{action.hint}</span>
  return (
    <Link
      to={action.to}
      className={cn(
        'h-8 inline-flex items-center rounded-lg px-3 text-[11px] font-semibold border',
        action.primary ? 'bg-green-500/15 border-green-500/40 text-green-300 hover:bg-green-500/25' : 'border-white/10 text-muted-foreground hover:text-foreground',
      )}
    >
      {action.label}
    </Link>
  )
}

function sessionLink(s: InspectionSession): string {
  const step = sessionResumeStep(s)
  if (step === 'live') return flowPaths.live(s.id)
  if (step === 'finish') return flowPaths.finish(s.id)
  if (step === 'review') return flowPaths.review(s.id)
  return flowPaths.report(s.id)
}

export const OverviewTab = memo(function OverviewTab({ asset }: { asset: AssetRecord }) {
  const sessions = useSessions()
  const issues = useIssues(asset.id)
  const open = openIssues(issues, asset.id)
  const recent = sessionsFor(sessions, asset.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5)

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card title="Giai đoạn nghiệm thu" icon={<BookOpen className="w-3.5 h-3.5 text-primary" />}>
        <ol className="flex flex-col gap-2">
          {asset.stages.map(st => {
            const def = STAGES[st]
            const progress = stageProgress(sessions, asset.id, st, def.dependsOn)
            const count = criteriaForStage(st).length
            return (
              <li key={st} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className="w-12 text-[12px] font-bold text-foreground">{def.code}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-foreground">{def.label} <span className="text-muted-foreground font-normal">· {def.labelEn}</span></p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {def.components.map(c => COMPONENTS[c].label).join(' · ')} · {count} tiêu chí
                  </p>
                </div>
                <TokenBadge token={STAGE_PROGRESS_META[progress]} />
                <StageCardAction asset={asset} stage={st} />
              </li>
            )
          })}
        </ol>
      </Card>
      <div className="flex flex-col gap-3">
        <Card title={`Issue đang mở · ${open.length}`} icon={<AlertTriangle className="w-3.5 h-3.5 text-red-400" />}>
          {open.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Không có issue mở.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {open.map(i => (
                <li key={i.id} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono font-semibold text-foreground">{i.id}</span>
                  <span className="text-muted-foreground truncate flex-1">{STAGES[i.stage].code} · {COMPONENTS[i.component].label}</span>
                  <TokenBadge token={ISSUE_STATUS_META[i.status]} size="small" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Phiên gần đây" icon={<Camera className="w-3.5 h-3.5 text-primary" />}>
          <ul className="flex flex-col gap-1.5">
            {recent.map(s => (
              <li key={s.id}>
                <Link to={sessionLink(s)} className="flex items-center gap-2 text-[11px] hover:text-foreground">
                  <span className="font-mono font-semibold text-foreground">{s.id}</span>
                  <span className="text-muted-foreground flex-1 truncate">{formatDateTimeVn(s.startedAt)}</span>
                  {s.signOff ? <TokenBadge token={SIGNOFF_META[s.signOff.result]} size="small" /> : <span className="text-[9px] text-sky-400">{s.status.toUpperCase()}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
})

export const StagesTab = memo(function StagesTab({ asset }: { asset: AssetRecord }) {
  const sessions = useSessions()
  const issues = useIssues(asset.id)
  const navigate = useNavigate()
  const [brief, setBrief] = useState<{ stage: StageCode; component: ComponentId } | null>(null)
  const briefAction = brief ? stageAction(asset.id, brief.stage, sessions, issues) : null
  const prepareTo = brief ? flowPaths.prepare(asset.id, brief.stage) : ''
  const canStart = briefAction?.to === prepareTo
  const log = useInspectionFlowStore(s => s.log)
  const onBriefStart = useCallback((b: InspectionBrief) => {
    log('brief.view', asset.id, `${b.id} · ${b.version} · ${b.requirements.length} yêu cầu`)
    navigate(`${flowPaths.prepare(asset.id, b.stage)}?brief=${b.component}`)
  }, [navigate, asset.id, log])

  return (
    <>
    {brief && (
      <InspectionBriefDialog
        open
        onOpenChange={o => { if (!o) setBrief(null) }}
        assetId={asset.id}
        stage={brief.stage}
        component={brief.component}
        onComponentChange={c => setBrief({ stage: brief.stage, component: c })}
        onStart={onBriefStart}
        startDisabledHint={canStart ? undefined : `Chưa thể bắt đầu · ${briefAction?.hint ?? ''}`}
      />
    )}
    <div className="grid gap-3 xl:grid-cols-2">
      {asset.stages.map(st => {
        const def = STAGES[st]
        const criteria = criteriaForStage(st)
        const list = sessionsFor(sessions, asset.id, st)
        return (
          <Card
            key={st}
            title={`${def.code} ${def.label}`}
            right={<TokenBadge token={STAGE_PROGRESS_META[stageProgress(sessions, asset.id, st, def.dependsOn)]} />}
          >
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-muted-foreground">
              <span>Checklist {def.checklistRevision}</span>
              <span>{criteria.filter(c => c.group === 'quantity').length} khối lượng · {criteria.filter(c => c.group === 'quality').length} chất lượng</span>
              {def.dependsOn && <span>Phụ thuộc {STAGES[def.dependsOn].label}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1"><ClipboardList className="w-3 h-3" /> Lưu ý nghiệm thu:</span>
              {def.components.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBrief({ stage: st, component: c })}
                  className="h-7 px-2 rounded-md border border-white/10 text-[11px] text-foreground/90 hover:border-primary/50 hover:text-foreground"
                >
                  {COMPONENTS[c].label}
                </button>
              ))}
            </div>
            {def.holdPoints.map(hp => <p key={hp.id} className="text-[10px] text-red-300/80 mt-1">{hp.label}</p>)}
            <table className="w-full mt-3 text-[11px]">
              <tbody>
                {list.map(s => (
                  <tr key={s.id} className="border-t border-white/5">
                    <td className="py-1.5 font-mono font-semibold text-foreground">{s.id}</td>
                    <td className="py-1.5 text-muted-foreground">#{s.attempt}</td>
                    <td className="py-1.5 text-muted-foreground">{formatDateTimeVn(s.startedAt)}</td>
                    <td className="py-1.5">{s.signOff ? <TokenBadge token={SIGNOFF_META[s.signOff.result]} size="small" /> : <span className="text-[9px] text-sky-400">{s.status.toUpperCase()}</span>}</td>
                    <td className="py-1.5 text-right"><Link to={sessionLink(s)} className="text-primary hover:underline">Mở</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end"><StageCardAction asset={asset} stage={st} /></div>
          </Card>
        )
      })}
    </div>
    </>
  )
})

export const DocumentsTab = memo(function DocumentsTab({ asset }: { asset: AssetRecord }) {
  const [query, setQuery] = useState('')
  const docs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return DOCUMENTS.filter(d => !q || `${d.code} ${d.title} ${d.kind}`.toLowerCase().includes(q))
  }, [query])
  return (
    <Card
      title={`Tài liệu liên kết · ${asset.code}`}
      icon={<FileText className="w-3.5 h-3.5 text-primary" />}
      right={(
        <label className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm tài liệu" className="h-8 w-44 rounded-lg bg-white/5 border border-white/10 pl-7 pr-2 text-[11px] text-foreground focus:outline-none" />
        </label>
      )}
    >
      <table className="w-full text-[11px]">
        <thead className="text-[9px] uppercase tracking-wide text-muted-foreground text-left">
          <tr><th className="py-1">Loại</th><th>Mã</th><th>Tên</th><th>Rev</th><th>GĐ</th><th>Nguồn</th><th>Trạng thái</th><th>Ngày</th></tr>
        </thead>
        <tbody>
          {docs.map(d => (
            <tr key={d.id} className="border-t border-white/5">
              <td className="py-1.5 text-muted-foreground">{DOC_KIND_LABEL[d.kind]}</td>
              <td className="font-mono text-foreground">{d.code}</td>
              <td className="text-foreground/90">{d.title}</td>
              <td>{d.revision}</td>
              <td>{d.stage ? STAGES[d.stage].code : '—'}</td>
              <td><SourceBadge source={d.source} /></td>
              <td><TokenBadge token={DOC_STATUS_META[d.status]} size="small" /></td>
              <td className="text-muted-foreground">{d.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
})
