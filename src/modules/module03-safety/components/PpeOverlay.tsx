import { useEffect, useRef, useState, memo, useCallback, useMemo, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { mapBackendBboxToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'
import {
  MOBILE_AI_BACKEND_STORAGE_KEY,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { shouldRunPpeOnCamera } from '@/modules/module02-training/data/cameraAiRuntime'
import {
  createPpeClient,
  getMobileAiBackendUrl,
  type PpeDetection,
  type PpeMetrics,
} from '../services/ppeBackend.service'
import { notifySafetyAiEventsChanged } from '../services/safetyAiEvents.service'
import { useVmsDetections } from '../context/VmsDetectionContext'
import { useOverlaySceneReset } from '../hooks/useOverlaySceneReset'
import { useStableOverlayDetections } from '../hooks/useStableOverlayDetections'
import { useLiveOverlaySync } from '../hooks/useLiveOverlaySync'
import { useRoiCycleDisplay } from '../hooks/useRoiCycleDisplay'
import {
  flattenPpeViolationOverlayBoxes,
  groupHasViolation,
  groupPpeDetections,
} from '../utils/ppeDetectionGroups'
import { shouldShowOverlayBox } from '../utils/overlayCoverage'
import {
  formatPersonOverlayBadge,
  formatPpeViolationOverlayBadge,
  tightenPersonOverlayBbox,
} from '../utils/personOverlayLabel'
import { syncPersonOverlaySession } from '../utils/personOverlaySession'
import { getOverlayBoxStyle } from '../utils/roiBoxRole'
import { overlayBoxMotionClass } from '../utils/overlayBoxMotion'
import { ppeScanRank, ppeViolationRank } from '../utils/overlayScanOrder'

interface PpeOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  enabled?: boolean
  compact?: boolean
}

function personOverlayDetection(person: PpeDetection): PpeDetection {
  return {
    ...person,
    behavior: 'person',
    bbox: tightenPersonOverlayBbox(person.bbox, person.subject_bbox),
  }
}

function buildPpeCycleDetections(detections: PpeDetection[]): PpeDetection[] {
  const groups = groupPpeDetections(detections)
  const persons = groups.map(g => personOverlayDetection(g.person))
  const violations = flattenPpeViolationOverlayBoxes(groups.filter(groupHasViolation))
  const condition: PpeDetection[] = []
  for (const group of groups) {
    if (group.slots.head && !group.slots.head.behavior.startsWith('no_')) {
      condition.push(group.slots.head)
    }
    if (group.slots.torso && !group.slots.torso.behavior.startsWith('no_')) {
      condition.push(group.slots.torso)
    }
    for (const foot of group.slots.feet) {
      if (!foot.behavior.startsWith('no_')) condition.push(foot)
    }
  }
  return [...persons, ...condition, ...violations]
}

function formatPpeLiveBadge(detection: PpeDetection): string {
  if (detection.behavior === 'person') {
    return formatPersonOverlayBadge(
      detection.worker_name,
      detection.confidence,
      '',
      {
        workerId: detection.worker_id,
        workerName: detection.worker_name,
        faceMatchConfidence: detection.face_match_confidence,
        faceMatchSource: detection.face_match_source,
      },
    )
  }
  return formatPpeViolationOverlayBadge({
    behavior: detection.behavior,
    confidence: detection.confidence,
    scenario_id: detection.scenario_id,
    worker_id: detection.worker_id,
    worker_name: detection.worker_name,
    face_match_confidence: detection.face_match_confidence,
    face_match_source: detection.face_match_source,
  })
}

function PpeDetectionBox({
  detection,
  frameWidth,
  frameHeight,
  videoRef,
  compact,
  videoFit,
  videoObjectPosition = 'center',
  snapOverlay = false,
  pulse = false,
}: {
  detection: PpeDetection
  frameWidth: number
  frameHeight: number
  videoRef: RefObject<HTMLVideoElement | null>
  compact?: boolean
  videoFit: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  snapOverlay?: boolean
  pulse?: boolean
}) {
  const style = getOverlayBoxStyle('ppe', detection.behavior)
  const video = videoRef.current
  const [x1, y1, x2, y2] = detection.bbox

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
  if (!shouldShowOverlayBox(detection.confidence, detection.bbox)) return null

  return (
    <div
      className={cn(overlayBoxMotionClass(snapOverlay), pulse && 'animate-pulse')}
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: detection.behavior === 'person' ? 7 : 8,
      }}
    >
      <div className={cn('absolute inset-0 rounded-sm', style.border, style.fill)} />
      <span
        className={cn(
          'absolute -top-3 left-0 px-0.5 py-px font-mono whitespace-nowrap rounded-sm',
          style.bg,
          style.label,
          compact ? 'text-[5px]' : 'text-[7px]',
        )}
      >
        {formatPpeLiveBadge(detection)}
      </span>
    </div>
  )
}

