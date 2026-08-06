import { useEffect, useRef, useState, memo, type RefObject } from 'react'
import { MobileAiOverlay } from '@/modules/module02-training/components/MobileAiOverlay'
import {
  type MobileAiConnectionStatus,
  type MobileAiDetection,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { useMobileAiBackendVersion } from '@/modules/module02-training/hooks/useMobileAiBackendVersion'
import { shouldRunPcccOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import {
  createPcccClient,
  getMobileAiBackendUrl,
  type PcccDetection,
} from '../services/pcccBackend.service'
import { notifySafetyAiEventsChanged } from '../services/safetyAiEvents.service'
import { useRoiCycleDisplay } from '../hooks/useRoiCycleDisplay'
import { useOverlayLayoutTick } from '../hooks/useOverlayLayoutTick'
import { OVERLAY_CYCLE_DEFAULTS, pcccScanRank, pcccViolationRank } from '../utils/overlayScanOrder'
import { VIOLATION_MIN_CONFIDENCE } from '../utils/violationConfidence'

function visibleDetections(detections: MobileAiDetection[]): MobileAiDetection[] {
  return detections.filter(d => {
    if (d.behavior === 'smoking' || d.behavior === 'fire') {
      return d.confidence >= VIOLATION_MIN_CONFIDENCE
    }
    if (d.behavior === 'person') return true
    return d.confidence >= 0.40
  })
}

interface PcccOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  enabled?: boolean
  compact?: boolean
}

function toOverlayDetections(detections: PcccDetection[]): MobileAiDetection[] {
  return detections.map(d => ({
    behavior: d.behavior,
    label: d.label,
    confidence: d.confidence,
    bbox: d.bbox,
  }))
}

function usePcccState(
  cameraId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const clientRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [detections, setDetections] = useState<MobileAiDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const layoutTick = useOverlayLayoutTick(videoRef)
  const backendUrlVersion = useMobileAiBackendVersion()

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video) {
      clientRef.current?.stop()
      clientRef.current = null
      setDetections([])
      setStatus('idle')
      return
    }

    const shouldAnalyze = () => shouldRunPcccOnCamera(cameraId, video.currentTime)

    clientRef.current?.stop()
    clientRef.current = createPcccClient(video, {
      cameraId,
      backendUrl: getMobileAiBackendUrl(),
      shouldAnalyze,
      onStatusChange: (s, msg) => {
        setStatus(s)
        setStatusMsg(msg)
      },
      onResult: result => {
        if (!shouldRunPcccOnCamera(cameraId, video.currentTime)) {
          setDetections([])
          return
        }
        setFrameSize({ width: result.width, height: result.height })
        setDetections(visibleDetections(toOverlayDetections(result.detections)))
        if (result.events.length > 0) {
          notifySafetyAiEventsChanged()
        }
      },
    })

    const onSegmentChange = () => {
      if (!shouldRunPcccOnCamera(cameraId, video.currentTime)) {
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

export const PcccOverlay = memo(function PcccOverlay({
  cameraId,
  videoRef,
  enabled = true,
  compact,
}: PcccOverlayProps) {
  const { detections, frameSize, layoutTick } = usePcccState(
    cameraId,
    videoRef,
    enabled,
  )

  const { visible: cycledDetections, pulse } = useRoiCycleDisplay(
    detections,
    d => d.behavior === 'smoking' || d.behavior === 'fire',
    {
      getScanRank: d => pcccScanRank(d.behavior),
      getViolationRank: d => pcccViolationRank(d.behavior),
      ...OVERLAY_CYCLE_DEFAULTS,
    },
  )

  const showContent = enabled && cycledDetections.length > 0 && frameSize.width > 0

  if (!showContent) return null

  return (
    <MobileAiOverlay
      detections={cycledDetections}
      frameWidth={frameSize.width}
      frameHeight={frameSize.height}
      videoRef={videoRef}
      layoutTick={layoutTick}
      compact={compact}
      pulse={pulse}
    />
  )
})
