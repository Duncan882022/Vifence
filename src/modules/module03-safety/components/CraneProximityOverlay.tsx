import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapVideoRectToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { MobileAiBackendConfig } from '@/modules/module02-training/components/MobileAiBackendConfig'
import {
  MOBILE_AI_BACKEND_STORAGE_KEY,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  createCraneProximityClient,
  getMobileAiBackendUrl,
  type CraneProximityDetection,
  type CraneProximityMetrics,
} from '../services/craneProximityBackend.service'

const EVENT_MIN_CONFIDENCE = 0.80
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
    border: 'border-fuchsia-400',
    fill: 'bg-fuchsia-500/20',
    label: 'text-white',
    bg: 'bg-black/80',
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

function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit = 'contain',
}: {
  detection: CraneProximityDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
}) {
  const style = resolveDetectionStyle(detection)
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox
  const isGreenExcavator = detection.machine_kind === 'crane_green'
  const isPending = detection.behavior === 'crane' && detection.confidence < EVENT_MIN_CONFIDENCE
  const isMachinery = detection.behavior === 'crane' && Boolean(detection.machine_kind)
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

  const distLabel = detection.distance_m != null ? ` · ${detection.distance_m.toFixed(2)}m` : ''

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
          'absolute inset-0 rounded-sm',
          style.border,
          style.fill,
          isGreenExcavator ? 'border-[3px]' : isMachinery ? 'border-2' : 'border',
          isPending && !isGreenExcavator && 'border-dashed opacity-60',
        )}
        style={isGreenExcavator ? {
          boxShadow: '0 0 0 2px rgba(255,255,255,0.95), 0 0 10px rgba(232,121,249,0.85)',
        } : undefined}
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
        {detection.label} {(detection.confidence * 100).toFixed(0)}%{distLabel}{isPending ? ' · chưa đủ ngưỡng' : ''}
      </span>
    </div>
  )
}

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
    const clearOverlay = () => setDetections([])
    const observer = new ResizeObserver(bump)
    observer.observe(video)
    video.addEventListener('loadedmetadata', bump)
    video.addEventListener('seeked', clearOverlay)
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', bump)
      video.removeEventListener('seeked', clearOverlay)
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

    clientRef.current = createCraneProximityClient(video, {
      cameraId,
      backendUrl,
      onResult: result => {
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
            const rank = (d: CraneProximityDetection) => {
              if (d.behavior === 'crane') {
                if (d.machine_kind === 'tower_crane') return 0
                if (d.machine_kind === 'sany_drill') return 1
                if (d.machine_kind === 'crane_green') return 2
                return 3
              }
              if (d.behavior === 'person') return 4
              if (d.behavior === 'crane_proximity') return 5
              return 6
            }
            return rank(a) - rank(b)
          })
        setDetections(visible)
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

  return { status, statusMsg, detections, frameSize, metrics, layoutTick }
}

export function CraneProximityOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  enabled = true,
  compact,
}: CraneProximityOverlayProps) {
  const { status, statusMsg, detections, frameSize, metrics, layoutTick } =
    useCraneProximityState(cameraId, videoRef, enabled)

  const hasBackend = Boolean(getMobileAiBackendUrl())
  const hasViolation = detections.some(d => d.behavior === 'crane_proximity')
  const showContent = enabled && (detections.length > 0 || metrics || !hasBackend)

  if (!showContent && status !== 'connecting' && status !== 'error') return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      <div className="absolute top-2 left-2 z-[4] pointer-events-auto flex items-center gap-1">
        <MobileAiBackendConfig compact={compact} />
        {!hasBackend && !compact && (
          <span className="text-[7px] font-mono px-1 py-px rounded bg-amber-500/15 text-amber-200 border border-amber-500/30">
            URL chung Mobile · Crane AI
          </span>
        )}
      </div>

      {frameSize.width > 0 && detections.map(d => (
        <DetectionBox
          key={`${d.behavior}-${Math.round(d.bbox[0])}-${Math.round(d.bbox[1])}-${layoutTick}`}
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
            Người: {metrics.person_count} · ngưỡng ≤ {metrics.proximity_threshold_m}m
          </span>
          {metrics.min_distance_m != null && (
            <span className={cn(
              'text-[7px] font-mono px-1 py-px rounded',
              metrics.min_distance_m <= metrics.proximity_threshold_m
                ? 'bg-red-500/20 text-red-200'
                : 'bg-emerald-500/15 text-emerald-200',
            )}>
              K/c gần nhất: {metrics.min_distance_m.toFixed(2)}m
            </span>
          )}
          {hasViolation && (
            <span className="text-[7px] font-mono px-1 py-px rounded bg-red-500/25 text-red-200 border border-red-500/40">
              Vi phạm vùng nguy hiểm
            </span>
          )}
        </div>
      )}

      {(status === 'connecting' || status === 'error') && (
        <div className="absolute bottom-2 left-2 text-[7px] font-mono px-1.5 py-0.5 rounded bg-black/60 max-w-[85%]">
          <span className={status === 'error' ? 'text-red-300' : 'text-amber-200'}>
            {status === 'connecting' ? 'Đang phân tích máy cẩu…' : (statusMsg ?? 'Lỗi backend')}
          </span>
        </div>
      )}

      {status === 'connected' && !compact && (
        <div className="absolute bottom-2 left-10 flex items-center gap-1 px-1 py-px rounded bg-amber-500/15 border border-amber-500/30">
          <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[7px] text-amber-300 font-mono">Crane AI</span>
        </div>
      )}
    </div>
  )
}
