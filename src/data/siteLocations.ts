/** Shared construction-site waypoints — reused across Module 01 (access) and Module 02 (training zones). */

export interface SiteWaypoint {
  id: number
  label: string
  /** Percent position on site map (0–100) */
  x: number
  y: number
  color: string
}

export interface SiteRouteSegment {
  fromId: number
  toId: number
  /** Road-following polyline including start/end (percent coords) */
  points: { x: number; y: number }[]
  color: string
}

/** Central junction where site paths meet */
export const SITE_JUNCTION = { x: 48, y: 55 }

export const SITE_WAYPOINTS: SiteWaypoint[] = [
  { id: 1, label: 'Cổng chính', x: 78, y: 18, color: '#22c55e' },
  { id: 2, label: 'Khu cọc nhồi', x: 18, y: 22, color: '#38bdf8' },
  { id: 3, label: 'Kho vật tư', x: 28, y: 48, color: '#f97316' },
  { id: 4, label: 'Nhà điều hành', x: 62, y: 52, color: '#a855f7' },
  { id: 5, label: 'Cổng phụ 2', x: 52, y: 82, color: '#2563eb' },
]

/** Static site road network — matches reference layout */
export const SITE_ROUTE_SEGMENTS: SiteRouteSegment[] = [
  {
    fromId: 1,
    toId: 0,
    color: '#22c55e',
    points: [
      { x: 78, y: 18 },
      { x: 78, y: 34 },
      { x: 60, y: 34 },
      { x: 48, y: 55 },
    ],
  },
  {
    fromId: 2,
    toId: 0,
    color: '#38bdf8',
    points: [
      { x: 18, y: 22 },
      { x: 18, y: 38 },
      { x: 36, y: 38 },
      { x: 48, y: 55 },
    ],
  },
  {
    fromId: 3,
    toId: 0,
    color: '#f97316',
    points: [
      { x: 28, y: 48 },
      { x: 28, y: 55 },
      { x: 48, y: 55 },
    ],
  },
  {
    fromId: 4,
    toId: 0,
    color: '#a855f7',
    points: [
      { x: 62, y: 52 },
      { x: 55, y: 52 },
      { x: 48, y: 55 },
    ],
  },
  {
    fromId: 5,
    toId: 0,
    color: '#2563eb',
    points: [
      { x: 52, y: 82 },
      { x: 52, y: 68 },
      { x: 48, y: 55 },
    ],
  },
]

/** Relative traffic density per zone (0–1) for heat overlay */
export const SITE_TRAFFIC_HEAT: Record<number, number> = {
  1: 0.85,
  2: 0.55,
  3: 0.72,
  4: 0.48,
  5: 0.65,
}

export function getSiteWaypoint(id: number): SiteWaypoint | undefined {
  return SITE_WAYPOINTS.find(w => w.id === id)
}

export function buildTrackRoutePoints(pathWaypointIds: number[]): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = []
  for (const wpId of pathWaypointIds) {
    const segment = SITE_ROUTE_SEGMENTS.find(s => s.fromId === wpId)
    const wp = getSiteWaypoint(wpId)
    if (!segment || !wp) continue
    if (result.length === 0) {
      result.push(...segment.points)
    } else {
      result.push(...segment.points.slice(1))
    }
  }
  return result
}
