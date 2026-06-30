import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Info } from 'lucide-react'

interface GlassCardProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  tooltip?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
  delay?: number
  noPadding?: boolean
}

export function GlassCard({
  title, subtitle, icon, tooltip, action, className, children, delay = 0, noPadding,
}: GlassCardProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={cn('ecc-card flex flex-col min-h-0', noPadding ? 'p-0 overflow-hidden' : 'p-4 gap-3', className)}
      >
        <div className={cn(
          'flex items-start justify-between gap-2 shrink-0',
          noPadding && 'px-4 pt-4',
        )}>
          {/* Left: icon + title + subtitle */}
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="shrink-0">{icon}</div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="ecc-card-header leading-none">{title}</h3>
                {tooltip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-slate-600 hover:text-emerald-400 transition-colors">
                        <Info className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              {subtitle && (
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right: action */}
          {action && (
            <div className="shrink-0">{action}</div>
          )}
        </div>

        <div className={cn('flex flex-col flex-1 min-h-0', noPadding && 'px-0 pb-0')}>
          {children}
        </div>
      </motion.div>
    </TooltipProvider>
  )
}

export function TrendBadge({
  value, suffix = '%', invert, showLabel = false,
}: {
  value: number; suffix?: string; invert?: boolean; showLabel?: boolean
}) {
  const positive = invert ? value <= 0 : value >= 0
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums',
        positive ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10',
      )}>
        {value > 0 ? '+' : ''}{value}{suffix}
      </span>
      {showLabel && (
        <span className="text-[9px] text-slate-600 leading-tight">so với tháng trước</span>
      )}
    </span>
  )
}

export function CardIcon({
  children, color = 'emerald',
}: {
  children: React.ReactNode
  color?: 'emerald' | 'amber' | 'sky' | 'violet' | 'orange'
}) {
  const styles = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    sky: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    violet: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
    orange: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  }
  return (
    <div className={cn(
      'w-8 h-8 rounded-lg border flex items-center justify-center',
      styles[color],
    )}>
      {children}
    </div>
  )
}
