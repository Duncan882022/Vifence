/** Module 05 – Helmet Camera Patrol Intelligence — mock data */

export type CameraStatus = 'ONLINE' | 'OFFLINE'
export type ZoneCoverage = 'VISITED' | 'NOT_VISITED'
export type EventType =
  | 'PPE_VIOLATION'
  | 'MACHINE_STOPPED'
  | 'PERSON_DETECTED'
  | 'POPULATION_OBSERVED'
  | 'POPULATION_CHANGE'
  | 'HIGH_DENSITY'
  | 'IDENTITY_VERIFIED'
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

/* ── Cameras ── GPS tại Cầu Sông Hốt ───────────────────────── */
export const MOCK_HELMET_CAMERAS: HelmetCamera[] = [
  {
    id: 'HC-01',
    name: 'Helmet 01',
    status: 'ONLINE',
    currentZone: 'ZONE_SITE',
    gps: { lat: 20.933094, lng: 106.923950 },
    activeSeconds: 2884,
    patrolSessionId: 'PATROL_20260820_0800',
  },
  {
    id: 'HC-02',
    name: 'Helmet 02',
    status: 'ONLINE',
    currentZone: 'ZONE_SITE',
    gps: { lat: 20.933120, lng: 106.924010 },
    activeSeconds: 2585,
    patrolSessionId: 'PATROL_20260820_0815',
  },
]

/* ── Zones — chưa chia khu, một zone = công trường ─────────── */
export const MOCK_PATROL_ZONES: PatrolZone[] = [
  {
    id: 'ZONE_SITE',
    name: 'Cầu Sông Hốt',
    shortName: 'Cầu Sông Hốt',
    coverage: 'VISITED',
    dwellSeconds: 624,
    peopleCurrent: 42,
    vehiclesCurrent: 8,
    uniquePeople: 58,
    uniqueVehicles: 11,
    areaSqm: 5200,
  },
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
    gps: { lat: 20.943600, lng: 106.911444 },
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
    gps: { lat: 20.943500, lng: 106.910044 },
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
    gps: { lat: 20.944000, lng: 106.910944 },
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
    gps: { lat: 20.943550, lng: 106.910094 },
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
    gps: { lat: 20.944550, lng: 106.911444 },
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
    gps: { lat: 20.943700, lng: 106.910054 },
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
