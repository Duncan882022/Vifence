import { useEffect, useRef, useState, memo, useCallback, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapBackendBboxToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { useMobileAiBackendVersion } from '@/modules/module02-training/hooks/useMobileAiBackendVersion'
import { type MobileAiConnectionStatus } from '@/modules/module02-training/services/mobileAiBackend.service'
import { shouldRunWahOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import {
  createWahClient,
  getMobileAiBackendUrl,
  type WahDetection,
} from '../services/wahBackend.service'
import { notifySafetyAiEventsChanged } from '../services/safetyAiEvents.service'
import { useViolationStickyOverlay } from '../hooks/useViolationStickyOverlay'
import { useStableOverlayDetections } from '../hooks/useStableOverlayDetections'
import { useOverlayLayoutTick } from '../hooks/useOverlayLayoutTick'
import { useOverlaySceneReset } from '../hooks/useOverlaySceneReset'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '../utils/roiOverlayCode'
import { filterWahHarnessFalsePositives } from '../utils/wahHarnessLogic'
import { getOverlayBoxStyle } from '../utils/roiBoxRole'

interface WahOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  enabled?: boolean
  compact?: boolean
}

function formatLabel(detection: WahDetection): string {
  return formatRoiOverlayBadge(
    formatRoiOverlayCode(detection.behavior),
    detection.confidence,
  )
}

function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit,
  videoObjectPosition = 'center',
}: {
  detection: WahDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
}) {
  const style = getOverlayBoxStyle('wah', detection.behavior)
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox

  if (!video?.videoWidth || !video.videoHeight || frameWidth <= 0 || frameHeight <= 0) {
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

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: 7,
      }}
    >
      <div className={cn(
        'absolute inset-0 border rounded-sm',
        style.border,
        style.fill,
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
        setDetections(filtered)
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
  videoObjectPosition = 'center',
  enabled = true,
  compact,
}: WahOverlayProps) {
  const { detections, frameSize, layoutTick } = useWahState(
    cameraId,
    videoRef,
    enabled,
  )

  const stableDetections = useStableOverlayDetections(detections)
  const { visible } = useViolationStickyOverlay(stableDetections, {
    isViolation: d => d.behavior === 'no_harness',
  })

  if (!enabled || visible.length === 0 || frameSize.width <= 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {visible.map((d, i) => (
        <DetectionBox
          key={`${d.behavior}-${i}-${Math.round(d.bbox[0])}-${layoutTick}`}
          detection={d}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
        />
      ))}
    </div>
  )
})
