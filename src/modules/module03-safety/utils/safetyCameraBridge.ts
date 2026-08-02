import { getMonitoringDeviceShortName } from '../data/monitoringDevices'
import { SAFETY_CAMERAS } from '../data/safetyCameras'
import { getZoneSiteCode } from '../data/safetyZones'
import type { MonitoringDeviceType } from '../types/safety.types'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { cameraDisplayLabel } from '@/modules/module02-training/data/trainingCameras'

const BODY_DEVICE_TO_CAMERA: Record<string, string> = {
  'BODY-01': 'BC-01',
  'BODY-02': 'BC-02',
  'BODY-03': 'BC-03',
  'BODY-04': 'BC-01',
  'BODY-05': 'BC-02',
  'BODY-06': 'BC-03',
}

/** Map thiết bị giám sát Module 03 → camera live Module 02 (TrainingCameraPanel / Giảng Võ). */
export function resolveTrainingCameraId(
  sourceDeviceId: string,
  sourceType?: MonitoringDeviceType,
): string | undefined {
  if (sourceType === 'DRONE' || sourceType === 'DRONE_RTK') {
    return sourceDeviceId === 'DRONE-01' ? 'FC-01' : 'FC-02'
  }

  if (sourceType === 'BODY_CAMERA' || sourceDeviceId.startsWith('BODY-')) {
    return BODY_DEVICE_TO_CAMERA[sourceDeviceId] ?? 'BC-01'
  }

  const camMatch = sourceDeviceId.match(/^CAM-(\d+)$/)
  if (camMatch) {
    const n = parseInt(camMatch[1], 10)
    if (n <= 8) return `A-${String(n).padStart(2, '0')}`
    return `B-${String(n - 8).padStart(2, '0')}`
  }

  if (sourceDeviceId.startsWith('PTZ-')) {
    return sourceDeviceId === 'PTZ-01' ? 'A-03' : 'B-02'
  }

  return SAFETY_CAMERAS.find(c => c.id === sourceDeviceId)?.id
}

/** Camera Giảng Võ theo id — dùng cho live + playback label */
export function getSafetyCamera(id: string | undefined): TrainingCamera | undefined {
  if (!id) return undefined
  return SAFETY_CAMERAS.find(c => c.id === id)
}

export function getSafetyCameraDisplayName(id: string | undefined, fallback?: string): string {
  const cam = getSafetyCamera(id)
  if (cam) return cameraDisplayLabel(cam)
  return fallback ?? id ?? '—'
}

/** Vị trí ghi hình trên thẻ sự kiện — vd. TTDV-A - Cam 03 */
export function getEventCapturePlace(
  sourceDeviceId: string,
  sourceType?: MonitoringDeviceType,
  zoneId?: string,
): string {
  const trainingId = resolveTrainingCameraId(sourceDeviceId, sourceType)
  const cam = getSafetyCamera(trainingId)

  if (cam?.streamType === 'fixed' && cam.zone) {
    return `${cam.zone} - ${cam.name}`
  }

  if (cam?.streamType === 'bodycam') {
    const site = zoneId ? getZoneSiteCode(zoneId) : cam.zone
    return site ? `${site} - ${cam.name}` : (cam.assignee ?? cam.name)
  }

  if (cam?.streamType === 'mobile') {
    return cam.assignee ?? cam.name
  }

  if (cam?.streamType === 'flycam') {
    const site = zoneId ? getZoneSiteCode(zoneId) : ''
    return site ? `${site} - ${cam.name}` : cam.name
  }

  const site = zoneId ? getZoneSiteCode(zoneId) : '—'
  return `${site} - ${getMonitoringDeviceShortName(sourceDeviceId)}`
}
