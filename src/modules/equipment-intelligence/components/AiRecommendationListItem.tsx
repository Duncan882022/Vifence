import { ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { AiRecommendationRow } from '../ceo-dashboard/types'
import { AI_SEV, aiRiskColor } from '../ceo-dashboard/utils/aiRecommendationUi'

interface AiRecommendationListItemProps {
  item: AiRecommendationRow
  unread?: boolean
  compact?: boolean
  onClick: () => void
}

export function AiRecommendationListItem({
  item,
  unread = false,
  compact = false,
  onClick,
}: AiRecommendationListItemProps) {
  const { Icon, cls, bg, border } = AI_SEV[item.severity]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-2.5 text-left transition-colors group',
        compact ? 'px-3 py-2.5' : 'px-3 py-3 gap-3',
        'border-b border-[#1e2433]/60 hover:bg-[#1a2235]/50',
        unread && 'bg-primary/[0.03]',
      )}
    >
      <div className={cn(
        'rounded-lg flex items-center justify-center shrink-0 border',
        compact ? 'w-7 h-7' : 'w-8 h-8',
        bg,
        border,
      )}>
        <Icon className={cn(compact ? 'w-3.5 h-3.5' : 'w-4 h-4', cls)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {unread && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden />
          )}
          <span className={cn('font-bold text-primary', compact ? 'text-[9px]' : 'text-[10px]')}>
            {item.machineCode}
          </span>
          <span className={cn(
            'font-semibold uppercase px-1 py-0.5 rounded border',
            compact ? 'text-[7px]' : 'text-[8px]',
            bg,
            border,
            cls,
          )}>
            {AI_SEV[item.severity].label}
          </span>
        </div>
        <p className={cn(
          'font-medium text-foreground leading-snug line-clamp-1',
          compact ? 'text-[9px]' : 'text-[10px]',
        )}>
          {item.recommendation}
        </p>
        {!compact && item.detail && (
          <p className="text-[9px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">
            {item.detail}
          </p>
        )}
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0 pt-0.5">
        <span className={cn(
          'font-bold tabular-nums',
          compact ? 'text-[11px]' : 'text-[13px]',
          aiRiskColor(item.riskScorePct),
        )}>
          {item.riskScorePct}%
        </span>
        <span className="text-[8px] text-muted-foreground uppercase">Rủi ro</span>
      </div>

      <ChevronRight className={cn(
        'text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 mt-1',
        compact ? 'w-3.5 h-3.5' : 'w-4 h-4',
      )} />
    </button>
  )
}
