import { useEffect, useRef, useState, memo, useCallback, useMemo, type RefObject } from 'react'
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
import { useViolationStickyOverlay } from '../hooks/useViolationStickyOverlay'
import { groupPpeDetections, groupHasViolation } from '../utils/ppeDetectionGroups'
import { shouldShowOverlayBox } from '../utils/overlayCoverage'
import { PpePersonGroupBox } from './PpePersonGroupBox'

interface PpeOverlayProps {
  cameraId: string
  videoRef: RefObject<HTMLVideoElement | null>
  videoFit?: 'cover' | 'contain'
  videoObjectPosition?: 'center' | 'bottom'
  enabled?: boolean
  compact?: boolean
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
  useOverlaySceneReset(videoRef, enabled, resetDetections)
  const vms = useVmsDetections()

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
  const stableDetections = useStableOverlayDetections(detections)

  const { visible: stickyViolations } = useViolationStickyOverlay(stableDetections, {
    isViolation: d => d.behavior.startsWith('no_'),
  })

  const visibleGroups = useMemo(() => {
    if (stickyViolations.length === 0) return []
    return groupPpeDetections(stableDetections).filter(group => {
      if (!groupHasViolation(group)) return false
      return shouldShowOverlayBox(group.person.confidence, group.person.bbox)
    })
  }, [stableDetections, stickyViolations])

  if (visibleGroups.length === 0 || frameSize.width <= 0) return null

  return (
    <>
      {visibleGroups.map(group => (
        <PpePersonGroupBox
          key={`${group.id}-${layoutTick}`}
          group={group}
          frameWidth={frameSize.width}
          frameHeight={frameSize.height}
          videoRef={videoRef}
          compact={compact}
          videoFit={videoFit}
          videoObjectPosition={videoObjectPosition}
        />
      ))}
    </>
  )
})
