import { useCallback, useState, type ReactNode } from 'react'
import { Minus, Plus, RotateCw } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getSiteZone } from '@/data/siteLocations'
import {
  getLegendItems,
  polygonPoints,
  type DigitalTwinMapMode,
  type DigitalTwinZone,
} from './siteDigitalTwinMap.utils'

const MIN_ZOOM = 0.85
const MAX_ZOOM = 1.6
const ZOOM_STEP = 0.12

export interface SiteDigitalTwinMapProps {
  zones: DigitalTwinZone[]
  mode: DigitalTwinMapMode
  selectedZoneId?: string | null
  onSelectZone?: (zoneId: string | null) => void
  showLegend?: boolean
  showControls?: boolean
  showZonePolygons?: boolean
  showHeat?: boolean
  className?: string
  /** SVG layer (routes, pins) rendered inside the viewBox */
  svgOverlay?: ReactNode
  /** HTML elements rendered inside the transform container (e.g. pin label pills) */
  htmlOverlay?: ReactNode
}

function resolveZoneGeometry(zone: DigitalTwinZone) {
  const siteZone = getSiteZone(zone.id)
  return {
    polygon: zone.polygon ?? siteZone?.polygon,
    cx: zone.cx ?? siteZone?.cx ?? 50,
    cy: zone.cy ?? siteZone?.cy ?? 50,
    heatShape: zone.heatShape ?? (siteZone ? 'zone' : 'point'),
  }
}

export function SiteDigitalTwinMap({
  zones,
  mode,
  selectedZoneId,
  onSelectZone,
  showLegend = true,
  showControls = true,
  showZonePolygons = true,
  showHeat = true,
  className,
  svgOverlay,
  htmlOverlay,
}: SiteDigitalTwinMapProps) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP))
  }, [])

  const handleRotate = useCallback(() => {
    setRotation(r => (r + 15) % 360)
  }, [])

  const legendItems = getLegendItems(mode)

  return (
    <div className={cn('relative w-full h-full min-h-[160px] overflow-hidden bg-[#0b0f1a]', className)}>
      <div
        className="absolute inset-0 origin-center transition-transform duration-200 ease-out"
        style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
      >
        <img
          src="/maps/site-aerial.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a]/70 via-[#0a1219]/50 to-[#060d14]/80" />

        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          <defs>
            <pattern id="site-digital-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
            </pattern>
            {showHeat && zones.map(zone => {
              const blobIntensity = Math.max(0.15, zone.intensity)
              return (
                <radialGradient
                  key={`heat-${zone.id}`}
                  id={`site-heat-${zone.id}`}
                  cx="50%"
                  cy="50%"
                  r="50%"
                >
                  <stop offset="0%" stopColor={zone.color} stopOpacity={0.42 * blobIntensity} />
                  <stop offset="55%" stopColor={zone.color} stopOpacity={0.16 * blobIntensity} />
                  <stop offset="100%" stopColor={zone.color} stopOpacity="0" />
                </radialGradient>
              )
            })}
          </defs>
          <rect width="100%" height="100%" fill="url(#site-digital-grid)" />

          {showHeat && zones.map(zone => {
            const { cx, cy, heatShape } = resolveZoneGeometry(zone)
            const rx = heatShape === 'point' ? '7%' : '11%'
            const ry = heatShape === 'point' ? '6%' : '10%'
            return (
              <ellipse
                key={`blob-${zone.id}`}
                cx={`${cx}%`}
                cy={`${cy}%`}
                rx={rx}
                ry={ry}
                fill={`url(#site-heat-${zone.id})`}
              />
            )
          })}
        </svg>

        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {showZonePolygons && zones.map(zone => {
            const { polygon } = resolveZoneGeometry(zone)
            if (!polygon) return null
            const isSelected = selectedZoneId === zone.id
            const fillOpacity = 0.08 + zone.intensity * 0.28

            return (
              <g key={`zone-${zone.id}`}>
                <polygon
                  points={polygonPoints(polygon)}
                  fill={zone.color}
                  fillOpacity={fillOpacity}
                  stroke={isSelected ? '#ffffff' : zone.color}
                  strokeWidth={isSelected ? 0.6 : 0.35}
                  strokeOpacity={isSelected ? 0.9 : 0.55}
                  className={onSelectZone ? 'cursor-pointer' : undefined}
                  onClick={() => onSelectZone?.(isSelected ? null : zone.id)}
                  role={onSelectZone ? 'button' : undefined}
                  tabIndex={onSelectZone ? 0 : undefined}
                  onKeyDown={e => {
                    if (!onSelectZone) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectZone(isSelected ? null : zone.id)
                    }
                  }}
                />
              </g>
            )
          })}

          {svgOverlay}
        </svg>

        {zones.map(zone => {
          const { cx, cy, polygon } = resolveZoneGeometry(zone)
          const isSelected = selectedZoneId === zone.id
          const labelX = cx
          const labelY = polygon
            ? polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length
            : cy
          const labelOffsetX = labelX > 50 ? -8 : 8

          return (
            <div
              key={`label-${zone.id}`}
              className={cn(
                'absolute pointer-events-none transition-opacity duration-150',
                isSelected ? 'opacity-100 z-[2]' : 'opacity-80',
              )}
              style={{
                left: `${labelX}%`,
                top: `${labelY}%`,
                transform: `translate(${labelOffsetX}px, -14px)`,
              }}
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[8px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap',
                  'bg-black/75 border backdrop-blur-sm',
                  isSelected && 'ring-1 ring-white/40',
                )}
                style={{
                  color: zone.color,
                  borderColor: `${zone.color}55`,
                }}
              >
                <span>{zone.label}</span>
                {zone.value !== undefined && (
                  <span className="tabular-nums text-white/95">{zone.value}</span>
                )}
                {zone.badge !== undefined && zone.badge > 0 && (
                  <span className="text-[6px] font-bold text-red-100 bg-red-600/50 px-0.5 py-px rounded">
                    {zone.badge}
                  </span>
                )}
              </span>
              {zone.sublabel && (
                <span
                  className="block text-[6px] text-white/45 mt-0.5 pl-0.5"
                  style={{ transform: `translateX(${labelOffsetX > 0 ? 0 : -4}px)` }}
                >
                  {zone.sublabel}
                </span>
              )}
            </div>
          )
        })}

        {htmlOverlay}
      </div>

      {showControls && (
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
      )}

      {showLegend && (
        <div className="absolute bottom-2 left-2 z-10 flex flex-wrap items-center gap-1.5 sm:gap-2 px-2 py-1 rounded bg-[#0b0f1a]/85 border border-[#1e2433] backdrop-blur-sm">
          {legendItems.map(item => (
            <span key={item.label} className="inline-flex items-center gap-1 text-[7px] sm:text-[8px] text-muted-foreground">
              <span className={cn('w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm', item.color)} />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
