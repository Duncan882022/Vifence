import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Info } from 'lucide-react'

interface GlassCardProps {
  title: string
  tooltip?: string
  className?: string
  children: React.ReactNode
  delay?: number
}

export function GlassCard({ title, tooltip, className, children, delay = 0 }: GlassCardProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay }}
        className={cn(
          'rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-4 flex flex-col gap-3 min-h-0',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 shrink-0">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{title}</h3>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-slate-500 hover:text-sky-400 transition-colors">
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {children}
      </motion.div>
    </TooltipProvider>
  )
}

export function TrendBadge({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const up = value >= 0
  return (
    <span className={cn('text-[10px] font-semibold tabular-nums', up ? 'text-emerald-400' : 'text-red-400')}>
      {up ? '+' : ''}{value}{suffix}
    </span>
  )
}
