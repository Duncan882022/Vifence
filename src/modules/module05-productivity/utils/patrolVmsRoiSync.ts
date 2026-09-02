import type { VmsDetectionSnapshot } from '@/modules/module03-safety/services/vmsDetections.service'
import type { MobileAiDetection } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  patrolPersonMeetsDisplayGate,
  patrolPersonMeetsDrFlycamDisplayGate,
  suppressPatrolObjectOverlappingIdentified,
} from './patrolPersonVisibility'
import { bboxToPixelSpace } from '@/modules/module02-training/utils/videoOverlayCoords'
import {
  resolveEffectivePatrolFlightMode,
  resolvePatrolFlycamGateFlags,
  type PatrolFlightMode,
} from './patrolFlightMode'

/** Map + gate detections VMS → payload ROI engine (một nguồn/cam). */
export function gateVmsPatrolPersonDetections(
  snapshot: VmsDetectionSnapshot,
  cameraId: string,
  flightMode?: PatrolFlightMode | null,
): MobileAiDetection[] {
  const frameW = snapshot.width ?? 0
  const frameH = snapshot.height ?? 0
  const effectiveMode = flightMode ?? resolveEffectivePatrolFlightMode(cameraId, snapshot.metrics)
  const flycamGates = resolvePatrolFlycamGateFlags(cameraId, effectiveMode)
  const isDrFlycam = cameraId.startsWith('DR-')

  const mapped = snapshot.detections
    .map(d => ({
      behavior: d.behavior,
      label: d.label ?? d.behavior,
      confidence: d.confidence,
      bbox: d.bbox,
      subject_bbox: d.subject_bbox,
      worker_id: d.worker_id,
      worker_name: d.worker_name,
      track_id: d.track_id,
      tier: d.tier,
      velocity: d.velocity,
      peak_group: d.peak_group,
      peak_group_index: d.peak_group_index,
      peak_group_size: d.peak_group_size,
      face_eligible: undefined as boolean | undefined,
    }))
    .filter(d => {
      if (d.behavior !== 'person') return false
      const raw = d.subject_bbox?.length === 4 ? d.subject_bbox : d.bbox
      if (!raw || raw.length < 4 || frameW <= 0 || frameH <= 0) return false
      const bbox = bboxToPixelSpace(
        [raw[0], raw[1], raw[2], raw[3]] as [number, number, number, number],
        frameW,
        frameH,
      )
      const gateInput = {
        bbox,
        frameW,
        frameH,
        workerId: d.worker_id,
      }
      if (isDrFlycam) {
        return patrolPersonMeetsDrFlycamDisplayGate(gateInput)
      }
      return patrolPersonMeetsDisplayGate({
        ...gateInput,
        flycam: flycamGates.flycam,
        proximityFlycam: flycamGates.proximityFlycam,
      })
    })

  return suppressPatrolObjectOverlappingIdentified(mapped, frameW, frameH)
}
