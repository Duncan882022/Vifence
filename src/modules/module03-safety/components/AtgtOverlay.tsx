import { useEffect, useRef, useState, memo, useCallback, useMemo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapBackendBboxToOverlay, mapNormalizedPolygonToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import { useMobileAiBackendVersion } from '@/modules/module02-training/hooks/useMobileAiBackendVersion'
import { isCameraAiModelEnabled } from '@/modules/module02-training/services/cameraAiConfig.service'
import { useCameraLiveRoiVisible } from '@/modules/module02-training/hooks/useCameraLiveRoiVisible'
import {
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  createAtgtClient,
  getMobileAiBackendUrl,
  type AtgtDetection,
} from '../services/atgtBackend.service'
import { notifySafetyAiEventsChanged } from '../services/safetyAiEvents.service'
import { useVmsDetections } from '../context/VmsDetectionContext'
import { getRoiZonesForCamera } from '@/modules/module04-housekeeping/data/housekeepingRoiConfig'
import { formatRoiOverlayBadge, formatRoiOverlayCode } from '../utils/roiOverlayCode'
import { useViolationStickyOverlay } from '../hooks/useViolationStickyOverlay'
import { useLiveOverlaySync } from '../hooks/useLiveOverlaySync'
import { overlayBoxMotionClass } from '../utils/overlayBoxMotion'
import { useStableOverlayDetections } from '../hooks/useStableOverlayDetections'
import { useOverlayLayoutTick } from '../hooks/useOverlayLayoutTick'
import { useOverlaySceneReset } from '../hooks/useOverlaySceneReset'
import { isAtgtLaneViolationBehavior, filterAtgtLaneOverlayDetections } from '../utils/atgtLaneLogic'
import { getOverlayBoxStyle } from '../utils/roiBoxRole'

interface AtgtOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  enabled?: boolean
  compact?: boolean
}

const VEHICLE_MIN_CONF = 0.45
const LANE_GUIDE_STROKE_WIDTH = 0.75

const LANE_GUIDE_STROKE: Record<string, { stroke: string; dash?: string }> = {
  soft_median: { stroke: 'rgba(56, 189, 248, 0.92)', dash: '5 3' },
  hard_median: { stroke: 'rgba(74, 222, 128, 0.95)' },
}

function mapBboxPointToOverlay(
  x: number,
  y: number,
  frameWidth: number,
  frameHeight: number,
  video: HTMLVideoElement | null | undefined,
  videoFit: 'cover' | 'contain',
  videoObjectPosition: 'center' | 'bottom',
): { x: number; y: number } | null {
  const box = mapBackendBboxToOverlay(
    [x, y, x + 1, y + 1],
    frameWidth,
    frameHeight,
    video,
    videoFit,
    videoObjectPosition,
  )
  if (box.w <= 0) return null
  return { x: box.x, y: box.y }
}

