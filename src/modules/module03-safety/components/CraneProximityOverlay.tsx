import { useCallback, useEffect, useMemo, useRef, useState, memo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import {
  mapBackendBboxToOverlay,
  mapNormalizedPolygonToOverlay,
} from '@/modules/module02-training/utils/videoOverlayCoords'
import { getDefaultRoiZonesForModel } from '@/modules/module02-training/data/cameraAiRoiDefaults'
import type { CameraAiRoiZone } from '@/modules/module02-training/types/cameraAi.types'
import { useStableOverlayDetections } from '../hooks/useStableOverlayDetections'
import { type MobileAiConnectionStatus } from '@/modules/module02-training/services/mobileAiBackend.service'
import { useMobileAiBackendVersion } from '@/modules/module02-training/hooks/useMobileAiBackendVersion'
import { useOverlaySceneReset } from '../hooks/useOverlaySceneReset'
import {
  createCraneProximityClient,
  getMobileAiBackendUrl,
  type CraneProximityDetection,
  type CraneProximityMetrics,
} from '../services/craneProximityBackend.service'
import { shouldRunCraneOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import { useCameraLiveRoiVisible } from '@/modules/module02-training/hooks/useCameraLiveRoiVisible'
import { notifySafetyAiEventsChanged } from '../services/safetyAiEvents.service'
import { useVmsDetections } from '../context/VmsDetectionContext'
import { useViolationStickyOverlay } from '../hooks/useViolationStickyOverlay'
import { useLiveOverlaySync } from '../hooks/useLiveOverlaySync'
import { overlayBoxMotionClass } from '../utils/overlayBoxMotion'
import { appendCraneProximityRelated, isMachineDetection } from '../utils/craneOverlayRelated'
import { craneScanRank } from '../utils/overlayScanOrder'
import { getOverlayBoxStyle } from '../utils/roiBoxRole'
import {
  MACHINERY_INFO_MIN_CONFIDENCE,
  OVERLAY_MIN_CONFIDENCE,
} from '../utils/overlayVisibility'
import { shouldShowOverlayBox } from '../utils/overlayCoverage'
import { VIOLATION_MIN_CONFIDENCE } from '../utils/violationConfidence'
import { formatRoiOverlayBadge, formatCraneOverlayLabel, machineKindLabel } from '../utils/roiOverlayCode'
import { formatPersonOverlayBadge } from '../utils/personOverlayLabel'

const EVENT_MIN_CONFIDENCE = VIOLATION_MIN_CONFIDENCE
const INFO_MIN_CONFIDENCE = OVERLAY_MIN_CONFIDENCE
const MACHINE_MIN_CONFIDENCE = MACHINERY_INFO_MIN_CONFIDENCE

const ROI_STROKE: Record<string, { stroke: string; fill: string; dash: string }> = {
  CRANE_WORK: { stroke: 'rgba(56, 189, 248, 0.85)', fill: 'rgba(56, 189, 248, 0.10)', dash: '6 4' },
  CRANE_BODY: { stroke: 'rgba(251, 191, 36, 0.55)', fill: 'none', dash: '5 4' },
}
/** Cam A-04 — polygon ROI mỏng hơn ATGT/Road (1.2). */
const CRANE_ROI_POLYGON_STROKE_WIDTH = 0.75

function CraneRoiPolygons({
  zones,
  frameWidth,
  frameHeight,
  videoRef,
  videoFit,
  videoObjectPosition = 'center',
  layoutTick,
}: {
  zones: CameraAiRoiZone[]
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
        const style = ROI_STROKE[zone.type] ?? ROI_STROKE.CRANE_WORK
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
            strokeWidth={CRANE_ROI_POLYGON_STROKE_WIDTH}
            strokeDasharray={style.dash}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}
const MACHINE_KIND_STYLE: Record<string, { border: string; fill: string; label: string; bg: string }> = {
  tower_crane: {
    border: 'border-amber-300/95 border-dashed',
    fill: 'bg-amber-400/12',
    label: 'text-amber-100',
    bg: 'bg-amber-950/75',
  },
  crane_green: {
    border: 'border-lime-400/95 border-dashed',
    fill: 'bg-lime-400/12',
    label: 'text-lime-100',
    bg: 'bg-lime-950/75',
  },
  sany_drill: {
    border: 'border-sky-400/95 border-dashed',
    fill: 'bg-sky-400/12',
    label: 'text-sky-100',
    bg: 'bg-sky-950/75',
  },
}

function resolveDetectionStyle(detection: CraneProximityDetection) {
  if (detection.behavior === 'crane' && detection.machine_kind) {
    const kindStyle = MACHINE_KIND_STYLE[detection.machine_kind]
    if (kindStyle) return { ...kindStyle, role: 'info' as const }
  }
  const behaviorKey = detection.behavior === 'unknown' ? 'person' : detection.behavior
  return getOverlayBoxStyle('crane_proximity', behaviorKey, detection.machine_kind)
}

function formatDetectionBadge(
  detection: CraneProximityDetection,
): string {
  const distLabel = formatDistanceLabel(detection.distance_m)
  if (detection.behavior === 'person' || detection.behavior === 'crane_proximity') {
    return formatPersonOverlayBadge(detection.worker_name, detection.confidence, distLabel)
  }
  const code = formatCraneOverlayLabel(detection.behavior, {
    machineKind: detection.machine_kind,
    scenarioId: detection.scenario_id,
    label: detection.label,
  })
  return formatRoiOverlayBadge(code, detection.confidence, distLabel)
}

function formatDistanceLabel(distanceM: number | undefined): string {
  if (distanceM == null || distanceM <= 0) return ''
  return ` · ${distanceM.toFixed(1)}m`
}

interface CraneProximityOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  enabled?: boolean
  compact?: boolean
}

const DetectionBox = memo(function DetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit = 'contain',
  videoObjectPosition = 'center',
  pulse,
  snapOverlay = false,
}: {
  detection: CraneProximityDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  pulse?: boolean
  snapOverlay?: boolean
}) {
  const style = resolveDetectionStyle(detection)
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox
  const isViolation = detection.behavior === 'crane_proximity'
  const layerZ = isViolation
    ? 7
    : detection.machine_kind === 'crane_green'
      ? 6
      : detection.machine_kind === 'sany_drill'
        ? 5
        : detection.machine_kind === 'tower_crane'
          ? 4
          : 3

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

  const displayLabel = formatDetectionBadge(detection)

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
      <div
        className={cn(
          'absolute inset-0 rounded-sm border-2',
          style.border,
          style.fill,
          pulse && 'animate-pulse',
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
        {displayLabel}
      </span>
    </div>
  )
})

function passesCraneOverlayDetection(d: CraneProximityDetection): boolean {
  if (d.behavior === 'crane' && d.machine_kind) {
    return d.confidence >= MACHINE_MIN_CONFIDENCE
  }
  if (d.behavior === 'crane_proximity') {
    return shouldShowOverlayBox(d.confidence, d.bbox)
  }
  if (d.behavior === 'person') {
    return d.confidence >= INFO_MIN_CONFIDENCE
  }
  return false
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
  const backendUrlVersion = useMobileAiBackendVersion()
  const resetDetections = useCallback(() => setDetections([]), [])
  const vms = useVmsDetections()
  useOverlaySceneReset(videoRef, enabled, resetDetections, { liveHls: Boolean(vms?.active) })

  useEffect(() => {
    if (!enabled || !vms?.active || !vms.snapshot) return
    const video = videoRef.current
    if (video && !shouldRunCraneOnCamera(cameraId, video.currentTime)) {
      setDetections([])
      return
    }
    setLayoutTick(t => t + 1)
    const craneMetrics = vms.snapshot.metrics.crane as CraneProximityMetrics | undefined
    const mapped = vms.snapshot.detections
      .filter(d => ['crane', 'crane_proximity', 'person'].includes(d.behavior))
        .map(d => ({
          behavior: d.behavior as CraneProximityDetection['behavior'],
          label: d.label,
          scenario_id: d.scenario_id ?? 'DZ-003',
          confidence: d.confidence,
          bbox: d.bbox,
          machine_kind: d.machine_kind,
          distance_m: d.distance_m,
          nearest_machine: d.nearest_machine,
          worker_id: d.worker_id,
          worker_name: d.worker_name,
          employee_code: d.employee_code,
          contractor_name: d.contractor_name,
          face_match_confidence: d.face_match_confidence,
        })) as CraneProximityDetection[]
    const visible = mapped
      .filter(passesCraneOverlayDetection)
      .sort((a, b) => craneScanRank(a.behavior, a.machine_kind) - craneScanRank(b.behavior, b.machine_kind))
    setDetections(visible)
    setFrameSize({ width: vms.snapshot.width, height: vms.snapshot.height })
    setMetrics(craneMetrics)
    setStatus(vms.status)
    setStatusMsg(vms.statusMsg)
  }, [enabled, vms?.active, vms?.snapshot?.updated_at, vms?.status, vms?.statusMsg, cameraId, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !enabled) return
    const onSegmentChange = () => {
      if (!shouldRunCraneOnCamera(cameraId, video.currentTime)) {
        setDetections([])
      }
    }
    video.addEventListener('timeupdate', onSegmentChange)
    video.addEventListener('seeked', onSegmentChange)
    return () => {
      video.removeEventListener('timeupdate', onSegmentChange)
      video.removeEventListener('seeked', onSegmentChange)
    }
  }, [cameraId, enabled, videoRef])

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

    clientRef.current = createCraneProximityClient(video, {
      cameraId,
      backendUrl,
      shouldAnalyze: () => shouldRunCraneOnCamera(cameraId, video.currentTime),
      onResult: result => {
        if (!shouldRunCraneOnCamera(cameraId, video.currentTime)) {
          setDetections([])
          return
        }
        const visible = result.detections
          .filter(passesCraneOverlayDetection)
          .sort((a, b) => {
            const rank = (d: CraneProximityDetection) =>
              craneScanRank(d.behavior, d.machine_kind)
            return rank(a) - rank(b)
          })
        setDetections(visible)
        setFrameSize({ width: result.width, height: result.height })
        setMetrics(result.metrics)

        const backendViolation = (result.events ?? []).some(
          e => e.behavior === 'crane_proximity' && e.confidence >= EVENT_MIN_CONFIDENCE,
        )
        if (backendViolation) {
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

  const roiZones = useMemo<CameraAiRoiZone[]>(() => {
    const fromVms = (vms?.snapshot?.roi_zones ?? [])
      .filter(z => z.type === 'CRANE_BODY' || z.type === 'CRANE_WORK')
      .map(z => ({
        id: z.id,
        label: z.label,
        type: z.type,
        polygon: z.polygon,
      }))
    if (fromVms.length > 0) return fromVms
    return getDefaultRoiZonesForModel(cameraId, 'crane_proximity')
  }, [cameraId, vms?.snapshot?.roi_zones])

  return { status, statusMsg, detections, frameSize, metrics, roiZones, layoutTick }
}

export const CraneProximityOverlay = memo(function CraneProximityOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  videoObjectPosition = 'center',
  enabled = true,
  compact,
}: CraneProximityOverlayProps) {
  const { detections, frameSize, roiZones, layoutTick } =
    useCraneProximityState(cameraId, videoRef, enabled)

  const { syncKey, trackLock, missGraceFrames, snapOverlay } = useLiveOverlaySync()
  const stableDetections = useStableOverlayDetections(detections, { syncKey, trackLock })

  const appendRelated = useCallback(
    (visible: CraneProximityDetection[], all: CraneProximityDetection[]) =>
      appendCraneProximityRelated(visible, all),
    [],
  )

  const { visible: stickyViolations } = useViolationStickyOverlay(stableDetections, {
    isViolation: d => d.behavior === 'crane_proximity',
    appendRelated,
    syncKey,
    missGraceFrames,
  })

  const renderDetections = useMemo(() => {
    const apiMachines = stableDetections.filter(
      d => isMachineDetection(d) && d.confidence >= MACHINE_MIN_CONFIDENCE,
    )

    const fromViolations: CraneProximityDetection[] = stickyViolations.flatMap(v => {
      if (v.behavior !== 'crane_proximity' || !v.machine_bbox || v.machine_bbox.length < 4) {
        return []
      }
      return [{
        behavior: 'crane' as const,
        label: machineKindLabel(v.machine_kind),
        scenario_id: v.scenario_id,
        confidence: Math.max(v.confidence, 0.85),
        bbox: v.machine_bbox,
        machine_kind: v.machine_kind,
      }]
    })

    const seen = new Set<string>()
    const merged: CraneProximityDetection[] = []
    for (const det of [...stickyViolations, ...apiMachines, ...fromViolations]) {
      const key = `${det.behavior}-${det.machine_kind ?? 'x'}-${det.bbox.map(v => Math.round(v / 8)).join(',')}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(det)
    }
    return merged
  }, [stickyViolations, stableDetections])

  const [liveRoiVisible] = useCameraLiveRoiVisible(cameraId)
  const showPolygon = roiZones.length > 0 && liveRoiVisible
  const video = videoRef.current
  const overlayFrameSize =
    frameSize.width > 0
      ? frameSize
      : video?.videoWidth && video.videoHeight
        ? { width: video.videoWidth, height: video.videoHeight }
        : { width: 0, height: 0 }
  const showBoxes = renderDetections.length > 0 && overlayFrameSize.width > 0

  if (!enabled) return null
  if (!showPolygon && !showBoxes) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {showPolygon && (
        <CraneRoiPolygons
          zones={roiZones}
          frameWidth={overlayFrameSize.width}
          frameHeight={overlayFrameSize.height}
          videoRef={videoRef}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
          layoutTick={layoutTick}
        />
      )}
      {showBoxes && renderDetections.map(d => (
        <DetectionBox
          key={`${d.behavior}-${d.machine_kind ?? 'none'}-${Math.round(d.bbox[0])}-${Math.round(d.bbox[1])}-${layoutTick}`}
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
})
