import { useCallback, useMemo, useState } from 'react'
import {
  Car, Crosshair, HardHat, Layers, Minus, Plus,
  Users,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { PatrolEvent } from '../data/patrolMockData'
import {
  PATROL_HEATMAP_ZONE_SHAPES,
  PATROL_HELMET_MARKERS,
  buildPatrolRouteSegments,
  type PatrolHeatmapZoneShape,
} from '../data/patrolSiteMap'
import type { LivePatrolZone, PatrolHeatPoint, PatrolMapLayerVisibility } from '../services/patrolHeatmap.service'
import { formatPatrolSessionRange } from '../services/patrolHeatmap.service'

function polygonPoints(pts: { x: number; y: number }[]): string {
  return pts.map(p => `${p.x},${p.y}`).join(' ')
}

function ZoneStatCard({
  shape,
  zone,
  visible,
}: {
  shape: PatrolHeatmapZoneShape
  zone: LivePatrolZone | undefined
  visible: boolean
}) {
  if (!visible) return null

  const people = zone?.peopleCurrent ?? 0
  const vehicles = zone?.vehiclesCurrent ?? 0

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        left: `${shape.cardAnchor.x}%`,
        top: `${shape.cardAnchor.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div
        className="rounded-md border-2 bg-[#1e293b]/90 backdrop-blur-md px-2.5 py-2 min-w-[118px] shadow-xl"
        style={{ borderColor: shape.borderColor }}
      >
        <p className="text-[11px] font-bold text-white tracking-wide mb-1.5">{shape.label}</p>
        <div className="flex items-center gap-1.5 text-[10px] text-white mb-1">
          <Users className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="font-bold tabular-nums">{people}</span>
          <span className="text-white/55">người</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-white">
          <Car className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="font-bold tabular-nums">{vehicles}</span>
          <span className="text-white/55">máy</span>
        </div>
      </div>
    </div>
  )
}

function HelmetMapPin({
  label,
  color,
  x,
  y,
  visible,
}: {
  label: string
  color: string
  x: number
  y: number
  visible: boolean
}) {
  if (!visible) return null

  return (
    <div
      className="absolute z-[25] pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -100%)' }}
    >
      <div className="flex flex-col items-center">
        <div
          className="w-7 h-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
          style={{ backgroundColor: color }}
        >
          <HardHat className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="mt-0.5 px-1.5 py-0.5 rounded bg-[#1e293b]/95 border border-white/20 text-[8px] font-bold text-white whitespace-nowrap">
          {label}
        </div>
        <div
          className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent -mt-px"
          style={{ borderTopColor: color }}
        />
      </div>
    </div>
  )
}

export interface PatrolSiteHeatmapMapProps {
  zones: LivePatrolZone[]
  heatPoints: PatrolHeatPoint[]
  sessionDate: string
  layerVisibility: PatrolMapLayerVisibility
  visibleHelmetIds: string[]
  events?: PatrolEvent[]
}

const MIN_ZOOM = 0.92
const MAX_ZOOM = 1.4
const ZOOM_STEP = 0.08

const STREET_LABELS = [
  { text: 'Đ. Đại Tây Dương', x: 72, y: 12, rotate: -8 },
  { text: 'Biển Hồ 5', x: 8, y: 48, rotate: -65 },
  { text: 'Biển Hồ 2', x: 52, y: 88, rotate: 0 },
  { text: 'Biển Hồ 6', x: 88, y: 58, rotate: 55 },
]

export function PatrolSiteHeatmapMap({
  zones,
  heatPoints,
  sessionDate,
  layerVisibility,
  visibleHelmetIds,
  events = [],
}: PatrolSiteHeatmapMapProps) {
  const [mapView, setMapView] = useState<'map' | 'satellite'>('map')
  const [zoom, setZoom] = useState(1)

  const zoneMap = useMemo(() => new Map(zones.map(z => [z.id, z])), [zones])
  const primaryShapes = useMemo(
    () => PATROL_HEATMAP_ZONE_SHAPES.filter(s => s.displayTier === 'primary'),
    [],
  )
  const routeSegments = useMemo(() => buildPatrolRouteSegments(), [])
  const visibleMarkers = useMemo(
    () => PATROL_HELMET_MARKERS.filter(m => visibleHelmetIds.includes(m.id)),
    [visibleHelmetIds],
  )

  const eventPins = useMemo(() => {
    if (!layerVisibility.events) return []
    return events.map(ev => {
      const shape = PATROL_HEATMAP_ZONE_SHAPES.find(s => s.id === ev.zoneId)
      if (!shape) return null
      return {
        id: ev.id,
        x: shape.cardAnchor.x + 4,
        y: shape.cardAnchor.y - 6,
        color: ev.type === 'PPE_VIOLATION' ? '#ef4444' : '#f97316',
      }
    }).filter((p): p is NonNullable<typeof p> => !!p)
  }, [events, layerVisibility.events])

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP)), [])
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP)), [])

  return (
    <div className="relative w-full h-full min-h-[260px] overflow-hidden rounded-b-lg bg-[#0b0f1a]">
      {/* Map canvas */}
      <div
        className="absolute inset-0 origin-center transition-transform duration-200"
        style={{ transform: `scale(${zoom})` }}
      >
        <img
          src="/maps/site-aerial.jpg"
          alt=""
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            mapView === 'satellite' ? 'saturate-110 brightness-105' : 'brightness-90 contrast-110 saturate-50',
          )}
          draggable={false}
        />
        {mapView === 'map' && (
          <div className="absolute inset-0 bg-[#1e3a5f]/20" />
        )}

        {/* Heat gradient */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          <defs>
            <filter id="patrol-heat-blur-v2" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="18" />
            </filter>
          </defs>
          <g filter="url(#patrol-heat-blur-v2)" style={{ mixBlendMode: 'screen' }}>
            {heatPoints.map(point => (
              <ellipse
                key={point.id}
                cx={`${point.x}%`}
                cy={`${point.y}%`}
                rx={`${point.radius}%`}
                ry={`${point.radius * 0.85}%`}
                fill={point.color}
                fillOpacity={point.opacity}
              />
            ))}
          </g>
        </svg>

        {/* Zones + route SVG */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {layerVisibility.zones && primaryShapes.map(shape => (
            <polygon
              key={shape.id}
              points={polygonPoints(shape.polygon)}
              fill="transparent"
              stroke={shape.borderColor}
              strokeWidth="0.42"
              strokeDasharray="1.8 1.2"
              strokeOpacity="0.95"
            />
          ))}

          {layerVisibility.route && routeSegments.map((seg, i) => (
            <line
              key={`route-${i}`}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke={seg.color}
              strokeWidth="0.55"
              strokeDasharray="1.6 1"
              strokeLinecap="round"
              opacity="0.9"
            />
          ))}

          {layerVisibility.events && eventPins.map(pin => (
            <circle
              key={pin.id}
              cx={pin.x}
              cy={pin.y}
              r="1.2"
              fill={pin.color}
              stroke="#fff"
              strokeWidth="0.25"
            />
          ))}
        </svg>

        {/* Street labels */}
        {STREET_LABELS.map(label => (
          <span
            key={label.text}
            className="absolute z-10 text-[7px] font-semibold text-white/45 pointer-events-none whitespace-nowrap"
            style={{
              left: `${label.x}%`,
              top: `${label.y}%`,
              transform: `translate(-50%, -50%) rotate(${label.rotate}deg)`,
            }}
          >
            {label.text}
          </span>
        ))}

        {layerVisibility.zones && primaryShapes.map(shape => (
          <ZoneStatCard
            key={`card-${shape.id}`}
            shape={shape}
            zone={zoneMap.get(shape.id)}
            visible
          />
        ))}

        {visibleMarkers.map(marker => (
          <HelmetMapPin
            key={marker.id}
            label={marker.label}
            color={marker.color}
            x={marker.x}
            y={marker.y}
            visible={layerVisibility.cameras}
          />
        ))}
      </div>

      {/* Top-right map controls */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-1">
        {([
          { icon: Plus, action: handleZoomIn, label: 'Phóng to' },
          { icon: Minus, action: handleZoomOut, label: 'Thu nhỏ' },
          { icon: Layers, action: () => {}, label: 'Lớp' },
          { icon: Crosshair, action: () => {}, label: 'Vị trí' },
        ] as const).map(({ icon: Icon, action, label }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            onClick={action}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/95 border border-slate-200 text-slate-700 hover:bg-white shadow-md"
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>

      {/* Bottom-left scale */}
      <div className="absolute bottom-3 left-3 z-30 flex items-end gap-1 pointer-events-none">
        <div className="flex flex-col items-start">
          <div className="w-[52px] h-[3px] bg-white/80 border border-white/40" />
          <span className="text-[8px] text-white/70 mt-0.5 font-medium">50 m</span>
        </div>
      </div>

      {/* Bottom-right map type + date chip on map */}
      <div className="absolute bottom-3 right-3 z-30 flex flex-col items-end gap-2">
        <div className="inline-flex rounded-md overflow-hidden border border-slate-200 bg-white/95 shadow-md">
          {(['map', 'satellite'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setMapView(mode)}
              className={cn(
                'px-3 py-1.5 text-[10px] font-semibold transition-colors',
                mapView === mode ? 'bg-sky-500 text-white' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              {mode === 'map' ? 'Bản đồ' : 'Vệ tinh'}
            </button>
          ))}
        </div>
      </div>

      {/* Hidden date for a11y — shown in toolbar */}
      <span className="sr-only">{formatPatrolSessionRange(sessionDate)}</span>
    </div>
  )
}
