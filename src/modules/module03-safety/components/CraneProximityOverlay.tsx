import { useCallback, useEffect, useRef, useState, memo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapVideoRectToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { type MobileAiConnectionStatus } from '@/modules/module02-training/services/mobileAiBackend.service'
import { useMobileAiBackendVersion } from '@/modules/module02-training/hooks/useMobileAiBackendVersion'
import { useOverlaySceneReset } from '../hooks/useOverlaySceneReset'
import {
  createCraneProximityClient,
  getMobileAiBackendUrl,
  type CraneProximityDetection,
  type CraneProximityMetrics,
} from '../services/craneProximityBackend.service'
import { shouldRunCraneOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import { notifySafetyAiEventsChanged } from '../services/safetyAiEvents.service'
import { useRoiCycleDisplay } from '../hooks/useRoiCycleDisplay'
import { craneScanRank, OVERLAY_CYCLE_DEFAULTS } from '../utils/overlayScanOrder'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '../utils/roiOverlayCode'
import { VIOLATION_MIN_CONFIDENCE } from '../utils/violationConfidence'

const EVENT_MIN_CONFIDENCE = VIOLATION_MIN_CONFIDENCE
const UNKNOWN_MIN_CONFIDENCE = 0.45

const BOX_STYLE = {
  border: 'border-gray-400/80',
  fill: 'bg-gray-400/10',
  label: 'text-gray-200',
  bg: 'bg-gray-600/35',
} as const

const BEHAVIOR_STYLE: Record<
  string,
  { border: string; fill: string; label: string; bg: string }
> = {
  person: BOX_STYLE,
  unknown: BOX_STYLE,
  crane: {
    border: 'border-amber-400/90',
    fill: 'bg-amber-400/10',
    label: 'text-amber-200',
    bg: 'bg-amber-500/35',
  },
  crane_green: {
    border: 'border-emerald-400/95',
    fill: 'bg-emerald-400/12',
    label: 'text-emerald-100',
    bg: 'bg-emerald-700/45',
  },
  sany_drill: {
    border: 'border-orange-400/95',
    fill: 'bg-orange-400/12',
    label: 'text-orange-200',
    bg: 'bg-orange-600/40',
  },
  excavator_orange: {
    border: 'border-orange-400/95',
    fill: 'bg-orange-400/12',
    label: 'text-orange-200',
    bg: 'bg-orange-600/40',
  },
  tower_crane: {
    border: 'border-yellow-300/95',
    fill: 'bg-yellow-300/12',
    label: 'text-yellow-100',
    bg: 'bg-yellow-500/40',
  },
  crane_proximity: {
    border: 'border-red-400/95',
    fill: 'bg-red-500/18',
    label: 'text-red-200',
    bg: 'bg-red-600/40',
  },
}

function formatDetectionBadge(
  detection: CraneProximityDetection,
  isPending: boolean,
): string {
  const behaviorKey = detection.behavior === 'crane' && detection.machine_kind
    ? detection.machine_kind
    : detection.behavior
  const code = formatRoiOverlayCode(behaviorKey, detection.scenario_id)
  const distLabel = formatDistanceLabel(detection.distance_m)
  const pending = isPending ? ' ·LB' : ''
  return formatRoiOverlayBadge(code, detection.confidence, `${distLabel}${pending}`)
}

function formatDistanceLabel(distanceM: number | undefined): string {
  if (distanceM == null || distanceM <= 0) return ''
  return ` · ${distanceM.toFixed(1)}m`
}

interface CraneProximityOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  enabled?: boolean
  compact?: boolean
}

function resolveDetectionStyle(detection: CraneProximityDetection) {
  if (
    detection.label === 'Unknown'
    || detection.label === 'person_unknown'
    || detection.behavior === 'unknown'
  ) {
    return BOX_STYLE
  }
  if (detection.behavior === 'crane' && detection.machine_kind) {
    return BEHAVIOR_STYLE[detection.machine_kind as keyof typeof BEHAVIOR_STYLE] ?? BEHAVIOR_STYLE.crane
  }
  return BEHAVIOR_STYLE[detection.behavior] ?? BOX_STYLE
}

const DetectionBox = memo(function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit = 'contain',
  pulse,
}: {
  detection: CraneProximityDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  pulse?: boolean
}) {
  const style = resolveDetectionStyle(detection)
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox
  const isGreenExcavator = detection.machine_kind === 'crane_green'
  const isPending = detection.behavior === 'crane' && detection.confidence < EVENT_MIN_CONFIDENCE
  const layerZ = detection.behavior === 'crane_proximity'
    ? 7
    : isGreenExcavator
      ? 6
      : detection.machine_kind === 'sany_drill'
        ? 5
        : detection.machine_kind === 'tower_crane'
          ? 4
          : 3

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

  const displayLabel = formatDetectionBadge(detection, isPending)

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: layerZ,
      }}
    >
      <div
        className={cn(
          'absolute inset-0 border rounded-sm',
          style.border,
          style.fill,
          isPending && 'border-dashed opacity-60',
          pulse && 'animate-pulse',
        )}
      />
      <span
        className={cn(
          'absolute -top-3 left-0 px-0.5 py-px font-mono whitespace-nowrap rounded-sm',
          style.bg,
          style.label,
          compact ? 'text-[5px]' : 'text-[7px]',
          isPending && 'opacity-70',
        )}
      >
        {displayLabel}
      </span>
    </div>
  )
})

