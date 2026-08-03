import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import type { MobileAiConnectionStatus } from '@/modules/module02-training/services/mobileAiBackend.service'
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
  { border: string; label: string; bg: string }
> = {
  mud: { border: 'border-amber-400/85', label: 'text-amber-200', bg: 'bg-amber-500/25' },
  water: { border: 'border-sky-400/85', label: 'text-sky-200', bg: 'bg-sky-500/25' },
  object: { border: 'border-orange-400/85', label: 'text-orange-200', bg: 'bg-orange-500/25' },
}

const ROI_TYPE_STYLE: Record<string, string> = {
  ROAD: 'stroke-cyan-400/70 fill-cyan-400/8',
  BUFFER: 'stroke-blue-400/50 fill-blue-400/5',
  STORAGE: 'stroke-violet-400/50 fill-violet-400/5',
}

interface RoadAnalysisOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  enabled?: boolean
  compact?: boolean
}

function polygonPoints(polygon: Array<{ x: number; y: number }>): string {
  return polygon.map(p => `${p.x * 100},${p.y * 100}`).join(' ')
}

function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  compact,
}: {
  detection: RoadAnalysisDetection
  frameWidth: number
  frameHeight: number
  compact?: boolean
}) {
  const style = BEHAVIOR_STYLE[detection.behavior]
  const [x1, y1, x2, y2] = detection.bbox
  const left = (x1 / frameWidth) * 100
  const top = (y1 / frameHeight) * 100
  const width = ((x2 - x1) / frameWidth) * 100
  const height = ((y2 - y1) / frameHeight) * 100

  return (
    <div
      className="absolute pointer-events-none transition-all duration-300 ease-out"
      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
    >
      <div className={cn('absolute inset-0 border rounded-sm', style.border)} />
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

function RoiPolygons({ zones }: { zones: RoadAnalysisRoiZone[] }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {zones.map(zone => (
        <polygon
          key={zone.id}
          points={polygonPoints(zone.polygon)}
          className={cn('stroke-[0.35] vector-effect-non-scaling-stroke', ROI_TYPE_STYLE[zone.type] ?? ROI_TYPE_STYLE.ROAD)}
        />
      ))}
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
  const [roiZones, setRoiZones] = useState<RoadAnalysisRoiZone[]>(() =>
    getRoiZonesForCamera(cameraId).map(z => ({
      id: z.id,
      label: z.label,
      type: z.type,
      polygon: z.polygon,
    })),
  )

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
      setStatusMsg('Chưa cấu hình URL backend AI (dùng chung mobile).')
      return
    }

    clientRef.current = createRoadAnalysisClient(video, {
      cameraId,
      backendUrl,
      onResult: result => {
        const filtered = result.detections.filter(d => d.confidence >= 0.48)
        const now = Date.now()
        if (filtered.length > 0) {
          holdRef.current = { until: now + 1600, items: filtered }
          setDetections(filtered)
        } else if (now < holdRef.current.until) {
          setDetections(holdRef.current.items)
        } else {
          setDetections([])
        }
        setFrameSize({ width: result.width, height: result.height })
        setMetrics(result.metrics)
        if (result.roi_zones.length > 0) setRoiZones(result.roi_zones)
      },
      onStatusChange: (next, msg) => {
        setStatus(next)
        setStatusMsg(msg)
      },
    })

    return stopClient
  }, [cameraId, enabled, stopClient, videoRef])

  return { status, statusMsg, detections, frameSize, metrics, roiZones }
}

export function RoadAnalysisOverlay({
  cameraId,
  videoRef,
  enabled = true,
  compact,
}: RoadAnalysisOverlayProps) {
  const { status, statusMsg, detections, frameSize, metrics, roiZones } =
    useRoadAnalysisState(cameraId, videoRef, enabled)

  const showContent = enabled && (roiZones.length > 0 || detections.length > 0 || metrics)

  if (!showContent && status !== 'connecting' && status !== 'error') return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {roiZones.length > 0 && <RoiPolygons zones={roiZones} />}

      {frameSize.width > 0 && detections.map((d, i) => (
        <DetectionBox
          key={`${d.behavior}-${i}-${Math.round(d.bbox[0])}`}
          detection={d}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          compact={compact}
        />
      ))}

      {!compact && metrics && (
        <div className="absolute top-2 right-2 flex flex-col gap-0.5 items-end">
          <span className="text-[7px] font-mono px-1 py-px rounded bg-black/55 text-white/75">
            Bùn {metrics.mud_percent.toFixed(1)}% · Nước {metrics.water_percent.toFixed(1)}%
          </span>
          {metrics.object_count > 0 && (
            <span className="text-[7px] font-mono px-1 py-px rounded bg-orange-500/20 text-orange-200">
              {metrics.object_count} vật thể
            </span>
          )}
        </div>
      )}

      {(status === 'connecting' || status === 'error') && (
        <div className="absolute bottom-2 left-2 text-[7px] font-mono px-1.5 py-0.5 rounded bg-black/60">
          <span className={status === 'error' ? 'text-red-300' : 'text-amber-200'}>
            {status === 'connecting' ? 'Đang phân tích đường…' : (statusMsg ?? 'Lỗi backend')}
          </span>
        </div>
      )}

      {status === 'connected' && !compact && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 px-1 py-px rounded bg-emerald-500/15 border border-emerald-500/30">
          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[7px] text-emerald-300 font-mono">HK AI</span>
        </div>
      )}
    </div>
  )
}
