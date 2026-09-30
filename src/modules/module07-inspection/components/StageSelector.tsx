import { cn } from '@/utils/cn'
import {
  PLAN_STATUS_META,
  STAGE_META,
  STAGE_STATUS_META,
  type InspectionStageId,
  type PlanStatus,
  type StageStatus,
} from '../types'

export function PlanStatusChip({ status }: { status: PlanStatus }) {
  const meta = PLAN_STATUS_META[status]
  return (
    <span className={cn('px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-wider', meta.className)}>
      {meta.label}
    </span>
  )
}

interface StageSelectorProps {
  value: InspectionStageId | 'all'
  onChange: (stage: InspectionStageId | 'all') => void
  counts: Record<InspectionStageId, { objects: number; checklists: number; missing: number }>
  statuses: Record<InspectionStageId, StageStatus>
  onHover?: (stage: InspectionStageId | null) => void
}

export function StageSelector({ value, onChange, counts, statuses, onHover }: StageSelectorProps) {
  const stages: InspectionStageId[] = ['gd1', 'gd2', 'gd3']

  return (
    <div className="flex items-stretch gap-0 min-w-0">
      {stages.map((stage, i) => {
        const meta = STAGE_META[stage]
        const st = STAGE_STATUS_META[statuses[stage]]
        const c = counts[stage]
        const active = value === stage
        return (
          <div key={stage} className="flex items-center min-w-0 flex-1">
            {i > 0 && (
              <div className="w-4 sm:w-6 h-px bg-[#2a3855] shrink-0 mx-0.5" aria-hidden />
            )}
            <button
              type="button"
              onMouseEnter={() => onHover?.(stage)}
              onMouseLeave={() => onHover?.(null)}
              onClick={() => onChange(active ? 'all' : stage)}
              className={cn(
                'flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-[#1e2433] bg-[#0b0f1a] hover:border-[#2a3855]',
              )}
            >
              <p className="text-[10px] font-bold text-foreground truncate">{meta.short}</p>
              <p className={cn('text-[9px] font-semibold truncate', st.className)}>{st.label}</p>
              <p className="text-[9px] text-muted-foreground tabular-nums mt-0.5 truncate">
                {c.objects} CT · {c.checklists} CL
                {c.missing > 0 && <span className="text-amber-400"> · {c.missing} thiếu</span>}
              </p>
            </button>
          </div>
        )
      })}
    </div>
  )
}

interface ChipGroupProps<T extends string> {
  options: { id: T; label: string }[]
  value: T | 'all' | T[]
  multiple?: boolean
  counts?: Partial<Record<T, number>>
  onToggle: (id: T) => void
  onAll?: () => void
}

export function FilterChips<T extends string>({
  options, value, multiple, counts, onToggle, onAll,
}: ChipGroupProps<T>) {
  const selected = Array.isArray(value) ? value : value === 'all' ? [] : [value]
  const allOn = !multiple && value === 'all' || (multiple && selected.length === 0)

  return (
    <div className="flex flex-wrap gap-1">
      {onAll && (
        <button
          type="button"
          onClick={onAll}
          className={cn(
            'px-2 py-0.5 rounded text-[9px] font-semibold border transition-colors',
            allOn ? 'border-primary bg-primary/15 text-primary' : 'border-[#1e2433] text-muted-foreground hover:text-foreground',
          )}
        >
          ALL
        </button>
      )}
      {options.map(opt => {
        const on = selected.includes(opt.id)
        const n = counts?.[opt.id]
        const empty = typeof n === 'number' && n <= 0
        return (
          <button
            key={opt.id}
            type="button"
            disabled={empty}
            title={empty ? 'Không có trong file IFC đang mở' : undefined}
            onClick={() => { if (!empty) onToggle(opt.id) }}
            className={cn(
              'px-2 py-0.5 rounded text-[9px] font-semibold border transition-colors',
              empty
                ? 'border-[#1e2433] text-muted-foreground/40 cursor-not-allowed'
                : on ? 'border-primary bg-primary/15 text-primary' : 'border-[#1e2433] text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
            {typeof n === 'number' && <span className="ml-1 tabular-nums font-normal">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
