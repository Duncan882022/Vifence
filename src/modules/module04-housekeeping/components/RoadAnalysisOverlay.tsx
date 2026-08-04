import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapVideoPointToOverlay, mapVideoRectToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { MobileAiBackendConfig } from '@/modules/module02-training/components/MobileAiBackendConfig'
import {
  MOBILE_AI_BACKEND_STORAGE_KEY,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { getRoiZonesForCamera } from '../data/housekeepingRoiConfig'
import {
  createRoadAnalysisClient,
  getMobileAiBackendUrl,
  type RoadAnalysisDetection,
  type RoadAnalysisResult,
  type RoadAnalysisRoiZone,
} from '../services/roadAnalysisBackend.service'

const BEHAVIOR_STYLE: Record<
  RoadAnalysisDetection['behavior'],
  { border: string; fill: string; label: string; bg: string }
> = {
  mud: {
    border: 'border-amber-400/90',
    fill: 'bg-amber-400/12',
    label: 'text-amber-200',
    bg: 'bg-amber-500/35',
  },
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
  mesh_missing: {
    border: 'border-lime-400/90',
    fill: 'bg-lime-400/12',
    label: 'text-lime-200',
    bg: 'bg-lime-500/35',
  },
  mesh_torn: {
    border: 'border-green-400/90',
    fill: 'bg-green-400/12',
    label: 'text-green-200',
    bg: 'bg-green-600/35',
  },
  mesh_dirty: {
    border: 'border-emerald-400/90',
    fill: 'bg-emerald-400/12',
    label: 'text-emerald-200',
    bg: 'bg-emerald-600/35',
  },
}

const ROI_STROKE: Record<string, { stroke: string; fill: string }> = {
  ROAD: { stroke: 'rgba(74, 222, 128, 0.95)', fill: 'rgba(34, 197, 94, 0.18)' },
  MESH: { stroke: 'rgba(132, 204, 22, 0.85)', fill: 'rgba(34, 197, 94, 0.10)' },
  BUFFER: { stroke: 'rgba(134, 239, 172, 0.55)', fill: 'none' },
  STORAGE: { stroke: 'rgba(167, 139, 250, 0.5)', fill: 'none' },
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
  const style = BEHAVIOR_STYLE[detection.behavior]
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
      className="absolute pointer-events-none transition-all duration-300 ease-out"
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
    >
      <div className={cn('absolute inset-0 border rounded-sm', style.border, style.fill)} />
      <span
        className={cn(
          'absolute -top-3 left-0 px-0.5 py-px font-mono whitespace-nowrap rounded-sm',
          style.bg,
          style.label,
          compact ? 'text-[5px]' : 'text-[7px]',
        )}
      >
        {detection.label} {detection.confidence.toFixed(2)}
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
      className="absolute inset-0 w-full h-full pointer-events-none"
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
  const holdRef = useRef<{ until: number; items: RoadAnalysisDetection[] }>({ until: 0, items: [] })
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [detections, setDetections] = useState<RoadAnalysisDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [metrics, setMetrics] = useState<RoadAnalysisResult['metrics']>()
  const roiZones = useMemo<RoadAnalysisRoiZone[]>(() =>
    getRoiZonesForCamera(cameraId)
      .filter(z => z.type !== 'MESH')
      .map(z => ({
      id: z.id,
      label: z.label,
      type: z.type,
      polygon: z.polygon,
    })),
  [cameraId])
  const [layoutTick, setLayoutTick] = useState(0)
  const [backendUrlVersion, setBackendUrlVersion] = useState(0)

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
    const observer = new ResizeObserver(bump)
    observer.observe(video)
    video.addEventListener('loadedmetadata', bump)
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', bump)
    }
  }, [enabled, videoRef])

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

    clientRef.current = createRoadAnalysisClient(video, {
      cameraId,
      backendUrl,
      onResult: result => {
        const filtered = result.detections
          .filter(d => d.confidence >= 0.55)
          .slice(0, 3)
        const now = Date.now()
        if (filtered.length > 0) {
          holdRef.current = { until: now + 1200, items: filtered }
          setDetections(filtered)
        } else if (now < holdRef.current.until) {
          setDetections(holdRef.current.items)
        } else {
          setDetections([])
        }
        setFrameSize({ width: result.width, height: result.height })
        setMetrics(result.metrics)
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
  const { status, statusMsg, detections, frameSize, metrics, roiZones, layoutTick } =
    useRoadAnalysisState(cameraId, videoRef, enabled)

  const hasBackend = Boolean(getMobileAiBackendUrl())
  const showContent = enabled && (roiZones.length > 0 || detections.length > 0 || metrics || !hasBackend)

  if (!showContent && status !== 'connecting' && status !== 'error') return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {roiZones.length > 0 && (
        <RoiPolygons zones={roiZones} videoRef={videoRef} videoFit={videoFit} />
      )}

      <div className="absolute top-2 left-2 z-[4] pointer-events-auto flex items-center gap-1">
        <MobileAiBackendConfig
          compact={compact}
          onSaved={() => { /* backendUrlVersion bump via global event */ }}
        />
        {!hasBackend && !compact && (
          <span className="text-[7px] font-mono px-1 py-px rounded bg-sky-500/15 text-sky-200 border border-sky-500/30">
            URL chung Mobile · iPhone
          </span>
        )}
      </div>

      {frameSize.width > 0 && detections.map((d, i) => (
        <DetectionBox
          key={`${d.behavior}-${i}-${Math.round(d.bbox[0])}-${layoutTick}`}
          detection={d}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
        />
      ))}

      {!compact && metrics && (
        <div className="absolute top-2 right-2 flex flex-col gap-0.5 items-end max-w-[55%]">
          <span className="text-[7px] font-mono px-1 py-px rounded bg-black/55 text-white/75 text-right">
            ROI: bùn {metrics.mud_percent.toFixed(1)}% · nước {metrics.water_percent.toFixed(1)}%
          </span>
          {detections.length === 0 && (
            <span className="text-[7px] font-mono px-1 py-px rounded bg-emerald-500/15 text-emerald-200">
              Chưa vượt ngưỡng cảnh báo
            </span>
          )}
          {metrics.object_count > 0 && detections.some(d => d.behavior === 'object') && (
            <span className="text-[7px] font-mono px-1 py-px rounded bg-orange-500/20 text-orange-200">
              {metrics.object_count} vật thể
            </span>
          )}
        </div>
      )}

      {(status === 'connecting' || status === 'error') && (
        <div className="absolute bottom-2 left-2 text-[7px] font-mono px-1.5 py-0.5 rounded bg-black/60 max-w-[85%]">
          <span className={status === 'error' ? 'text-red-300' : 'text-amber-200'}>
            {status === 'connecting'
              ? 'Đang phân tích đường…'
              : (statusMsg ?? 'Lỗi backend')}
          </span>
        </div>
      )}

      {status === 'connected' && !compact && (
        <div className="absolute bottom-2 left-10 flex items-center gap-1 px-1 py-px rounded bg-emerald-500/15 border border-emerald-500/30">
          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[7px] text-emerald-300 font-mono">HK AI</span>
        </div>
      )}
    </div>
  )
}
