import { getMonitoringDeviceShortName } from '../data/monitoringDevices'
import { SAFETY_CAMERAS } from '../data/safetyCameras'
import { getZoneSiteCode } from '../data/safetyZones'
import type { MonitoringDeviceType } from '../types/safety.types'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { cameraDisplayLabel } from '@/modules/module02-training/data/trainingCameras'
import { displayUnknown, joinDisplayUnknown } from './displayUnknown'

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
  return displayUnknown(fallback ?? id)
}

/** Chuẩn hoá camera_id từ backend — mobile / LOCAL-CAM → MOB-01 */
export function normalizeEventCameraId(cameraId: string | undefined): string {
  const id = (cameraId ?? '').trim()
  if (!id || id === 'mobile' || id === 'LOCAL-CAM') return 'MOB-01'
  return id
}

/** Suy luận nguồn sự kiện từ camera_id thực tế */
export function inferEventSourceMeta(
  cameraId: string | undefined,
  fallbackType: MonitoringDeviceType = 'FIXED_CAMERA',
): { sourceDeviceId: string; sourceType: MonitoringDeviceType } {
  const sourceDeviceId = normalizeEventCameraId(cameraId)
  const cam = getSafetyCamera(sourceDeviceId)

  if (cam?.streamType === 'mobile') {
    return { sourceDeviceId, sourceType: 'MOBILE' }
  }
  if (cam?.streamType === 'bodycam') {
    return { sourceDeviceId, sourceType: 'BODY_CAMERA' }
  }
  if (cam?.streamType === 'flycam') {
    return { sourceDeviceId, sourceType: 'DRONE' }
  }
  if (cam?.streamType === 'fixed') {
    return { sourceDeviceId, sourceType: 'FIXED_CAMERA' }
  }

  const trainingId = resolveTrainingCameraId(sourceDeviceId, fallbackType)
  if (trainingId) {
    const resolved = getSafetyCamera(trainingId)
    if (resolved) {
      if (resolved.streamType === 'mobile') return { sourceDeviceId: trainingId, sourceType: 'MOBILE' }
      if (resolved.streamType === 'bodycam') return { sourceDeviceId: trainingId, sourceType: 'BODY_CAMERA' }
      if (resolved.streamType === 'flycam') return { sourceDeviceId: trainingId, sourceType: 'DRONE' }
      if (resolved.streamType === 'fixed') return { sourceDeviceId: trainingId, sourceType: 'FIXED_CAMERA' }
    }
  }

  return { sourceDeviceId, sourceType: fallbackType }
}

/** Khu vực hiển thị — TTDV-A, Di động, … */
export function getEventAreaLabel(
  sourceDeviceId: string,
  sourceType?: MonitoringDeviceType,
  zoneId?: string,
): string {
  const { sourceDeviceId: camId, sourceType: resolvedType } = inferEventSourceMeta(
    sourceDeviceId,
    sourceType ?? 'FIXED_CAMERA',
  )
  const cam = getSafetyCamera(camId)

  if (resolvedType === 'MOBILE' || cam?.streamType === 'mobile') return 'Di động'
  if (resolvedType === 'BODY_CAMERA' || cam?.streamType === 'bodycam') return 'Di động'
  if (cam?.zone) return cam.zone
  if (zoneId) {
    const site = getZoneSiteCode(zoneId)
    if (site && site !== zoneId) return site
  }
  return displayUnknown(undefined)
}

/** Nguồn ghi hình — Cam 03, Bodycam, … */
export function getEventSourceLabel(
  sourceDeviceId: string,
  sourceType?: MonitoringDeviceType,
): string {
  const { sourceDeviceId: camId, sourceType: resolvedType } = inferEventSourceMeta(
    sourceDeviceId,
    sourceType ?? 'FIXED_CAMERA',
  )
  const cam = getSafetyCamera(camId)

  if (resolvedType === 'MOBILE' || cam?.streamType === 'mobile') return 'Bodycam'
  if (resolvedType === 'BODY_CAMERA' || cam?.streamType === 'bodycam') return 'Bodycam'
  if (resolvedType === 'DRONE' || resolvedType === 'DRONE_RTK' || cam?.streamType === 'flycam') {
    return cam?.name ?? 'Flycam'
  }
  if (cam?.streamType === 'fixed') return cam.name
  return displayUnknown(getMonitoringDeviceShortName(sourceDeviceId) || undefined)
}

/** Vị trí ghi hình trên thẻ sự kiện — vd. TTDV-A · Cam 03 */
export function getEventCapturePlace(
  sourceDeviceId: string,
  sourceType?: MonitoringDeviceType,
  zoneId?: string,
): string {
  return joinDisplayUnknown([
    getEventAreaLabel(sourceDeviceId, sourceType, zoneId),
    getEventSourceLabel(sourceDeviceId, sourceType),
  ])
}
