/**
 * Patrol heatmap service — HQCV §13–16.
 *
 * Layers  : people | vehicle | combined  (§12 layer switch)
 * Modes   : count  | density            (§15 số lượng / mật độ)
 * Counts  : current | unique            (§16 current / unique)
 */
import type { PatrolZone } from '../data/patrolMockData'
import { PATROL_HEATMAP_ZONE_SHAPES, PATROL_PRIMARY_ZONE_IDS } from '../data/patrolSiteMap'

/* ── Types ──────────────────────────────────────────────────── */

export type PatrolDensityLayer = 'people' | 'vehicle' | 'combined'
export type PatrolDisplayMode  = 'count' | 'density'
export type PatrolCountMode    = 'current' | 'unique'

/** Shape used for the legacy SVG heatmap (PatrolSiteHeatmapMap). */
export type { PatrolZone as LivePatrolZone }

export type PatrolMapLayerVisibility = {
  cameras: boolean
  route: boolean
  zones: boolean
  events: boolean
}

export interface PatrolHeatPoint {
  id: string
  x: number
  y: number
  radius: number
  color: string
  opacity: number
}

/* ── Count resolution (§16) ─────────────────────────────────── */

export function resolveCount(
  zone: PatrolZone,
  layer: PatrolDensityLayer,
  countMode: PatrolCountMode,
): number {
  if (layer === 'people') {
    return countMode === 'current' ? zone.peopleCurrent : zone.uniquePeople
  }
  if (layer === 'vehicle') {
    return countMode === 'current' ? zone.vehiclesCurrent : zone.uniqueVehicles
  }
  /* combined */
  const p = countMode === 'current' ? zone.peopleCurrent : zone.uniquePeople
  const v = countMode === 'current' ? zone.vehiclesCurrent : zone.uniqueVehicles
  return p + v
}

/* ── Density resolution (§15) ───────────────────────────────── */

export function resolveDisplayValue(
  zone: PatrolZone,
  layer: PatrolDensityLayer,
  countMode: PatrolCountMode,
  displayMode: PatrolDisplayMode,
): number {
  const count = resolveCount(zone, layer, countMode)
  if (displayMode === 'density' && zone.areaSqm > 0) {
    return parseFloat((count / zone.areaSqm * 100).toFixed(2))
  }
  return count
}

export function formatDisplayValue(
  zone: PatrolZone,
  layer: PatrolDensityLayer,
  countMode: PatrolCountMode,
  displayMode: PatrolDisplayMode,
): string {
  if (zone.coverage !== 'VISITED') return '—'
  const v = resolveDisplayValue(zone, layer, countMode, displayMode)
  if (displayMode === 'density') return `${v}/100m²`
  return String(v)
}

/* ── Heat colour gradient ───────────────────────────────────── */

export function getPatrolHeatBlobColor(count: number, visited: boolean): string {
  if (!visited || count === 0) return '#64748b'
  if (count >= 70) return '#ef4444'
  if (count >= 50) return '#f97316'
  if (count >= 30) return '#eab308'
  if (count >= 15) return '#84cc16'
  if (count >= 6)  return '#22c55e'
  return '#38bdf8'
}

export function getPatrolDensityHeatColor(count: number, visited: boolean): string {
  return getPatrolHeatBlobColor(count, visited)
}

export function getPatrolDensityIntensity(count: number, max: number, visited: boolean): number {
  if (!visited) return 0.06
  if (max <= 0 || count === 0) return 0.08
  return Math.min(1, 0.22 + (count / max) * 0.78)
}

/** Thang màu mật độ reference — Thấp (lam) → Cao (đỏ). */
const PATROL_HEATMAP_RAMP: readonly { t: number; rgb: [number, number, number] }[] = [
  { t: 0.0, rgb: [37, 99, 235] },   // blue
  { t: 0.18, rgb: [6, 182, 212] },  // cyan
  { t: 0.38, rgb: [34, 197, 94] },  // green
  { t: 0.58, rgb: [234, 179, 8] },  // yellow
  { t: 0.78, rgb: [249, 115, 22] }, // orange
  { t: 1.0, rgb: [239, 68, 68] },   // red
]

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

/** Map intensity 0..1 → RGB theo thang chú giải HQCV. */
export function getPatrolHeatmapRampRgb(t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t))
  for (let i = 1; i < PATROL_HEATMAP_RAMP.length; i += 1) {
    const prev = PATROL_HEATMAP_RAMP[i - 1]
    const next = PATROL_HEATMAP_RAMP[i]
    if (v <= next.t) {
      const local = (v - prev.t) / (next.t - prev.t)
      return [
        lerpChannel(prev.rgb[0], next.rgb[0], local),
        lerpChannel(prev.rgb[1], next.rgb[1], local),
        lerpChannel(prev.rgb[2], next.rgb[2], local),
      ]
    }
  }
  return PATROL_HEATMAP_RAMP[PATROL_HEATMAP_RAMP.length - 1].rgb
}

