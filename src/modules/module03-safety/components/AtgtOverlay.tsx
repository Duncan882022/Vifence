import { useEffect, useRef, useState, memo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapVideoRectToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { useMobileAiBackendVersion } from '@/modules/module02-training/hooks/useMobileAiBackendVersion'
import {
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { shouldRunAtgtOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import {
  cam03AtgtDemoDetections,
  CAM03_ATGT_DEMO_HARD_MEDIAN,
  isInCam03AtgtDemoSegment,
} from '../data/cam03AtgtDemo'
import {
  createAtgtClient,
  getMobileAiBackendUrl,
  type AtgtDetection,
} from '../services/atgtBackend.service'
import { notifySafetyAiEventsChanged } from '../services/safetyAiEvents.service'
import {
  registerAtgtSpeedingDemoEvent,
  registerAtgtLaneDemoEvent,
  resetAtgtDemoEventSegment,
} from '../services/atgtDemoEvents.service'
import {
  captureAtgtLaneSnapshot,
  captureAtgtSpeedingSnapshot,
} from '../utils/captureAtgtSnapshot'
import {
  formatSpeedingOverlayLabel,
  formatVehicleOverlayLabel,
  resolveVehiclePlate,
  UNKNOWN_VEHICLE_PLATE,
} from '../utils/vehiclePlate'
import { useRoiCycleDisplay } from '../hooks/useRoiCycleDisplay'
import { atgtScanRank, atgtViolationRank, OVERLAY_CYCLE_DEFAULTS } from '../utils/overlayScanOrder'
import { filterAtgtLaneOverlayDetections, hasAtgtLaneMedian, isAtgtLaneMedianBehavior } from '../utils/atgtLaneLogic'
import { VIOLATION_MIN_CONFIDENCE } from '../utils/violationConfidence'

interface AtgtOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  enabled?: boolean
  compact?: boolean
}

const VEHICLE_MIN_CONF = 0.45
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
  vehicle: BOX_STYLE,
  speeding: {
    border: 'border-cyan-400/95',
    fill: 'bg-cyan-500/18',
    label: 'text-cyan-200',
    bg: 'bg-cyan-600/40',
  },
  hard_median: {
    border: 'border-emerald-400/90',
    fill: 'bg-emerald-500/12',
    label: 'text-emerald-200',
    bg: 'bg-emerald-600/35',
  },
  soft_median: {
    border: 'border-emerald-400/90',
    fill: 'bg-emerald-500/12',
    label: 'text-emerald-200',
    bg: 'bg-emerald-600/35',
  },
}

function formatLabel(detection: AtgtDetection): string {
  if (detection.behavior === 'speeding') {
    return formatSpeedingOverlayLabel(detection.vehiclePlate)
  }
  if (detection.behavior === 'vehicle') {
    return formatVehicleOverlayLabel(detection.vehiclePlate)
  }
  return detection.label
}

function visibleDetections(detections: AtgtDetection[]): AtgtDetection[] {
  return filterAtgtLaneOverlayDetections(
    detections.filter(d => {
      if (d.behavior === 'speeding') return d.confidence >= VIOLATION_MIN_CONF
      if (d.behavior === 'vehicle') return d.confidence >= VEHICLE_MIN_CONF
      if (isAtgtLaneMedianBehavior(d.behavior)) return d.confidence >= 0
      return d.confidence >= 0.5
    }),
  ).sort((a, b) => {
    const rank = (d: AtgtDetection) => {
      if (d.behavior === 'vehicle') return 0
      if (isAtgtLaneMedianBehavior(d.behavior)) return 1
      return 2
    }
    return rank(a) - rank(b)
  })
}

function resolveAtgtDetections(
  video: HTMLVideoElement,
  cameraId: string,
  backendItems: AtgtDetection[],
): AtgtDetection[] {
  if (cameraId !== 'A-03' || !isInCam03AtgtDemoSegment(video.currentTime)) {
    return backendItems
  }

  const demo = demoDetectionsForVideo(video)
  const backendVehicle = backendItems.find(d => d.behavior === 'vehicle' || d.behavior === 'speeding')
  if (!backendVehicle?.vehiclePlate && !backendVehicle?.vehicleType) {
    return demo
  }

  return demo.map(d => {
    if (d.behavior !== 'vehicle' && d.behavior !== 'speeding') return d
    const plate = backendVehicle.vehiclePlate ?? d.vehiclePlate
    const vehicleType = backendVehicle.vehicleType ?? d.vehicleType
    return {
      ...d,
      vehiclePlate: plate,
      vehicleType,
      label: d.behavior === 'vehicle'
        ? formatVehicleOverlayLabel(plate)
        : d.label,
    }
  })
}

function laneCheckSnapshotBbox(
  video: HTMLVideoElement,
  items: AtgtDetection[],
): [number, number, number, number] {
  const found = items.find(d => d.behavior === 'no_soft_median')
  if (found) return found.bbox

  const w = video.videoWidth
  const h = video.videoHeight
  return [
    CAM03_ATGT_DEMO_HARD_MEDIAN.x1 * w,
    CAM03_ATGT_DEMO_HARD_MEDIAN.y1 * h,
    CAM03_ATGT_DEMO_HARD_MEDIAN.x2 * w,
    CAM03_ATGT_DEMO_HARD_MEDIAN.y2 * h,
  ]
}

function demoDetectionsForVideo(video: HTMLVideoElement): AtgtDetection[] {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return []
  return cam03AtgtDemoDetections(w, h, video.currentTime)
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
  detection: AtgtDetection
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
  const layerZ = detection.behavior === 'speeding' ? 7
    : isAtgtLaneMedianBehavior(detection.behavior) ? 5
      : detection.behavior === 'vehicle' ? 3
        : 2

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
        {formatLabel(detection)} {(detection.confidence * 100).toFixed(0)}%
      </span>
    </div>
  )
}

