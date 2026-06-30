import { AlertCircle, AlertTriangle, Info, ChevronRight, ArrowRight } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { cn } from '@/utils/cn'
import type { AiRecommendationRow, AiSeverity } from '../types'

const SEV: Record<AiSeverity, { Icon: typeof AlertCircle; cls: string }> = {
  critical: { Icon: AlertCircle, cls: 'text-red-400' },
  high: { Icon: AlertTriangle, cls: 'text-amber-400' },
  medium: { Icon: AlertTriangle, cls: 'text-yellow-400' },
  info: { Icon: Info, cls: 'text-sky-400' },
}

interface AiRecommendationsPanelProps {
  items: AiRecommendationRow[]
  onSelect: (item: AiRecommendationRow) => void
}

export function AiRecommendationsPanel({ items, onSelect }: AiRecommendationsPanelProps) {
  return (
    <GlassCard
      title="AI RECOMMENDATIONS"
      delay={0.35}
      className="min-h-[320px]"
      noPadding
      action={
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
        >
          Xem tất cả
          <ArrowRight className="w-3 h-3" strokeWidth={2} />
        </button>
      }
    >
      {/* Table header */}
      <div className="grid grid-cols-[28px_72px_1fr_60px_20px] gap-x-2 px-3 py-2 ecc-table-head border-b border-white/[0.06]">
        <span />
        <span>MÁY</span>
        <span>RECOMMENDATION</span>
        <span className="text-right">RISK SCORE</span>
        <span />
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.04]">
        {items.map(item => {
          const { Icon, cls } = SEV[item.severity]
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="w-full grid grid-cols-[28px_72px_1fr_60px_20px] gap-x-2 px-3 py-2.5 text-left hover:bg-white/[0.035] transition-colors group"
            >
              {/* Severity icon */}
              <div className="flex items-start pt-0.5">
                <Icon className={cn('w-4 h-4 shrink-0', cls)} strokeWidth={1.75} />
              </div>

              {/* Machine code */}
              <div className="flex items-start pt-0.5">
                <span className="text-[11px] font-semibold text-sky-300 leading-tight">{item.machineCode}</span>
              </div>

              {/* Recommendation + detail */}
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-200 leading-tight truncate">
                  {item.recommendation}
                </p>
                {item.detail && (
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate">
                    {item.detail}
                  </p>
                )}
              </div>

              {/* Risk score */}
              <div className="text-right flex items-start pt-0.5 justify-end">
                <span className={cn(
                  'text-[13px] font-bold tabular-nums',
                  item.riskScorePct >= 75 ? 'text-red-400'
                  : item.riskScorePct >= 60 ? 'text-amber-400'
                  : 'text-slate-400',
                )}>
                  {item.riskScorePct}%
                </span>
              </div>

              {/* Chevron */}
              <div className="flex items-start pt-0.5">
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" strokeWidth={1.75} />
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer count */}
      <div className="px-3 py-2 border-t border-white/[0.06] mt-auto">
        <p className="text-[10px] text-slate-600">
          Hiển thị {items.length} trong tổng số 18 khuyến nghị
        </p>
      </div>
    </GlassCard>
  )
}
