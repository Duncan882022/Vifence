import { useEffect, useRef, useState, memo, useCallback, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapVideoRectToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import {
  MOBILE_AI_BACKEND_STORAGE_KEY,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { shouldRunPpeOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import {
  createPpeClient,
  getMobileAiBackendUrl,
  type PpeDetection,
  type PpeMetrics,
} from '../services/ppeBackend.service'
import { useRoiCycleDisplay } from '../hooks/useRoiCycleDisplay'
import { OVERLAY_CYCLE_DEFAULTS, ppeScanRank, ppeViolationRank } from '../utils/overlayScanOrder'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '../utils/roiOverlayCode'
import { notifySafetyAiEventsChanged } from '../services/safetyAiEvents.service'
import { VIOLATION_MIN_CONFIDENCE } from '../utils/violationConfidence'
import { useOverlaySceneReset } from '../hooks/useOverlaySceneReset'
import { modelBoxStyle } from '@/modules/module02-training/data/cameraAiModelTokens'

const VIOLATION_MIN_CONF = VIOLATION_MIN_CONFIDENCE
const SUBJECT_STYLE = modelBoxStyle('ppe', 'subject')
const VIOLATION_STYLE = modelBoxStyle('ppe', 'violation')

const BEHAVIOR_STYLE: Record<string, { border: string; fill: string; label: string; bg: string }> = {
  person: SUBJECT_STYLE,
  hard_hat: SUBJECT_STYLE,
  safety_vest: SUBJECT_STYLE,
  safety_shoes: SUBJECT_STYLE,
  no_helmet: VIOLATION_STYLE,
  no_vest: VIOLATION_STYLE,
  no_shoes: VIOLATION_STYLE,
}

const COMPLIANT_BEHAVIORS = new Set(['hard_hat', 'safety_vest', 'safety_shoes'])

function visibleDetections(detections: PpeDetection[]): PpeDetection[] {
  return detections.filter(d => {
    if (COMPLIANT_BEHAVIORS.has(d.behavior)) return false
    if (d.behavior === 'person') return true
    if (d.behavior.startsWith('no_')) return d.confidence >= VIOLATION_MIN_CONF
    return d.confidence >= 0.40
  })
}

/** Chỉ ROI vi phạm + người — không hiển thị bbox “đang mang đồ”. */
function overlayDetections(detections: PpeDetection[]): PpeDetection[] {
  return visibleDetections(detections).sort(
    (a, b) => {
      const diff = ppeScanRank(a.behavior, a.bbox) - ppeScanRank(b.behavior, b.bbox)
      if (diff !== 0) return diff
      return a.bbox[0] - b.bbox[0]
    },
  )
}

interface PpeOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  enabled?: boolean
  compact?: boolean
}

function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit = 'contain',
  pulse,
}: {
  detection: PpeDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  pulse?: boolean
}) {
  const style = BEHAVIOR_STYLE[detection.behavior] ?? BEHAVIOR_STYLE.person
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox
  const isViolation = detection.behavior.startsWith('no_')

  if (!video?.videoWidth || !video.videoHeight || frameWidth <= 0 || frameHeight <= 0) {
    return null
  }

  const sx = video.videoWidth / frameWidth
  const sy = video.videoHeight / frameHeight
  const box = mapVideoRectToOverlay(
    { x: x1 * sx, y: y1 * sy, width: (x2 - x1) * sx, height: (y2 - y1) * sy },
    video,
    videoFit,
  )

  if (box.w <= 0.5 || box.h <= 0.5) return null

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: isViolation ? 8 : 4,
      }}
    >
      <div className={cn(
        'absolute inset-0 border rounded-sm',
        style.border,
        style.fill,
        pulse && 'animate-pulse',
      )} />
      {!compact || isViolation ? (
        <span
          className={cn(
            'absolute -top-3 left-0 px-0.5 py-px font-mono whitespace-nowrap rounded-sm',
            style.bg,
            style.label,
            compact ? 'text-[5px]' : 'text-[7px]',
          )}
        >
          {formatRoiOverlayBadge(
            formatRoiOverlayCode(detection.behavior, detection.scenario_id),
            detection.confidence,
          )}
        </span>
      ) : null}
    </div>
  )
}

function usePpeState(
  cameraId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const clientRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [detections, setDetections] = useState<PpeDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [metrics, setMetrics] = useState<PpeMetrics>()
  const [layoutTick, setLayoutTick] = useState(0)
  const [backendUrlVersion, setBackendUrlVersion] = useState(0)
  const resetDetections = useCallback(() => setDetections([]), [])
  useOverlaySceneReset(videoRef, enabled, resetDetections)

  useEffect(() => {
    const bump = () => setBackendUrlVersion(v => v + 1)
    const onStorage = (e: StorageEvent) => {
      if (e.key === MOBILE_AI_BACKEND_STORAGE_KEY) bump()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('vifence-mobile-ai-backend-changed', bump)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('vifence-mobile-ai-backend-changed', bump)
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video) {
      clientRef.current?.stop()
      clientRef.current = null
      setDetections([])
      setStatus('idle')
      return
    }

    const shouldAnalyze = () => shouldRunPpeOnCamera(cameraId, video.currentTime)

    clientRef.current?.stop()
    clientRef.current = createPpeClient(video, {
      cameraId,
      backendUrl: getMobileAiBackendUrl(),
      shouldAnalyze,
      onStatusChange: (s, msg) => {
        setStatus(s)
        setStatusMsg(msg)
      },
      onResult: result => {
        setFrameSize({ width: result.width, height: result.height })
        setMetrics(result.metrics)
        setDetections(overlayDetections(result.detections))
        if (result.events && result.events.length > 0) {
          notifySafetyAiEventsChanged()
        }
      },
    })

    return () => {
      clientRef.current?.stop()
      clientRef.current = null
    }
  }, [cameraId, enabled, videoRef, backendUrlVersion])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const bump = () => setLayoutTick(v => v + 1)
    video.addEventListener('loadedmetadata', bump)
    video.addEventListener('resize', bump)
    window.addEventListener('resize', bump)
    return () => {
      video.removeEventListener('loadedmetadata', bump)
      video.removeEventListener('resize', bump)
      window.removeEventListener('resize', bump)
    }
  }, [videoRef, layoutTick])

  return { status, statusMsg, detections, frameSize, metrics }
}

export const PpeOverlay = memo(function PpeOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  enabled = true,
  compact,
}: PpeOverlayProps) {
  const { detections, frameSize } = usePpeState(cameraId, videoRef, enabled)
  const { visible: cycledDetections, pulse } = useRoiCycleDisplay(
    detections,
    d => d.behavior.startsWith('no_'),
    {
      getScanRank: d => ppeScanRank(d.behavior, d.bbox),
      getViolationRank: d => ppeViolationRank(d.behavior, d.bbox),
      ...OVERLAY_CYCLE_DEFAULTS,
    },
  )

  const showContent = cycledDetections.length > 0 && frameSize.width > 0

  if (!showContent) return null

  return (
    <>
      {cycledDetections.map((d, i) => (
        <DetectionBox
          key={`${d.behavior}-${i}-${d.bbox.join(',')}`}
          detection={d}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
          pulse={pulse}
        />
      ))}
    </>
  )
})
