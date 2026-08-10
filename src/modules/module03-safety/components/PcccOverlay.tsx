import { useEffect, useRef, useState, memo, useCallback, type RefObject } from 'react'
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
import { useVmsDetections } from '../context/VmsDetectionContext'
import { useOverlayLayoutTick } from '../hooks/useOverlayLayoutTick'
import { useOverlaySceneReset } from '../hooks/useOverlaySceneReset'
import {
  getVideoObjectFitForCamera,
  getVideoObjectPositionForCamera,
} from '@/modules/module02-training/data/trainingCameraFeeds'
import { formatRoiOverlayCode } from '../utils/roiOverlayCode'

function visibleDetections(detections: MobileAiDetection[]): MobileAiDetection[] {
  return detections.filter(d =>
    (d.behavior === 'smoking' || d.behavior === 'fire') && d.confidence >= 0.45,
  )
}

interface PcccOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  enabled?: boolean
  compact?: boolean
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
}

function toOverlayDetections(detections: PcccDetection[]): MobileAiDetection[] {
  return detections.map(d => ({
    behavior: d.behavior,
    label: formatRoiOverlayCode(d.behavior),
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
  const resetDetections = useCallback(() => setDetections([]), [])
  useOverlaySceneReset(videoRef, enabled, resetDetections)
  const vms = useVmsDetections()

  useEffect(() => {
    if (!enabled || !vms?.active || !vms.snapshot) return
    setFrameSize({ width: vms.snapshot.width, height: vms.snapshot.height })
    setDetections(visibleDetections(
      vms.snapshot.detections
        .filter(d => d.behavior === 'smoking' || d.behavior === 'fire')
        .map(d => ({
          behavior: d.behavior as PcccDetection['behavior'],
          label: formatRoiOverlayCode(d.behavior),
          confidence: d.confidence,
          bbox: d.bbox,
        })),
    ))
    setStatus(vms.status)
    setStatusMsg(vms.statusMsg)
  }, [enabled, vms?.active, vms?.snapshot?.updated_at, vms?.status, vms?.statusMsg])

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video || vms?.active) {
      clientRef.current?.stop()
      clientRef.current = null
      if (!enabled) {
        setDetections([])
        setStatus('idle')
      }
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
  }, [cameraId, enabled, videoRef, backendUrlVersion, vms?.active])

  return { status, statusMsg, detections, frameSize, layoutTick }
}

export const PcccOverlay = memo(function PcccOverlay({
  cameraId,
  videoRef,
  enabled = true,
  compact,
  videoFit = 'cover',
  videoObjectPosition = 'center',
}: PcccOverlayProps) {
  const { detections, frameSize, layoutTick } = usePcccState(
    cameraId,
    videoRef,
    enabled,
  )

  const showContent = enabled && detections.length > 0 && frameSize.width > 0

  const resolvedFit = videoFit ?? getVideoObjectFitForCamera(cameraId)
  const resolvedPosition = videoObjectPosition ?? getVideoObjectPositionForCamera(cameraId)

  if (!showContent) return null

  return (
    <MobileAiOverlay
      detections={detections}
      frameWidth={frameSize.width}
      frameHeight={frameSize.height}
      videoRef={videoRef}
      layoutTick={layoutTick}
      compact={compact}
      modelId="pccc"
      videoFit={resolvedFit}
      videoObjectPosition={resolvedPosition}
    />
  )
})
