import { cn } from '@/utils/cn'
import type { MobileAiDetection } from '../services/mobileAiBackend.service'

interface MobileAiOverlayProps {
  detections: MobileAiDetection[]
  frameWidth: number
  frameHeight: number
  compact?: boolean
}

const BEHAVIOR_STYLE: Record<string, { border: string; label: string; badge: string }> = {
  smoking: {
    border: 'border-orange-400/90',
    label: 'bg-orange-500/30 text-orange-200',
    badge: 'bg-orange-500/25 border-orange-500/40 text-orange-200',
  },
  fire: {
    border: 'border-red-400/90',
    label: 'bg-red-500/30 text-red-200',
    badge: 'bg-red-500/25 border-red-500/40 text-red-200',
  },
}

function DetectionBox({
  det,
  frameWidth,
  frameHeight,
  compact,
}: {
  det: MobileAiDetection
  frameWidth: number
  frameHeight: number
  compact?: boolean
}) {
  const [x1, y1, x2, y2] = det.bbox
  const style = BEHAVIOR_STYLE[det.behavior] ?? BEHAVIOR_STYLE.fire
  const left = (x1 / frameWidth) * 100
  const top = (y1 / frameHeight) * 100
  const width = ((x2 - x1) / frameWidth) * 100
  const height = ((y2 - y1) / frameHeight) * 100

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
    >
      <div className={cn('absolute inset-0 border-2 rounded-sm', style.border)} />
      <span
        className={cn(
          'absolute -top-3 left-0 px-1 py-px font-mono whitespace-nowrap rounded-sm',
          style.label,
          compact ? 'text-[5px]' : 'text-[7px]',
        )}
      >
        {det.label}
        {' '}
        {det.confidence.toFixed(2)}
      </span>
    </div>
  )
}

export function MobileAiOverlay({
  detections,
  frameWidth,
  frameHeight,
  compact,
}: MobileAiOverlayProps) {
  if (detections.length === 0 || frameWidth <= 0 || frameHeight <= 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[3]">
      {detections.map((det, i) => (
        <DetectionBox
          key={`${det.behavior}-${det.label}-${i}-${det.bbox.join('-')}`}
          det={det}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
          compact={compact}
        />
      ))}
    </div>
  )
}

export function MobileAiAlertBadge({
  detections,
  compact,
}: {
  detections: MobileAiDetection[]
  compact?: boolean
}) {
  const smoking = detections.some(d => d.behavior === 'smoking')
  const fire = detections.some(d => d.behavior === 'fire')
  if (!smoking && !fire) return null

  return (
    <div className={cn('absolute left-2 flex flex-col gap-1 z-[4]', compact ? 'top-6' : 'top-10')}>
      {smoking && (
        <span className={cn(
          'rounded font-bold border px-1.5 py-0.5',
          BEHAVIOR_STYLE.smoking.badge,
          compact ? 'text-[6px]' : 'text-[8px]',
        )}>
          Hút thuốc
        </span>
      )}
      {fire && (
        <span className={cn(
          'rounded font-bold border px-1.5 py-0.5',
          BEHAVIOR_STYLE.fire.badge,
          compact ? 'text-[6px]' : 'text-[8px]',
        )}>
          Cháy nổ
        </span>
      )}
    </div>
  )
}
