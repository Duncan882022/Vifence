import { AlertTriangle, Check } from 'lucide-react'
import { MetricPercentRing } from '@/components/common/MetricPercentRing/MetricPercentRing'
import { cn } from '@/utils/cn'
import type { CompletenessItem } from '../types'

interface Props {
  pct: number
  items: CompletenessItem[]
  onSupplement: () => void
}

export function CompletenessPanel({ pct, items, onSupplement }: Props) {
  const color = pct >= 85 ? '#4ade80' : pct >= 65 ? '#facc15' : '#f87171'
  const missing = items.filter(i => !i.ok).length

  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-2.5">
      <div className="flex items-center gap-3">
        <MetricPercentRing percent={pct} color={color} size={48} />
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Completeness</p>
          <p className="text-xs font-semibold text-foreground">Inspection Plan {pct}% complete</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map(item => (
          <li key={item.id} className="flex items-start gap-1.5 text-[10px]">
            {item.ok
              ? <Check className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
              : <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />}
            <span className={cn(item.ok ? 'text-muted-foreground' : 'text-amber-300')}>{item.label}</span>
          </li>
        ))}
      </ul>
      {missing > 0 && (
        <button
          type="button"
          onClick={onSupplement}
          className="mt-2 w-full text-[11px] font-semibold py-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/25"
        >
          Bổ sung thông tin
        </button>
      )}
    </div>
  )
}
