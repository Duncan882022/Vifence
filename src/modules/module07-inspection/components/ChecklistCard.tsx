import { BoxSelect } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ChecklistStatus, InspectionChecklistItem } from '../types'
import { CHECK_TYPE_META, STAGE_META } from '../types'
import { ProvenanceBadge } from './ProvenanceBadge'

const STATUS_META: Record<ChecklistStatus, { label: string; className: string }> = {
  pass: { label: 'Đạt', className: 'bg-green-500/15 text-green-400 border-green-500/25' },
  fail: { label: 'Không đạt', className: 'bg-red-500/15 text-red-400 border-red-500/25' },
  pending: { label: 'Chờ', className: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  missing: { label: 'Thiếu', className: 'bg-orange-500/15 text-orange-300 border-orange-500/25' },
}

interface Props {
  item: InspectionChecklistItem
  active?: boolean
  onHover: (id: string | null) => void
  onFocus: (id: string) => void
  onViewBim: (id: string) => void
}

export function ChecklistCard({ item, active, onHover, onFocus, onViewBim }: Props) {
  return (
    <div
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onFocus(item.id)}
      className={cn(
        'rounded-lg border px-2.5 py-2 cursor-pointer transition-colors',
        active ? 'border-primary bg-primary/10' : 'border-[#1e2433] bg-[#0b0f1a] hover:border-[#2a3855]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold text-foreground leading-snug">
          {item.checkType && (
            <span
              title={CHECK_TYPE_META[item.checkType].tip}
              className={cn('mr-1 inline-block px-1 py-0.5 rounded border text-[8px] font-bold align-middle', CHECK_TYPE_META[item.checkType].className)}
            >
              {CHECK_TYPE_META[item.checkType].label}
            </span>
          )}
          {item.code && <span className="mr-1 text-muted-foreground tabular-nums">{item.code}</span>}
          {item.title}
        </p>
        <span className={cn('shrink-0 px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase tracking-wide', STATUS_META[item.status].className)}>
          {STATUS_META[item.status].label}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px]">
        <span className="text-muted-foreground">Source</span>
        <ProvenanceBadge value={item.sourceProvenance} />
        <span className="text-muted-foreground">Design</span>
        <span className="flex items-center gap-1">
          <span className="text-foreground tabular-nums">{item.designValue ?? '—'}</span>
          {item.designProvenance !== 'extracted' && <ProvenanceBadge value={item.designProvenance} />}
        </span>
        <span className="text-muted-foreground">Tolerance</span>
        <span className="flex items-center gap-1">
          <span className="text-foreground">{item.tolerance ?? '—'}</span>
          <ProvenanceBadge value={item.toleranceProvenance} />
        </span>
        <span className="text-muted-foreground">Stage</span>
        <span className="text-foreground">{STAGE_META[item.stage].short}</span>
        {active && item.method && (
          <>
            <span className="text-muted-foreground">Phương pháp</span>
            <span className="text-foreground leading-snug">{item.method}</span>
          </>
        )}
        {active && item.reference && (
          <>
            <span className="text-muted-foreground">Căn cứ</span>
            <span className="text-muted-foreground leading-snug">{item.reference}</span>
          </>
        )}
      </div>
      <button
        type="button"
        disabled={item.objectIds.length === 0}
        onClick={e => { e.stopPropagation(); onViewBim(item.id) }}
        className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
      >
        <BoxSelect className="w-3 h-3" />
        Xem trên BIM
        <span className="font-normal text-muted-foreground tabular-nums">· {item.objectIds.length}</span>
      </button>
    </div>
  )
}
