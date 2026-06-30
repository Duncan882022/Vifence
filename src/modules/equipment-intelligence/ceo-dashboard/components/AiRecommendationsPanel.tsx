import { GlassCard } from './GlassCard'
import { cn } from '@/utils/cn'
import type { AiRecommendationRow, AiSeverity } from '../types'

const SEV: Record<AiSeverity, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-500/20 text-red-300 border-red-500/40' },
  high: { label: 'High', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  medium: { label: 'Medium', className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  info: { label: 'Info', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
}

interface AiRecommendationsPanelProps {
  items: AiRecommendationRow[]
  onSelect: (item: AiRecommendationRow) => void
}

export function AiRecommendationsPanel({ items, onSelect }: AiRecommendationsPanelProps) {
  return (
    <GlassCard title="AI Recommendations" delay={0.35} className="min-h-[280px]">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/10 text-[9px] uppercase tracking-wider text-slate-500">
              <th className="py-2 px-2 text-left">Severity</th>
              <th className="py-2 px-2 text-left">Máy</th>
              <th className="py-2 px-2 text-left">Recommendation</th>
              <th className="py-2 px-2 text-right">Risk</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr
                key={item.id}
                onClick={() => onSelect(item)}
                className="border-b border-white/5 hover:bg-white/[0.04] cursor-pointer transition-colors"
              >
                <td className="py-2.5 px-2">
                  <span className={cn('px-2 py-0.5 rounded border text-[9px] font-bold uppercase', SEV[item.severity].className)}>
                    {SEV[item.severity].label}
                  </span>
                </td>
                <td className="py-2.5 px-2 font-semibold text-sky-300">{item.machineCode}</td>
                <td className="py-2.5 px-2 text-slate-300 max-w-[180px] truncate">{item.recommendation}</td>
                <td className="py-2.5 px-2 text-right">
                  <span className={cn(
                    'font-bold tabular-nums',
                    item.riskScorePct >= 75 ? 'text-red-400' : item.riskScorePct >= 60 ? 'text-amber-400' : 'text-slate-400',
                  )}>
                    {item.riskScorePct}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}
