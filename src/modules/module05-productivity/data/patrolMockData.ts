/** Module 05 – Helmet Camera Patrol Intelligence — mock data */

export type CameraStatus = 'ONLINE' | 'OFFLINE'
export type ZoneCoverage = 'VISITED' | 'NOT_VISITED'
export type EventType = 'PPE_VIOLATION' | 'MACHINE_STOPPED' | 'PERSON_DETECTED'
export type EventStatus = 'DETECTED' | 'PENDING' | 'LOCKED' | 'ENDED'

export interface HelmetCamera {
  id: string
  name: string
  status: CameraStatus
  currentZone: string | null
  gps: { lat: number; lng: number } | null
  activeSeconds: number
  patrolSessionId: string
}

export interface PatrolZone {
  id: string
  name: string
  shortName: string
  coverage: ZoneCoverage
  dwellSeconds: number
  peopleCurrent: number
  vehiclesCurrent: number
  uniquePeople: number
  uniqueVehicles: number
  areaSqm: number
}

export interface PatrolEvent {
  id: string
  type: EventType
  cameraId: string
  cameraName: string
  zoneId: string
  zoneName: string
  objectId: string
  objectLabel: string
  violationLabel: string
  startedAt: string
  lockedAt: string
  endedAt: string | null
  durationSeconds: number | null
  status: EventStatus
  confidence: number
  gps: { lat: number; lng: number }
  /** Snapshot từ backend VMS — `/events/{id}/snapshot` */
  snapshotUrl?: string
}

export interface PatrolDashboard {
  uniquePeople: number
  uniqueVehicles: number
  visitedZones: number
  totalZones: number
  coveragePercent: number
  activePatrolSeconds: number
  sessionLabel: string
}

/* ── Dashboard ─────────────────────────────────────────────── */
export const MOCK_PATROL_DASHBOARD: PatrolDashboard = {
  uniquePeople: 183,
  uniqueVehicles: 37,
  visitedZones: 8,
  totalZones: 8,
  coveragePercent: 100,
  activePatrolSeconds: 2820,
  sessionLabel: 'PATROL_20260820_0800',
}

/* ── Cameras ── GPS updated to match GPS zone grid ─────────── */
export const MOCK_HELMET_CAMERAS: HelmetCamera[] = [
  {
    id: 'HC-01',
    name: 'Helmet 01',
    status: 'ONLINE',
    currentZone: 'ZONE_A',
    gps: { lat: 21.003767, lng: 105.945910 },
    activeSeconds: 2884,
    patrolSessionId: 'PATROL_20260820_0800',
  },
  {
    id: 'HC-02',
    name: 'Helmet 02',
    status: 'ONLINE',
    currentZone: 'ZONE_B',
    gps: { lat: 21.003767, lng: 105.947177 },
    activeSeconds: 2585,
    patrolSessionId: 'PATROL_20260820_0815',
  },
  {
    id: 'HC-03',
    name: 'Helmet 03',
    status: 'ONLINE',
    currentZone: 'ZONE_C',
    gps: { lat: 21.004667, lng: 105.947177 },
    activeSeconds: 2410,
    patrolSessionId: 'PATROL_20260820_0822',
  },
  {
    id: 'HC-04',
    name: 'Helmet 04',
    status: 'ONLINE',
    currentZone: 'ZONE_D',
    gps: { lat: 21.002867, lng: 105.945910 },
    activeSeconds: 1980,
    patrolSessionId: 'PATROL_20260820_0830',
  },
  {
    id: 'HC-05',
    name: 'Helmet 05',
    status: 'ONLINE',
    currentZone: 'ZONE_E',
    gps: { lat: 21.003767, lng: 105.948443 },
    activeSeconds: 1755,
    patrolSessionId: 'PATROL_20260820_0840',
  },
]

/* ── Zones ─────────────────────────────────────────────────── */
export const MOCK_PATROL_ZONES: PatrolZone[] = [
  { id: 'ZONE_A', name: 'Khu thi công móng',       shortName: 'Móng', coverage: 'VISITED',     dwellSeconds: 624, peopleCurrent: 42, vehiclesCurrent: 8,  uniquePeople: 58, uniqueVehicles: 11, areaSqm: 1200 },
  { id: 'ZONE_B', name: 'Khu lắp dựng tầng',       shortName: 'Tầng', coverage: 'VISITED',     dwellSeconds: 380, peopleCurrent: 61, vehiclesCurrent: 14, uniquePeople: 29, uniqueVehicles: 5,  areaSqm: 850  },
  { id: 'ZONE_C', name: 'Khu hoàn thiện',           shortName: 'HT',   coverage: 'VISITED',     dwellSeconds: 512, peopleCurrent: 35, vehiclesCurrent: 6,  uniquePeople: 48, uniqueVehicles: 12, areaSqm: 1450 },
  { id: 'ZONE_D', name: 'Khu kho vật tư',           shortName: 'Kho',  coverage: 'VISITED',     dwellSeconds: 186, peopleCurrent: 18, vehiclesCurrent: 3,  uniquePeople: 9,  uniqueVehicles: 2,  areaSqm: 600  },
  { id: 'ZONE_E', name: 'Khu văn phòng công trường',shortName: 'VP',   coverage: 'VISITED',     dwellSeconds: 220, peopleCurrent: 12, vehiclesCurrent: 2,  uniquePeople: 12, uniqueVehicles: 3,  areaSqm: 400  },
  { id: 'ZONE_F', name: 'Sân cẩu',                  shortName: 'Cẩu',  coverage: 'VISITED',     dwellSeconds: 340, peopleCurrent: 8,  vehiclesCurrent: 6,  uniquePeople: 11, uniqueVehicles: 7,  areaSqm: 700  },
  { id: 'ZONE_G', name: 'Cổng ra vào',              shortName: 'Cổng', coverage: 'VISITED',     dwellSeconds: 98,  peopleCurrent: 12, vehiclesCurrent: 4,  uniquePeople: 16, uniqueVehicles: 5,  areaSqm: 300  },
  { id: 'ZONE_H', name: 'Khu đúc cọc',              shortName: 'Cọc',  coverage: 'VISITED',     dwellSeconds: 460, peopleCurrent: 22, vehiclesCurrent: 9,  uniquePeople: 27, uniqueVehicles: 10, areaSqm: 980  },
]

