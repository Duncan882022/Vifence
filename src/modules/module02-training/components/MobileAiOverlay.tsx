import { memo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapVideoRectToOverlay } from '../utils/videoOverlayCoords'
import type { MobileAiDetection } from '../services/mobileAiBackend.service'

interface MobileAiOverlayProps {
  detections: MobileAiDetection[]
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  layoutTick?: number
  compact?: boolean
  pulse?: boolean
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
  no_harness: {
    border: 'border-orange-400/95',
    label: 'bg-orange-500/30 text-orange-200',
    badge: 'bg-orange-500/25 border-orange-500/40 text-orange-200',
  },
}

const DetectionBox = memo(function DetectionBox({
  det,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  pulse,
}: {
  det: MobileAiDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  pulse?: boolean
}) {
  const [x1, y1, x2, y2] = det.bbox
  const style = BEHAVIOR_STYLE[det.behavior] ?? BEHAVIOR_STYLE.fire
  const video = videoRef.current
  const isViolation = det.behavior === 'smoking' || det.behavior === 'fire'

  if (!video?.videoWidth || !video.videoHeight || frameWidth <= 0 || frameHeight <= 0) {
    return null
  }

  const sx = video.videoWidth / frameWidth
  const sy = video.videoHeight / frameHeight
  const box = mapVideoRectToOverlay(
    { x: x1 * sx, y: y1 * sy, width: (x2 - x1) * sx, height: (y2 - y1) * sy },
    video,
    'contain',
  )

  if (box.w <= 0.5 || box.h <= 0.5) return null

  const displayLabel = det.behavior === 'smoking'
    ? 'PCCC · Hút thuốc'
    : det.behavior === 'fire'
      ? 'PCCC · Cháy nổ'
      : det.label

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: isViolation ? 9 : 4,
      }}
    >
      <div className={cn(
        'absolute inset-0 border rounded-sm',
        style.border,
        pulse && 'animate-pulse',
      )} />
      <span
        className={cn(
          'absolute -top-3 left-0 px-1 py-px font-mono whitespace-nowrap rounded-sm',
          style.label,
          compact ? 'text-[5px]' : 'text-[7px]',
        )}
      >
        {displayLabel}
        {' '}
        {(det.confidence * 100).toFixed(0)}%
      </span>
    </div>
  )
})

export function MobileAiOverlay({
  detections,
  frameWidth,
  frameHeight,
  videoRef,
  layoutTick = 0,
  compact,
  pulse,
}: MobileAiOverlayProps) {
  if (detections.length === 0 || frameWidth <= 0 || frameHeight <= 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[9]">
      {detections.map((det, i) => (
        <DetectionBox
          key={`${det.behavior}-${det.label}-${i}-${Math.round(det.bbox[0])}-${layoutTick}`}
          det={det}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
          videoRef={videoRef}
          compact={compact}
          pulse={pulse}
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
    <div className={cn('absolute left-2 flex flex-col gap-1 z-[10]', compact ? 'top-14' : 'top-[4.5rem]')}>
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
