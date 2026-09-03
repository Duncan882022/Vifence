import { memo, useEffect, useMemo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { canProjectOverlayBox, mapBackendBboxToOverlay } from '../utils/videoOverlayCoords'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '@/modules/module03-safety/utils/roiOverlayCode'
import type { MobileAiDetection } from '../services/mobileAiBackend.service'
import type { CameraAiModelId } from '../types/cameraAi.types'
import { getCameraAiModelVisual } from '../data/cameraAiModelTokens'
import { getOverlayBoxStyle, isAtldViolationBehavior } from '@/modules/module03-safety/utils/roiBoxRole'
import { shouldShowOverlayBox } from '@/modules/module03-safety/utils/overlayCoverage'
import { useViolationStickyOverlay } from '@/modules/module03-safety/hooks/useViolationStickyOverlay'
import { useRoiCycleDisplay } from '@/modules/module03-safety/hooks/useRoiCycleDisplay'
import { useStableOverlayDetections } from '@/modules/module03-safety/hooks/useStableOverlayDetections'
import { ppeScanRank, ppeViolationRank } from '@/modules/module03-safety/utils/overlayScanOrder'
import {
  formatPersonOverlayBadge,
  formatPpeViolationOverlayBadge,
} from '@/modules/module03-safety/utils/personOverlayLabel'
import { syncPersonOverlaySession } from '@/modules/module03-safety/utils/personOverlaySession'
import { overlayBoxMotionClass, overlayBoxTrackingClass } from '@/modules/module03-safety/utils/overlayBoxMotion'
import { MOBILE_TRACK_LOCK_CONFIG } from '@/modules/module03-safety/utils/liveOverlaySync'

interface MobileAiOverlayProps {
  detections: MobileAiDetection[]
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  layoutTick?: number
  compact?: boolean
  modelId?: CameraAiModelId
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  /** Bám đối tượng IoU + làm mượt bbox (HC bodycam person ROI). */
  objectTracking?: boolean
}

function resolveBehaviorStyle(modelId: CameraAiModelId, behavior: string) {
  const box = getOverlayBoxStyle(modelId, behavior)
  const visual = getCameraAiModelVisual(modelId)
  return {
    border: box.border,
    fill: box.fill,
    label: cn(box.bg, box.label),
    badge: visual.badge,
    role: box.role,
  }
}

function formatMobileDetectionBadge(det: MobileAiDetection, modelId: CameraAiModelId): string {
  if (det.behavior === 'person') {
    const suffix = det.weak ? ' ?' : ''
    return formatPersonOverlayBadge(det.worker_name, det.confidence, suffix, {
      workerId: det.worker_id,
      workerName: det.worker_name,
    })
  }
  if (modelId === 'ppe' && det.behavior.startsWith('no_')) {
    return formatPpeViolationOverlayBadge({
      behavior: det.behavior,
      confidence: det.confidence,
      worker_id: det.worker_id,
      worker_name: det.worker_name,
    })
  }
  return formatRoiOverlayBadge(
    formatRoiOverlayCode(det.behavior),
    det.confidence,
  )
}

const DetectionBox = memo(function DetectionBox({
  det,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  modelId,
  videoFit = 'cover',
  videoObjectPosition = 'center',
  pulse = false,
  trackId,
  snapMotion = false,
}: {
  det: MobileAiDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  modelId: CameraAiModelId
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  pulse?: boolean
  trackId?: string
  snapMotion?: boolean
}) {
  const [x1, y1, x2, y2] = det.bbox
  const isWeakPerson = det.behavior === 'person' && Boolean(det.weak)
  const style = isWeakPerson
    ? {
        border: 'border-2 border-amber-400/90',
        fill: 'bg-amber-400/12',
        label: 'bg-amber-950/85 text-amber-200',
        badge: '',
        role: 'info' as const,
      }
    : resolveBehaviorStyle(modelId, det.behavior)
  const video = videoRef.current

  if (!canProjectOverlayBox(video, frameWidth, frameHeight)) return null

  if (isWeakPerson) {
    if (det.confidence < 0.35) return null
  } else if (!shouldShowOverlayBox(det.confidence, det.bbox as [number, number, number, number])) {
    return null
  }

  const box = mapBackendBboxToOverlay(
    [x1, y1, x2, y2],
    frameWidth,
    frameHeight,
    video,
    videoFit,
    videoObjectPosition,
  )

  if (box.w <= 0.5 || box.h <= 0.5) return null

  const displayLabel = formatMobileDetectionBadge(det, modelId)

  return (
    <div
      className={cn(snapMotion ? overlayBoxTrackingClass() : overlayBoxMotionClass(false), pulse && 'animate-pulse')}
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: det.behavior === 'person' ? 8 : 9,
      }}
      data-track-id={trackId}
    >
      <div className={cn(
        'absolute inset-0 rounded-sm',
        style.border,
        style.fill,
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
  modelId = 'pccc',
  videoFit = 'cover',
  videoObjectPosition = 'center',
  objectTracking = false,
}: MobileAiOverlayProps) {
  const isPpe = modelId === 'ppe'
  const trackedDetections = useStableOverlayDetections(
    useMemo(
      () => detections.map(d => ({
        ...d,
        confidence: d.confidence,
        bbox: d.bbox as [number, number, number, number],
      })),
      [detections],
    ),
    objectTracking
      ? { trackLock: MOBILE_TRACK_LOCK_CONFIG, predictBetweenFrames: true }
      : undefined,
  )

  const sourceDetections = objectTracking ? trackedDetections : detections

  const stickyInput = useMemo(
    () => sourceDetections.map(d => ({
      ...d,
      confidence: d.confidence,
      bbox: d.bbox as [number, number, number, number],
    })),
    [sourceDetections],
  )

  useEffect(() => {
    if (!isPpe) return
    syncPersonOverlaySession(
      stickyInput
        .filter(d => d.behavior === 'person')
        .map(d => d.worker_id),
    )
  }, [isPpe, stickyInput])

  const { visible: stickyVisible } = useViolationStickyOverlay(stickyInput, {
    isViolation: d => isAtldViolationBehavior(d.behavior),
  })

  const { visible: cycleVisible, pulse } = useRoiCycleDisplay(
    stickyInput,
    d => d.behavior.startsWith('no_'),
    {
      enabled: isPpe && !objectTracking,
      getScanRank: d => ppeScanRank(d.behavior, d.bbox),
      getViolationRank: d => ppeViolationRank(d.behavior, d.bbox),
    },
  )

  const visible = objectTracking
    ? stickyInput.filter(d => shouldShowOverlayBox(d.confidence, d.bbox))
    : isPpe
      ? cycleVisible
      : stickyVisible

  if (visible.length === 0 || frameWidth <= 0 || frameHeight <= 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[9]">
      {visible.map((det, i) => {
        const trackId = 'trackId' in det ? (det as { trackId?: string }).trackId : undefined
        return (
        <DetectionBox
          key={trackId ?? `${det.behavior}-${det.label}-${i}-${layoutTick}`}
          det={det}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
          videoRef={videoRef}
          compact={compact}
          modelId={modelId}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
          pulse={!objectTracking && isPpe && pulse && det.behavior === 'person'}
          trackId={trackId}
          snapMotion={objectTracking}
        />
        )
      })}
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
  const smoking = detections.some(d => d.behavior === 'smoking' && d.confidence >= 0.70)
  const fire = detections.some(d => d.behavior === 'fire' && d.confidence >= 0.70)
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
        )}
        >
          Hút thuốc
        </span>
      )}
      {fire && (
        <span className={cn(
          'rounded font-bold border px-1.5 py-0.5',
          fireStyle.badge,
          compact ? 'text-[6px]' : 'text-[8px]',
        )}
        >
          Lửa
        </span>
      )}
    </div>
  )
}
