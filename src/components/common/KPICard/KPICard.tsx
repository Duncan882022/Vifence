import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { KPIData } from '@/types/api'

interface KPICardProps {
  data: KPIData
  icon?: LucideIcon
  iconColor?: string
  iconBg?: string
  className?: string
}

function formatDelta(change: number, changeUnit?: string): string {
  const prefix = change > 0 ? '+' : ''
  const suffix = changeUnit ? ` ${changeUnit}` : ''
  return `${prefix}${change}${suffix}`
}

export function KPICard({ data, icon: Icon, iconColor, iconBg, className }: KPICardProps) {
  const {
    label, value, unit, detail, change, changeType,
    previousValue, higherIsBetter = true, changeUnit,
  } = data

  const isUp = changeType === 'increase'
  const isDown = changeType === 'decrease'
  const isNeutral = changeType === 'neutral'
  const isGood = higherIsBetter ? isUp : isDown
  const isBad = higherIsBetter ? isDown : isUp

  const showCompare = change !== undefined && changeType !== undefined
  const showYesterdayRow = showCompare && previousValue !== undefined

  return (
    <div className={cn(
      'bg-[#0d1117] border border-[#1e2433] rounded-lg p-3.5 flex flex-col gap-2 min-h-[96px]',
      className,
    )}>
      <div className="flex items-start gap-2.5">
        {Icon && (
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            iconBg || 'bg-primary/10',
          )}>
            <Icon className={cn('w-4 h-4', iconColor || 'text-primary')} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-tight truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-bold text-foreground leading-none tabular-nums">{value}</span>
            {unit && <span className="text-[11px] text-muted-foreground shrink-0">{unit}</span>}
          </div>
          {detail && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{detail}</p>
          )}
        </div>
      </div>

      {showYesterdayRow && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#1e2433]/70 mt-auto">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Hôm qua{' '}
            <span className="font-semibold text-muted-foreground/90 tabular-nums">
              {previousValue}{unit ? ` ${unit}` : ''}
            </span>
          </span>
          <span className={cn(
            'inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums shrink-0',
            isGood && 'text-green-400',
            isBad && 'text-red-400',
            isNeutral && 'text-muted-foreground',
          )}>
            {isUp && <TrendingUp className="w-3 h-3" />}
            {isDown && <TrendingDown className="w-3 h-3" />}
            {isNeutral && <Minus className="w-3 h-3" />}
            {isNeutral
              ? 'Không đổi'
              : formatDelta(change!, changeUnit)}
          </span>
        </div>
      )}

      {showCompare && !showYesterdayRow && (
        <div className={cn(
          'flex items-center gap-1 text-[10px] font-medium pt-2 border-t border-[#1e2433]/70 mt-auto',
          isGood && 'text-green-400',
          isBad && 'text-red-400',
          isNeutral && 'text-muted-foreground',
        )}>
          {isUp && <TrendingUp className="w-3 h-3" />}
          {isDown && <TrendingDown className="w-3 h-3" />}
          {isNeutral && <Minus className="w-3 h-3" />}
          <span>
            {isNeutral
              ? 'Không đổi so với hôm qua'
              : `${formatDelta(change!, changeUnit)} so với hôm qua`}
          </span>
        </div>
      )}
    </div>
  )
}
