import { memo, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { cn } from '@/utils/cn'
import { STAGES } from '../../../data/workflow/hnqnProject'
import { ISSUE_STATUS_META, SIGNOFF_META, STAGE_PROGRESS_META } from '../../../data/workflow/meta'
import { useAudit, useIssues, useSessions } from '../../../hooks/useInspectionFlow'
import { sessionsFor, stageProgress } from '../../../services/workflow/sessionLogic'
import type { AssetRecord } from '../../../workflow.types'
import { Card, formatDateTimeVn, TokenBadge } from '../FlowUi'

/** §29 Asset history — theo giai đoạn, kèm audit trail. */
export const AssetHistory = memo(function AssetHistory({ asset }: { asset: AssetRecord }) {
  const sessions = useSessions()
  const issues = useIssues(asset.id)
  const audit = useAudit(asset.id)
  const [showAudit, setShowAudit] = useState(false)
  const auditSorted = useMemo(() => [...audit].sort((a, b) => b.at.localeCompare(a.at)), [audit])

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card title="Lịch sử nghiệm thu" icon={<History className="w-3.5 h-3.5 text-primary" />}>
        <ol className="flex flex-col gap-3">
          {asset.stages.map(st => {
            const list = sessionsFor(sessions, asset.id, st)
            const stIssues = issues.filter(i => i.stage === st)
            const progress = stageProgress(sessions, asset.id, st, STAGES[st].dependsOn)
            return (
              <li key={st} className="border-l-2 border-white/10 pl-3">
                <p className="text-[12px] font-bold text-foreground flex items-center gap-2">
                  {STAGES[st].code} {STAGES[st].label}
                  {list.length === 0 && <TokenBadge token={STAGE_PROGRESS_META[progress]} size="small" />}
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {list.map(s => (
                    <li key={s.id} className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono text-foreground">#{String(s.attempt).padStart(3, '0')}</span>
                      <span className="text-muted-foreground">{s.id}</span>
                      {s.signOff ? <TokenBadge token={SIGNOFF_META[s.signOff.result]} size="small" /> : <span className="text-[9px] text-sky-400">{s.status.toUpperCase()}</span>}
                      <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTimeVn(s.signOff?.at ?? s.startedAt)}</span>
                    </li>
                  ))}
                  {stIssues.map(i => (
                    <li key={i.id} className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono text-foreground">Issue {i.id.split('-').pop()}</span>
                      <TokenBadge token={ISSUE_STATUS_META[i.status]} size="small" />
                      <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTimeVn(i.history[i.history.length - 1]?.at)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      </Card>
      <Card
        title={`Audit trail · ${audit.length}`}
        right={(
          <button type="button" onClick={() => setShowAudit(v => !v)} className="text-[10px] text-primary">
            {showAudit ? 'Thu gọn' : 'Xem tất cả'}
          </button>
        )}
      >
        <ul className={cn('flex flex-col gap-1 overflow-y-auto', showAudit ? 'max-h-[60vh]' : 'max-h-72')}>
          {(showAudit ? auditSorted : auditSorted.slice(0, 15)).map(a => (
            <li key={a.id} className="text-[10px] leading-snug">
              <span className="text-muted-foreground">{formatDateTimeVn(a.at)}</span>{' '}
              <span className="font-mono text-sky-300">{a.action}</span>{' '}
              <span className="text-foreground/90">{a.detail}</span>
              <span className="text-muted-foreground"> · {a.by}{a.sessionId ? ` · ${a.sessionId}` : ''}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
})
