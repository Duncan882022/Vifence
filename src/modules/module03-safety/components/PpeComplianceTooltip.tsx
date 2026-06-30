import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { buildPpeTooltipLines, getPpeLevel, PPE_LEVEL_HIGH_MIN, PPE_LEVEL_MEDIUM_MIN } from '../utils/safetyUiHelpers'

interface PpeComplianceTooltipProps {
  score: number
  children?: ReactNode
  iconClassName?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function PpeComplianceTooltip({
  score,
  children,
  iconClassName,
  side = 'top',
}: PpeComplianceTooltipProps) {
  const lines = buildPpeTooltipLines(score)
  const { color } = getPpeLevel(score)
  const mediumMax = PPE_LEVEL_HIGH_MIN - 1

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children ?? (
            <button
              type="button"
              className="inline-flex shrink-0 cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              aria-label="Giải thích điểm tuân thủ PPE"
            >
              <Info className={cn('w-3 h-3 text-muted-foreground/70 hover:text-muted-foreground', iconClassName)} />
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] space-y-1.5 whitespace-normal leading-relaxed">
          {lines.slice(0, -1).map(line => (
            <p key={line} className="text-slate-400">{line}</p>
          ))}
          <p className={cn('font-semibold pt-0.5 border-t border-white/10', color)}>
            {lines[lines.length - 1]}
          </p>
          <p className="text-[10px] text-muted-foreground/80">
            Ngưỡng: Cao ≥ {PPE_LEVEL_HIGH_MIN}% · Trung bình {PPE_LEVEL_MEDIUM_MIN}–{mediumMax}% · Thấp &lt; {PPE_LEVEL_MEDIUM_MIN}%
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface PpeLevelIconProps {
  score: number
  size?: 'xs' | 'sm' | 'md'
  showLabel?: boolean
  className?: string
}

const LEVEL_ICON_SIZE = {
  xs: { box: 'w-5 h-5', icon: 'w-2.5 h-2.5', text: 'text-[8px]' },
  sm: { box: 'w-6 h-6', icon: 'w-3 h-3', text: 'text-[9px]' },
  md: { box: 'w-8 h-8', icon: 'w-3.5 h-3.5', text: 'text-[10px]' },
} as const

export function PpeLevelIcon({ score, size = 'sm', showLabel = false, className }: PpeLevelIconProps) {
  const { icon: Icon, color, bg, label, fullLabel } = getPpeLevel(score)
  const sizes = LEVEL_ICON_SIZE[size]

  return (
    <span className={cn('inline-flex items-center gap-1 shrink-0', className)}>
      <span
        className={cn('rounded-md flex items-center justify-center', sizes.box, bg)}
        title={`${fullLabel}`}
        aria-label={fullLabel}
      >
        <Icon className={cn(sizes.icon, color)} aria-hidden />
      </span>
      {showLabel && (
        <span className={cn('font-semibold', sizes.text, color)}>{label}</span>
      )}
    </span>
  )
}
