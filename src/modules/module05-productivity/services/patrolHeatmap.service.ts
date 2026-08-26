/**
 * Patrol heatmap service — HQCV §13–16.
 *
 * Layers  : people | vehicle | combined  (§12 layer switch)
 * Modes   : count  | density            (§15 số lượng / mật độ)
 * Counts  : current | unique            (§16 current / unique)
 */
import type { PatrolZone } from '../data/patrolMockData'

/* ── Types ──────────────────────────────────────────────────── */

export type PatrolDensityLayer = 'people' | 'vehicle' | 'combined'
export type PatrolDisplayMode  = 'count' | 'density'
export type PatrolCountMode    = 'current' | 'unique'

export type PatrolMapLayerVisibility = {
  cameras: boolean
  route: boolean
  zones: boolean
  events: boolean
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

export function formatPatrolSessionRange(sessionDate: string): string {
  const [y, m, d] = sessionDate.split('-')
  return `${d}/${m}/${y} 08:00`
}
