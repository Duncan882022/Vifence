import { useEffect, useRef, useState, memo, useCallback, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapVideoRectToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { useMobileAiBackendVersion } from '@/modules/module02-training/hooks/useMobileAiBackendVersion'
import {
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { shouldRunWahOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import {
  createWahClient,
  getMobileAiBackendUrl,
  type WahDetection,
} from '../services/wahBackend.service'
import { notifySafetyAiEventsChanged } from '../services/safetyAiEvents.service'
import { useRoiCycleDisplay } from '../hooks/useRoiCycleDisplay'
import { useOverlayLayoutTick } from '../hooks/useOverlayLayoutTick'
import { useOverlaySceneReset } from '../hooks/useOverlaySceneReset'
import { OVERLAY_CYCLE_DEFAULTS, wahScanRank } from '../utils/overlayScanOrder'
import { VIOLATION_MIN_CONFIDENCE } from '../utils/violationConfidence'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '../utils/roiOverlayCode'
import { filterWahHarnessFalsePositives } from '../utils/wahHarnessLogic'

interface WahOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  enabled?: boolean
  compact?: boolean
}

const PERSON_MIN_CONF = 0.45
const VIOLATION_MIN_CONF = VIOLATION_MIN_CONFIDENCE

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
  safety_harness: {
    border: 'border-orange-400/90',
    fill: 'bg-orange-500/14',
    label: 'text-orange-100',
    bg: 'bg-orange-600/35',
  },
  no_harness: {
    border: 'border-red-400/95',
    fill: 'bg-red-500/18',
    label: 'text-red-200',
    bg: 'bg-red-600/40',
  },
}

function formatLabel(detection: WahDetection): string {
  return formatRoiOverlayBadge(
    formatRoiOverlayCode(detection.behavior),
    detection.confidence,
  )
}

/** `filtered` phải đã qua `filterWahHarnessFalsePositives` — tránh lọc lại 2 lần. */
function visibleDetections(filtered: WahDetection[]): WahDetection[] {
  return filtered
    .filter(d => {
      if (d.behavior === 'no_harness') return d.confidence >= VIOLATION_MIN_CONF
      if (d.behavior === 'safety_harness') return d.confidence >= 0.5
      if (d.behavior === 'person') return d.confidence >= PERSON_MIN_CONF
      return d.confidence >= 0.5
    })
    .sort((a, b) => wahScanRank(a.behavior) - wahScanRank(b.behavior))
}

function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit,
  pulse,
}: {
  detection: WahDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  pulse?: boolean
}) {
  const style = BEHAVIOR_STYLE[detection.behavior] ?? BOX_STYLE
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox
  const layerZ = detection.behavior === 'no_harness' ? 7
    : detection.behavior === 'safety_harness' ? 6
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
      <div className={cn(
        'absolute inset-0 border rounded-sm',
        style.border,
        style.fill,
        pulse && 'animate-pulse',
      )} />
      <span
        className={cn(
          'absolute -top-3 left-0 px-0.5 py-px font-mono whitespace-nowrap rounded-sm',
          style.bg,
          style.label,
          compact ? 'text-[5px]' : 'text-[7px]',
        )}
      >
        {formatLabel(detection)}
      </span>
    </div>
  )
}

function useWahState(
  cameraId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const clientRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [detections, setDetections] = useState<WahDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const layoutTick = useOverlayLayoutTick(videoRef)
  const backendUrlVersion = useMobileAiBackendVersion()
  const resetDetections = useCallback(() => setDetections([]), [])
  useOverlaySceneReset(videoRef, enabled, resetDetections)

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video) {
      clientRef.current?.stop()
      clientRef.current = null
      setDetections([])
      setStatus('idle')
      return
    }

    const shouldAnalyze = () => shouldRunWahOnCamera(cameraId, video.currentTime)

    clientRef.current?.stop()
    clientRef.current = createWahClient(video, {
      cameraId,
      backendUrl: getMobileAiBackendUrl(),
      shouldAnalyze,
      onStatusChange: (s, msg) => {
        setStatus(s)
        setStatusMsg(msg)
      },
      onResult: result => {
        if (!shouldRunWahOnCamera(cameraId, video.currentTime)) {
          setDetections([])
          return
        }
        const filtered = filterWahHarnessFalsePositives(result.detections)
        setFrameSize({ width: result.width, height: result.height })
        setDetections(visibleDetections(filtered))
        if (result.events.length > 0) {
          notifySafetyAiEventsChanged()
        }
      },
    })

    const onSegmentChange = () => {
      if (!shouldRunWahOnCamera(cameraId, video.currentTime)) {
        setDetections([])
      }
    }
    video.addEventListener('timeupdate', onSegmentChange)
    video.addEventListener('seeked', onSegmentChange)

    return () => {
      video.removeEventListener('timeupdate', onSegmentChange)
      video.removeEventListener('seeked', onSegmentChange)
      clientRef.current?.stop()
      clientRef.current = null
    }
  }, [cameraId, enabled, videoRef, backendUrlVersion])

  return { status, statusMsg, detections, frameSize, layoutTick }
}

export const WahOverlay = memo(function WahOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  enabled = true,
  compact,
}: WahOverlayProps) {
  const { detections, frameSize, layoutTick } = useWahState(
    cameraId,
    videoRef,
    enabled,
  )

  const { visible: cycledDetections, pulse } = useRoiCycleDisplay(
    detections,
    d => d.behavior === 'no_harness',
    {
      getScanRank: d => wahScanRank(d.behavior),
      ...OVERLAY_CYCLE_DEFAULTS,
    },
  )
  const showContent = enabled && detections.length > 0 && frameSize.width > 0

  if (!showContent) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {cycledDetections.map((d, i) => (
        <DetectionBox
          key={`${d.behavior}-${i}-${Math.round(d.bbox[0])}-${layoutTick}`}
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
