import { Play } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/format'
import type { SafetyViolation } from '@/types/safety'
import type { Event } from '@/types/event'
import {
  getViolationSeverity,
  VIOLATION_SEVERITY_COLORS,
  VIOLATION_SEVERITY_LABELS,
  VIOLATION_TYPE_LABELS,
} from '../data/safetyViolations'
import { ViolationTypeIcon } from './ViolationTypeIcon'
import { violationToEvent } from './SafetyViolationTable'

interface SafetyViolationHistoryListProps {
  violations: SafetyViolation[]
  onPlayback?: (event: Event) => void
  onSelectWorker?: (workerIdOrName: string) => void
  emptyLabel?: string
}

export function SafetyViolationHistoryList({
  violations,
  onPlayback,
  onSelectWorker,
  emptyLabel = 'Không có vi phạm',
}: SafetyViolationHistoryListProps) {
  if (violations.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground text-center py-8">{emptyLabel}</p>
    )
  }

  return (
    <div className="divide-y divide-[#1e2433]/60">
      {violations.map(v => {
        const severity = getViolationSeverity(v.type)
        const sevCfg = VIOLATION_SEVERITY_COLORS[severity]

        return (
          <div
            key={v.id}
            className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-[#1a2235]/30 transition-colors group"
          >
            <ViolationTypeIcon type={v.type} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1 mb-0.5">
                <p className="text-[10px] font-semibold text-foreground truncate">
                  {VIOLATION_TYPE_LABELS[v.type]}
                </p>
                <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded', sevCfg.color, sevCfg.bg)}>
                  {VIOLATION_SEVERITY_LABELS[severity]}
                </span>
                <span className={cn(
                  'text-[8px] font-bold px-1 py-0.5 rounded',
                  v.status === 'pending' ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400',
                )}>
                  {v.status === 'pending' ? 'Chưa xử lý' : 'Đã xử lý'}
                </span>
              </div>
              {v.workerName && onSelectWorker && (
                <button
                  type="button"
                  onClick={() => onSelectWorker(v.workerId ?? v.workerName!)}
                  className="text-[9px] text-primary/80 hover:text-primary hover:underline underline-offset-2 decoration-dotted truncate block max-w-full text-left"
                >
                  {v.workerName}
                </button>
              )}
              {!onSelectWorker && v.workerName && (
                <p className="text-[9px] text-muted-foreground truncate">{v.workerName}</p>
              )}
              <p className="text-[9px] text-muted-foreground/70 truncate tabular-nums mt-0.5">
                {formatDateTime(v.timestamp)} · {v.location}
              </p>
            </div>
            {onPlayback && (
              <button
                type="button"
                onClick={() => onPlayback(violationToEvent(v))}
                className="p-1.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors shrink-0 opacity-70 group-hover:opacity-100"
                title="Xem lại video"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
