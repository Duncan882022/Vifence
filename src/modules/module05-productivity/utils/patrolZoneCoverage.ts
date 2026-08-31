/**
 * KPI «Khu vực tuần tra» — phủ sóng theo thiết bị online trong khu,
 * không theo observed_count workforce (mật độ nhân lực).
 */
import {
  PATROL_GPS_ZONES,
  PATROL_HELMET_ZONE_ASSIGNMENTS,
  PATROL_MAP_ACTIVE_DRONE_PINS,
  type PatrolGpsZone,
} from '../data/patrolSiteMap'
import type { WorkforceSnapshot } from '../types/workforceHeatmap'

export interface PatrolZoneCoverageInput {
  /** cameraId → stream online (HC-*, DR-*). */
  cameraOnlineById: Record<string, boolean>
  workforce?: WorkforceSnapshot | null
}

export interface PatrolZoneCoverageResult {
  visitedZones: number
  totalZones: number
  coveragePercent: number
  /** zone_id → đã có thiết bị tuần tra active trong khu. */
  visitedByZoneId: Record<string, boolean>
}

function devicesForZone(zoneId: string): string[] {
  const fromHelmets = PATROL_HELMET_ZONE_ASSIGNMENTS
    .filter(row => row.zoneId === zoneId)
    .map(row => row.helmetId)
  const fromDrones = PATROL_MAP_ACTIVE_DRONE_PINS
    .filter(pin => pin.zoneId === zoneId)
    .map(pin => pin.id)
  return [...new Set([...fromHelmets, ...fromDrones])]
}

type LngLat = [number, number]

function cross2d(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

/** Cùng half-plane test với patrolSiteGeometry — nhất quán viền zone. */
function isPointInZonePolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false
  const p: LngLat = [lng, lat]
  const ring: LngLat[] = polygon.map(([la, ln]) => [ln, la])
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (cross2d(a[0], a[1], b[0], b[1], p[0], p[1]) > 1e-11) return false
  }
  return true
}

function devicePosition(
  deviceId: string,
  workforce: WorkforceSnapshot | null | undefined,
): { lat: number; lng: number } | null {
  const helmet = workforce?.helmets?.[deviceId]
  if (helmet?.lat != null && helmet?.lon != null) {
    const lat = Number(helmet.lat)
    const lng = Number(helmet.lon)
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      return { lat, lng }
    }
  }
  return null
}

function isDevicePatrollingZone(
  deviceId: string,
  zone: PatrolGpsZone,
  cameraOnlineById: Record<string, boolean>,
  workforce: WorkforceSnapshot | null | undefined,
): boolean {
  if (!cameraOnlineById[deviceId]) return false
  if (!devicesForZone(zone.zone_id).includes(deviceId)) return false

  const pos = devicePosition(deviceId, workforce)
  if (pos) {
    return isPointInZonePolygon(pos.lat, pos.lng, zone.polygon)
  }

  // Gán tĩnh + online, chưa có GPS — coi là đang tuần tra khu được gán.
  return true
}

export function computePatrolZoneCoverage(
  input: PatrolZoneCoverageInput,
): PatrolZoneCoverageResult {
  const zones = PATROL_GPS_ZONES
  const visitedByZoneId: Record<string, boolean> = {}

  for (const zone of zones) {
    const devices = devicesForZone(zone.zone_id)
    visitedByZoneId[zone.zone_id] = devices.some(deviceId =>
      isDevicePatrollingZone(deviceId, zone, input.cameraOnlineById, input.workforce),
    )
  }

  const visitedZones = Object.values(visitedByZoneId).filter(Boolean).length
  const totalZones = zones.length
  const coveragePercent = totalZones > 0
    ? Math.round((visitedZones / totalZones) * 100)
    : 0

  return { visitedZones, totalZones, coveragePercent, visitedByZoneId }
}
