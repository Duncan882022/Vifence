import type { SafetySiteCode, SafetyZone } from '../types/safety.types'

export const SAFETY_PROJECT_ID = 'OCP1-PILOT'

/** 6 khu vực thí điểm — mapShapeId khớp với safetySiteMapPaths */
export const SAFETY_ZONES: SafetyZone[] = [
  {
    id: 'ZONE-A01',
    name: 'Block phía Bắc',
    siteCode: 'TTDV-A',
    type: 'BUILDING',
    projectId: SAFETY_PROJECT_ID,
    mapShapeId: 'zone-a01',
    labelX: 174,
    labelY: 118,
    monitoringProfileIds: ['PROFILE-BUILDING-WAH'],
    deviceIds: ['CAM-01', 'CAM-02', 'PTZ-01', 'BODY-01', 'BODY-02'],
    riskLevel: 'WARNING',
  },
  {
    id: 'ZONE-A02',
    name: 'Block trung tâm phía Bắc',
    siteCode: 'TTDV-A',
    type: 'BUILDING',
    projectId: SAFETY_PROJECT_ID,
    mapShapeId: 'zone-a02',
    labelX: 416,
    labelY: 112,
    monitoringProfileIds: ['PROFILE-BUILDING-WAH'],
    deviceIds: ['CAM-03', 'CAM-04', 'PTZ-02', 'BODY-03'],
    riskLevel: 'HIGH',
  },
  {
    id: 'ZONE-B01',
    name: 'Đường nội bộ giữa hai block',
    siteCode: 'TTDV-A',
    type: 'ROAD',
    projectId: SAFETY_PROJECT_ID,
    mapShapeId: 'zone-b01',
    labelX: 284,
    labelY: 218,
    monitoringProfileIds: ['PROFILE-INTERNAL-ROAD'],
    deviceIds: ['CAM-05', 'CAM-06'],
    riskLevel: 'HIGH',
  },
  {
    id: 'ZONE-B02',
    name: 'Nút giao phía Tây',
    siteCode: 'TTDV-A',
    type: 'INTERSECTION',
    projectId: SAFETY_PROJECT_ID,
    mapShapeId: 'zone-b02',
    labelX: 168,
    labelY: 298,
    monitoringProfileIds: ['PROFILE-INTERNAL-ROAD'],
    deviceIds: ['CAM-07', 'CAM-08', 'CAM-09'],
    riskLevel: 'CRITICAL',
  },
  {
    id: 'ZONE-B03',
    name: 'Nút giao phía Đông',
    siteCode: 'TMDV-C',
    type: 'INTERSECTION',
    projectId: SAFETY_PROJECT_ID,
    mapShapeId: 'zone-b03',
    labelX: 518,
    labelY: 262,
    monitoringProfileIds: ['PROFILE-INTERNAL-ROAD'],
    deviceIds: ['DRONE-01', 'CAM-10'],
    riskLevel: 'WARNING',
  },
  {
    id: 'ZONE-C01',
    name: 'Block phía Nam',
    siteCode: 'TMDV-B',
    type: 'BUILDING',
    projectId: SAFETY_PROJECT_ID,
    mapShapeId: 'zone-c01',
    labelX: 348,
    labelY: 358,
    monitoringProfileIds: ['PROFILE-BUILDING-WAH', 'PROFILE-EXCAVATION'],
    deviceIds: ['BODY-04', 'BODY-05', 'BODY-06'],
    riskLevel: 'NORMAL',
  },
]

export const SAFETY_ZONE_MAP = new Map(SAFETY_ZONES.map(z => [z.id, z]))

export function getZoneName(zoneId: string): string {
  return SAFETY_ZONE_MAP.get(zoneId)?.name ?? zoneId
}

export function getZoneSiteCode(zoneId: string): SafetySiteCode | string {
  return SAFETY_ZONE_MAP.get(zoneId)?.siteCode ?? zoneId
}