/* ── Events — GPS updated to match GPS zone grid ───────────── */
export const MOCK_PATROL_EVENTS: PatrolEvent[] = [
  {
    id: 'EVT-00128',
    type: 'PPE_VIOLATION',
    cameraId: 'HC-03',
    cameraName: 'Helmet 03',
    zoneId: 'ZONE_B',
    zoneName: 'Khu lắp dựng tầng',
    objectId: 'PERSON_0023',
    objectLabel: 'PERSON_0023',
    violationLabel: 'Không đội mũ bảo hộ',
    startedAt: '2026-08-20T09:32:13+07:00',
    lockedAt: '2026-08-20T09:32:18+07:00',
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 0.91,
    gps: { lat: 21.003700, lng: 105.947300 },
  },
  {
    id: 'EVT-00127',
    type: 'PPE_VIOLATION',
    cameraId: 'HC-01',
    cameraName: 'Helmet 01',
    zoneId: 'ZONE_A',
    zoneName: 'Khu thi công móng',
    objectId: 'PERSON_0012',
    objectLabel: 'PERSON_0012',
    violationLabel: 'Không mặc áo phản quang',
    startedAt: '2026-08-20T09:20:58+07:00',
    lockedAt: '2026-08-20T09:21:04+07:00',
    endedAt: '2026-08-20T09:26:41+07:00',
    durationSeconds: 337,
    status: 'ENDED',
    confidence: 0.87,
    gps: { lat: 21.003600, lng: 105.945900 },
  },
  {
    id: 'EVT-00129',
    type: 'PERSON_DETECTED',
    cameraId: 'HC-02',
    cameraName: 'Helmet 02',
    zoneId: 'ZONE_C',
    zoneName: 'Khu hoàn thiện',
    objectId: 'sgc-00000010',
    objectLabel: 'sgc-00000010',
    violationLabel: 'Phát hiện người',
    startedAt: '2026-08-20T09:35:02+07:00',
    lockedAt: '2026-08-20T09:35:04+07:00',
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 0.88,
    gps: { lat: 21.004100, lng: 105.946800 },
  },
  {
    id: 'EVT-00130',
    type: 'PERSON_DETECTED',
    cameraId: 'HC-01',
    cameraName: 'Helmet 01',
    zoneId: 'ZONE_A',
    zoneName: 'Khu thi công móng',
    objectId: 'sgc-00000003',
    objectLabel: 'sgc-00000003',
    violationLabel: 'Phát hiện người',
    startedAt: '2026-08-20T09:18:44+07:00',
    lockedAt: '2026-08-20T09:18:46+07:00',
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 0.91,
    gps: { lat: 21.003650, lng: 105.945950 },
  },
  {
    id: 'EVT-00143',
    type: 'MACHINE_STOPPED',
    cameraId: 'HC-02',
    cameraName: 'Helmet 02',
    zoneId: 'ZONE_C',
    zoneName: 'Khu hoàn thiện',
    objectId: 'VEHICLE_0021',
    objectLabel: 'Máy xúc #021',
    violationLabel: 'Máy dừng >5 giây',
    startedAt: '2026-08-20T09:42:11+07:00',
    lockedAt: '2026-08-20T09:42:16+07:00',
    endedAt: '2026-08-20T09:42:23+07:00',
    durationSeconds: 12,
    status: 'ENDED',
    confidence: 0.95,
    gps: { lat: 21.004650, lng: 105.947300 },
  },
  {
    id: 'EVT-00144',
    type: 'MACHINE_STOPPED',
    cameraId: 'HC-01',
    cameraName: 'Helmet 01',
    zoneId: 'ZONE_A',
    zoneName: 'Khu thi công móng',
    objectId: 'VEHICLE_0034',
    objectLabel: 'Cẩu tháp #034',
    violationLabel: 'Máy dừng >5 giây',
    startedAt: '2026-08-20T08:58:40+07:00',
    lockedAt: '2026-08-20T08:58:45+07:00',
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 0.93,
    gps: { lat: 21.003800, lng: 105.945910 },
  },
]

export function formatActiveTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}g ${m}p`
  return `${m} phút`
}

export function formatPatrolTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}g ${m}p`
  return `${m} phút`
}
