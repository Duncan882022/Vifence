import { useMemo } from 'react'
import { SiteDigitalTwinMap } from '@/components/common/SiteDigitalTwinMap'
import {
  SITE_JUNCTION,
  SITE_ROUTE_SEGMENTS,
  SITE_TRAFFIC_HEAT,
  SITE_WAYPOINTS,
  buildTrackRoutePoints,
  getSiteWaypoint,
} from '@/data/siteLocations'
import type { AccessWaypoint } from '@/types/access'

interface AccessMovementMapProps {
  waypoints?: AccessWaypoint[]
  pathWaypointIds: number[]
  activeWaypointId?: number | null
  onSelectWaypoint?: (id: number) => void
  showHeat?: boolean
}

export function AccessMovementMap({
  waypoints = SITE_WAYPOINTS,
  pathWaypointIds,
  activeWaypointId,
  onSelectWaypoint,
  showHeat = true,
}: AccessMovementMapProps) {
  const activePathPoints = useMemo(
    () => buildTrackRoutePoints(pathWaypointIds),
    [pathWaypointIds],
  )

  const pathWaypointSet = useMemo(
    () => new Set(pathWaypointIds),
    [pathWaypointIds],
  )

  const trafficZones = useMemo(
    () => waypoints.map(wp => ({
      id: String(wp.id),
      label: `${wp.id}. ${wp.label}`,
      intensity: SITE_TRAFFIC_HEAT[wp.id] ?? 0.3,
      color: getSiteWaypoint(wp.id)?.color ?? '#3b82f6',
      heatShape: 'point' as const,
      cx: wp.x,
      cy: wp.y,
    })),
    [waypoints],
  )

  const svgOverlay = (
    <>
      {SITE_ROUTE_SEGMENTS.map(seg => {
        const dimmed = pathWaypointIds.length > 0 && !pathWaypointSet.has(seg.fromId)
        return (
          <polyline
            key={`road-${seg.fromId}`}
            points={seg.points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={seg.color}
            strokeWidth={dimmed ? 0.5 : 0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={dimmed ? 0.2 : 0.45}
          />
        )
      })}

      {activePathPoints.length > 1 && (
        <polyline
          points={activePathPoints.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      )}

      <circle cx={SITE_JUNCTION.x} cy={SITE_JUNCTION.y} r="1.2" fill="#64748b" opacity="0.6" />

      {waypoints.map(wp => {
        const siteWp = getSiteWaypoint(wp.id) ?? wp
        const color = 'color' in siteWp ? (siteWp as { color: string }).color : '#3b82f6'
        const onPath = pathWaypointSet.has(wp.id)
        const isActive = activeWaypointId === wp.id

        return (
          <g
            key={wp.id}
            className="cursor-pointer"
            onClick={() => onSelectWaypoint?.(wp.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') onSelectWaypoint?.(wp.id)
            }}
          >
            {onPath && (
              <circle cx={wp.x} cy={wp.y} r={isActive ? 5 : 4} fill={color} opacity="0.25" />
            )}
            <circle
              cx={wp.x}
              cy={wp.y}
              r={isActive ? 3.2 : onPath ? 2.8 : 2.4}
              fill={onPath ? color : '#1e2433'}
              stroke={onPath ? '#ffffff' : color}
              strokeWidth={isActive ? 0.8 : 0.5}
              opacity={onPath ? 1 : 0.75}
            />
            <text
              x={wp.x}
              y={wp.y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="2.8"
              fill="#ffffff"
              fontWeight="bold"
              pointerEvents="none"
            >
              {wp.id}
            </text>
          </g>
        )
      })}
    </>
  )

  return (
    <SiteDigitalTwinMap
      zones={trafficZones}
      mode="traffic"
      showZonePolygons={false}
      showHeat={showHeat}
      showLegend={false}
      svgOverlay={svgOverlay}
      className="min-h-[160px]"
    />
  )
}