function LaneMedianGuide({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  videoFit,
  videoObjectPosition = 'center',
}: {
  detection: AtgtDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
}) {
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox
  const style = LANE_GUIDE_STROKE[detection.behavior] ?? LANE_GUIDE_STROKE.soft_median

  const isVerticalFence =
    detection.behavior === 'soft_median' && (x2 - x1) < (y2 - y1) * 0.72
  const lineX = isVerticalFence ? x2 : null
  const lineY = detection.behavior === 'hard_median' ? (y1 + y2) / 2 : null

  const p1 = isVerticalFence && lineX != null
    ? mapBboxPointToOverlay(lineX, y1, frameWidth, frameHeight, video, videoFit, videoObjectPosition)
    : lineY != null
      ? mapBboxPointToOverlay(x1, lineY, frameWidth, frameHeight, video, videoFit, videoObjectPosition)
      : null
  const p2 = isVerticalFence && lineX != null
    ? mapBboxPointToOverlay(lineX, y2, frameWidth, frameHeight, video, videoFit, videoObjectPosition)
    : lineY != null
      ? mapBboxPointToOverlay(x2, lineY, frameWidth, frameHeight, video, videoFit, videoObjectPosition)
      : null

  if (!p1 || !p2) return null

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-[3]"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={style.stroke}
        strokeWidth={LANE_GUIDE_STROKE_WIDTH}
        strokeDasharray={style.dash}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

const ATGT_ROI_STROKE: Record<string, { stroke: string; fill: string; dash?: string }> = {
  ROAD: { stroke: 'rgba(74, 222, 128, 0.95)', fill: 'rgba(34, 197, 94, 0.12)' },
}

function AtgtRoiPolygons({
  zones,
  frameWidth,
  frameHeight,
  videoRef,
  videoFit,
  videoObjectPosition = 'center',
  layoutTick,
}: {
  zones: Array<{ id: string; type: string; polygon: Array<{ x: number; y: number }> }>
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  layoutTick: number
}) {
  const video = videoRef.current
  if (zones.length === 0 || (frameWidth <= 0 && !video?.videoWidth)) return null

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {zones.map(zone => {
        const style = ATGT_ROI_STROKE[zone.type] ?? ATGT_ROI_STROKE.ROAD
        const points = mapNormalizedPolygonToOverlay(
          zone.polygon,
          video,
          frameWidth,
          frameHeight,
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
            strokeWidth={1.2}
            strokeDasharray={style.dash}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}

function visibleDetections(detections: AtgtDetection[]): AtgtDetection[] {
  return detections.filter(d => {
    if (d.behavior === 'speeding') return d.confidence >= 0.45
    if (d.behavior === 'vehicle') return d.confidence >= VEHICLE_MIN_CONF
    if (isAtgtLaneViolationBehavior(d.behavior)) return d.confidence >= 0.45
    return false
  })
}

function formatLabel(detection: AtgtDetection): string {
  return formatRoiOverlayBadge(
    formatRoiOverlayCode(detection.behavior),
    detection.confidence,
  )
}

const DetectionBox = memo(function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit,
  videoObjectPosition = 'center',
  snapOverlay = false,
}: {
  detection: AtgtDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  snapOverlay?: boolean
}) {
  const style = getOverlayBoxStyle('atgt_traffic', detection.behavior)
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox
  const layerZ = detection.behavior === 'speeding' ? 7 : 6

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
      className={overlayBoxMotionClass(snapOverlay)}
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
})

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
  const layoutTick = useOverlayLayoutTick(videoRef)
  const backendUrlVersion = useMobileAiBackendVersion()
  const resetDetections = useCallback(() => setDetections([]), [])
  const vms = useVmsDetections()
  useOverlaySceneReset(videoRef, enabled, resetDetections, { liveHls: Boolean(vms?.active) })

  useEffect(() => {
    if (!enabled || !vms?.active || !vms.snapshot) return
    setFrameSize({ width: vms.snapshot.width, height: vms.snapshot.height })
    setDetections(visibleDetections(
      vms.snapshot.detections
        .filter(d => ['vehicle', 'speeding', 'hard_median', 'soft_median', 'no_soft_median'].includes(d.behavior))
        .map(d => ({
          behavior: d.behavior as AtgtDetection['behavior'],
          label: d.label,
          confidence: d.confidence,
          bbox: d.bbox,
          vehiclePlate: d.vehicle_plate,
          vehicleType: d.vehicle_type,
          driverName: d.driver_name,
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

    const shouldAnalyze = () => isCameraAiModelEnabled(cameraId, 'atgt_traffic')

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
        setFrameSize({ width: result.width, height: result.height })
        setDetections(visibleDetections(result.detections))
        if (result.events.length > 0) {
          notifySafetyAiEventsChanged()
        }
      },
    })

    return () => {
      clientRef.current?.stop()
      clientRef.current = null
    }
  }, [cameraId, enabled, videoRef, backendUrlVersion, vms?.active])

  const roiZones = useMemo(() => {
    const fromVms = (vms?.snapshot?.roi_zones ?? []).filter(z => z.type === 'ROAD')
    if (fromVms.length > 0) return fromVms
    return getRoiZonesForCamera(cameraId).filter(z => z.type === 'ROAD')
  }, [cameraId, vms?.snapshot?.roi_zones])

  return { status, statusMsg, detections, frameSize, roiZones, layoutTick }
}

export const AtgtOverlay = memo(function AtgtOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  videoObjectPosition = 'center',
  enabled = true,
  compact,
}: AtgtOverlayProps) {
  const { detections, frameSize, roiZones, layoutTick } = useAtgtState(
    cameraId,
    videoRef,
    enabled,
  )
  const { syncKey, trackLock, missGraceFrames, snapOverlay } = useLiveOverlaySync()
  const stableDetections = useStableOverlayDetections(detections, { syncKey, trackLock })
  const laneFiltered = filterAtgtLaneOverlayDetections(stableDetections)

  const { visible: violationVisible } = useViolationStickyOverlay(laneFiltered, {
    isViolation: d =>
      d.behavior === 'speeding' || isAtgtLaneViolationBehavior(d.behavior),
    syncKey,
    missGraceFrames,
  })

  const medianVisible = laneFiltered.filter(
    d => (d.behavior === 'soft_median' || d.behavior === 'hard_median') && d.confidence >= 0.45,
  )

  const visible = [...violationVisible, ...medianVisible]

  const roadMaterialActive = isCameraAiModelEnabled(cameraId, 'road_material')
  const [liveRoiVisible] = useCameraLiveRoiVisible(cameraId)
  /** Cam A-03: polygon lòng đường do RoadAnalysisOverlay vẽ — tránh trùng / lệch. */
  const showPolygon = cameraId !== 'A-03'
    && !roadMaterialActive
    && roiZones.length > 0
    && liveRoiVisible
  const showBoxes = visible.length > 0 && frameSize.width > 0
  const video = videoRef.current
  const overlayFrameSize =
    frameSize.width > 0
      ? frameSize
      : video?.videoWidth && video.videoHeight
        ? { width: video.videoWidth, height: video.videoHeight }
        : { width: 0, height: 0 }

  if (!enabled) return null
  if (!showPolygon && !showBoxes) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {showPolygon && (
        <AtgtRoiPolygons
          zones={roiZones}
          frameWidth={overlayFrameSize.width}
          frameHeight={overlayFrameSize.height}
          videoRef={videoRef}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
          layoutTick={layoutTick}
        />
      )}
      {showBoxes && visible.map((d, i) => {
        if (d.behavior === 'soft_median' || d.behavior === 'hard_median') {
          return (
            <LaneMedianGuide
              key={`lane-${d.behavior}-${i}-${Math.round(d.bbox[0])}-${layoutTick}`}
              detection={d}
              frameWidth={frameSize.width}
              frameHeight={frameSize.height}
              videoRef={videoRef}
              videoFit={videoFit}
              videoObjectPosition={videoObjectPosition}
            />
          )
        }
        return (
          <DetectionBox
            key={`${d.behavior}-${i}-${Math.round(d.bbox[0])}-${layoutTick}`}
            detection={d}
            frameWidth={frameSize.width}
            frameHeight={frameSize.height}
            videoRef={videoRef}
            compact={compact}
            videoFit={videoFit}
            videoObjectPosition={videoObjectPosition}
            snapOverlay={snapOverlay}
          />
        )
      })}
    </div>
  )
})
