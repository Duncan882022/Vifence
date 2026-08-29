/**
 * Module 05 — kiểu dữ liệu tuần tra.
 *
 * Mọi dữ liệu hiển thị đều là live: sự kiện từ backend, chấm bản đồ từ
 * registry, băng xem lại từ MediaMTX. Seed zone bản đồ: `PATROL_SITE_ZONE_SEED`
 * trong patrolSiteMap.ts.
 */

export type CameraStatus = 'ONLINE' | 'OFFLINE'
export type ZoneCoverage = 'VISITED' | 'NOT_VISITED'
export type EventType =
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
  /** face_quality×2 + confidence từ daily_events — lọc tab Người/Đối tượng. */
  snapshotScore?: number
  /** Mã ẩn danh sgc-* khi objectId đã promote sang OBJ-* */
  trackWorkerId?: string
  /**
   * Tầng do server quyết: `object` | `person` | `profile`.
   *
   * Có trường này thì frontend không phải suy lại tầng từ hình dạng mã và
   * localStorage nữa — chính chỗ suy lại đó đã đẩy nhầm thẻ sang tab Định danh
   * khi một alias cũ còn kẹt trong trình duyệt.
   */
  stage?: 'object' | 'person' | 'profile'
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