/* ── Helpers used by PatrolGeoHeatmap (§12 layer colours) ───── */

/**
 * Returns fill colour for a zone polygon on the Leaflet map.
 * Accepts the pre-resolved `count` (already current/unique-filtered).
 */
export function getZoneFillColor(
  count: number,
  _maxCount: number,
  visited: boolean,
): string {
  return getPatrolHeatBlobColor(visited ? count : 0, visited)
}

export function getZoneFillOpacity(
  count: number,
  maxCount: number,
  visited: boolean,
): number {
  if (!visited) return 0.12
  if (maxCount <= 0 || count === 0) return 0.15
  return Math.min(0.72, 0.22 + (count / maxCount) * 0.50)
}

/* ── Legacy helpers (used by old PatrolSiteHeatmapMap.tsx) ───── */

export function buildLivePatrolZones(source: PatrolZone[]): PatrolZone[] {
  return source.map(z => ({ ...z }))
}

export function jitterPatrolCount(value: number, max: number): number {
  if (max <= 0) return 0
  const delta = Math.floor(Math.random() * 5) - 2
  return Math.max(0, Math.min(max, value + delta))
}

export function tickLivePatrolZones(zones: PatrolZone[]): PatrolZone[] {
  return zones.map(zone => {
    if (zone.coverage !== 'VISITED') return zone
    return {
      ...zone,
      peopleCurrent: jitterPatrolCount(zone.peopleCurrent, zone.uniquePeople + 8),
      vehiclesCurrent: jitterPatrolCount(zone.vehiclesCurrent, zone.uniqueVehicles + 3),
    }
  })
}

function legacyResolveLayerCount(zone: PatrolZone, layer: 'people' | 'vehicle'): number {
  return layer === 'vehicle' ? zone.vehiclesCurrent : zone.peopleCurrent
}

export function buildPatrolDigitalTwinZones(
  zones: PatrolZone[],
  layer: 'people' | 'vehicle',
) {
  const zoneMap = new Map(zones.map(z => [z.id, z]))
  const maxCount = Math.max(...zones.map(z => legacyResolveLayerCount(z, layer)), 1)

  return PATROL_HEATMAP_ZONE_SHAPES.map(shape => {
    const zone = zoneMap.get(shape.id)
    const visited = zone?.coverage === 'VISITED'
    const count = zone ? legacyResolveLayerCount(zone, layer) : 0

    return {
      id: shape.id,
      label: shape.label,
      sublabel: zone?.name ?? shape.sublabel,
      polygon: shape.polygon,
      cx: shape.cx,
      cy: shape.cy,
      intensity: getPatrolDensityIntensity(count, maxCount, visited),
      color: getPatrolHeatBlobColor(count, visited),
      value: zone && visited ? String(count) : '—',
    }
  })
}

export function buildPatrolHeatPoints(
  zones: PatrolZone[],
  layer: 'people' | 'vehicle',
): PatrolHeatPoint[] {
  const zoneMap = new Map(zones.map(z => [z.id, z]))
  const maxCount = Math.max(...zones.map(z => legacyResolveLayerCount(z, layer)), 1)

  return PATROL_HEATMAP_ZONE_SHAPES
    .filter(shape => PATROL_PRIMARY_ZONE_IDS.includes(shape.id))
    .flatMap(shape => {
      const zone = zoneMap.get(shape.id)
      const visited = zone?.coverage === 'VISITED'
      const count = zone ? legacyResolveLayerCount(zone, layer) : 0
      if (!visited || count === 0) return []

      const intensity = getPatrolDensityIntensity(count, maxCount, visited)
      const color = getPatrolHeatBlobColor(count, visited)
      const baseRadius = 8 + (count / maxCount) * 14

      return [
        { id: `${shape.id}-core`, x: shape.cx, y: shape.cy, radius: baseRadius, color, opacity: 0.42 * intensity + 0.18 },
        { id: `${shape.id}-halo`, x: shape.cx, y: shape.cy, radius: baseRadius * 1.55, color, opacity: 0.22 * intensity + 0.08 },
      ]
    })
}

export function buildPatrolTrailPoints(zoneIds: readonly string[]): { x: number; y: number }[] {
  return zoneIds
    .map(id => PATROL_HEATMAP_ZONE_SHAPES.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map(s => ({ x: s.cx, y: s.cy }))
}

export function formatPatrolSessionRange(sessionDate: string): string {
  const [y, m, d] = sessionDate.split('-')
  return `${d}/${m}/${y} 08:00`
}