function useAtgtState(
  cameraId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const clientRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [detections, setDetections] = useState<AtgtDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [layoutTick, setLayoutTick] = useState(0)
  const backendUrlVersion = useMobileAiBackendVersion()
  const [inSegment, setInSegment] = useState(false)
  const segmentLoggedRef = useRef<{ speeding?: string; lane?: string }>({})
  const wasInSegmentRef = useRef(false)

  const maybeLogDemoEvents = (
    video: HTMLVideoElement,
    items: AtgtDetection[],
  ) => {
    if (cameraId !== 'A-03' || !isInCam03AtgtDemoSegment(video.currentTime)) return
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return

    const loopPass = Math.floor(video.currentTime / Math.max(video.duration || 15, 1))
    const lanePresent = hasAtgtLaneMedian(items, 0)
    if (!lanePresent) {
      const key = `${loopPass}-lane`
      if (segmentLoggedRef.current.lane !== key) {
        const laneBbox = laneCheckSnapshotBbox(video, items)
        const snapshotUrl = captureAtgtLaneSnapshot(video, laneBbox) ?? undefined
        if (!snapshotUrl) return
        const record = registerAtgtLaneDemoEvent({
          cameraId,
          confidence: items.find(d => d.behavior === 'no_soft_median')?.confidence ?? 0.86,
          segmentKey: key,
          snapshotUrl,
        })
        if (record) segmentLoggedRef.current.lane = key
      }
    }

    const speeding = items.find(d => d.behavior === 'speeding')
    if (speeding) {
      const key = `${loopPass}-speeding`
      if (segmentLoggedRef.current.speeding !== key) {
        const vehicle = items.find(d => d.behavior === 'vehicle') ?? speeding
        const plate = resolveVehiclePlate(vehicle.vehiclePlate ?? speeding.vehiclePlate)
        const snapshotUrl = captureAtgtSpeedingSnapshot(video, vehicle.bbox, {
          vehiclePlate: plate !== UNKNOWN_VEHICLE_PLATE ? plate : undefined,
        }) ?? undefined
        if (!snapshotUrl) return
        const record = registerAtgtSpeedingDemoEvent({
          cameraId,
          confidence: speeding.confidence,
          segmentKey: key,
          snapshotUrl,
          vehiclePlate: plate,
          vehicleType: vehicle.vehicleType ?? speeding.vehicleType,
        })
        if (record) segmentLoggedRef.current.speeding = key
      }
    }
  }

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

    const applyDetections = (items: AtgtDetection[], width: number, height: number) => {
      setFrameSize({ width, height })
      setDetections(visibleDetections(items))
      if (video) maybeLogDemoEvents(video, items)
    }

    const syncSegment = () => {
      const active = cameraId === 'A-03' && isInCam03AtgtDemoSegment(video.currentTime)
      setInSegment(active)
      if (!active) {
        if (wasInSegmentRef.current) {
          wasInSegmentRef.current = false
          setDetections([])
          segmentLoggedRef.current = {}
          resetAtgtDemoEventSegment()
        }
        return
      }
      if (!wasInSegmentRef.current) {
        resetAtgtDemoEventSegment()
        segmentLoggedRef.current = {}
        wasInSegmentRef.current = true
      }
    }

    const applyDemoOverlay = () => {
      syncSegment()
      if (!isInCam03AtgtDemoSegment(video.currentTime) || !shouldRunAtgtOnCamera(cameraId, video.currentTime)) {
        return
      }
      const demo = demoDetectionsForVideo(video)
      if (demo.length > 0) {
        applyDetections(demo, video.videoWidth, video.videoHeight)
      }
    }

    const shouldAnalyze = () => shouldRunAtgtOnCamera(cameraId, video.currentTime)

    clientRef.current?.stop()
    clientRef.current = createAtgtClient(video, {
      cameraId,
      backendUrl: getMobileAiBackendUrl(),
      shouldAnalyze,
      onStatusChange: (s, msg) => {
        setStatus(s)
        setStatusMsg(msg)
      },
      onResult: result => {
        const items = resolveAtgtDetections(
          video,
          cameraId,
          result.detections.length > 0 ? result.detections : [],
        )
        applyDetections(items, result.width, result.height)
        if (result.events.length > 0) {
          notifySafetyAiEventsChanged()
        }
      },
    })

    video.addEventListener('timeupdate', syncSegment)
    video.addEventListener('seeked', applyDemoOverlay)
    applyDemoOverlay()

    return () => {
      video.removeEventListener('timeupdate', syncSegment)
      video.removeEventListener('seeked', applyDemoOverlay)
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

export const AtgtOverlay = memo(function AtgtOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  enabled = true,
  compact,
}: AtgtOverlayProps) {
  const { detections, frameSize, inSegment, layoutTick } = useAtgtState(
    cameraId,
    videoRef,
    enabled,
  )

  const { visible: cycledDetections, pulse } = useRoiCycleDisplay(
    detections,
    d => d.behavior === 'speeding',
    {
      getScanRank: d => atgtScanRank(d.behavior),
      getViolationRank: d => atgtViolationRank(d.behavior),
      ...OVERLAY_CYCLE_DEFAULTS,
    },
  )
  const showContent = inSegment && detections.length > 0 && frameSize.width > 0

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
