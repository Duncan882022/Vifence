import { motion } from 'framer-motion'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { AiRecommendationRow } from '../types'

const SEV_CONFIG = {
  critical: { color: '#f87171', label: 'Nghiêm trọng' },
  high:     { color: '#fb923c', label: 'Cao' },
  medium:   { color: '#fbbf24', label: 'Trung bình' },
  info:     { color: '#38bdf8', label: 'Thông tin' },
} as const

interface AiRiskPanelProps {
  recommendations: AiRecommendationRow[]
  open?: boolean
  onToggle?: () => void
  onRowClick?: (item: AiRecommendationRow) => void
}

export function AiRiskPanel({ recommendations, open = true, onToggle, onRowClick }: AiRiskPanelProps) {
  const top5 = [...recommendations]
    .sort((a, b) => b.riskScorePct - a.riskScorePct)
    .slice(0, 5)

  const headerRight = onToggle && (
    <button
      type="button"
      onClick={onToggle}
      className="p-1 rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors"
      aria-label={open ? 'Thu gọn' : 'Mở rộng'}
    >
      {open
        ? <ChevronLeft className="w-3.5 h-3.5" />
        : <ChevronRight className="w-3.5 h-3.5" />}
    </button>
  )

  if (!open) {
    return (
      <div className="flex flex-col items-center justify-between py-3 px-1.5 gap-2 bg-[#0d1117] border border-[#1e2433] rounded-lg overflow-hidden select-none shrink-0" style={{ width: 44 }}>
        <AlertTriangle className="w-3.5 h-3.5 text-orange-400/70 shrink-0" />
        <span
          className="text-[8px] font-semibold text-muted-foreground/60 uppercase tracking-widest whitespace-nowrap"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Rủi ro AI
        </span>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded-lg border border-[#1e2433] bg-[#060b14] text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )
  }

  return (
    <Panel
      title="Top 5 nguy cơ sự cố"
      fit
      headerRight={headerRight}
      className={cn('shrink-0')}
    >
      <div className="px-2 pb-2 space-y-1">
        {top5.map((item, idx) => {
          const sev = SEV_CONFIG[item.severity]
          return (
            <motion.button
              key={item.id}
              type="button"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              onClick={() => onRowClick?.(item)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#060b14] border border-[#1e2433] text-left cursor-pointer transition-colors hover:bg-[#0f1520] hover:border-[#2a3855]"
            >
              {/* Risk rank */}
              <span className="text-[9px] font-bold text-muted-foreground/40 w-3 shrink-0 tabular-nums">
                {idx + 1}
              </span>

              {/* Machine code */}
              <span className="text-[10px] font-bold shrink-0 w-16 truncate" style={{ color: sev.color }}>
                {item.machineCode}
              </span>

              {/* Recommendation summary */}
              <span className="text-[9px] text-muted-foreground/70 flex-1 truncate min-w-0">
                {item.recommendation}
              </span>

              {/* Risk score */}
              <div className="flex items-center gap-1 shrink-0">
                <div className="w-12 h-1 rounded-full bg-[#1a2030] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${item.riskScorePct}%`, background: sev.color }}
                  />
                </div>
                <span className="text-[9px] font-bold tabular-nums" style={{ color: sev.color }}>
                  {item.riskScorePct}%
                </span>
              </div>
            </motion.button>
          )
        })}
      </div>
    </Panel>
  )
}
