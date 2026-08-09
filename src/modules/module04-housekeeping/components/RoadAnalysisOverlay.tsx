import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapVideoPointToOverlay, mapVideoRectToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import {
  MOBILE_AI_BACKEND_STORAGE_KEY,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { useOverlaySceneReset } from '@/modules/module03-safety/hooks/useOverlaySceneReset'
import { notifySafetyAiEventsChanged } from '@/modules/module03-safety/services/safetyAiEvents.service'
import { getRoiZonesForCamera } from '../data/housekeepingRoiConfig'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '@/modules/module03-safety/utils/roiOverlayCode'
import { shouldRunRoadOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import { modelBoxStyle } from '@/modules/module02-training/data/cameraAiModelTokens'
import {
  createRoadAnalysisClient,
  getMobileAiBackendUrl,
  type RoadAnalysisDetection,
  type RoadAnalysisResult,
  type RoadAnalysisRoiZone,
} from '../services/roadAnalysisBackend.service'

function visibleDetections(detections: RoadAnalysisDetection[]): RoadAnalysisDetection[] {
  return detections.filter(
    d =>
      d.behavior !== 'unknown'
      && d.label !== 'Unknown'
      && !d.behavior.startsWith('mesh_'),
  )
}

const BEHAVIOR_STYLE: Partial<Record<
  RoadAnalysisDetection['behavior'],
  { border: string; fill: string; label: string; bg: string }
>> = {
  mud: modelBoxStyle('road_material', 'violation'),
  water: {
    border: 'border-sky-400/90',
    fill: 'bg-sky-400/12',
    label: 'text-sky-200',
    bg: 'bg-sky-500/35',
  },
  object: {
    border: 'border-orange-400/90',
    fill: 'bg-orange-400/12',
    label: 'text-orange-200',
    bg: 'bg-orange-500/35',
  },
  unknown: modelBoxStyle('road_material', 'subject'),
}

const ROI_STROKE: Record<string, { stroke: string; fill: string }> = {
  ROAD: { stroke: 'rgba(74, 222, 128, 0.95)', fill: 'rgba(34, 197, 94, 0.18)' },
  BUFFER: { stroke: 'rgba(134, 239, 172, 0.55)', fill: 'none' },
  STORAGE: { stroke: 'rgba(167, 139, 250, 0.35)', fill: 'none' },
}

interface RoadAnalysisOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  enabled?: boolean
  compact?: boolean
}

function polygonPointsOnVideo(
  polygon: Array<{ x: number; y: number }>,
  video: HTMLVideoElement,
  fit: 'cover' | 'contain',
): string {
  return polygon
    .map(p => {
      const pt = mapVideoPointToOverlay(p.x, p.y, video, fit)
      return `${pt.x},${pt.y}`
    })
    .join(' ')
}

function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit = 'contain',
}: {
  detection: RoadAnalysisDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
}) {
  const style = BEHAVIOR_STYLE[detection.behavior] ?? BEHAVIOR_STYLE.unknown ?? {
    border: 'border-gray-400/80',
    fill: 'bg-gray-400/10',
    label: 'text-gray-200',
    bg: 'bg-gray-600/35',
  }
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox

  if (!video?.videoWidth || !video.videoHeight || frameWidth <= 0 || frameHeight <= 0) {
    return null
  }

  const sx = video.videoWidth / frameWidth
  const sy = video.videoHeight / frameHeight
  const box = mapVideoRectToOverlay(
    {
      x: x1 * sx,
      y: y1 * sy,
      width: (x2 - x1) * sx,
      height: (y2 - y1) * sy,
    },
    video,
    videoFit,
  )

  if (box.w <= 0.5 || box.h <= 0.5) return null

  return (
    <div
      className="absolute pointer-events-none z-[3]"
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
    >
      <div
        className={cn(
          'absolute inset-0 border rounded-sm',
          style.border,
          style.fill,
        )}
      />
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
    </div>
  )
}

function RoiPolygons({
  zones,
  videoRef,
  videoFit,
}: {
  zones: RoadAnalysisRoiZone[]
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit: 'cover' | 'contain'
}) {
  const video = videoRef.current
  if (!video?.videoWidth || !video.videoHeight) return null

  const visible = zones.filter(z => z.type === 'ROAD')

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {visible.map(zone => {
        const style = ROI_STROKE[zone.type] ?? ROI_STROKE.ROAD
        return (
          <polygon
            key={zone.id}
            points={polygonPointsOnVideo(zone.polygon, video, videoFit)}
            fill={style.fill}
            stroke={style.stroke}
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}

function useRoadAnalysisState(
  cameraId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const clientRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [detections, setDetections] = useState<RoadAnalysisDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [metrics, setMetrics] = useState<RoadAnalysisResult['metrics']>()
  const roiZones = useMemo<RoadAnalysisRoiZone[]>(() =>
    getRoiZonesForCamera(cameraId)
      .filter(z => z.type === 'ROAD' || z.type === 'BUFFER')
      .map(z => ({
      id: z.id,
      label: z.label,
      type: z.type,
      polygon: z.polygon,
    })),
  [cameraId])
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
    if (!video || !enabled) return
    const bump = () => setLayoutTick(t => t + 1)
    const syncSegment = () => {
      if (!shouldRunRoadOnCamera(cameraId, video.currentTime)) {
        setDetections([])
        setMetrics(undefined)
      }
    }
    const clearOverlay = () => setDetections([])
    const onSeeked = () => {
      clearOverlay()
      syncSegment()
    }
    const observer = new ResizeObserver(bump)
    observer.observe(video)
    video.addEventListener('loadedmetadata', bump)
    video.addEventListener('timeupdate', syncSegment)
    video.addEventListener('seeked', onSeeked)
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', bump)
      video.removeEventListener('timeupdate', syncSegment)
      video.removeEventListener('seeked', onSeeked)
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

    const shouldAnalyze = () => shouldRunRoadOnCamera(cameraId, video.currentTime)

    clientRef.current = createRoadAnalysisClient(video, {
      cameraId,
      backendUrl,
      shouldAnalyze,
      onResult: result => {
        if (!shouldRunRoadOnCamera(cameraId, video.currentTime)) {
          setDetections([])
          setMetrics(undefined)
          return
        }
        setDetections(visibleDetections(result.detections))
        setFrameSize({ width: result.width, height: result.height })
        setMetrics(result.metrics)
        if (result.events && result.events.length > 0) {
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

  return { status, statusMsg, detections, frameSize, metrics, roiZones, layoutTick, backendUrlVersion }
}

export function RoadAnalysisOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  enabled = true,
  compact,
}: RoadAnalysisOverlayProps) {
  const { detections, frameSize, roiZones, layoutTick } =
    useRoadAnalysisState(cameraId, videoRef, enabled)

  if (!enabled) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {roiZones.length > 0 && (
        <RoiPolygons zones={roiZones} videoRef={videoRef} videoFit={videoFit} />
      )}

      {frameSize.width > 0 && detections.map((d, idx) => (
        <DetectionBox
          key={`${d.behavior}-${idx}-${Math.round(d.bbox[0])}-${Math.round(d.bbox[1])}-${layoutTick}`}
          detection={d}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
        />
      ))}
    </div>
  )
}
