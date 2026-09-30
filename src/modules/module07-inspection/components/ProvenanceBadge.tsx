import { cn } from '@/utils/cn'
import { PROVENANCE_META, type Provenance } from '../types'

interface Props {
  value: Provenance
  className?: string
}

export function ProvenanceBadge({ value, className }: Props) {
  const meta = PROVENANCE_META[value]
  return (
    <span
      title={meta.tip}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-semibold tracking-wide',
        meta.className,
        className,
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          value === 'extracted' && 'bg-green-400',
          value === 'inferred' && 'bg-amber-400',
          value === 'required' && 'bg-red-400',
        )}
      />
      {meta.label}
    </span>
  )
}