function usePpeState(
  cameraId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const clientRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<MobileAiConnectionStatus>('idle')
  const [statusMsg, setStatusMsg] = useState<string>()
  const [detections, setDetections] = useState<PpeDetection[]>([])
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [metrics, setMetrics] = useState<PpeMetrics>()
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
    const ppeMetrics = vms.snapshot.metrics.ppe as PpeMetrics | undefined
    setFrameSize({ width: vms.snapshot.width, height: vms.snapshot.height })
    setMetrics(ppeMetrics ?? {
      person_count: vms.snapshot.detections.filter(d => d.behavior === 'person').length,
      ppe_violations: vms.snapshot.detections.filter(d => d.behavior.startsWith('no_')).length,
    })
    setDetections(
      vms.snapshot.detections
        .filter(d => ['person', 'hard_hat', 'no_helmet', 'safety_vest', 'no_vest', 'safety_shoes', 'no_shoes'].includes(d.behavior))
        .map(d => ({
          behavior: d.behavior as PpeDetection['behavior'],
          label: d.label,
          scenario_id: d.scenario_id ?? '',
          confidence: d.confidence,
          bbox: d.bbox,
          subject_bbox: d.subject_bbox,
          worker_id: d.worker_id,
          worker_name: d.worker_name,
          employee_code: d.employee_code,
          contractor_name: d.contractor_name,
          face_match_confidence: d.face_match_confidence,
          face_match_source: d.face_match_source,
        })),
    )
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
    if (!enabled || !video || vms?.active) {
      clientRef.current?.stop()
      clientRef.current = null
      if (!enabled) {
        setDetections([])
        setStatus('idle')
      }
      return
    }

    const shouldAnalyze = () => shouldRunPpeOnCamera(cameraId, video.currentTime)

    clientRef.current?.stop()
    clientRef.current = createPpeClient(video, {
      cameraId,
      backendUrl: getMobileAiBackendUrl(),
      shouldAnalyze,
      onStatusChange: (s, msg) => {
        setStatus(s)
        setStatusMsg(msg)
      },
      onResult: result => {
        setFrameSize({ width: result.width, height: result.height })
        setMetrics(result.metrics)
        setDetections(result.detections)
        if (result.events && result.events.length > 0) {
          notifySafetyAiEventsChanged()
        }
      },
    })

    return () => {
      clientRef.current?.stop()
      clientRef.current = null
    }
  }, [cameraId, enabled, videoRef, backendUrlVersion, vms?.active])

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

  return { status, statusMsg, detections, frameSize, metrics, layoutTick }
}

export const PpeOverlay = memo(function PpeOverlay({
  cameraId,
  videoRef,
  videoFit = 'contain',
  videoObjectPosition = 'center',
  enabled = true,
  compact,
}: PpeOverlayProps) {
  const { detections, frameSize, layoutTick } = usePpeState(cameraId, videoRef, enabled)
  const { syncKey, trackLock, snapOverlay } = useLiveOverlaySync()
  const stableDetections = useStableOverlayDetections(detections, { syncKey, trackLock })

  const cycleItems = useMemo(
    () => buildPpeCycleDetections(stableDetections).filter(d =>
      shouldShowOverlayBox(d.confidence, d.bbox),
    ),
    [stableDetections],
  )

  useEffect(() => {
    syncPersonOverlaySession(
      cycleItems
        .filter(d => d.behavior === 'person')
        .map(d => d.worker_id),
    )
  }, [cycleItems])

  const { visible, pulse } = useRoiCycleDisplay(cycleItems, d => d.behavior.startsWith('no_'), {
    getScanRank: d => ppeScanRank(d.behavior, d.bbox),
    getViolationRank: d => ppeViolationRank(d.behavior, d.bbox),
  })

  if (visible.length === 0 || frameSize.width <= 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {visible.map((detection, index) => (
        <PpeDetectionBox
          key={`${detection.behavior}-${index}-${Math.round(detection.bbox[0])}-${Math.round(detection.bbox[1])}-${layoutTick}`}
          detection={detection}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
          snapOverlay={snapOverlay}
          pulse={pulse && detection.behavior === 'person'}
        />
      ))}
    </div>
  )
})
