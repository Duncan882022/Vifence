import { memo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapVideoRectToOverlay } from '../utils/videoOverlayCoords'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '@/modules/module03-safety/utils/roiOverlayCode'
import type { MobileAiDetection } from '../services/mobileAiBackend.service'
import type { CameraAiModelId } from '../types/cameraAi.types'
import { getCameraAiModelVisual, modelBoxStyle } from '../data/cameraAiModelTokens'

interface MobileAiOverlayProps {
  detections: MobileAiDetection[]
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  layoutTick?: number
  compact?: boolean
  pulse?: boolean
  modelId?: CameraAiModelId
}

function isViolationBehavior(behavior: string): boolean {
  return behavior === 'smoking' || behavior === 'fire' || behavior === 'no_harness'
}

function resolveBehaviorStyle(modelId: CameraAiModelId, behavior: string) {
  const box = modelBoxStyle(modelId, isViolationBehavior(behavior) ? 'violation' : 'subject')
  const visual = getCameraAiModelVisual(modelId)
  return {
    border: box.border,
    label: cn(box.bg, box.label),
    badge: visual.badge,
  }
}

const DetectionBox = memo(function DetectionBox({
  det,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  pulse,
  modelId,
}: {
  det: MobileAiDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  pulse?: boolean
  modelId: CameraAiModelId
}) {
  const [x1, y1, x2, y2] = det.bbox
  const style = resolveBehaviorStyle(modelId, det.behavior)
  const video = videoRef.current
  const isViolation = isViolationBehavior(det.behavior)

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

  const displayLabel = formatRoiOverlayBadge(
    formatRoiOverlayCode(det.behavior),
    det.confidence,
  )

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
  modelId = 'pccc',
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
          modelId={modelId}
        />
      ))}
    </div>
  )
}

export function MobileAiAlertBadge({
  detections,
  compact,
  modelId = 'pccc',
}: {
  detections: MobileAiDetection[]
  compact?: boolean
  modelId?: CameraAiModelId
}) {
  const smoking = detections.some(d => d.behavior === 'smoking')
  const fire = detections.some(d => d.behavior === 'fire')
  if (!smoking && !fire) return null

  const smokingStyle = resolveBehaviorStyle(modelId, 'smoking')
  const fireStyle = resolveBehaviorStyle(modelId, 'fire')

  return (
    <div className={cn('absolute left-2 flex flex-col gap-1 z-[10]', compact ? 'top-14' : 'top-[4.5rem]')}>
      {smoking && (
        <span className={cn(
          'rounded font-bold border px-1.5 py-0.5',
          smokingStyle.badge,
          compact ? 'text-[6px]' : 'text-[8px]',
        )}>
          PCCC-001
        </span>
      )}
      {fire && (
        <span className={cn(
          'rounded font-bold border px-1.5 py-0.5',
          fireStyle.badge,
          compact ? 'text-[6px]' : 'text-[8px]',
        )}>
          PCCC-002
        </span>
      )}
    </div>
  )
}
