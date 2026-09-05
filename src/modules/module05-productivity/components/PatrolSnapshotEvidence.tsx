import { cn } from '@/utils/cn'
import { patrolTierToken, type PatrolTier } from '../utils/patrolTierTokens'
import type { PatrolTierSnapshot } from '../types/patrolTierSnapshot'
import { resolvePatrolTier } from '../utils/resolvePatrolTier'

interface PatrolSnapshotEvidenceProps {
  src: string
  alt?: string
  tier?: PatrolTier
  tierSnapshot?: PatrolTierSnapshot | null
  confidence?: number
  label?: string
  className?: string
}

/** Ảnh snapshot + viền màu tầng (bbox đã bake trong JPG từ BE). */
export function PatrolSnapshotEvidence({
  src,
  alt = '',
  tier,
  tierSnapshot,
  confidence,
  label,
  className,
}: PatrolSnapshotEvidenceProps) {
  const resolvedTier = tier
    ?? resolvePatrolTier({ tierSnapshot: tierSnapshot ?? undefined, surface: 'event' })
  const token = patrolTierToken(resolvedTier)
  const pct = confidence ?? tierSnapshot?.confidence
  const caption = label ?? (pct != null && pct > 0 ? `${Math.round(pct * 100)}%` : undefined)

  return (
    <div className={cn('relative overflow-hidden rounded-md', className)}>
      <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-md border-2',
          token.roiBorder.replace('border-2 border-solid ', '').replace('border-2 border-dashed ', 'border-dashed '),
        )}
        style={{ borderColor: token.heatmapDotHex }}
        aria-hidden
      />
      {caption && (
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[8px] font-semibold tabular-nums truncate',
            token.roiLabelBg,
            token.roiLabelText,
          )}
        >
          {caption}
        </div>
      )}
    </div>
  )
}