function useCraneProximityState(
  cameraId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const clientRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [detections, setDetections] = useState<CraneProximityDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [metrics, setMetrics] = useState<CraneProximityMetrics>()
  const [layoutTick, setLayoutTick] = useState(0)
  const backendUrlVersion = useMobileAiBackendVersion()
  const resetDetections = useCallback(() => setDetections([]), [])
  useOverlaySceneReset(videoRef, enabled, resetDetections)

  const syncSegment = (video: HTMLVideoElement) => {
    if (!shouldRunCraneOnCamera(cameraId, video.currentTime)) {
      setDetections([])
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video || !enabled) return
    const bump = () => setLayoutTick(t => t + 1)
    const onSegmentChange = () => {
      syncSegment(video)
    }
    const observer = new ResizeObserver(bump)
    observer.observe(video)
    video.addEventListener('loadedmetadata', bump)
    video.addEventListener('seeked', onSegmentChange)
    video.addEventListener('timeupdate', onSegmentChange)
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', bump)
      video.removeEventListener('seeked', onSegmentChange)
      video.removeEventListener('timeupdate', onSegmentChange)
    }
  }, [cameraId, enabled, videoRef])

  const stopClient = useCallback(() => {
    clientRef.current?.stop()
    clientRef.current = null
  }, [])

  useEffect(() => {
    stopClient()
    if (!enabled) {
      setStatus('idle')
      setDetections([])
      return
    }

    const video = videoRef.current
    const backendUrl = getMobileAiBackendUrl()
    if (!video || !backendUrl) {
      setStatus('error')
      setStatusMsg('Chưa có URL backend — bấm ⚙ (dùng chung Mobile cam).')
      return
    }

    clientRef.current = createCraneProximityClient(video, {
      cameraId,
      backendUrl,
      shouldAnalyze: () => shouldRunCraneOnCamera(cameraId, video.currentTime),
      onResult: result => {
        syncSegment(video)
        if (!shouldRunCraneOnCamera(cameraId, video.currentTime)) {
          setDetections([])
          return
        }

        const visible = result.detections
          .filter(d => {
          if (d.behavior === 'crane_proximity') return d.confidence >= EVENT_MIN_CONFIDENCE
          if (
            d.behavior === 'unknown'
            || d.label === 'Unknown'
            || d.label === 'person_unknown'
          ) {
            return d.confidence >= UNKNOWN_MIN_CONFIDENCE
          }
          if (d.behavior === 'person') return d.confidence >= UNKNOWN_MIN_CONFIDENCE
          // Máy móc (crane/crane_green/sany_drill/tower_crane): vẫn vẽ bbox khi
          // AI phát hiện được nhưng chưa đủ ngưỡng — giúp giám sát biết đã detect.
          return d.confidence >= 0.40
        })
          .sort((a, b) => {
            const rank = (d: CraneProximityDetection) =>
              craneScanRank(d.behavior, d.machine_kind)
            return rank(a) - rank(b)
          })
        setDetections(visible)
        setFrameSize({ width: result.width, height: result.height })
        setMetrics(result.metrics)

        const backendViolation = (result.events ?? []).some(
          e => e.behavior === 'crane_proximity' && e.confidence >= EVENT_MIN_CONFIDENCE,
        )
        if (backendViolation) {
          notifySafetyAiEventsChanged()
        }
      },
      onStatusChange: (next, msg) => {
        setStatus(next)
        setStatusMsg(msg)
      },
    })

    return stopClient
  }, [cameraId, enabled, stopClient, videoRef, backendUrlVersion])

  return { status, statusMsg, detections, frameSize, metrics, layoutTick }
}

export const CraneProximityOverlay = memo(function CraneProximityOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  enabled = true,
  compact,
}: CraneProximityOverlayProps) {
  const { detections, frameSize, layoutTick } =
    useCraneProximityState(cameraId, videoRef, enabled)

  const { visible: cycledDetections, pulse } = useRoiCycleDisplay<CraneProximityDetection>(
    detections,
    d => d.behavior === 'crane_proximity',
    {
      ...OVERLAY_CYCLE_DEFAULTS,
      getScanRank: (d: CraneProximityDetection) => craneScanRank(d.behavior, d.machine_kind),
    },
  )
  const showContent = enabled && detections.length > 0 && frameSize.width > 0

  if (!showContent) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {cycledDetections.map(d => (
        <DetectionBox
          key={`${d.behavior}-${d.machine_kind ?? 'none'}-${Math.round(d.bbox[0])}-${Math.round(d.bbox[1])}-${layoutTick}`}
          detection={d}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
          pulse={pulse}
        />
      ))}
    </div>
  )
})
