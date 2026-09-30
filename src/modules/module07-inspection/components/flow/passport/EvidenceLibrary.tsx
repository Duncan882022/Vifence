import { memo, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Download, FileText, Filter, Mic, Play, Ruler, Search } from 'lucide-react'
import { cn } from '@/utils/cn'
import { CRITERIA, findCriterion } from '../../../data/workflow/criteria'
import { COMPONENTS, STAGES } from '../../../data/workflow/hnqnProject'
import { AI_VERDICT_META, CRITERION_STATUS_META } from '../../../data/workflow/meta'
import { useEvidence, useIssues, useSessions } from '../../../hooks/useInspectionFlow'
import { flowPaths } from '../../../services/workflow/flowNav'
import { formatClock } from '../../../services/workflow/ids'
import { sessionsFor } from '../../../services/workflow/sessionLogic'
import type { AssetRecord, ComponentId, CriterionStatus, Evidence, InspectionSession, StageCode } from '../../../workflow.types'
import { EvidenceMedia } from '../EvidenceMedia'
import { buildMarkers, EvidenceVideoPlayer } from '../EvidenceVideoPlayer'
import { Card, EmptyState, formatDateTimeVn, TokenBadge } from '../FlowUi'

type LibraryKind = 'full_video' | 'video_evidence' | 'snapshot' | 'ai' | 'voice' | 'measurement' | 'report'

const KIND_LABEL: Record<LibraryKind, string> = {
  full_video: 'Full video',
  video_evidence: 'Video evidence',
  snapshot: 'Snapshot',
  ai: 'AI evidence',
  voice: 'Voice',
  measurement: 'Measurement / Test',
  report: 'Report',
}

interface LibraryItem {
  id: string
  kind: LibraryKind
  label: string
  session: InspectionSession
  stage: StageCode
  component?: ComponentId
  criterionId?: string
  at: string
  videoTs: number
  videoTo?: number
  result?: CriterionStatus
  evidence?: Evidence
  aiVerdict?: keyof typeof AI_VERDICT_META
}

const KIND_ICON: Record<LibraryKind, typeof Camera> = {
  full_video: Play,
  video_evidence: Play,
  snapshot: Camera,
  ai: Camera,
  voice: Mic,
  measurement: Ruler,
  report: FileText,
}

