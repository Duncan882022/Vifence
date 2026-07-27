import type { MonitoringDevice } from '../types/safety.types'
import { getZoneSiteCode } from './safetyZones'

export const MONITORING_DEVICES: MonitoringDevice[] = [
  { id: 'CAM-01', name: 'Cam 01', type: 'FIXED_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-A01'], coordinates: { x: 120, y: 140 } },
  { id: 'CAM-02', name: 'Cam 02', type: 'FIXED_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-A01'], coordinates: { x: 220, y: 130 } },
  { id: 'CAM-03', name: 'Cam 03', type: 'FIXED_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-A02'], coordinates: { x: 340, y: 100 } },
  { id: 'CAM-04', name: 'Cam 04', type: 'FIXED_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-A02'], coordinates: { x: 480, y: 110 } },
  { id: 'CAM-05', name: 'Cam 05', type: 'FIXED_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-B01'], coordinates: { x: 284, y: 180 } },
  { id: 'CAM-06', name: 'Cam 06', type: 'FIXED_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-B01'], coordinates: { x: 284, y: 260 } },
  { id: 'CAM-07', name: 'Cam 07', type: 'FIXED_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-B02'], coordinates: { x: 140, y: 310 } },
  { id: 'CAM-08', name: 'Cam 08', type: 'FIXED_CAMERA', status: 'OFFLINE', zoneIds: ['ZONE-B02'], coordinates: { x: 100, y: 360 } },
  { id: 'CAM-09', name: 'Cam 01', type: 'FIXED_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-B02'], coordinates: { x: 160, y: 380 } },
  { id: 'CAM-10', name: 'Cam 02', type: 'FIXED_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-B03'], coordinates: { x: 460, y: 370 } },
  { id: 'PTZ-01', name: 'Cam 03', type: 'PTZ_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-A01'], coordinates: { x: 174, y: 160 } },
  { id: 'PTZ-02', name: 'Cam 02', type: 'PTZ_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-A02'], coordinates: { x: 416, y: 150 } },
  { id: 'DRONE-01', name: 'Fly 01', type: 'DRONE', status: 'STANDBY', zoneIds: ['ZONE-B03', 'ZONE-C01'], coordinates: { x: 518, y: 240 } },
  { id: 'BODY-01', name: 'Body 01', type: 'BODY_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-A01'] },
  { id: 'BODY-02', name: 'Body 02', type: 'BODY_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-A01'] },
  { id: 'BODY-03', name: 'Body 03', type: 'BODY_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-A02'] },
  { id: 'BODY-04', name: 'Body 01', type: 'BODY_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-C01'] },
  { id: 'BODY-05', name: 'Body 02', type: 'BODY_CAMERA', status: 'ONLINE', zoneIds: ['ZONE-C01'] },
  { id: 'BODY-06', name: 'Body 03', type: 'BODY_CAMERA', status: 'OFFLINE', zoneIds: ['ZONE-C01'] },
]

export const MONITORING_DEVICE_MAP = new Map(MONITORING_DEVICES.map(d => [d.id, d]))

/** Tên thiết bị ghi hình — vd. TTDV-A · Cam 03 */
export function getMonitoringDeviceLabel(deviceId: string): string {
  const device = MONITORING_DEVICE_MAP.get(deviceId)
  if (!device) return deviceId
  const site = device.zoneIds[0] ? getZoneSiteCode(device.zoneIds[0]) : ''
  return site ? `${site} · ${device.name}` : device.name
}

/** Tên camera ngắn — vd. Cam 03 */
export function getMonitoringDeviceShortName(deviceId: string): string {
  return MONITORING_DEVICE_MAP.get(deviceId)?.name ?? deviceId
}

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  FIXED_CAMERA: 'Camera cố định',
  PTZ_CAMERA: 'Camera PTZ',
  DRONE: 'Flycam',
  DRONE_RTK: 'Flycam RTK',
  BODY_CAMERA: 'Bodycam',
  MOBILE: 'Mobile HSE',
  RADAR: 'Radar',
  GPS_IVI: 'GPS/IVI',
  WEARABLE_SENSOR: 'Cảm biến đeo',
  BIM_GIS: 'BIM/GIS',
}

export const AUTOMATION_LABELS: Record<string, string> = {
  AUTOMATIC: 'AI tự động',
  AI_ASSISTED: 'AI đề xuất',
  HSE_VERIFICATION: 'Cần HSE xác minh',
}

export const STATUS_LABELS: Record<string, string> = {
  DETECTED: 'Mới phát hiện',
  PENDING_VERIFICATION: 'Chờ HSE xác minh',
  CONFIRMED: 'Đã xác nhận',
  ASSIGNED: 'Đã giao xử lý',
  IN_PROGRESS: 'Đang khắc phục',
  PENDING_RECHECK: 'Chờ kiểm tra lại',
  CLOSED: 'Đã đóng',
  OVERDUE: 'Quá hạn',
}

export const SEVERITY_LABELS: Record<string, string> = {
  WARNING: 'Cảnh báo',
  VIOLATION: 'Vi phạm',
  CRITICAL: 'Khẩn cấp',
}
