import { useCallback, useMemo, useState } from 'react'
import { Minus, Plus, RotateCw } from 'lucide-react'
import { cn } from '@/utils/cn'
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

const MIN_ZOOM = 0.85
const MAX_ZOOM = 1.6
const ZOOM_STEP = 0.12

function polylinePoints(pts: { x: number; y: number }[]): string {
  return pts.map(p => `${p.x},${p.y}`).join(' ')
}

export function AccessMovementMap({
  waypoints = SITE_WAYPOINTS,
  pathWaypointIds,
  activeWaypointId,
  onSelectWaypoint,
  showHeat = true,
}: AccessMovementMapProps) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const activePathPoints = useMemo(
    () => buildTrackRoutePoints(pathWaypointIds),
    [pathWaypointIds],
  )

  const pathWaypointSet = useMemo(
    () => new Set(pathWaypointIds),
    [pathWaypointIds],
  )

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP))
  }, [])

  const handleRotate = useCallback(() => {
    setRotation(r => (r + 15) % 360)
  }, [])

  return (
    <div className="relative w-full h-full min-h-[160px] overflow-hidden bg-[#060b14]">
      {/* Map layer — zoom + rotate */}
      <div
        className="absolute inset-0 origin-center transition-transform duration-200 ease-out"
        style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
      >
        {/* Aerial background */}
        <img
          src="/maps/site-aerial.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a]/70 via-[#0a1219]/50 to-[#060d14]/80" />

        {/* Grid overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          <defs>
            <pattern id="access-site-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
            </pattern>
            {showHeat && SITE_WAYPOINTS.map(wp => {
              const intensity = SITE_TRAFFIC_HEAT[wp.id] ?? 0.3
              return (
                <radialGradient
                  key={`heat-${wp.id}`}
                  id={`heat-${wp.id}`}
                  cx="50%"
                  cy="50%"
                  r="50%"
                >
                  <stop offset="0%" stopColor={wp.color} stopOpacity={0.35 * intensity} />
                  <stop offset="55%" stopColor={wp.color} stopOpacity={0.12 * intensity} />
                  <stop offset="100%" stopColor={wp.color} stopOpacity="0" />
                </radialGradient>
              )
            })}
          </defs>
          <rect width="100%" height="100%" fill="url(#access-site-grid)" />

          {/* Heat blobs */}
          {showHeat && SITE_WAYPOINTS.map(wp => (
            <ellipse
              key={`blob-${wp.id}`}
              cx={`${wp.x}%`}
              cy={`${wp.y}%`}
              rx="9%"
              ry="8%"
              fill={`url(#heat-${wp.id})`}
            />
          ))}
        </svg>

        {/* Routes + pins SVG (viewBox 0–100 for percent coords) */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Base site roads (dim) */}
          {SITE_ROUTE_SEGMENTS.map(seg => {
            const dimmed = pathWaypointIds.length > 0 && !pathWaypointSet.has(seg.fromId)
            return (
              <polyline
                key={`road-${seg.fromId}`}
                points={polylinePoints(seg.points)}
                fill="none"
                stroke={seg.color}
                strokeWidth={dimmed ? 0.5 : 0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={dimmed ? 0.2 : 0.45}
              />
            )
          })}

          {/* Active track highlight */}
          {activePathPoints.length > 1 && (
            <polyline
              points={polylinePoints(activePathPoints)}
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
              strokeDasharray="0"
            />
          )}

          {/* Junction dot */}
          <circle
            cx={SITE_JUNCTION.x}
            cy={SITE_JUNCTION.y}
            r="1.2"
            fill="#64748b"
            opacity="0.6"
          />

          {/* Waypoint pins */}
          {waypoints.map(wp => {
            const siteWp = getSiteWaypoint(wp.id) ?? wp
            const color = 'color' in siteWp ? (siteWp as { color: string }).color : '#3b82f6'
            const onPath = pathWaypointSet.has(wp.id)
            const isActive = activeWaypointId === wp.id
            const x = wp.x
            const y = wp.y

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
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? 5 : 4}
                    fill={color}
                    opacity="0.25"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isActive ? 3.2 : onPath ? 2.8 : 2.4}
                  fill={onPath ? color : '#1e2433'}
                  stroke={onPath ? '#ffffff' : color}
                  strokeWidth={isActive ? 0.8 : 0.5}
                  opacity={onPath ? 1 : 0.75}
                />
                <text
                  x={x}
                  y={y + 1}
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
        </svg>

        {/* Label pills — HTML for crisp text */}
        {waypoints.map(wp => {
          const siteWp = getSiteWaypoint(wp.id)
          const color = siteWp?.color ?? '#3b82f6'
          const onPath = pathWaypointSet.has(wp.id)
          const isActive = activeWaypointId === wp.id
          const labelOffsetX = wp.x > 50 ? -8 : 8

          return (
            <div
              key={`label-${wp.id}`}
              className={cn(
                'absolute pointer-events-none transition-opacity duration-150',
                onPath || isActive ? 'opacity-100' : 'opacity-60',
              )}
              style={{
                left: `${wp.x}%`,
                top: `${wp.y}%`,
                transform: `translate(${labelOffsetX}px, -18px)`,
              }}
            >
              <span
                className={cn(
                  'inline-block text-[8px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap',
                  'bg-black/70 border backdrop-blur-sm',
                  isActive && 'ring-1 ring-white/30',
                )}
                style={{
                  color: onPath ? color : '#94a3b8',
                  borderColor: `${color}40`,
                }}
              >
                {wp.id}. {wp.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Map controls */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-0.5 z-10">
        {([
          { icon: Plus, action: handleZoomIn, label: 'Phóng to' },
          { icon: Minus, action: handleZoomOut, label: 'Thu nhỏ' },
          { icon: RotateCw, action: handleRotate, label: 'Xoay bản đồ' },
        ] as const).map(({ icon: Icon, action, label }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            onClick={action}
            className="w-7 h-7 flex items-center justify-center bg-[#1a2235]/90 border border-[#1e2433] rounded text-white/80 hover:text-white hover:bg-[#243044] transition-colors"
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>
    </div>
  )
}
