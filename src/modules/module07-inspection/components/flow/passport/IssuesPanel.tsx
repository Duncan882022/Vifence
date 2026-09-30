import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { findCriterion } from '../../../data/workflow/criteria'
import { COMPONENTS, STAGES } from '../../../data/workflow/hnqnProject'
import { ISSUE_FLOW, ISSUE_STATUS_META } from '../../../data/workflow/meta'
import { useIssues } from '../../../hooks/useInspectionFlow'
import { useInspectionFlowStore } from '../../../store/inspectionFlow.store'
import { flowPaths } from '../../../services/workflow/flowNav'
import { formatClock } from '../../../services/workflow/ids'
import type { AssetRecord, Issue, IssueStatus } from '../../../workflow.types'
import { EvidenceMedia } from '../EvidenceMedia'
import { Card, EmptyState, formatDateTimeVn, TokenBadge } from '../FlowUi'

const NEXT: Partial<Record<IssueStatus, { to: IssueStatus; label: string; placeholder: string }>> = {
  open: { to: 'rectified', label: 'Xác nhận đã khắc phục', placeholder: 'Nhà thầu mô tả khắc phục (bổ sung 3 thanh D16, chỉnh khoảng cách...)' },
  rectified: { to: 'waiting_reinspection', label: 'Yêu cầu nghiệm thu lại', placeholder: 'Ghi chú cho TVGS' },
}

function IssueCard({ issue }: { issue: Issue }) {
  const setIssueStatus = useInspectionFlowStore(s => s.setIssueStatus)
  const snapshot = useInspectionFlowStore(s => (issue.snapshotId ? s.evidence[issue.snapshotId] : undefined))
  const [note, setNote] = useState('')
  const next = NEXT[issue.status]
  const criterion = findCriterion(issue.criterionId)
  const step = ISSUE_FLOW.indexOf(issue.status)

  return (
    <article className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex flex-col gap-2">
      <header className="flex items-center gap-2 flex-wrap">
        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
        <span className="font-mono font-bold text-[12px] text-foreground">{issue.id}</span>
        <TokenBadge token={ISSUE_STATUS_META[issue.status]} />
        <span className="text-[10px] text-muted-foreground ml-auto">{issue.responsible}</span>
      </header>
      <ol className="flex items-center gap-1">
        {ISSUE_FLOW.map((s, i) => (
          <li key={s} className={cn('flex-1 h-1 rounded', i <= step ? 'bg-primary/70' : 'bg-white/10')} title={ISSUE_STATUS_META[s].label} />
        ))}
      </ol>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <dl className="grid grid-cols-[110px_1fr] gap-y-0.5 text-[11px]">
          <dt className="text-muted-foreground">Stage / Component</dt><dd>{STAGES[issue.stage].code} {STAGES[issue.stage].label} · {COMPONENTS[issue.component].label}</dd>
          <dt className="text-muted-foreground">Criterion</dt><dd>{criterion ? `${criterion.code} ${criterion.title}` : issue.criterionId}</dd>
          <dt className="text-muted-foreground">Design</dt><dd className="font-semibold">{issue.design}</dd>
          <dt className="text-muted-foreground">Observed</dt><dd className="font-semibold text-amber-300">{issue.observed}</dd>
          <dt className="text-muted-foreground">Session / Video</dt><dd className="font-mono">{issue.sessionId} · {formatClock(issue.videoTs)}</dd>
          <dt className="text-muted-foreground">Comment</dt><dd>{issue.comment}</dd>
        </dl>
        {snapshot && <EvidenceMedia evidence={snapshot} className="w-32 h-20" />}
      </div>
      <ul className="border-t border-white/5 pt-2 flex flex-col gap-0.5">
        {issue.history.map((h, i) => (
          <li key={i} className="text-[10px] text-muted-foreground">
            <span className="font-semibold text-foreground/80">{ISSUE_STATUS_META[h.status].label}</span> · {formatDateTimeVn(h.at)} · {h.by}{h.note ? ` — ${h.note}` : ''}
          </li>
        ))}
      </ul>
      {next && (
        <div className="flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={next.placeholder} className="flex-1 h-8 rounded-lg bg-white/5 border border-white/10 px-2 text-[11px] text-foreground" />
          <button
            type="button"
            disabled={!note.trim()}
            onClick={() => {
              setIssueStatus(issue.id, next.to, note.trim())
              setNote('')
            }}
            className="h-8 px-3 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-semibold disabled:opacity-40"
          >
            {next.label}
          </button>
        </div>
      )}
      {issue.status === 'waiting_reinspection' && (
        <Link to={flowPaths.prepare(issue.assetId, issue.stage)} className="self-start h-8 inline-flex items-center px-3 rounded-lg bg-green-500/15 border border-green-500/40 text-green-300 text-[11px] font-semibold">
          Nghiệm thu lại {STAGES[issue.stage].code}
        </Link>
      )}
      {issue.status === 'closed' && issue.closedBySessionId && (
        <p className="text-[10px] text-green-400">Đóng bởi phiên {issue.closedBySessionId}</p>
      )}
    </article>
  )
}

/** §22 Issue lifecycle — không xoá issue, chỉ chuyển trạng thái có lịch sử. */
export const IssuesPanel = memo(function IssuesPanel({ asset }: { asset: AssetRecord }) {
  const issues = useIssues(asset.id)
  const sorted = [...issues].sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed') || b.id.localeCompare(a.id))
  return (
    <Card title={`Issue / Rectification · ${issues.length}`} icon={<AlertTriangle className="w-3.5 h-3.5 text-red-400" />}>
      {sorted.length === 0 ? (
        <EmptyState icon={<AlertTriangle className="w-6 h-6" />} title="Chưa có issue" hint="Issue được tạo từ màn Inspection Review khi phát hiện sai lệch." />
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">{sorted.map(i => <IssueCard key={i.id} issue={i} />)}</div>
      )}
    </Card>
  )
})
