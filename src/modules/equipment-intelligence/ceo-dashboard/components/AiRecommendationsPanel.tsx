import { motion } from 'framer-motion'
import { AlertCircle, AlertTriangle, Info, ChevronRight, ArrowRight, Sparkles } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { AiRecommendationRow, AiSeverity } from '../types'

const SEV: Record<AiSeverity, { Icon: typeof AlertCircle; cls: string; bg: string; border: string }> = {
  critical: { Icon: AlertCircle, cls: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/25' },
  high: { Icon: AlertTriangle, cls: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/25' },
  medium: { Icon: AlertTriangle, cls: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25' },
  info: { Icon: Info, cls: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/25' },
}

function riskColor(score: number): string {
  if (score >= 75) return 'text-red-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-muted-foreground'
}

interface AiRecommendationsPanelProps {
  items: AiRecommendationRow[]
  onSelect: (item: AiRecommendationRow) => void
}

export function AiRecommendationsPanel({ items, onSelect }: AiRecommendationsPanelProps) {
  return (
    <Panel
      title="AI Recommendations"
      noPadding
      expandable
      className="h-full min-h-0"
      headerRight={(
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-primary hover:text-primary/80 hover:bg-primary/10 font-semibold transition-colors"
        >
          Xem tất cả
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0b0f1a] border-b border-[#1e2433] shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex-1">
            Khuyến nghị thông minh
          </span>
          <span className="text-[9px] text-muted-foreground tabular-nums">{items.length} mục</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {items.map((item, i) => {
            const { Icon, cls, bg, border } = SEV[item.severity]
            return (
              <motion.button
                key={item.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                onClick={() => onSelect(item)}
                className="w-full flex items-start gap-3 px-3 py-3 text-left border-b border-[#1e2433]/60 hover:bg-[#1a2235]/50 transition-colors group"
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                  bg, border,
                )}>
                  <Icon className={cn('w-4 h-4', cls)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-primary">{item.machineCode}</span>
                    <span className={cn(
                      'text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded border',
                      bg, border, cls,
                    )}>
                      {item.severity}
                    </span>
                  </div>
                  <p className="text-[10px] font-medium text-foreground leading-snug line-clamp-1">
                    {item.recommendation}
                  </p>
                  {item.detail && (
                    <p className="text-[9px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">
                      {item.detail}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                  <span className={cn('text-[13px] font-bold tabular-nums', riskColor(item.riskScorePct))}>
                    {item.riskScorePct}%
                  </span>
                  <span className="text-[8px] text-muted-foreground uppercase">Risk</span>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 mt-1" />
              </motion.button>
            )
          })}
        </div>

        <div className="px-3 py-2.5 border-t border-[#1e2433] shrink-0 bg-[#0b0f1a]/50">
          <p className="text-[10px] text-muted-foreground">
            Hiển thị {items.length} trong tổng số 18 khuyến nghị
          </p>
        </div>
      </div>
    </Panel>
  )
}