function buildItems(sessions: InspectionSession[], evidence: Evidence[]): LibraryItem[] {
  const items: LibraryItem[] = []
  for (const s of sessions) {
    items.push({ id: `video-${s.id}`, kind: 'full_video', label: `Video H1 toàn phiên · ${s.helmetId}`, session: s, stage: s.stage, at: s.startedAt, videoTs: 0 })
    for (const f of s.ai?.findings ?? []) {
      const status = s.reviews[f.id]?.finalStatus ?? s.results[f.criterionId]?.status
      items.push({
        id: `clip-${f.id}`,
        kind: f.verdict === 'pass_candidate' ? 'video_evidence' : 'ai',
        label: `${findCriterion(f.criterionId)?.code ?? ''} ${f.summary}`,
        session: s,
        stage: s.stage,
        component: f.component,
        criterionId: f.criterionId,
        at: s.finishedAt ?? s.startedAt,
        videoTs: f.videoFrom,
        videoTo: f.videoTo,
        result: status,
        aiVerdict: f.verdict,
      })
    }
    if (s.signOff) {
      items.push({ id: `report-${s.id}`, kind: 'report', label: `Biên bản nghiệm thu ${s.id}`, session: s, stage: s.stage, at: s.signOff.at, videoTs: 0 })
    }
  }
  for (const e of evidence) {
    const s = sessions.find(x => x.id === e.ctx.sessionId)
    if (!s) continue
    items.push({
      id: e.id,
      kind: e.type === 'snapshot' ? 'snapshot' : e.type === 'voice' ? 'voice' : 'measurement',
      label: e.label,
      session: s,
      stage: e.ctx.stage,
      component: e.ctx.component,
      criterionId: e.ctx.criterionId,
      at: e.ctx.timestamp,
      videoTs: e.ctx.videoTs,
      videoTo: e.videoTo,
      result: e.ctx.criterionId ? s.results[e.ctx.criterionId]?.status : undefined,
      evidence: e,
    })
  }
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

const selectClass = 'h-8 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-foreground'

/** §27 Evidence Library + §28 video seek. */
export const EvidenceLibrary = memo(function EvidenceLibrary({ asset, sessionId }: { asset: AssetRecord; sessionId?: string }) {
  const allSessions = useSessions()
  const sessions = useMemo(() => sessionsFor(allSessions, asset.id).filter(s => !sessionId || s.id === sessionId), [allSessions, asset.id, sessionId])
  const evidence = useEvidence({ assetId: asset.id, sessionId })
  const issues = useIssues(asset.id)
  const [kind, setKind] = useState<LibraryKind | 'all'>('all')
  const [stage, setStage] = useState<StageCode | 'all'>('all')
  const [component, setComponent] = useState<ComponentId | 'all'>('all')
  const [criterion, setCriterion] = useState('all')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [date, setDate] = useState('')
  const [result, setResult] = useState<CriterionStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [seek, setSeek] = useState<{ sec: number; nonce: number } | null>(null)

  const items = useMemo(() => buildItems(sessions, evidence), [sessions, evidence])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(i =>
      (kind === 'all' || i.kind === kind)
      && (stage === 'all' || i.stage === stage)
      && (component === 'all' || i.component === component)
      && (criterion === 'all' || i.criterionId === criterion)
      && (sessionFilter === 'all' || i.session.id === sessionFilter)
      && (!date || i.at.slice(0, 10) === date)
      && (result === 'all' || i.result === result)
      && (!q || `${i.label} ${i.session.id} ${i.criterionId ?? ''}`.toLowerCase().includes(q)))
  }, [items, kind, stage, component, criterion, sessionFilter, date, result, query])

  const selected = filtered.find(i => i.id === selectedId) ?? filtered.find(i => i.kind !== 'report') ?? null
  const markers = useMemo(
    () => (selected ? buildMarkers(selected.session, evidence, selected.session.ai?.findings ?? [], issues) : []),
    [selected, evidence, issues],
  )
  const criteriaOptions = CRITERIA.filter(c => stage === 'all' || c.stage === stage)
  const selectedKey = selected?.id
  const selectedTs = selected?.videoTs
  useEffect(() => {
    if (selectedTs != null) setSeek({ sec: selectedTs, nonce: Date.now() })
  }, [selectedKey, selectedTs])

  const choose = (item: LibraryItem) => {
    setSelectedId(item.id)
    setSeek({ sec: item.videoTs, nonce: Date.now() })
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <Card
        title={`Evidence Library · ${filtered.length}/${items.length}`}
        icon={<Filter className="w-3.5 h-3.5 text-primary" />}
        bodyClassName="flex flex-col gap-2"
      >
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-1.5">
          <select value={kind} onChange={e => setKind(e.target.value as LibraryKind | 'all')} className={selectClass}>
            <option value="all">Mọi loại</option>
            {(Object.keys(KIND_LABEL) as LibraryKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <select value={stage} onChange={e => { setStage(e.target.value as StageCode | 'all'); setCriterion('all') }} className={selectClass}>
            <option value="all">Mọi giai đoạn</option>
            {asset.stages.map(s => <option key={s} value={s}>{STAGES[s].code} {STAGES[s].label}</option>)}
          </select>
          <select value={component} onChange={e => setComponent(e.target.value as ComponentId | 'all')} className={selectClass}>
            <option value="all">Mọi component</option>
            {(Object.keys(COMPONENTS) as ComponentId[]).map(c => <option key={c} value={c}>{COMPONENTS[c].label}</option>)}
          </select>
          <select value={criterion} onChange={e => setCriterion(e.target.value)} className={selectClass}>
            <option value="all">Mọi tiêu chí</option>
            {criteriaOptions.map(c => <option key={c.id} value={c.id}>{STAGES[c.stage].code} {c.code} {c.title}</option>)}
          </select>
          {!sessionId && (
            <select value={sessionFilter} onChange={e => setSessionFilter(e.target.value)} className={selectClass}>
              <option value="all">Mọi phiên</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
          )}
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={selectClass} />
          <select value={result} onChange={e => setResult(e.target.value as CriterionStatus | 'all')} className={selectClass}>
            <option value="all">Mọi kết quả</option>
            {(Object.keys(CRITERION_STATUS_META) as CriterionStatus[]).map(r => <option key={r} value={r}>{CRITERION_STATUS_META[r].label}</option>)}
          </select>
          <label className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm" className={cn(selectClass, 'w-full pl-7')} />
          </label>
        </div>
        <ul className="flex flex-col gap-1 max-h-[52vh] overflow-y-auto pr-1">
          {filtered.map(item => {
            const Icon = KIND_ICON[item.kind]
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => choose(item)}
                  className={cn(
                    'w-full text-left rounded-lg border px-2.5 py-2 flex items-start gap-2',
                    selected?.id === item.id ? 'border-primary/50 bg-primary/10' : 'border-white/5 hover:border-white/15',
                  )}
                >
                  <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-foreground truncate">{item.label}</p>
                    <p className="text-[9px] text-muted-foreground truncate">
                      {KIND_LABEL[item.kind]} · {item.session.id} · {STAGES[item.stage].code}
                      {item.component ? ` · ${COMPONENTS[item.component].label}` : ''}
                      {item.kind !== 'report' ? ` · ${formatClock(item.videoTs)}${item.videoTo != null ? `–${formatClock(item.videoTo)}` : ''}` : ''}
                    </p>
                  </div>
                  {item.aiVerdict && <TokenBadge token={AI_VERDICT_META[item.aiVerdict]} size="small" />}
                  {item.result && <TokenBadge token={CRITERION_STATUS_META[item.result]} size="small" />}
                </button>
              </li>
            )
          })}
          {filtered.length === 0 && <EmptyState title="Không có bằng chứng khớp bộ lọc" />}
        </ul>
      </Card>
      <Card title={selected ? selected.label : 'Xem lại'} icon={<Play className="w-3.5 h-3.5 text-primary" />} bodyClassName="flex flex-col gap-3">
        {selected ? (
          <>
            {selected.kind === 'report' ? (
              <Link to={flowPaths.report(selected.session.id)} className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline">
                <Download className="w-3.5 h-3.5" /> Mở biên bản {selected.session.id}
              </Link>
            ) : (
              <EvidenceVideoPlayer session={selected.session} markers={markers} seek={seek} />
            )}
            {selected.evidence && <EvidenceMedia evidence={selected.evidence} className="max-h-60 w-full" />}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <dt className="text-muted-foreground">Project → Asset</dt><dd className="text-foreground">HN–QN → {asset.name}</dd>
              <dt className="text-muted-foreground">Stage / Component</dt><dd className="text-foreground">{STAGES[selected.stage].code}{selected.component ? ` · ${COMPONENTS[selected.component].label}` : ''}</dd>
              <dt className="text-muted-foreground">Criterion</dt><dd className="text-foreground">{selected.criterionId ? `${findCriterion(selected.criterionId)?.code} ${findCriterion(selected.criterionId)?.title}` : '—'}</dd>
              <dt className="text-muted-foreground">Session / Helmet</dt><dd className="text-foreground">{selected.session.id} · {selected.session.helmetId}{selected.session.simulatedH1 ? ' (mô phỏng)' : ''}</dd>
              <dt className="text-muted-foreground">Timestamp</dt><dd className="text-foreground">{formatDateTimeVn(selected.at)}</dd>
              <dt className="text-muted-foreground">Video</dt><dd className="text-foreground font-mono">{formatClock(selected.videoTs)}{selected.videoTo != null ? ` – ${formatClock(selected.videoTo)}` : ''}</dd>
            </dl>
          </>
        ) : (
          <EmptyState icon={<Play className="w-6 h-6" />} title="Chọn bằng chứng để xem lại" />
        )}
      </Card>
    </div>
  )
})
