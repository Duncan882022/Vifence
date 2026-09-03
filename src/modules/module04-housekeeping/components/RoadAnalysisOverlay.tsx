import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { canProjectOverlayBox, mapBackendBboxToOverlay, mapNormalizedPolygonToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import {
  MOBILE_AI_BACKEND_STORAGE_KEY,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { isCameraAiModelEnabled } from '@/modules/module02-training/services/cameraAiConfig.service'
import { useOverlaySceneReset } from '@/modules/module03-safety/hooks/useOverlaySceneReset'
import { notifySafetyAiEventsChanged } from '@/modules/module03-safety/services/safetyAiEvents.service'
import { useVmsDetections } from '@/modules/module03-safety/context/VmsDetectionContext'
import { useCameraLiveRoiVisible } from '@/modules/module02-training/hooks/useCameraLiveRoiVisible'
import { getRoiZonesForCamera } from '../data/housekeepingRoiConfig'
import { useStableOverlayDetections } from '@/modules/module03-safety/hooks/useStableOverlayDetections'
import { useViolationStickyOverlay } from '@/modules/module03-safety/hooks/useViolationStickyOverlay'
import { useLiveOverlaySync } from '@/modules/module03-safety/hooks/useLiveOverlaySync'
import { overlayBoxMotionClass } from '@/modules/module03-safety/utils/overlayBoxMotion'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '@/modules/module03-safety/utils/roiOverlayCode'
import { getOverlayBoxStyle } from '@/modules/module03-safety/utils/roiBoxRole'
import {
  createRoadAnalysisClient,
  getMobileAiBackendUrl,
  type RoadAnalysisDetection,
  type RoadAnalysisResult,
  type RoadAnalysisRoiZone,
} from '../services/roadAnalysisBackend.service'

function visibleDetections(
  detections: RoadAnalysisDetection[],
  frameWidth: number,
  frameHeight: number,
): RoadAnalysisDetection[] {
  const frameArea = Math.max(frameWidth * frameHeight, 1)
  return detections.filter(d => {
    if (d.behavior.startsWith('mesh_')) {
      if (d.label === 'Unknown') return false
      return d.confidence >= 0.85
    }
    if (
      d.behavior !== 'mud'
      && d.behavior !== 'water'
      && d.behavior !== 'object'
    ) {
      return false
    }
    if (d.label === 'Unknown') return false
    if (d.confidence < 0.68) return false
    const [x1, y1, x2, y2] = d.bbox
    const areaRatio = ((x2 - x1) * (y2 - y1)) / frameArea
    if (areaRatio < 0.0035) return false
    /** Bùn/nước có thể phủ vùng lớn trong ROI — vật cản (object) giữ ngưỡng chặt hơn. */
    const maxArea = d.behavior === 'object' ? 0.32 : 0.58
    if (areaRatio > maxArea) return false
    return true
  })
}


/** Polygon ROI — ROAD xanh (lòng đường) + MESH xanh dương (lưới bao che), nét 1.2. */
const ROI_STROKE: Record<string, { stroke: string; fill: string; dash?: string }> = {
  ROAD: { stroke: 'rgba(74, 222, 128, 0.95)', fill: 'rgba(34, 197, 94, 0.12)' },
  MESH: { stroke: 'rgba(56, 189, 248, 0.95)', fill: 'rgba(14, 165, 233, 0.10)' },
  STORAGE: { stroke: 'rgba(167, 139, 250, 0.30)', fill: 'none', dash: '4 3' },
}
const ROI_POLYGON_STROKE_WIDTH = 1.2

interface RoadAnalysisOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  enabled?: boolean
  compact?: boolean
}

function polygonPointsOnVideo(
  polygon: Array<{ x: number; y: number }>,
  video: HTMLVideoElement | null | undefined,
  frameWidth: number,
  frameHeight: number,
  fit: 'cover' | 'contain',
  objectPosition: 'center' | 'bottom' = 'center',
): string {
  return mapNormalizedPolygonToOverlay(
    polygon,
    video,
    frameWidth,
    frameHeight,
    fit,
    objectPosition,
  )
}

function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit = 'contain',
  videoObjectPosition = 'center',
  snapOverlay = false,
}: {
  detection: RoadAnalysisDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  snapOverlay?: boolean
}) {
  const style = getOverlayBoxStyle('road_material', detection.behavior)
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox

  if (!canProjectOverlayBox(video, frameWidth, frameHeight)) return null

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
      className={cn('pointer-events-none z-[3]', overlayBoxMotionClass(snapOverlay))}
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
  frameWidth,
  frameHeight,
  videoRef,
  videoFit,
  videoObjectPosition = 'center',
  layoutTick,
}: {
  zones: RoadAnalysisRoiZone[]
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  layoutTick: number
}) {
  const video = videoRef.current
  const fw = frameWidth > 0 ? frameWidth : (video?.videoWidth ?? 0)
  const fh = frameHeight > 0 ? frameHeight : (video?.videoHeight ?? 0)
  if (zones.length === 0 || (fw <= 0 && fh <= 0 && !video?.clientWidth)) return null

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {zones.filter(z => z.type === 'ROAD' || z.type === 'MESH').map(zone => {
        const style = ROI_STROKE[zone.type] ?? ROI_STROKE.ROAD
        const points = polygonPointsOnVideo(
          zone.polygon,
          video,
          fw,
          fh,
          videoFit,
          videoObjectPosition,
        )
        if (!points) return null
        return (
          <polygon
            key={`${zone.id}-${layoutTick}`}
            points={points}
            fill={style.fill}
            stroke={style.stroke}
            strokeWidth={ROI_POLYGON_STROKE_WIDTH}
            strokeDasharray={style.dash}
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
      .filter(z => z.type === 'ROAD' || z.type === 'MESH')
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
  const vms = useVmsDetections()
  useOverlaySceneReset(videoRef, enabled, resetDetections, {
    liveHls: Boolean(vms?.active),
    cameraId,
  })

  useEffect(() => {
    if (!enabled || !vms?.active || !vms.snapshot) return
    setLayoutTick(t => t + 1)
    const roadMetrics = vms.snapshot.metrics.road as RoadAnalysisResult['metrics'] | undefined
    setDetections(visibleDetections(
      vms.snapshot.detections
        .filter(d =>
          d.behavior === 'mud'
          || d.behavior === 'water'
          || d.behavior === 'object'
          || d.behavior.startsWith('mesh_'),
        )
        .map(d => ({
          behavior: d.behavior as RoadAnalysisDetection['behavior'],
          label: d.label,
          scenario_id: d.scenario_id ?? '',
          confidence: d.confidence,
          bbox: d.bbox,
        })),
      vms.snapshot.width,
      vms.snapshot.height,
    ))
    setFrameSize({ width: vms.snapshot.width, height: vms.snapshot.height })
    setMetrics(roadMetrics)
    setStatus(vms.status)
    setStatusMsg(vms.statusMsg)
  }, [enabled, vms?.active, vms?.snapshot?.updated_at, vms?.status, vms?.statusMsg])

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
    video.addEventListener('loadeddata', bump)
    if (video.videoWidth > 0) bump()
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', bump)
      video.removeEventListener('loadeddata', bump)
    }
  }, [cameraId, enabled, videoRef])

  const stopClient = useCallback(() => {
    clientRef.current?.stop()
    clientRef.current = null
  }, [])

  useEffect(() => {
    stopClient()
    if (!enabled || vms?.active) {
      if (!enabled) {
        setStatus('idle')
        setDetections([])
      }
      return
    }

    const video = videoRef.current
    const backendUrl = getMobileAiBackendUrl()
    if (!video || !backendUrl) {
      setStatus('error')
      setStatusMsg('Chưa có URL backend — bấm ⚙ (dùng chung Mobile cam).')
      return
    }

    const shouldAnalyze = () => isCameraAiModelEnabled(cameraId, 'road_material')

    clientRef.current = createRoadAnalysisClient(video, {
      cameraId,
      backendUrl,
      shouldAnalyze,
      onResult: result => {
        setDetections(visibleDetections(result.detections, result.width, result.height))
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
  }, [cameraId, enabled, stopClient, videoRef, backendUrlVersion, vms?.active])

  const effectiveRoiZones = useMemo<RoadAnalysisRoiZone[]>(() => {
    const fromVms = (vms?.snapshot?.roi_zones ?? []).filter(
      z => z.type === 'ROAD' || z.type === 'MESH',
    )
    const byId = new Map(roiZones.map(z => [z.id, z]))
    for (const z of fromVms) {
      byId.set(z.id, {
        id: z.id,
        label: z.label ?? byId.get(z.id)?.label ?? z.id,
        type: z.type,
        polygon: z.polygon,
      })
    }
    return [...byId.values()].filter(z => z.type === 'ROAD' || z.type === 'MESH')
  }, [roiZones, vms?.snapshot?.roi_zones])

  return { status, statusMsg, detections, frameSize, metrics, roiZones: effectiveRoiZones, layoutTick, backendUrlVersion }
}

export function RoadAnalysisOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  videoObjectPosition = 'center',
  enabled = true,
  compact,
}: RoadAnalysisOverlayProps) {
  const { detections, frameSize, roiZones, layoutTick } =
    useRoadAnalysisState(cameraId, videoRef, enabled)
  const { syncKey, trackLock, missGraceFrames, snapOverlay } = useLiveOverlaySync()
  const stableDetections = useStableOverlayDetections(detections, { syncKey, trackLock })
  const { visible } = useViolationStickyOverlay(stableDetections, {
    isViolation: d =>
      d.behavior === 'mud'
      || d.behavior === 'water'
      || d.behavior === 'object'
      || d.behavior.startsWith('mesh_'),
    syncKey,
    missGraceFrames,
  })
  const [liveRoiVisible] = useCameraLiveRoiVisible(cameraId)
  const showPolygon = liveRoiVisible && roiZones.some(z => z.type === 'ROAD' || z.type === 'MESH')
  const video = videoRef.current
  const overlayFrameSize = {
    width: frameSize.width > 0
      ? frameSize.width
      : video?.videoWidth ?? (cameraId === 'A-03' ? 640 : 0),
    height: frameSize.height > 0
      ? frameSize.height
      : video?.videoHeight ?? (cameraId === 'A-03' ? 640 : 0),
  }
  const showBoxes = visible.length > 0 && overlayFrameSize.width > 0

  if (!enabled) return null
  if (!showPolygon && !showBoxes) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {showPolygon && (
        <RoiPolygons
          key={`road-roi-${layoutTick}`}
          zones={roiZones}
          frameWidth={overlayFrameSize.width}
          frameHeight={overlayFrameSize.height}
          videoRef={videoRef}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
          layoutTick={layoutTick}
        />
      )}

      {showBoxes && visible.map((d, idx) => (
        <DetectionBox
          key={`${d.behavior}-${idx}-${Math.round(d.bbox[0])}-${Math.round(d.bbox[1])}-${layoutTick}`}
          detection={d}
          frameWidth={overlayFrameSize.width}
          frameHeight={overlayFrameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
          snapOverlay={snapOverlay}
        />
      ))}
    </div>
  )
}
