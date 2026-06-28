/** Shared construction-site waypoints — reused across Module 01 (access) and Module 02 (training zones). */

export interface SiteZonePolygon {
  id: string
  label: string
  sublabel?: string
  /** Polygon vertices in percent coords (0–100) */
  polygon: { x: number; y: number }[]
  /** Heat blob center */
  cx: number
  cy: number
}

/** Zone overlays aligned to aerial map — shared by safety/housekeeping heatmaps */
export const SITE_ZONES: SiteZonePolygon[] = [
  {
    id: 'gate',
    label: 'Cổng chính',
    sublabel: 'Khu A',
    polygon: [
      { x: 66, y: 10 },
      { x: 88, y: 10 },
      { x: 88, y: 32 },
      { x: 66, y: 32 },
    ],
    cx: 77,
    cy: 21,
  },
  {
    id: 'khu-a',
    label: 'Khu A',
    sublabel: 'Thi công',
    polygon: [
      { x: 30, y: 8 },
      { x: 65, y: 8 },
      { x: 65, y: 30 },
      { x: 30, y: 30 },
    ],
    cx: 47,
    cy: 19,
  },
  {
    id: 'khu-b',
    label: 'Khu B',
    sublabel: 'Cơ điện',
    polygon: [
      { x: 8, y: 28 },
      { x: 42, y: 28 },
      { x: 42, y: 72 },
      { x: 8, y: 72 },
    ],
    cx: 25,
    cy: 50,
  },
  {
    id: 'khu-c',
    label: 'Khu C',
    sublabel: 'Sân thi công',
    polygon: [
      { x: 55, y: 30 },
      { x: 78, y: 30 },
      { x: 78, y: 50 },
      { x: 55, y: 50 },
    ],
    cx: 66,
    cy: 40,
  },
  {
    id: 'khu-d',
    label: 'Khu D',
    sublabel: 'Nguy hiểm',
    polygon: [
      { x: 55, y: 50 },
      { x: 78, y: 50 },
      { x: 78, y: 72 },
      { x: 55, y: 72 },
    ],
    cx: 66,
    cy: 61,
  },
  {
    id: 'yard',
    label: 'Bãi vật liệu',
    sublabel: 'Khu C',
    polygon: [
      { x: 8, y: 55 },
      { x: 32, y: 55 },
      { x: 32, y: 78 },
      { x: 8, y: 78 },
    ],
    cx: 20,
    cy: 66,
  },
  {
    id: 'crane',
    label: 'Khu cần cẩu',
    sublabel: 'Khu D',
    polygon: [
      { x: 34, y: 55 },
      { x: 53, y: 55 },
      { x: 53, y: 78 },
      { x: 34, y: 78 },
    ],
    cx: 43,
    cy: 66,
  },
]

export function getSiteZone(id: string): SiteZonePolygon | undefined {
  return SITE_ZONES.find(z => z.id === id)
}

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
