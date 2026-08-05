import { useEffect, useRef, useState, memo, type RefObject } from 'react'
import { MobileAiOverlay } from '@/modules/module02-training/components/MobileAiOverlay'
import {
  MOBILE_AI_BACKEND_STORAGE_KEY,
  type MobileAiConnectionStatus,
  type MobileAiDetection,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { shouldRunPcccOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import {
  cam04PcccDemoDetections,
  isInCam04PcccDemoSegment,
} from '../data/cam04PcccDemo'
import {
  createPcccClient,
  getMobileAiBackendUrl,
  type PcccDetection,
} from '../services/pcccBackend.service'
import {
  notifySafetyAiEventsChanged,
} from '../services/safetyAiEvents.service'
import {
  registerPcccFireDemoEvent,
  registerPcccSmokingDemoEvent,
  resetPcccDemoEventSegment,
} from '../services/pcccDemoEvents.service'
import { useRoiCycleDisplay } from '../hooks/useRoiCycleDisplay'
import { OVERLAY_CYCLE_DEFAULTS, pcccScanRank, pcccViolationRank } from '../utils/overlayScanOrder'
import { VIOLATION_MIN_CONFIDENCE } from '../utils/violationConfidence'
import {
  capturePcccFireSnapshot,
  capturePcccSmokingSnapshot,
} from '../utils/capturePcccSnapshot'

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

function demoDetectionsForVideo(video: HTMLVideoElement): PcccDetection[] {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return []
  return cam04PcccDemoDetections(w, h)
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
  const [layoutTick, setLayoutTick] = useState(0)
  const [backendUrlVersion, setBackendUrlVersion] = useState(0)
  const [inSegment, setInSegment] = useState(false)
  const segmentLoggedRef = useRef<{ smoking?: string; fire?: string }>({})

  const maybeLogDemoEvents = (
    video: HTMLVideoElement,
    items: MobileAiDetection[],
  ) => {
    if (cameraId !== 'A-04' || !isInCam04PcccDemoSegment(video.currentTime)) return

    const loopPass = Math.floor(video.currentTime / Math.max(video.duration || 25, 1))
    const smoking = items.find(
      d => d.behavior === 'smoking' && d.confidence >= VIOLATION_MIN_CONFIDENCE,
    )
    if (smoking) {
      const key = `${loopPass}-smoking`
      if (segmentLoggedRef.current.smoking !== key) {
        registerPcccSmokingDemoEvent({
          cameraId,
          confidence: smoking.confidence,
          segmentKey: key,
          snapshotUrl: capturePcccSmokingSnapshot(video, smoking.bbox) ?? undefined,
        })
        segmentLoggedRef.current.smoking = key
      }
    }

    const fire = items.find(
      d => d.behavior === 'fire' && d.confidence >= VIOLATION_MIN_CONFIDENCE,
    )
    if (fire) {
      const key = `${loopPass}-fire`
      if (segmentLoggedRef.current.fire !== key) {
        registerPcccFireDemoEvent({
          cameraId,
          confidence: fire.confidence,
          segmentKey: key,
          snapshotUrl: capturePcccFireSnapshot(video, fire.bbox) ?? undefined,
        })
        segmentLoggedRef.current.fire = key
      }
    }
  }

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
      setInSegment(false)
      return
    }

    const applyDetections = (items: PcccDetection[], width: number, height: number) => {
      const overlayItems = visibleDetections(toOverlayDetections(items))
      setFrameSize({ width, height })
      setDetections(overlayItems)
      maybeLogDemoEvents(video, overlayItems)
    }

    const syncDemo = () => {
      const active = cameraId === 'A-04' && isInCam04PcccDemoSegment(video.currentTime)
      setInSegment(active)
      if (active && shouldRunPcccOnCamera(cameraId, video.currentTime)) {
        const demo = demoDetectionsForVideo(video)
        if (demo.length > 0) {
          applyDetections(demo, video.videoWidth, video.videoHeight)
        }
      } else if (!active) {
        setDetections([])
        segmentLoggedRef.current = {}
        resetPcccDemoEventSegment()
      }
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
        const items = result.detections.length > 0
          ? result.detections
          : (cameraId === 'A-04' && isInCam04PcccDemoSegment(video.currentTime)
            ? demoDetectionsForVideo(video)
            : [])
        applyDetections(items, result.width, result.height)
        if (result.events.length > 0) {
          notifySafetyAiEventsChanged()
        }
      },
    })

    video.addEventListener('timeupdate', syncDemo)
    video.addEventListener('seeked', syncDemo)
    syncDemo()

    return () => {
      video.removeEventListener('timeupdate', syncDemo)
      video.removeEventListener('seeked', syncDemo)
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

  return { status, statusMsg, detections, frameSize, layoutTick, inSegment }
}

export const PcccOverlay = memo(function PcccOverlay({
  cameraId,
  videoRef,
  enabled = true,
  compact,
}: PcccOverlayProps) {
  const { detections, frameSize, layoutTick, inSegment } = usePcccState(
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

  const showContent = inSegment && cycledDetections.length > 0 && frameSize.width > 0

  if (!showContent) return null

  return (
    <>
      {showContent && (
        <MobileAiOverlay
          detections={cycledDetections}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          layoutTick={layoutTick}
          compact={compact}
          pulse={pulse}
        />
      )}
    </>
  )
})
